import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";
import type {ProductionExecutionSource,ProductionExecutionStatus} from "@/lib/production-execution";

const SOURCES=new Set<ProductionExecutionSource>(["BATCH","MASKING","UNMASKING"]);
const STATUSES=new Set<ProductionExecutionStatus>(["WAITING","ON-GOING","DONE"]);
const clean=(v:unknown)=>String(v??"").trim();

export async function PATCH(req:Request){
 const denied=await requireApiUser();
 if(denied)return denied;
 const body=await req.json().catch(()=>({}));
 const sourceType=clean(body.sourceType).toUpperCase() as ProductionExecutionSource;
 const sourceKey=clean(body.sourceKey);
 const status=clean(body.status).toUpperCase() as ProductionExecutionStatus;
 const batchId=Number(body.batchId);
 const scheduleId=body.scheduleId==null||body.scheduleId===""?null:Number(body.scheduleId);
 const remark=clean(body.remark)||null;
 if(!SOURCES.has(sourceType)||!sourceKey||!STATUSES.has(status)||!Number.isFinite(batchId)||batchId<=0)
  return NextResponse.json({error:"Invalid production execution payload"},{status:400});
 if(scheduleId!=null&&(!Number.isFinite(scheduleId)||scheduleId<=0))
  return NextResponse.json({error:"Invalid schedule id"},{status:400});

 const c=await getPool().connect();
 try{
  await c.query("begin");
  const b=await c.query(`select id from planning_batch where id=$1 and status<>'CANCELLED' for share`,[batchId]);
  if(!b.rowCount)throw new Error("Batch not found or cancelled");
  if(scheduleId!=null){
   const s=await c.query(`select id from planning_schedule where id=$1 and batch_id=$2 and status<>'CANCELLED' for share`,[scheduleId,batchId]);
   if(!s.rowCount)throw new Error("Schedule does not belong to this Batch");
  }
  const q=await c.query(`
   insert into production_execution(
    source_type,source_key,batch_id,schedule_id,execution_status,
    actual_start,actual_end,remark,updated_at
   ) values(
    $1,$2,$3,$4,$5,
    case when $5='WAITING' then null else now() end,
    case when $5='DONE' then now() else null end,
    $6,now()
   )
   on conflict(source_type,source_key) do update set
    batch_id=excluded.batch_id,
    schedule_id=excluded.schedule_id,
    execution_status=excluded.execution_status,
    actual_start=case
      when excluded.execution_status='WAITING' then null
      when excluded.execution_status='ON-GOING' then coalesce(production_execution.actual_start,now())
      when excluded.execution_status='DONE' then coalesce(production_execution.actual_start,now())
      else production_execution.actual_start end,
    actual_end=case
      when excluded.execution_status='DONE' then coalesce(production_execution.actual_end,now())
      else null end,
    remark=coalesce(excluded.remark,production_execution.remark),
    updated_at=now()
   returning id,source_type,source_key,batch_id,schedule_id,execution_status,actual_start,actual_end,remark,updated_at
  `,[sourceType,sourceKey,batchId,scheduleId,status,remark]);
  await c.query("commit");
  return NextResponse.json({ok:true,execution:q.rows[0]});
 }catch(e:any){
  await c.query("rollback");
  const missing=e?.code==="42P01"?"Production Execution table is not installed. Run migration 068_production_execution.sql.":null;
  return NextResponse.json({error:missing||e?.message||"Production reporting failed"},{status:400});
 }finally{c.release();}
}
