import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {invalidatePlanningStaticData} from "@/lib/planning/planning-static-cache";
import {invalidateConfigHealth} from "@/lib/config/config-health";
import type {PoolClient} from "pg";

const clean=(v:unknown)=>String(v??"").trim();
const upper=(v:unknown)=>clean(v).toUpperCase();

type Dependency={
 key:string;
 label:string;
 table:string;
 where:string;
};

// Keep hard delete deliberately conservative. A Main Operation may be removed
// permanently only when no configuration/history table still references it.
const DEPENDENCIES:Dependency[]=[
 {key:"source_mapping",label:"Source → Main Mapping",table:"md_st_operation_mapping",where:`upper(trim(standard_operation_rule))=$1 or exists (select 1 from regexp_split_to_table(standard_operation_rule,'\\s*/\\s*') x where upper(trim(x))=$1)`},
 {key:"st_routing",label:"ST Routing",table:"md_st_routing",where:`upper(trim(standard_operation))=$1`},
 {key:"recipe_mapping",label:"Recipe Mapping",table:"md_operation_recipe_mapping",where:`upper(trim(standard_operation))=$1`},
 {key:"part_recipe",label:"Part Process Recipe",table:"md_part_process_recipe",where:`upper(trim(standard_operation))=$1`},
 {key:"schedule_area",label:"Schedule Area",table:"md_schedule_area_operation",where:`upper(trim(standard_operation))=$1`},
 {key:"auto_plan",label:"Auto Planning Rule",table:"md_auto_planning_rule",where:`upper(trim(standard_operation))=$1`},
 {key:"batch_recipe_rule",label:"Batch Key / Recipe Rule",table:"md_batch_key_recipe_rule",where:`upper(trim(standard_operation))=$1`},
 {key:"main_support",label:"Masking / Unmasking by Main",table:"md_main_support_operation",where:`upper(trim(standard_operation))=$1`},
 {key:"planning_job",label:"Planning Job Operation",table:"planning_job_operation",where:`upper(trim(standard_operation))=$1 or upper(trim(coalesce(previous_standard_operation_snapshot,'')))=$1`},
 {key:"planning_batch",label:"Planning Batch",table:"planning_batch",where:`upper(trim(standard_operation))=$1`},
 {key:"planning_batch_job",label:"Planning Batch Job",table:"planning_batch_job",where:`upper(trim(standard_operation))=$1`},
 {key:"scope_bridge",label:"ST Intermediate Bridge",table:"md_st_operation_scope",where:`upper(trim(coalesce(previous_main_operation,'')))=$1 or upper(trim(coalesce(next_main_operation,'')))=$1`},
 {key:"bridge_segment",label:"Intermediate Bridge Segment",table:"md_intermediate_bridge_segment",where:`upper(trim(previous_main_operation))=$1 or upper(trim(next_main_operation))=$1`},
 {key:"handover_history",label:"Planner Handover History",table:"planning_handover_change_event",where:`upper(trim(source_standard_operation))=$1 or upper(trim(coalesce(next_standard_operation,'')))=$1`},
];

async function relationExists(c:PoolClient,table:string){
 const q=await c.query(`select to_regclass($1) rel`,[`public.${table}`]);
 return Boolean(q.rows[0]?.rel);
}

async function dependencyCounts(c:PoolClient,operation:string){
 const op=operation.toUpperCase();
 const result:Array<{key:string;label:string;count:number}>=[];
 for(const d of DEPENDENCIES){
  if(!(await relationExists(c,d.table)))continue;
  try{
   const q=await c.query(`select count(*)::int count from ${d.table} where ${d.where}`,[op]);
   const count=Number(q.rows[0]?.count||0);
   if(count>0)result.push({key:d.key,label:d.label,count});
  }catch{
   // Older databases may not yet have one of the newer optional columns.
   // Ignore that optional dependency instead of making Operation Master unusable.
  }
 }
 return result;
}

async function activeSourceMappingCount(c:PoolClient,operation:string){
 if(!(await relationExists(c,"md_st_operation_mapping")))return 0;
 const q=await c.query(`
  select count(*)::int count
  from md_st_operation_mapping
  where is_active=true
    and (
      upper(trim(standard_operation_rule))=$1
      or exists (
       select 1
       from regexp_split_to_table(standard_operation_rule,'\\s*/\\s*') x
       where upper(trim(x))=$1
      )
    )
 `,[operation.toUpperCase()]);
 return Number(q.rows[0]?.count||0);
}

