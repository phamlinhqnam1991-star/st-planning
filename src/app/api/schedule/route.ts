import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

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
    select id,batch_no,standard_operation,process_minutes,status,plan_source
    from planning_batch
    where id=$1
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

  const end=new Date(start.getTime()+duration*60000);

  // A physical resource cannot run two batches at the same time.
  const overlap=await c.query(`
    select 1
    from planning_schedule
    where resource_code=$1
      and status<>'CANCELLED'
      and planned_start<$3
      and planned_end>$2
    limit 1
  `,[resourceCode,start,end]);
  if(overlap.rowCount) throw new Error(`${resourceCode} is occupied in this time range`);

  if(resource.resource_group==="CHEMICAL_LINE"){
   // One Chemical Line has six Flybars but only three may be active together.
   // PostgreSQL range check: if three existing intervals overlap any point of the
   // proposed interval, the proposed fourth carrier is rejected.
   const concurrency=await c.query(`
     with events as (
       select planned_start t, 1 delta
       from planning_schedule s
       join md_schedule_resource r on r.resource_code=s.resource_code
       where r.resource_group='CHEMICAL_LINE'
         and s.status<>'CANCELLED'
         and s.planned_start<$2 and s.planned_end>$1
       union all
       select planned_end t, -1 delta
       from planning_schedule s
       join md_schedule_resource r on r.resource_code=s.resource_code
       where r.resource_group='CHEMICAL_LINE'
         and s.status<>'CANCELLED'
         and s.planned_start<$2 and s.planned_end>$1
       union all select $1::timestamptz,1
       union all select $2::timestamptz,-1
     ),
     timeline as (
       select t,
              sum(sum(delta)) over(order by t,delta) active
       from events
       group by t,delta
     )
     select coalesce(max(active),0) max_active from timeline
   `,[start,end]);

   if(Number(concurrency.rows[0]?.max_active||0)>3)
    throw new Error("Chemical Line allows maximum 3 Flybars running at the same time");

   // Normal launch spacing across the whole line = 60 minutes.
   const spacing=Number(resource.launch_interval_minutes||60);
   const launch=await c.query(`
     select s.planned_start
     from planning_schedule s
     join md_schedule_resource r on r.resource_code=s.resource_code
     where r.resource_group='CHEMICAL_LINE'
       and s.status<>'CANCELLED'
       and abs(extract(epoch from (s.planned_start-$1::timestamptz))/60)<$2
     limit 1
   `,[start,spacing]);

   if(launch.rowCount)
    throw new Error(`Chemical Line Flybar starts must normally be at least ${spacing} minutes apart`);
  }

  const iq=await c.query(`
    insert into planning_schedule(
      batch_id,resource_code,schedule_date,planned_start,planned_end,
      duration_minutes,status,plan_source
    )
    values($1,$2,($3 at time zone 'Asia/Ho_Chi_Minh')::date,$3,$4,$5,'SCHEDULED',$6)
    returning *
  `,[batchId,resourceCode,start,end,duration,batch.plan_source||'PLANNING_BOARD']);

  await c.query(`
    update planning_batch
    set planned_start=$2,planned_end=$3,updated_at=now()
    where id=$1
  `,[batchId,start,end]);

  await c.query("commit");
  return NextResponse.json({ok:true,schedule:iq.rows[0]});
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
    select s.*,b.process_minutes,b.batch_no
    from planning_schedule s
    join planning_batch b on b.id=s.batch_id
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

  const end=new Date(start.getTime()+duration*60000);

  const overlap=await c.query(`
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

  if(resource.resource_group==="CHEMICAL_LINE"){
   const concurrency=await c.query(`
    with events as (
      select planned_start t,1 delta
      from planning_schedule s
      join md_schedule_resource r on r.resource_code=s.resource_code
      where s.id<>$3
        and r.resource_group='CHEMICAL_LINE'
        and s.status<>'CANCELLED'
        and s.planned_start<$2 and s.planned_end>$1
      union all
      select planned_end t,-1 delta
      from planning_schedule s
      join md_schedule_resource r on r.resource_code=s.resource_code
      where s.id<>$3
        and r.resource_group='CHEMICAL_LINE'
        and s.status<>'CANCELLED'
        and s.planned_start<$2 and s.planned_end>$1
      union all select $1::timestamptz,1
      union all select $2::timestamptz,-1
    ),
    timeline as (
      select t,sum(sum(delta)) over(order by t,delta) active
      from events
      group by t,delta
    )
    select coalesce(max(active),0) max_active from timeline
   `,[start,end,scheduleId]);

   if(Number(concurrency.rows[0]?.max_active||0)>3)
    throw new Error("Chemical Line allows maximum 3 Flybars running at the same time");

   const spacing=Number(resource.launch_interval_minutes||60);
   const launch=await c.query(`
    select 1
    from planning_schedule s
    join md_schedule_resource r on r.resource_code=s.resource_code
    where s.id<>$1
      and r.resource_group='CHEMICAL_LINE'
      and s.status<>'CANCELLED'
      and abs(extract(epoch from (s.planned_start-$2::timestamptz))/60)<$3
    limit 1
   `,[scheduleId,start,spacing]);

   if(launch.rowCount)
    throw new Error(`Chemical Line Flybar starts must normally be at least ${spacing} minutes apart`);
  }

  const uq=await c.query(`
    update planning_schedule
    set resource_code=$2,
        schedule_date=($3 at time zone 'Asia/Ho_Chi_Minh')::date,
        planned_start=$3,
        planned_end=$4,
        duration_minutes=$5,
        updated_at=now()
    where id=$1
    returning *
  `,[scheduleId,resourceCode,start,end,duration]);

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
