import type {PoolClient} from "pg";
import {ensureAdjustmentSet} from "@/lib/daily-production-adjustment";
import {refreshBatchTotals,recomputeJobPlanningStatus} from "@/lib/planning/batch-utils";
import {autoAdjustChemicalSchedule} from "@/lib/chemical-line-schedule-server";

const clean=(v:unknown)=>String(v??"").trim();

async function plannerForOperation(c:PoolClient,operation:unknown):Promise<"1"|"2"|null>{
 const op=clean(operation);
 if(!op)return null;
 const q=await c.query(`
  select coalesce(w.planner_owner,a.planner_owner) planner_owner
  from md_schedule_area_operation m
  join md_schedule_area a on a.schedule_area_code=m.schedule_area_code and a.is_active=true
  left join md_planner_work_assignment w on w.schedule_area_code=a.schedule_area_code and w.is_active=true
  where m.is_active=true and upper(trim(m.standard_operation))=upper(trim($1))
  order by a.display_order,a.schedule_area_code
  limit 1
 `,[op]);
 const owner=clean(q.rows[0]?.planner_owner);
 return owner==="1"||owner==="2"?owner:null;
}

export type ProductionRemovedJob={
 planningJobOperationId:number;
 jobNum:string;
 qty:number;
 surface:number;
};

export type ProductionRemoveImpact={
 eventId:number;
 jobNum:string;
 affectedBatchId:number;
 affectedBatchNo:string;
 affectedOperation:string;
 impactLevel:"WARNING"|"IMPACTED"|"CRITICAL";
 alreadyStarted:boolean;
};