export async function POST(req:Request){
 const body=await req.json().catch(()=>({}));
 const operation=upper(body.standard_operation);
 const stGroup=upper(body.st_group);
 const prefix=upper(body.batch_prefix);
 const note=clean(body.note)||null;
 const rawOrder=body.planning_sort_order;
 const planningOrder=rawOrder===""||rawOrder===null||rawOrder===undefined?null:Number(rawOrder);

 if(!operation)return NextResponse.json({error:"Main Operation không được để trống."},{status:400});
 if(!stGroup)return NextResponse.json({error:"Phải chọn ST Group."},{status:400});
 if(!/^[A-Z0-9]{3}$/.test(prefix))
  return NextResponse.json({error:"Batch Prefix phải đúng 3 ký tự A-Z hoặc 0-9."},{status:400});
 if(planningOrder!==null&&(!Number.isInteger(planningOrder)||planningOrder<0))
  return NextResponse.json({error:"Planning Order phải là số nguyên >= 0."},{status:400});

 const c=await getPool().connect();
 try{
  await c.query("begin");

  const groupQ=await c.query(`
   select st_group
   from md_st_group
   where upper(trim(st_group))=$1 and is_active=true
   limit 1
  `,[stGroup]);
  if(!groupQ.rowCount)throw new Error(`ST Group ${stGroup} không tồn tại hoặc đang ngưng sử dụng.`);

  const existing=await c.query(`
   select standard_operation,is_active
   from md_operation_master
   where upper(trim(standard_operation))=$1
   for update
  `,[operation]);

  let row:any;
  if(existing.rowCount){
   if(existing.rows[0].is_active)
    throw new Error(`Main Operation ${operation} đã tồn tại.`);

   const q=await c.query(`
    update md_operation_master
       set standard_operation=$1,
           st_group=$2,
           batch_prefix=$3,
           planning_sort_order=$4,
           note=$5,
           is_active=true,
           updated_at=now()
     where upper(trim(standard_operation))=$1
     returning *
   `,[operation,stGroup,prefix,planningOrder,note]);
   row=q.rows[0];
  }else{
   const q=await c.query(`
    insert into md_operation_master(
     standard_operation,st_group,batch_prefix,planning_sort_order,note,is_active,created_at,updated_at
    ) values($1,$2,$3,$4,$5,true,now(),now())
    returning *
   `,[operation,stGroup,prefix,planningOrder,note]);
   row=q.rows[0];
  }

  await c.query(`
   insert into md_planning_operation_scope(standard_operation,sort_order,is_active,updated_at)
   values(
    $1,
    coalesce($2,(select coalesce(max(sort_order),0)+10 from md_planning_operation_scope)),
    true,
    now()
   )
   on conflict(standard_operation) do update set
    sort_order=coalesce($2,md_planning_operation_scope.sort_order),
    is_active=true,
    updated_at=now()
  `,[operation,planningOrder]);

  await c.query("commit");
  invalidatePlanningStaticData();
  invalidateConfigHealth();
  return NextResponse.json({ok:true,row,reactivated:Boolean(existing.rowCount)});
 }catch(e){
  try{await c.query("rollback")}catch{}
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }finally{c.release();}
}

export async function PATCH(req:Request){
 const body=await req.json().catch(()=>({}));
 const operation=upper(body.standard_operation);
 const isActive=body.is_active===true;
 if(!operation)return NextResponse.json({error:"Thiếu Main Operation."},{status:400});

 const c=await getPool().connect();
 try{
  await c.query("begin");
  const current=await c.query(`
   select standard_operation,is_active,planning_sort_order
   from md_operation_master
   where upper(trim(standard_operation))=$1
   for update
  `,[operation]);
  if(!current.rowCount)throw new Error(`Không tìm thấy ${operation} trong Operation Master.`);

  if(!isActive){
   const mappingCount=await activeSourceMappingCount(c,operation);
   if(mappingCount>0){
    await c.query("rollback");
    return NextResponse.json({
     error:`Không thể ngưng ${operation}: còn ${mappingCount} Source → Main Mapping đang hoạt động. Hãy chuyển hoặc ngưng các mapping này trước.`
    },{status:409});
   }
  }

  const q=await c.query(`
   update md_operation_master
      set is_active=$2,updated_at=now()
    where upper(trim(standard_operation))=$1
    returning *
  `,[operation,isActive]);

  if(isActive){
   await c.query(`
    insert into md_planning_operation_scope(standard_operation,sort_order,is_active,updated_at)
    values($1,coalesce($2,(select coalesce(max(sort_order),0)+10 from md_planning_operation_scope)),true,now())
    on conflict(standard_operation) do update set is_active=true,sort_order=coalesce(md_planning_operation_scope.sort_order,$2),updated_at=now()
   `,[q.rows[0].standard_operation,q.rows[0].planning_sort_order]);
  }else{
   await c.query(`
    update md_planning_operation_scope
       set is_active=false,updated_at=now()
     where upper(trim(standard_operation))=$1
   `,[operation]);
  }

  await c.query("commit");
  invalidatePlanningStaticData();
  invalidateConfigHealth();
  return NextResponse.json({ok:true,row:q.rows[0]});
 }catch(e){
  try{await c.query("rollback")}catch{}
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }finally{c.release();}
}

export async function DELETE(req:Request){
 const body=await req.json().catch(()=>({}));
 const operation=upper(body.standard_operation);
 if(!operation)return NextResponse.json({error:"Thiếu Main Operation."},{status:400});

 const c=await getPool().connect();
 try{
  await c.query("begin");
  const current=await c.query(`
   select standard_operation,is_active
   from md_operation_master
   where upper(trim(standard_operation))=$1
   for update
  `,[operation]);
  if(!current.rowCount)throw new Error(`Không tìm thấy ${operation} trong Operation Master.`);
  if(current.rows[0].is_active){
   await c.query("rollback");
   return NextResponse.json({error:"Phải Ngưng sử dụng Main Operation trước khi Xóa vĩnh viễn."},{status:409});
  }

  const dependencies=await dependencyCounts(c,operation);
  const total=dependencies.reduce((s,x)=>s+x.count,0);
  if(total>0){
   await c.query("rollback");
   return NextResponse.json({
    error:`Không thể xóa ${operation}: vẫn còn dữ liệu/liên kết đang tham chiếu.`,
    dependencies,
    total
   },{status:409});
  }

  // Planning scope is a derived/config row owned by Operation Master and can be
  // removed together with a completely unused Operation.
  await c.query(`delete from md_planning_operation_scope where upper(trim(standard_operation))=$1`,[operation]);
  await c.query(`delete from md_operation_master where upper(trim(standard_operation))=$1`,[operation]);
  await c.query("commit");

  invalidatePlanningStaticData();
  invalidateConfigHealth();
  return NextResponse.json({ok:true,deleted:operation});
 }catch(e){
  try{await c.query("rollback")}catch{}
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }finally{c.release();}
}
