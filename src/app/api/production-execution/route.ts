import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";
import type {ProductionExecutionSource,ProductionExecutionStatus} from "@/lib/production-execution";
import {canProductionBatch} from "@/lib/security/scope-db";
import {notifyInternalChange} from "@/lib/internal-chat/server";

const SOURCES=new Set<ProductionExecutionSource>(["BATCH","MASKING","UNMASKING"]);
const STATUSES=new Set<ProductionExecutionStatus>(["WAITING","ON-GOING","DONE"]);
const REPORT_LEVELS=new Set(["JOB","LINE"]);
const clean=(v:unknown)=>String(v??"").trim();

export async function PATCH(req:Request){
 const {denied,ctx}=await requireApiPermission("production.report");
 if(denied||!ctx)return denied!;
 const body=await req.json().catch(()=>({}));
 const sourceType=clean(body.sourceType).toUpperCase() as ProductionExecutionSource;
 const sourceKey=clean(body.sourceKey);
 const status=clean(body.status).toUpperCase() as ProductionExecutionStatus;
 const reportLevel=clean(body.reportLevel||"JOB").toUpperCase();
 const batchId=Number(body.batchId);
 const scheduleId=body.scheduleId==null||body.scheduleId===""?null:Number(body.scheduleId);
 const planningJobOperationId=Number(body.planningJobOperationId);
 const jobNum=clean(body.jobNum);
 const expectedJobs=Math.max(1,Number(body.expectedJobs)||1);
 const remark=clean(body.remark)||null;
 if(!SOURCES.has(sourceType)||!sourceKey||!STATUSES.has(status)||!REPORT_LEVELS.has(reportLevel)||!Number.isFinite(batchId)||batchId<=0)
  return NextResponse.json({error:"Invalid production execution payload"},{status:400});
 if(scheduleId!=null&&(!Number.isFinite(scheduleId)||scheduleId<=0))
  return NextResponse.json({error:"Invalid schedule id"},{status:400});
 if(reportLevel==="JOB"&&(!Number.isFinite(planningJobOperationId)||planningJobOperationId<=0||!jobNum))
  return NextResponse.json({error:"Job-level production reporting requires planningJobOperationId and Job Number"},{status:400});
 if(reportLevel==="LINE"&&sourceType!=="BATCH")
  return NextResponse.json({error:"Line-level production reporting is only valid for scheduled production Batch rows"},{status:400});

 const c=await getPool().connect();
 try{
  const prodScope=await canProductionBatch(c,ctx,batchId);
  if(!prodScope.allowed)return NextResponse.json({error:`Không có quyền báo cáo khu vực ${prodScope.scopeKey||"của Batch"}.`},{status:403});
  await c.query("begin");
  const b=await c.query(`select id,batch_no,standard_operation from planning_batch where id=$1 and status<>'CANCELLED' for share`,[batchId]);
  if(!b.rowCount)throw new Error("Batch not found or cancelled");
  if(scheduleId!=null){
   const s=await c.query(`select id from planning_schedule where id=$1 and batch_id=$2 and status<>'CANCELLED' for share`,[scheduleId,batchId]);
   if(!s.rowCount)throw new Error("Schedule does not belong to this Batch");
  }

  // V506: a Batch with an unresolved upstream Remove Before Start impact must
  // not begin Production. If the Batch had already started before the impact was
  // created, later status updates remain allowed and the alert becomes CRITICAL.
  if(status!=="WAITING"){
   const startedQ=await c.query(`select actual_start from production_execution where source_type='BATCH' and source_key='BATCH:'||$1::bigint::text limit 1`,[batchId]);
   if(!startedQ.rows[0]?.actual_start){
    const impactQ=await c.query(`
     select id,job_num,source_batch_no,source_standard_operation
     from planning_handover_change_event
     where affected_batch_id=$1 and change_type='REMOVE_JOB' and status='NEW' and note like 'PRODUCTION_REMOVE_BEFORE_START:%'
     order by created_at,id limit 10
    `,[batchId]);
    if(impactQ.rowCount){
     const jobs=impactQ.rows.map((x:any)=>String(x.job_num||"")).filter(Boolean).join(", ");
     throw new Error(`UPSTREAM IMPACT · ACCEPT REQUIRED. Job ${jobs} đã bị Remove Before Start ở Main trước. Hãy xử lý cảnh báo Điều độ trước khi Start lô.`);
    }
   }
  }

  if(reportLevel==="LINE"){
   const lineScope=await c.query(`
    select
     s.resource_code,
     coalesce(sr.resource_group,'') resource_group,
     coalesce(sr.area_name,'') area_name
    from planning_schedule s
    left join md_schedule_resource sr on sr.resource_code=s.resource_code
    where s.batch_id=$1 and s.status<>'CANCELLED'
    order by s.id desc
    limit 1
   `,[batchId]);
   const scope=lineScope.rows[0]||{};
   const resource=clean(scope.resource_code).toUpperCase();
   const resourceGroup=clean(scope.resource_group).toUpperCase();
   const area=clean(scope.area_name).toUpperCase();
   const allowed=resource.startsWith("FB-")||resource.startsWith("CAB")||resource==="PAINT-POWDER"||resourceGroup==="CHEMICAL_LINE"||resourceGroup==="PAINTING"||resourceGroup==="PAINT_POWDER"||area.includes("CHEMICAL LINE")||area.includes("PAINT")||area.includes("POWDER COATING");
   if(!allowed)throw new Error("Line-level reporting is limited to Chemical Line and Painting");

   // V506: the first transition out of WAITING for Chemical/Painting must go
   // through Production Start Confirmation, where the actual loaded Job list is confirmed.
   if(status!=="WAITING"){
    const current=await c.query(`select execution_status,actual_start from production_execution where source_type=$1 and source_key=$2 for update`,[sourceType,sourceKey]);
    if(!current.rows[0]?.actual_start)throw new Error("Hãy dùng Production Start Confirmation để xác nhận danh sách Job đã load trước khi Start lô.");
   }

   const pq=await c.query(`
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
       when excluded.execution_status in ('ON-GOING','DONE') then coalesce(production_execution.actual_start,now())
       else production_execution.actual_start end,
     actual_end=case
       when excluded.execution_status='DONE' then coalesce(production_execution.actual_end,now())
       else null end,
     remark=coalesce(excluded.remark,production_execution.remark),
     updated_at=now()
    returning id,source_type,source_key,batch_id,schedule_id,execution_status,actual_start,actual_end,remark,updated_at
   `,[sourceType,sourceKey,batchId,scheduleId,status,remark]);
   await c.query("commit");
   await notifyInternalChange({dbClient:c,
    ctx,eventKey:"PRODUCTION_REPORTED",summary:`Production ${status} · Batch ${b.rows[0].batch_no} · ${b.rows[0].standard_operation} · line ${sourceKey}`,
    batchId,batchNo:String(b.rows[0].batch_no||""),standardOperation:String(b.rows[0].standard_operation||""),
    entityType:"PRODUCTION_EXECUTION",entityId:pq.rows[0]?.id||sourceKey,metadata:{reportLevel:"LINE",sourceType,sourceKey,status,remark}
   });
   return NextResponse.json({ok:true,execution:pq.rows[0],reportLevel:"LINE"});
  }

  const j=await c.query(`
   select bj.planning_job_operation_id,bj.job_num
   from planning_batch_job bj
   where bj.batch_id=$1 and bj.planning_job_operation_id=$2 and bj.job_num=$3
   for share
  `,[batchId,planningJobOperationId,jobNum]);
  if(!j.rowCount)throw new Error("Job does not belong to this Batch planning occurrence");

  const jq=await c.query(`
   insert into production_execution_job(
    source_type,source_key,batch_id,schedule_id,planning_job_operation_id,job_num,
    execution_status,actual_start,actual_end,remark,updated_at
   ) values(
    $1,$2,$3,$4,$5,$6,$7,
    case when $7='WAITING' then null else now() end,
    case when $7='DONE' then now() else null end,
    $8,now()
   )
   on conflict(source_type,source_key,planning_job_operation_id) do update set
    batch_id=excluded.batch_id,
    schedule_id=excluded.schedule_id,
    job_num=excluded.job_num,
    execution_status=excluded.execution_status,
    actual_start=case
      when excluded.execution_status='WAITING' then null
      when excluded.execution_status in ('ON-GOING','DONE') then coalesce(production_execution_job.actual_start,now())
      else production_execution_job.actual_start end,
    actual_end=case
      when excluded.execution_status='DONE' then coalesce(production_execution_job.actual_end,now())
      else null end,
    remark=coalesce(excluded.remark,production_execution_job.remark),
    updated_at=now()
   returning id,source_type,source_key,batch_id,schedule_id,planning_job_operation_id,job_num,
             execution_status,actual_start,actual_end,remark,updated_at
  `,[sourceType,sourceKey,batchId,scheduleId,planningJobOperationId,jobNum,status,remark]);

  const parentExisting=await c.query(`
   select execution_status,actual_start,actual_end,remark
   from production_execution
   where source_type=$1 and source_key=$2
   for update
  `,[sourceType,sourceKey]);
  const agg=await c.query(`
   select
    count(*)::int reported_jobs,
    count(*) filter(where execution_status='WAITING')::int waiting_jobs,
    count(*) filter(where execution_status='ON-GOING')::int ongoing_jobs,
    count(*) filter(where execution_status='DONE')::int done_jobs,
    min(actual_start) actual_start,
    max(actual_end) actual_end
   from production_execution_job
   where source_type=$1 and source_key=$2
  `,[sourceType,sourceKey]);
  const a=agg.rows[0];
  const reported=Number(a.reported_jobs)||0;
  const missing=Math.max(0,expectedJobs-reported);
  const done=Number(a.done_jobs)||0;
  const ongoing=Number(a.ongoing_jobs)||0;
  const summaryStatus:ProductionExecutionStatus=missing===0&&done>=expectedJobs?"DONE":ongoing>0||done>0?"ON-GOING":"WAITING";
  const summaryStart=summaryStatus==="WAITING"?null:(a.actual_start||parentExisting.rows[0]?.actual_start||new Date());
  const summaryEnd=summaryStatus==="DONE"?(a.actual_end||parentExisting.rows[0]?.actual_end||new Date()):null;

  const pq=await c.query(`
   insert into production_execution(
    source_type,source_key,batch_id,schedule_id,execution_status,
    actual_start,actual_end,remark,updated_at
   ) values($1,$2,$3,$4,$5,$6,$7,$8,now())
   on conflict(source_type,source_key) do update set
    batch_id=excluded.batch_id,
    schedule_id=excluded.schedule_id,
    execution_status=excluded.execution_status,
    actual_start=excluded.actual_start,
    actual_end=excluded.actual_end,
    remark=coalesce(excluded.remark,production_execution.remark),
    updated_at=now()
   returning id,source_type,source_key,batch_id,schedule_id,execution_status,actual_start,actual_end,remark,updated_at
  `,[sourceType,sourceKey,batchId,scheduleId,summaryStatus,summaryStart,summaryEnd,remark]);

  await c.query("commit");
  await notifyInternalChange({dbClient:c,
   ctx,eventKey:"PRODUCTION_REPORTED",summary:`Production ${status} · Job ${jobNum} · Batch ${b.rows[0].batch_no} · ${b.rows[0].standard_operation}${sourceType!=="BATCH"?` · ${sourceType}`:""}`,
   batchId,batchNo:String(b.rows[0].batch_no||""),standardOperation:String(b.rows[0].standard_operation||""),jobNums:[jobNum],
   entityType:"PRODUCTION_EXECUTION_JOB",entityId:jq.rows[0]?.id||planningJobOperationId,metadata:{reportLevel:"JOB",sourceType,sourceKey,status,remark}
  });
  return NextResponse.json({ok:true,jobExecution:jq.rows[0],execution:pq.rows[0],reportLevel:"JOB"});
 }catch(e:any){
  await c.query("rollback");
  const missing=e?.code==="42P01"?"Job-level Production Execution is not installed. Run migration 074_production_execution_job_level.sql on Aiven.":null;
  return NextResponse.json({error:missing||e?.message||"Production reporting failed"},{status:400});
 }finally{c.release();}
}
