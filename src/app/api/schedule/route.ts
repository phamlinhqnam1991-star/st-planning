import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { unlockNextAfterScheduledBatch,healScheduledHandoffs } from "@/lib/planning/unlock-next-after-schedule";
import {assertResourceAndChemicalCapacity,chemicalScheduleColumns,resolveChemicalScheduleWindow} from "@/lib/chemical-line-schedule-server";

function asDate(v:any){const d=new Date(v);return Number.isNaN(d.getTime())?null:d}

export async function POST(req:Request){
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
    for update
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

  const chemicalWindow=resource.resource_group==="CHEMICAL_LINE"
   ?await resolveChemicalScheduleWindow(c,{
     loadingStart:start,processMinutes:duration,totalQty:Number(batch.total_qty||0),
     totalSurfaceDm2:Number(batch.total_surface_dm2||0),recipeNo:batch.recipe_no
    })
   :null;
  const end=chemicalWindow?.unloadingEnd||new Date(start.getTime()+duration*60000);

  if(chemicalWindow){
   await assertResourceAndChemicalCapacity(c,{
    resourceCode,resourceGroup:resource.resource_group,window:chemicalWindow,
    maxConcurrent:Number(resource.max_concurrent||3)
   });
  }

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
    values($1,$2,($3 at time zone 'Asia/Ho_Chi_Minh')::date,$3,$4,$5,'SCHEDULED',$6,
      $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    returning *
  `,[batchId,resourceCode,start,end,columns?.durationMinutes||duration,batch.plan_source||'PLANNING_BOARD',
    columns?.loadingStart||null,columns?.loadingEnd||null,columns?.loadingDurationMinutes||null,
    columns?.processStart||null,columns?.processEnd||null,columns?.processDurationMinutes||null,
    columns?.ndtStart||null,columns?.ndtEnd||null,columns?.ndtDurationMinutes||null,
    columns?.unloadingStart||null,columns?.unloadingEnd||null,columns?.unloadingDurationMinutes||null]);

  await c.query(`
    update planning_batch
    set planned_start=$2,planned_end=$3,updated_at=now()
    where id=$1
  `,[batchId,start,end]);

  const unlockedNext=await unlockNextAfterScheduledBatch(c,batchId);
  const healedNext=await healScheduledHandoffs(c);

  await c.query("commit");
  return NextResponse.json({ok:true,schedule:iq.rows[0],unlockedNext,healedNext});
 }catch(e:any){
  await c.query("rollback");
  return NextResponse.json({error:e?.message||"Schedule failed"},{status:400});
 }finally{c.release()}
}

export async function PATCH(req:Request){
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
     excludeScheduleId:scheduleId
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
        schedule_date=($3 at time zone 'Asia/Ho_Chi_Minh')::date,
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

  const unlockedNext=await unlockNextAfterScheduledBatch(c,Number(current.batch_id));
  const healedNext=await healScheduledHandoffs(c);

  await c.query("commit");
  return NextResponse.json({ok:true,schedule:uq.rows[0],unlockedNext,healedNext});
 }catch(e:any){
  await c.query("rollback");
  return NextResponse.json({error:e?.message||"Schedule move failed"},{status:400});
 }finally{
  c.release();
 }
}
