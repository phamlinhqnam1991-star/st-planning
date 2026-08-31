import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {invalidatePlanningStaticData} from "@/lib/planning/planning-static-cache";
import {syncAllStDerived} from "@/lib/st-operation-flow";
import {invalidateConfigHealth} from "@/lib/config/config-health";

const clean=(v:unknown)=>String(v??"").trim();

async function remapAll(c:any){
  return await syncAllStDerived(c);
}

export async function POST(req:Request){
 let c:any=null;
 try{
  const body=await req.json();
  const action=clean(body?.action||"set-order").toLowerCase();
  const operationCode=clean(body?.operation_code).toUpperCase();
  const operationName=clean(body?.operation_name)||operationCode;
  const raw=body?.planning_sort_order;
  const order=raw===""||raw===null||raw===undefined?null:Number(raw);

  if(!operationCode)
   return NextResponse.json({error:"Thiếu Operation Code."},{status:400});

  if(order!==null && (!Number.isInteger(order)||order<0))
   return NextResponse.json({error:"Planning Order phải là số nguyên >= 0."},{status:400});

  c=await getPool().connect();
  await c.query("begin");

  if(action==="add"){
    // Production DB may contain historical duplicates, therefore do not rely
    // on ON CONFLICT. Reactivate/update existing code first; insert only if absent.
    const upd=await c.query(`
      update public.md_operation
         set operation_name=$2,
             planning_sort_order=$3,
             is_active=true
       where upper(trim(operation_code))=$1
      returning operation_code,operation_name,planning_sort_order
    `,[operationCode,operationName,order]);

    let row:any;
    if(upd.rowCount){
      row=upd.rows[0];
    }else{
      const ins=await c.query(`
        insert into public.md_operation(
          operation_code,operation_name,planning_sort_order,is_active
        )
        values($1,$2,$3,true)
        returning operation_code,operation_name,planning_sort_order
      `,[operationCode,operationName,order]);
      row=ins.rows[0];
    }

    await c.query(`insert into md_st_operation_scope(operation_code,is_active) values($1,true) on conflict(operation_code) do update set is_active=true`,[operationCode]);

    const sync=await remapAll(c);
    await c.query("commit");
    invalidatePlanningStaticData();
    invalidateConfigHealth();
    return NextResponse.json({
      ok:true,
      action:"add",
      row,
      sync,
      note:"Operation mới chỉ vào Main Operation khi có ST Operation Mapping active cho code này."
    });
  }

  // Default: update Planning Order of an existing active Operation Code.
  const q=await c.query(`
   update public.md_operation
      set planning_sort_order=$2
    where upper(trim(operation_code))=$1
      and is_active=true
    returning operation_code,operation_name,planning_sort_order
  `,[operationCode,order]);

  if(!q.rowCount){
    await c.query("rollback");
    return NextResponse.json({error:`Không tìm thấy Operation Code ${operationCode}.`},{status:404});
  }

  // User requirement: every add/remove/order change remaps/syncs all.
  const sync=await remapAll(c);
  await c.query("commit");
  invalidatePlanningStaticData();
  invalidateConfigHealth();
  return NextResponse.json({ok:true,action:"set-order",row:q.rows[0],sync});
 }catch(e){
  if(c){try{await c.query("rollback")}catch{}}
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{
  if(c)c.release();
 }
}

export async function DELETE(req:Request){
 let c:any=null;
 try{
  const body=await req.json();
  const operationCode=clean(body?.operation_code).toUpperCase();

  if(!operationCode)
   return NextResponse.json({error:"Thiếu Operation Code."},{status:400});

  c=await getPool().connect();
  await c.query("begin");

  const current=await c.query(`
    select operation_code,operation_name,planning_sort_order
    from public.md_operation
    where upper(trim(operation_code))=$1
      and is_active=true
  `,[operationCode]);

  if(!current.rowCount){
    await c.query("rollback");
    return NextResponse.json({error:`Không tìm thấy Operation Code ${operationCode}.`},{status:404});
  }

  // Remove only from ST Scope. md_operation is the GLOBAL raw Operation catalog
  // and must remain active because other factory areas may still use this code.
  await c.query(`
    insert into md_st_operation_scope(operation_code,is_active)
    values($1,false)
    on conflict(operation_code) do update set is_active=false
  `,[operationCode]);

  // The Operation Code must also stop contributing to future standardized
  // routing / Planning Chains. Preserve mapping rows as inactive history.
  const mappings=await c.query(`
    select id,source_operation_code,st_group,standard_operation_rule,mapping_rule
    from md_st_operation_mapping
    where upper(trim(source_operation_code))=$1
      and is_active=true
    for update
  `,[operationCode]);

  for(const m of mappings.rows){
    await c.query(`
      update md_st_operation_mapping
         set is_active=false,
             updated_at=now()
       where id=$1
    `,[m.id]);

    // Keep the same audit trail used by ST Operation Mapping screen.
    await c.query(`
      insert into md_st_operation_mapping_history(
        mapping_id,action,source_operation_code,
        old_st_group,old_standard_operation_rule,old_mapping_rule,changed_by
      )
      values($1,'DEACTIVATE',$2,$3,$4,$5,'system')
    `,[m.id,m.source_operation_code,m.st_group,m.standard_operation_rule,m.mapping_rule]);
  }

  const sync=await remapAll(c);
  await c.query("commit");
  invalidatePlanningStaticData();
  invalidateConfigHealth();

  return NextResponse.json({
    ok:true,
    action:"remove",
    operation_code:operationCode,
    deactivated_mappings:mappings.rowCount,
    sync
  });
 }catch(e){
  if(c){try{await c.query("rollback")}catch{}}
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{
  if(c)c.release();
 }
}