export async function removeJobsBeforeStart(c:PoolClient,args:{
 batchId:number;
 productionDate:string;
 includedPlanningJobOperationIds:number[];
}){
 const batchQ=await c.query(`
  select id,batch_no,standard_operation,total_qty,total_surface_dm2,process_minutes
  from planning_batch
  where id=$1 and status<>'CANCELLED'
  for update
 `,[args.batchId]);
 if(!batchQ.rowCount)throw new Error("Batch not found or cancelled.");
 const batch=batchQ.rows[0];

 const jobsQ=await c.query(`
  select bj.id batch_job_id,bj.planning_job_operation_id,bj.job_num,
         coalesce(bj.qty,0) qty,coalesce(bj.surface_dm2,0) surface_dm2,
         p.planning_seq,p.standard_operation
  from planning_batch_job bj
  join planning_job_operation p on p.id=bj.planning_job_operation_id
  where bj.batch_id=$1
  order by bj.created_at,bj.id
  for update of bj,p
 `,[args.batchId]);
 const allJobs=jobsQ.rows;
 const included=new Set(args.includedPlanningJobOperationIds.map(Number).filter(Number.isFinite));
 if(allJobs.length&&included.size===0)throw new Error("Phải giữ lại ít nhất 1 Job để Start Batch.");
 const invalid=[...included].filter(id=>!allJobs.some((x:any)=>Number(x.planning_job_operation_id)===id));
 if(invalid.length)throw new Error("Danh sách Job xác nhận không còn khớp Batch. Hãy tải lại Báo cáo sản xuất.");
 const removed=allJobs.filter((x:any)=>!included.has(Number(x.planning_job_operation_id)));
 if(!removed.length)return {removedJobs:[] as ProductionRemovedJob[],impacts:[] as ProductionRemoveImpact[],totals:null};

 const sourceQtyBefore=Number(batch.total_qty||0);
 const sourceSurfaceBefore=Number(batch.total_surface_dm2||0);
 const sourcePlanner=await plannerForOperation(c,batch.standard_operation);

 // Production reality wins at the source Main. Downstream planned memberships are
 // intentionally kept until their Shift accepts the generated REMOVE_JOB impact.
 for(const row of removed){
  const exQ=await c.query(`
   select execution_status,actual_start
   from production_execution_job
   where batch_id=$1 and planning_job_operation_id=$2
   order by id desc limit 1
  `,[args.batchId,row.planning_job_operation_id]);
  if(exQ.rows[0]?.actual_start||["ON-GOING","DONE"].includes(clean(exQ.rows[0]?.execution_status).toUpperCase()))
   throw new Error(`Job ${row.job_num} đã bắt đầu Production, không thể Remove Before Start.`);
  await c.query(`delete from planning_batch_job where id=$1`,[row.batch_job_id]);
  await c.query(`delete from production_execution_job where batch_id=$1 and planning_job_operation_id=$2 and execution_status='WAITING'`,[args.batchId,row.planning_job_operation_id]);
 }

 const totals=await refreshBatchTotals(c,args.batchId);
 // Keep Chemical Line timing consistent with the actual loaded population.
 await autoAdjustChemicalSchedule(c,args.batchId,totals.processMinutes,{previousProcessMinutes:Number(batch.process_minutes||0)});

 const set=await ensureAdjustmentSet(c,args.productionDate);
 const impacts:ProductionRemoveImpact[]=[];
 for(const row of removed){
  const jobNum=clean(row.job_num);
  const qty=Number(row.qty||0),surface=Number(row.surface_dm2||0);

  // Record the source Production decision first. This is durable even if there is no downstream Batch.
  const proposal={
   reportedFrom:"PRODUCTION_START_CONFIRMATION",
   reasonCode:"NOT_LOADED",
   sourceBatchNo:clean(batch.batch_no),
   sourceOperation:clean(batch.standard_operation),
   qty,surface,
   removedBeforeStart:true
  };
  await c.query(`
   insert into production_adjustment_item(
    adjustment_set_id,item_type,status,batch_id,planning_job_operation_id,job_num,standard_operation,
    reason,validation_status,validation_message,proposal_json,approved_at,approved_by,updated_at
   ) values(
    $1,'REMOVE_JOB','APPROVED',$2,$3,$4,$5,
    'Production Remove Before Start · Job not loaded','WARNING',
    'Job was unchecked at Production Start Confirmation and was not processed in this Batch.',
    $6::jsonb,now(),'Production',now()
   )
   on conflict(adjustment_set_id,item_type,batch_id,planning_job_operation_id)
   do update set status='APPROVED',reason=excluded.reason,validation_status=excluded.validation_status,
     validation_message=excluded.validation_message,proposal_json=excluded.proposal_json,
     approved_at=now(),approved_by='Production',updated_at=now()
  `,[set.id,args.batchId,row.planning_job_operation_id,jobNum,batch.standard_operation,JSON.stringify(proposal)]);

  const downstreamQ=await c.query(`
   select distinct
    p.id planning_job_operation_id,p.standard_operation,p.planning_seq,
    b.id affected_batch_id,b.batch_no affected_batch_no,
    s.id affected_schedule_id,s.resource_code affected_resource_code,s.planned_start affected_planned_start,
    pe.execution_status affected_execution_status,pe.actual_start affected_actual_start
   from planning_job_operation p
   join planning_batch_job bj on bj.planning_job_operation_id=p.id
   join planning_batch b on b.id=bj.batch_id and b.status<>'CANCELLED'
   left join lateral(
    select ps.id,ps.resource_code,ps.planned_start
    from planning_schedule ps
    where ps.batch_id=b.id and ps.status<>'CANCELLED'
    order by ps.planned_start desc,ps.id desc limit 1
   ) s on true
   left join production_execution pe
    on pe.source_type='BATCH' and pe.source_key='BATCH:'||b.id::text
   where p.job_num=$1 and p.is_active=true and p.planning_seq>$2
   order by p.planning_seq,b.id
  `,[jobNum,Number(row.planning_seq||0)]);

  const eventIds:number[]=[];
  for(const target of downstreamQ.rows){
   const targetStarted=Boolean(target.affected_actual_start)||["ON-GOING","DONE"].includes(clean(target.affected_execution_status).toUpperCase());
   const impactLevel:ProductionRemoveImpact["impactLevel"]=targetStarted?"CRITICAL":target.affected_schedule_id?"IMPACTED":"WARNING";
   const affectedPlanner=await plannerForOperation(c,target.standard_operation);
   const existing=await c.query(`
    select id from planning_handover_change_event
    where source_batch_id=$1 and job_num=$2 and change_type='REMOVE_JOB' and status='NEW'
      and affected_batch_id=$3 and note like 'PRODUCTION_REMOVE_BEFORE_START:%'
    order by id desc limit 1
   `,[args.batchId,jobNum,target.affected_batch_id]);
   let eventId=Number(existing.rows[0]?.id||0);
   if(!eventId){
    const ins=await c.query(`
     insert into planning_handover_change_event(
      source_batch_id,source_batch_no,source_standard_operation,source_planner,job_num,change_type,
      next_standard_operation,affected_planner,affected_batch_id,affected_batch_no,affected_schedule_id,affected_resource_code,affected_planned_start,
      source_batch_qty_before,source_batch_qty_after,source_batch_surface_before,source_batch_surface_after,changed_job_qty,changed_job_surface,
      impact_level,status,note
     ) values($1,$2,$3,$4,$5,'REMOVE_JOB',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'NEW',$20)
     returning id
    `,[args.batchId,batch.batch_no,batch.standard_operation,sourcePlanner,jobNum,target.standard_operation,affectedPlanner,
       target.affected_batch_id,target.affected_batch_no,target.affected_schedule_id||null,target.affected_resource_code||null,target.affected_planned_start||null,
       sourceQtyBefore,totals.totalQty,sourceSurfaceBefore,totals.totalSurface,qty,surface,impactLevel,
       `PRODUCTION_REMOVE_BEFORE_START: ${jobNum} was NOT LOADED in ${batch.batch_no} · ${batch.standard_operation}. Remove from downstream Batch ${target.affected_batch_no} · ${target.standard_operation}.${targetStarted?' CONFLICT: downstream Batch already started.':''}`]);
    eventId=Number(ins.rows[0]?.id||0);
   }
   if(eventId)eventIds.push(eventId);
   impacts.push({eventId,jobNum,affectedBatchId:Number(target.affected_batch_id),affectedBatchNo:clean(target.affected_batch_no),affectedOperation:clean(target.standard_operation),impactLevel,alreadyStarted:targetStarted});
  }

  await c.query(`
   update production_adjustment_item
   set proposal_json=proposal_json||jsonb_build_object('downstreamEventIds',$2::jsonb,'downstreamImpactCount',$3::int),updated_at=now()
   where adjustment_set_id=$1 and item_type='REMOVE_JOB' and batch_id=$4 and planning_job_operation_id=$5
  `,[set.id,JSON.stringify(eventIds),eventIds.length,args.batchId,row.planning_job_operation_id]);

  await recomputeJobPlanningStatus(c,jobNum);
 }
 await c.query(`update production_adjustment_set set status='READY',updated_at=now() where id=$1`,[set.id]);

 return {
  removedJobs:removed.map((x:any)=>({planningJobOperationId:Number(x.planning_job_operation_id),jobNum:clean(x.job_num),qty:Number(x.qty||0),surface:Number(x.surface_dm2||0)})),
  impacts,
  totals
 };
}

