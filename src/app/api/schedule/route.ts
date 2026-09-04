import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import {assertResourceAndChemicalCapacity,chemicalScheduleColumns,resolveChemicalScheduleWindow} from "@/lib/chemical-line-schedule-server";
import {recomputeJobPlanningStatus} from "@/lib/planning/batch-utils";
import {assertPreviousMainScheduledBeforeAdd} from "@/lib/schedule-predecessor-guard";

import {requireApiUser} from "@/lib/api-auth";
function asDate(v:any){const d=new Date(v);return Number.isNaN(d.getTime())?null:d}
// Planner override giờ bắt đầu Process/NDT/Unloading (ISO hoặc null = tự động).
function parseOverrides(body:any){
 return {
  processStart:body.process_start_override?asDate(body.process_start_override):null,
  ndtStart:body.ndt_start_override?asDate(body.ndt_start_override):null,
  unloadingStart:body.unloading_start_override?asDate(body.unloading_start_override):null,
  loadingMinutes:body.loading_minutes_override==null||body.loading_minutes_override===""
   ?null
   :(Number.isFinite(Number(body.loading_minutes_override))?Math.max(0,Number(body.loading_minutes_override)):null)
 };
}

export async function POST(req:Request){
 const denied=await requireApiUser();
 if(denied)return denied;
 const body=await req.json().catch(()=>({}));
 const batchId=Number(body.batchId);
 const resourceCode=String(body.resourceCode||"").trim();
 const start=asDate(body.plannedStart);
 const requestedDuration=Number(body.durationMinutes);

 if(!batchId||!resourceCode||!start)
  return NextResponse.json({error:"Missing batch/resource/start"},{status:400});

 if(body.durationMinutes!=null && (!Number.isFinite(requestedDuration)||requestedDuration<=0))
  return NextResponse.json({error:"Duration must be greater than 0 minutes"},{status:400});

 const c=await getPool().connect();
 try{
  await c.query("begin");

  const bq=await c.query(`
    select b.id,b.batch_no,b.standard_operation,b.process_minutes,b.status,b.plan_source,
           b.total_qty,b.total_surface_dm2,r.recipe_no
    from planning_batch b
    left join md_process_recipe r on r.recipe_key=b.recipe_key and r.is_active=true
    where b.id=$1
    for update of b
  `,[batchId]);
  if(!bq.rowCount) throw new Error("Batch not found");

  const rq=await c.query(`
    select resource_code,resource_group,max_concurrent,launch_interval_minutes
    from md_schedule_resource
    where resource_code=$1 and is_active=true
  `,[resourceCode]);
  if(!rq.rowCount) throw new Error("Resource not found");

  const batch=bq.rows[0];
  const resource=rq.rows[0];

  // Use manual Duration when supplied; otherwise use configured Process Time.
  const configuredDuration=Number(batch.process_minutes||0);
  const duration=
   Number.isFinite(requestedDuration) && requestedDuration>0
    ? Math.round(requestedDuration)
    : configuredDuration;

  if(duration<=0)
   throw new Error("Batch has no Process Time. Enter Duration manually.");

  let effectiveStart=start;
  let chemicalWindow:Awaited<ReturnType<typeof resolveChemicalScheduleWindow>>|null=null;
  let autoAdjusted:null|{from:string;to:string;reason:string}=null;
  // Lô liên kết (không Loading): loại LÔ NGUỒN khỏi kiểm tra trùng FB — lô liên kết bám
  // NDT End (hoặc Unloading End) của lô nguồn, CÙNG FB, chồng phần Unloading 30' của nguồn
  // là ĐÚNG quy tắc liên kết (không phải lỗi trùng FB).
  let excludeScheduleIds:number[]|null=null;
  if(resource.resource_group==="CHEMICAL_LINE"&&body.loading_minutes_override===0){
   const exclQ=await c.query(`
    select s.id from planning_schedule s
    where s.resource_code=$1 and s.status<>'CANCELLED'
      and abs(extract(epoch from (coalesce(s.ndt_end,s.planned_end) - $2::timestamptz)))<=300
   `,[resourceCode,start]);
   if(exclQ.rowCount)excludeScheduleIds=exclQ.rows.map((r:any)=>Number(r.id));
  }
  if(resource.resource_group==="CHEMICAL_LINE"){
   const ov=parseOverrides(body);
   const tryWindow=async(ls:Date)=>{
    const w=await resolveChemicalScheduleWindow(c,{loadingStart:ls,processMinutes:duration,totalQty:Number(batch.total_qty||0),totalSurfaceDm2:Number(batch.total_surface_dm2||0),recipeNo:batch.recipe_no,overrides:ov});
    await assertResourceAndChemicalCapacity(c,{resourceCode,resourceGroup:resource.resource_group,window:w,maxConcurrent:Number(resource.max_concurrent||3),excludeScheduleIds:excludeScheduleIds??undefined});
    return w;
   };
   try{
    chemicalWindow=await tryWindow(effectiveStart);
   }catch(firstErr){
    let ok=false;
    for(let step=1;step<=7*24*4;step++){
     try{
      const cand=new Date(start.getTime()+step*15*60000);
      chemicalWindow=await tryWindow(cand);
      effectiveStart=cand;ok=true;break;
     }catch{}
    }
    if(!ok)throw firstErr instanceof Error?firstErr:new Error(String(firstErr));
    autoAdjusted={from:start.toISOString(),to:effectiveStart.toISOString(),reason:firstErr instanceof Error?firstErr.message:"bị cấn giờ"};
   }
  }
  const end=chemicalWindow?.unloadingEnd||new Date(effectiveStart.getTime()+duration*60000);

  // V432 · ADD-ONLY physical predecessor lock.
  // IMPORTANT for Chemical Line: run the existing Chemical proposal/capacity logic FIRST,
  // then validate its final effectiveStart. This guard never changes the suggestion engine.
  await assertPreviousMainScheduledBeforeAdd(c,{batchId,currentStart:effectiveStart});

  // A physical resource cannot run two batches at the same time.
  const overlap=chemicalWindow?{rowCount:0}:await c.query(`
    select 1
    from planning_schedule
    where resource_code=$1
      and status<>'CANCELLED'
      and planned_start<$3
      and planned_end>$2
    limit 1
  `,[resourceCode,start,end]);
  if(overlap.rowCount) throw new Error(`${resourceCode} is occupied in this time range`);

  const columns=chemicalWindow?chemicalScheduleColumns(chemicalWindow):null;
  const iq=await c.query(`
    insert into planning_schedule(
      batch_id,resource_code,schedule_date,planned_start,planned_end,
      duration_minutes,status,plan_source,
      loading_start,loading_end,loading_duration_minutes,
      process_start,process_end,process_duration_minutes,
      ndt_start,ndt_end,ndt_duration_minutes,
      unloading_start,unloading_end,unloading_duration_minutes
    )
    values($1,$2,((($3::timestamptz at time zone 'Asia/Ho_Chi_Minh') - interval '6 hours')::date),$3,$4,$5,'SCHEDULED',$6,
      $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    returning *
  `,[batchId,resourceCode,effectiveStart,end,columns?.durationMinutes||duration,batch.plan_source||'PLANNING_BOARD',
    columns?.loadingStart||null,columns?.loadingEnd||null,columns?.loadingDurationMinutes||null,
    columns?.processStart||null,columns?.processEnd||null,columns?.processDurationMinutes||null,
    columns?.ndtStart||null,columns?.ndtEnd||null,columns?.ndtDurationMinutes||null,
    columns?.unloadingStart||null,columns?.unloadingEnd||null,columns?.unloadingDurationMinutes||null]);

  await c.query(`
    update planning_batch
    set planned_start=$2,planned_end=$3,updated_at=now()
    where id=$1
  `,[batchId,effectiveStart,end]);

  // v342: SCHEDULED is a valid handoff just like PLANNED-UNSCHEDULED.
  // Recompute every Job in this Batch so exactly the immediate next unplanned
  // Main becomes READY and every later Main stays WAIT.
  const handoffJobsQ=await c.query(`
    select distinct job_num
    from planning_batch_job
    where batch_id=$1
      and nullif(trim(job_num),'') is not null
  `,[batchId]);
  for(const row of handoffJobsQ.rows){
    await recomputeJobPlanningStatus(c,String(row.job_num||""));
  }

  await c.query("commit");
  return NextResponse.json({ok:true,schedule:iq.rows[0],autoAdjusted});
 }catch(e:any){
  await c.query("rollback");
  return NextResponse.json({error:e?.message||"Schedule failed"},{status:400});
 }finally{c.release()}
}

