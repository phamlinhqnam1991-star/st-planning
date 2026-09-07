import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";
import {canProductionBatch} from "@/lib/security/scope-db";
import {notifyInternalChange} from "@/lib/internal-chat/server";
import {removeJobsBeforeStart} from "@/lib/production-remove-before-start";

const clean=(v:unknown)=>String(v??"").trim();
const validDate=(v:unknown)=>/^\d{4}-\d{2}-\d{2}$/.test(clean(v));

export async function POST(req:Request){
 const {denied,ctx}=await requireApiPermission("production.report");
 if(denied||!ctx)return denied!;
 const body=await req.json().catch(()=>({}));
 const batchId=Number(body.batchId);
 const scheduleId=body.scheduleId==null||body.scheduleId===""?null:Number(body.scheduleId);
 const sourceKey=clean(body.sourceKey);
 const productionDate=clean(body.productionDate);
 const targetStatus=clean(body.status).toUpperCase()==="DONE"?"DONE":"ON-GOING";
 const includedPlanningJobOperationIds=Array.isArray(body.includedPlanningJobOperationIds)?body.includedPlanningJobOperationIds.map(Number).filter(Number.isFinite):[];
 if(!Number.isFinite(batchId)||batchId<=0||!sourceKey||sourceKey!==`BATCH:${batchId}`||!validDate(productionDate))return NextResponse.json({error:"Invalid Production Start Confirmation payload."},{status:400});

 const c=await getPool().connect();
 try{
  const scope=await canProductionBatch(c,ctx,batchId);
  if(!scope.allowed)return NextResponse.json({error:`Không có quyền báo cáo khu vực ${scope.scopeKey||"của Batch"}.`},{status:403});
  await c.query("begin");
  const bQ=await c.query(`select id,batch_no,standard_operation from planning_batch where id=$1 and status<>'CANCELLED' for update`,[batchId]);
  if(!bQ.rowCount)throw new Error("Batch not found or cancelled.");
  if(scheduleId!=null){
   const sQ=await c.query(`select id from planning_schedule where id=$1 and batch_id=$2 and status<>'CANCELLED' for share`,[scheduleId,batchId]);
   if(!sQ.rowCount)throw new Error("Schedule does not belong to this Batch.");
  }
  const lineScope=await c.query(`
   select s.resource_code,coalesce(sr.resource_group,'') resource_group,coalesce(sr.area_name,'') area_name
   from planning_schedule s
   left join md_schedule_resource sr on sr.resource_code=s.resource_code
   where s.batch_id=$1 and s.status<>'CANCELLED'
   order by s.id desc limit 1
  `,[batchId]);
  const ls=lineScope.rows[0]||{};
  const resource=clean(ls.resource_code).toUpperCase(),group=clean(ls.resource_group).toUpperCase(),area=clean(ls.area_name).toUpperCase();
  const isLine=resource.startsWith("FB-")||resource.startsWith("CAB")||resource==="PAINT-POWDER"||group==="CHEMICAL_LINE"||group==="PAINTING"||group==="PAINT_POWDER"||area.includes("CHEMICAL LINE")||area.includes("PAINT")||area.includes("POWDER COATING");
  if(!isLine)throw new Error("Production Start Confirmation is limited to Chemical Line and Painting line-level Batches.");
  const existingQ=await c.query(`select execution_status,actual_start from production_execution where source_type='BATCH' and source_key=$1 for update`,[sourceKey]);
  if(existingQ.rows[0]?.actual_start||["ON-GOING","DONE"].includes(clean(existingQ.rows[0]?.execution_status).toUpperCase()))
   throw new Error("Batch đã START trước đó. Production Start Confirmation chỉ dùng trước lần Start đầu tiên.");
  const impactQ=await c.query(`
   select id,job_num,source_batch_no,source_standard_operation
   from planning_handover_change_event
   where affected_batch_id=$1 and change_type='REMOVE_JOB' and status='NEW' and note like 'PRODUCTION_REMOVE_BEFORE_START:%'
   order by created_at,id limit 10
  `,[batchId]);
  if(impactQ.rowCount){
   const jobs=impactQ.rows.map((x:any)=>String(x.job_num||"")).filter(Boolean).join(", ");
   throw new Error(`UPSTREAM IMPACT · ACCEPT REQUIRED. Job ${jobs} đã bị Remove Before Start ở Main trước. Hãy xử lý tại Báo cáo sản xuất trước khi Start lô.`);
  }

  const result=await removeJobsBeforeStart(c,{batchId,productionDate,includedPlanningJobOperationIds});
  const exQ=await c.query(`
   insert into production_execution(source_type,source_key,batch_id,schedule_id,execution_status,actual_start,actual_end,remark,updated_at)
   values('BATCH',$1,$2,$3,$4,now(),case when $4='DONE' then now() else null end,$5,now())
   on conflict(source_type,source_key) do update set
    batch_id=excluded.batch_id,schedule_id=excluded.schedule_id,execution_status=excluded.execution_status,
    actual_start=coalesce(production_execution.actual_start,now()),
    actual_end=case when excluded.execution_status='DONE' then coalesce(production_execution.actual_end,now()) else null end,
    remark=coalesce(excluded.remark,production_execution.remark),updated_at=now()
   returning *
  `,[sourceKey,batchId,scheduleId,targetStatus,clean(body.remark)||null]);
  await c.query("commit");

  const removedJobs=result.removedJobs.map(x=>x.jobNum);
  await notifyInternalChange({dbClient:c,
   ctx,eventKey:removedJobs.length?"PRODUCTION_START_WITH_REMOVED_JOBS":"PRODUCTION_REPORTED",
   summary:removedJobs.length
    ?`Production START · ${bQ.rows[0].batch_no} · ${bQ.rows[0].standard_operation} · removed ${removedJobs.length} not-loaded Job(s): ${removedJobs.join(", ")}`
    :`Production ${targetStatus} · Batch ${bQ.rows[0].batch_no} · ${bQ.rows[0].standard_operation}`,
   batchId,batchNo:String(bQ.rows[0].batch_no||""),standardOperation:String(bQ.rows[0].standard_operation||""),jobNums:removedJobs,
   affectedMains:[...new Set(result.impacts.map(x=>x.affectedOperation).filter(Boolean))],entityType:"BATCH",entityId:batchId,
   metadata:{productionDate,removedBeforeStart:removedJobs.length,impactCount:result.impacts.length,criticalImpacts:result.impacts.filter(x=>x.alreadyStarted).length}
  });
  return NextResponse.json({ok:true,execution:exQ.rows[0],removedJobs:result.removedJobs,impacts:result.impacts,batchTotals:result.totals});
 }catch(e){
  await c.query("rollback");
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }finally{c.release();}
}