export async function acceptDownstreamRemove(c:PoolClient,eventId:number,acceptedBy:string){
 const eventQ=await c.query(`
  select * from planning_handover_change_event
  where id=$1 and change_type='REMOVE_JOB' and note like 'PRODUCTION_REMOVE_BEFORE_START:%'
  for update
 `,[eventId]);
 if(!eventQ.rowCount)throw new Error("Remove impact not found.");
 const event=eventQ.rows[0];
 if(event.status==='ACKNOWLEDGED')return {already:true,event,totals:null};
 const batchId=Number(event.affected_batch_id||0);
 if(!batchId)throw new Error("Downstream Batch is not available for this impact.");

 const batchQ=await c.query(`select id,batch_no,standard_operation,process_minutes from planning_batch where id=$1 and status<>'CANCELLED' for update`,[batchId]);
 if(!batchQ.rowCount)throw new Error("Downstream Batch no longer exists or was cancelled.");
 const executionQ=await c.query(`
  select execution_status,actual_start from production_execution
  where source_type='BATCH' and source_key='BATCH:'||$1::bigint::text
  limit 1
 `,[batchId]);
 const started=Boolean(executionQ.rows[0]?.actual_start)||["ON-GOING","DONE"].includes(clean(executionQ.rows[0]?.execution_status).toUpperCase());
 const jobStartedQ=await c.query(`
  select 1 from production_execution_job
  where batch_id=$1 and job_num=$2 and (actual_start is not null or execution_status in ('ON-GOING','DONE'))
  limit 1
 `,[batchId,event.job_num]);
 if(started||jobStartedQ.rowCount)throw new Error(`CONFLICT · Downstream Batch ${batchQ.rows[0].batch_no} đã START. Không thể tự động Remove Job ${event.job_num}.`);

 const memberQ=await c.query(`
  select bj.id,bj.planning_job_operation_id,bj.qty,bj.surface_dm2
  from planning_batch_job bj
  where bj.batch_id=$1 and upper(trim(bj.job_num))=upper(trim($2))
  order by bj.id
  for update
 `,[batchId,event.job_num]);
 if(!memberQ.rowCount){
  const ack=await c.query(`update planning_handover_change_event set status='ACKNOWLEDGED',acknowledged_at=now(),acknowledged_by=$2,note=concat_ws(E'\n',note,'Already absent from downstream Batch') where id=$1 returning *`,[eventId,acceptedBy]);
  return {already:true,event:ack.rows[0],totals:null};
 }

 for(const row of memberQ.rows){
  await c.query(`delete from planning_batch_job where id=$1`,[row.id]);
  await c.query(`delete from production_execution_job where batch_id=$1 and planning_job_operation_id=$2 and execution_status='WAITING'`,[batchId,row.planning_job_operation_id]);
 }
 await recomputeJobPlanningStatus(c,clean(event.job_num));
 const totals=await refreshBatchTotals(c,batchId);
 await autoAdjustChemicalSchedule(c,batchId,totals.processMinutes,{previousProcessMinutes:Number(batchQ.rows[0].process_minutes||0)});
 const ack=await c.query(`
  update planning_handover_change_event
  set status='ACKNOWLEDGED',acknowledged_at=now(),acknowledged_by=$2,
      note=concat_ws(E'\n',note,'Shift accepted · Job removed from downstream Batch')
  where id=$1 returning *
 `,[eventId,acceptedBy]);
 return {already:false,event:ack.rows[0],totals};
}