export async function PATCH(req:Request){
 const denied=await requireApiUser();
 if(denied)return denied;
 const body=await req.json().catch(()=>({}));
 const scheduleId=Number(body.scheduleId);
 const resourceCode=String(body.resourceCode||"").trim();
 const start=asDate(body.plannedStart);
 const requestedDuration=Number(body.durationMinutes);

 if(!scheduleId||!resourceCode||!start)
  return NextResponse.json({error:"Missing schedule/resource/start"},{status:400});

 if(body.durationMinutes!=null && (!Number.isFinite(requestedDuration)||requestedDuration<=0))
  return NextResponse.json({error:"Duration must be greater than 0 minutes"},{status:400});

 const c=await getPool().connect();
 try{
  await c.query("begin");

  const sq=await c.query(`
    select s.*,b.process_minutes,b.batch_no,b.total_qty,b.total_surface_dm2,r.recipe_no
    from planning_schedule s
    join planning_batch b on b.id=s.batch_id
    left join md_process_recipe r on r.recipe_key=b.recipe_key and r.is_active=true
    where s.id=$1 and s.status<>'CANCELLED'
    for update of s
  `,[scheduleId]);
  if(!sq.rowCount)throw new Error("Schedule not found");

  const rq=await c.query(`
    select resource_code,resource_group,max_concurrent,launch_interval_minutes
    from md_schedule_resource
    where resource_code=$1 and is_active=true
  `,[resourceCode]);
  if(!rq.rowCount)throw new Error("Resource not found");

  const current=sq.rows[0];
  const resource=rq.rows[0];
  if(["RUNNING","COMPLETED"].includes(String(current.status)))
   throw new Error("RUNNING/COMPLETED schedule cannot be moved");

  const configuredDuration=Number(current.process_minutes||0);
  const duration=
   Number.isFinite(requestedDuration)&&requestedDuration>0
    ?Math.round(requestedDuration)
    :configuredDuration;

  if(duration<=0)throw new Error("Batch has no Process Time. Enter Duration manually.");

  const chemicalWindow=resource.resource_group==="CHEMICAL_LINE"
   ?await resolveChemicalScheduleWindow(c,{
     loadingStart:start,processMinutes:duration,totalQty:Number(current.total_qty||0),
     totalSurfaceDm2:Number(current.total_surface_dm2||0),recipeNo:current.recipe_no,
     excludeScheduleId:scheduleId,overrides:parseOverrides(body)
    })
   :null;
  const end=chemicalWindow?.unloadingEnd||new Date(start.getTime()+duration*60000);
  if(chemicalWindow){
   await assertResourceAndChemicalCapacity(c,{
    resourceCode,resourceGroup:resource.resource_group,window:chemicalWindow,
    maxConcurrent:Number(resource.max_concurrent||3),excludeScheduleId:scheduleId
   });
  }

  const overlap=chemicalWindow?{rowCount:0}:await c.query(`
    select 1
    from planning_schedule
    where id<>$1
      and resource_code=$2
      and status<>'CANCELLED'
      and planned_start<$4
      and planned_end>$3
    limit 1
  `,[scheduleId,resourceCode,start,end]);
  if(overlap.rowCount)throw new Error(`${resourceCode} is occupied in this time range`);

  const columns=chemicalWindow?chemicalScheduleColumns(chemicalWindow):null;
  const uq=await c.query(`
    update planning_schedule
    set resource_code=$2,
        schedule_date=((($3::timestamptz at time zone 'Asia/Ho_Chi_Minh') - interval '6 hours')::date),
        planned_start=$3,
        planned_end=$4,
        duration_minutes=$5,
        loading_start=$6,loading_end=$7,loading_duration_minutes=$8,
        process_start=$9,process_end=$10,process_duration_minutes=$11,
        ndt_start=$12,ndt_end=$13,ndt_duration_minutes=$14,
        unloading_start=$15,unloading_end=$16,unloading_duration_minutes=$17,
        updated_at=now()
    where id=$1
    returning *
  `,[scheduleId,resourceCode,start,end,columns?.durationMinutes||duration,
    columns?.loadingStart||null,columns?.loadingEnd||null,columns?.loadingDurationMinutes||null,
    columns?.processStart||null,columns?.processEnd||null,columns?.processDurationMinutes||null,
    columns?.ndtStart||null,columns?.ndtEnd||null,columns?.ndtDurationMinutes||null,
    columns?.unloadingStart||null,columns?.unloadingEnd||null,columns?.unloadingDurationMinutes||null]);

  await c.query(`
    update planning_batch
    set planned_start=$2,planned_end=$3,updated_at=now()
    where id=$1
  `,[current.batch_id,start,end]);

  await c.query("commit");
  return NextResponse.json({ok:true,schedule:uq.rows[0]});
 }catch(e:any){
  await c.query("rollback");
  return NextResponse.json({error:e?.message||"Schedule move failed"},{status:400});
 }finally{
  c.release();
 }
}

