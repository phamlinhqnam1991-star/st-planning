import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {invalidatePlanningStaticData} from "@/lib/planning/planning-static-cache";
import {invalidateConfigHealth} from "@/lib/config/config-health";

const clean=(v:unknown)=>String(v??"").trim().toUpperCase();

export async function POST(req:Request){
 const body=await req.json().catch(()=>({}));
 const oldName=clean(body.old_name);
 const newName=clean(body.new_name);

 if(!oldName||!newName)
  return NextResponse.json({error:"Thiếu tên công đoạn cũ/mới."},{status:400});

 if(oldName===newName)
  return NextResponse.json({ok:true,oldName,newName,changed:false});

 const c=await getPool().connect();

 try{
  await c.query("begin");

  const oldQ=await c.query(`
   select *
   from md_operation_master
   where standard_operation=$1
     and is_active=true
   for update
  `,[oldName]);

  if(!oldQ.rowCount)
   throw new Error(`Không tìm thấy công đoạn ${oldName}.`);

  const existsQ=await c.query(`
   select 1
   from md_operation_master
   where standard_operation=$1
   limit 1
  `,[newName]);

  if(existsQ.rowCount)
   throw new Error(`Tên ${newName} đã tồn tại trong Operation Master.`);

  const row=oldQ.rows[0];

  // Insert the new master key first so future FK constraints remain safe.
  await c.query(`
   insert into md_operation_master(
    standard_operation,st_group,time_calc_type,priority,
    qty_min,qty_max,surface_min_dm2,surface_max_dm2,
    fixed_hours,standard_hours,note,is_active,created_at,updated_at
   )
   values(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
    coalesce($13,now()),now()
   )
  `,[
   newName,row.st_group,row.time_calc_type,row.priority,
   row.qty_min,row.qty_max,row.surface_min_dm2,row.surface_max_dm2,
   row.fixed_hours,row.standard_hours,row.note,row.is_active,row.created_at
  ]);

  // Mapping rule: only exact Standard Operation values are renamed.
  await c.query(`
   update md_st_operation_mapping
   set standard_operation_rule=$2,updated_at=now()
   where standard_operation_rule=$1
  `,[oldName,newName]);

  await c.query(`
   update md_st_routing
   set standard_operation=$2
   where standard_operation=$1
  `,[oldName,newName]);

  await c.query(`
   update md_operation_recipe_mapping
   set standard_operation=$2
   where standard_operation=$1
  `,[oldName,newName]);

  await c.query(`
   update md_part_process_recipe
   set standard_operation=$2,updated_at=now()
   where standard_operation=$1
  `,[oldName,newName]);

  await c.query(`
   update md_planning_operation_scope
   set standard_operation=$2
   where standard_operation=$1
  `,[oldName,newName]);

  await c.query(`
   update planning_job_operation
   set standard_operation=$2,updated_at=now()
   where standard_operation=$1
  `,[oldName,newName]);

  await c.query(`
   update planning_job_operation
   set previous_standard_operation_snapshot=$2,updated_at=now()
   where previous_standard_operation_snapshot=$1
  `,[oldName,newName]);

  await c.query(`
   update planning_batch
   set standard_operation=$2,updated_at=now()
   where standard_operation=$1
  `,[oldName,newName]);

  await c.query(`
   update planning_batch_job
   set standard_operation=$2
   where standard_operation=$1
  `,[oldName,newName]);

  // Remove only the old master key after all active references were moved.
  await c.query(`
   delete from md_operation_master
   where standard_operation=$1
  `,[oldName]);

  await c.query("commit");
  invalidatePlanningStaticData();
  invalidateConfigHealth();

  return NextResponse.json({
   ok:true,
   oldName,
   newName,
   changed:true
  });
 }catch(error){
  await c.query("rollback");
  return NextResponse.json(
   {error:error instanceof Error?error.message:String(error)},
   {status:400}
  );
 }finally{
  c.release();
 }
}