// V434 · Remove from Scheduling only.
// Keep planning_batch + planning_batch_job intact so the Batch returns to the
// Unscheduled pool. This is intentionally different from deleting a Batch.
export async function DELETE(req:Request){
 const denied=await requireApiUser();
 if(denied)return denied;
 const body=await req.json().catch(()=>({}));
 const scheduleId=Number(body.scheduleId);
 if(!scheduleId)return NextResponse.json({error:"Missing scheduleId"},{status:400});

 const c=await getPool().connect();
 try{
  await c.query("begin");
  const sq=await c.query(`
   select s.id,s.batch_id,s.status,b.batch_no
   from planning_schedule s
   join planning_batch b on b.id=s.batch_id
   where s.id=$1 and s.status<>'CANCELLED'
   for update of s
  `,[scheduleId]);
  if(!sq.rowCount)throw new Error("Schedule not found");
  const row=sq.rows[0];
  if(["RUNNING","COMPLETED"].includes(String(row.status||"").toUpperCase()))
   throw new Error("RUNNING/COMPLETED schedule cannot be unscheduled");

  await c.query(`
   update planning_schedule
   set status='CANCELLED',updated_at=now()
   where id=$1
  `,[scheduleId]);

  const stillActive=await c.query(`
   select 1 from planning_schedule
   where batch_id=$1 and status<>'CANCELLED'
   limit 1
  `,[row.batch_id]);
  if(!stillActive.rowCount){
   await c.query(`
    update planning_batch
    set planned_start=null,planned_end=null,updated_at=now()
    where id=$1
   `,[row.batch_id]);
  }

  const jobsQ=await c.query(`
   select distinct job_num
   from planning_batch_job
   where batch_id=$1 and nullif(trim(job_num),'') is not null
  `,[row.batch_id]);
  for(const job of jobsQ.rows){
   await recomputeJobPlanningStatus(c,String(job.job_num||""));
  }

  await c.query("commit");
  return NextResponse.json({ok:true,batchId:Number(row.batch_id),batchNo:String(row.batch_no||"")});
 }catch(e:any){
  await c.query("rollback");
  return NextResponse.json({error:e?.message||"Unschedule failed"},{status:400});
 }finally{
  c.release();
 }
}

