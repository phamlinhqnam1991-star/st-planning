import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";

const clean=(v:unknown)=>String(v??"").trim();
const validBatchPrefix=(v:unknown)=>{
 const x=clean(v).toUpperCase();
 return /^[A-Z0-9]{3}$/.test(x)?x:"";
};
const asDate=(v:unknown)=>{
 const d=new Date(String(v??""));
 return Number.isNaN(d.getTime())?null:d;
};

export async function POST(req:Request){
 const body=await req.json().catch(()=>({}));
 const requestedScheduleArea=clean(body.schedule_area_code).toUpperCase();
 const requestedStGroup=clean(body.st_group);
 const standardOperation=clean(body.standard_operation);
 const recipeKey=clean(body.recipe_key)||null;
 const resourceCode=clean(body.resource_code);
 const planningDate=clean(body.planning_date);
 const start=asDate(body.planned_start);
 const duration=Number(body.duration_minutes);
 const note=clean(body.note)||null;

 if(!standardOperation||!resourceCode||!planningDate||!start)
  return NextResponse.json({error:"Operation / Resource / Date / Start là bắt buộc."},{status:400});
 if(!Number.isFinite(duration)||duration<=0)
  return NextResponse.json({error:"Duration phải lớn hơn 0 phút."},{status:400});

 const c=await getPool().connect();
 try{
  await c.query("begin");

  const opQ=await c.query(`
   select o.standard_operation,o.st_group,o.batch_prefix
   from md_operation_master o
   where upper(o.standard_operation)=upper($1)
     and o.is_active=true
   limit 1
  `,[standardOperation]);
  if(!opQ.rowCount)throw new Error(`Operation Master chưa có ${standardOperation}.`);

  const op=opQ.rows[0];

  if(requestedScheduleArea){
   const areaMapQ=await c.query(`
    select a.schedule_area_code,a.resource_group,a.resource_code
    from md_schedule_area a
    join md_schedule_area_operation m
      on m.schedule_area_code=a.schedule_area_code
     and m.standard_operation=$2
     and m.is_active=true
    where a.schedule_area_code=$1
      and a.is_active=true
      and a.allow_manual_plan=true
    limit 1
   `,[requestedScheduleArea,op.standard_operation]);

   if(!areaMapQ.rowCount)
    throw new Error(
     `Standard Operation ${op.standard_operation} chưa được map vào Schedule Area ${requestedScheduleArea}.`
    );

   const area=areaMapQ.rows[0];
   if(area.resource_code && clean(area.resource_code)!==resourceCode)
    throw new Error(`${requestedScheduleArea} chỉ cho Resource ${area.resource_code}.`);

   if(area.resource_group){
    const rg=await c.query(`
     select 1 from md_schedule_resource
     where resource_code=$1 and resource_group=$2 and is_active=true
     limit 1
    `,[resourceCode,area.resource_group]);
    if(!rg.rowCount)
     throw new Error(`${resourceCode} không thuộc Resource Group ${area.resource_group}.`);
   }
  }

  if(
   requestedStGroup &&
   clean(op.st_group).toUpperCase()!==requestedStGroup.toUpperCase()
  ){
   throw new Error(
    `Standard Operation ${op.standard_operation} không thuộc ST Group ${requestedStGroup}.`
   );
  }

  const batchPrefix=validBatchPrefix(op.batch_prefix);
  if(!batchPrefix)throw new Error(`${standardOperation} chưa có Batch Prefix 3 ký tự.`);

  if(recipeKey){
   const rq=await c.query(`
    select recipe_key
    from md_process_recipe
    where recipe_key=$1 and is_active=true
    limit 1
   `,[recipeKey]);
   if(!rq.rowCount)throw new Error("Recipe không hợp lệ hoặc đã ngưng sử dụng.");
  }

  const resourceQ=await c.query(`
   select resource_code,resource_group,max_concurrent,launch_interval_minutes
   from md_schedule_resource
   where resource_code=$1 and is_active=true
   limit 1
  `,[resourceCode]);
  if(!resourceQ.rowCount)throw new Error("Resource không hợp lệ.");
  const resource=resourceQ.rows[0];

  const effectiveDateQ=await c.query(`select $1::date planning_date`,[planningDate]);
  const effectiveDate=effectiveDateQ.rows[0].planning_date;

  await c.query(`
   select pg_advisory_xact_lock(hashtext($1 || '|' || $2::date::text))
  `,[batchPrefix,effectiveDate]);

  const tokenQ=await c.query(`select upper(to_char($1::date,'DDMON')) date_token`,[effectiveDate]);
  const dateToken=String(tokenQ.rows[0]?.date_token||"").toUpperCase();
  const stem=`${batchPrefix}_${dateToken}_`;

  const nextQ=await c.query(`
   select coalesce(max(
    case when batch_no ~ ('^' || $1 || '[0-9]{3}$')
     then right(batch_no,3)::integer else null end
   ),0)+1 next_no
   from planning_batch
   where left(batch_no,length($1))=$1
  `,[stem]);
  const nextNo=Number(nextQ.rows[0]?.next_no||1);
  if(nextNo>999)throw new Error(`Đã vượt quá 999 Batch cho ${batchPrefix} ngày ${dateToken}.`);
  const batchNo=`${stem}${String(nextNo).padStart(3,"0")}`;

  const areaQ=await c.query(`
   select a.id
   from md_area_operation_group ag
   join md_area a on a.id=ag.area_id and a.is_active=true
   where ag.st_group=$1 and ag.is_active=true
   limit 1
  `,[op.st_group||""]);
  const areaId=areaQ.rows[0]?.id||null;

  const end=new Date(start.getTime()+Math.round(duration)*60000);

  const overlap=await c.query(`
   select 1
   from planning_schedule
   where resource_code=$1
     and status<>'CANCELLED'
     and planned_start<$3
     and planned_end>$2
   limit 1
  `,[resourceCode,start,end]);
  if(overlap.rowCount)throw new Error(`${resourceCode} is occupied in this time range`);

  if(resource.resource_group==="CHEMICAL_LINE"){
   const concurrency=await c.query(`
    with events as (
     select planned_start t,1 delta
     from planning_schedule s
     join md_schedule_resource r on r.resource_code=s.resource_code
     where r.resource_group='CHEMICAL_LINE'
       and s.status<>'CANCELLED'
       and s.planned_start<$2 and s.planned_end>$1
     union all
     select planned_end t,-1 delta
     from planning_schedule s
     join md_schedule_resource r on r.resource_code=s.resource_code
     where r.resource_group='CHEMICAL_LINE'
       and s.status<>'CANCELLED'
       and s.planned_start<$2 and s.planned_end>$1
     union all select $1::timestamptz,1
     union all select $2::timestamptz,-1
    ), timeline as (
     select t,sum(sum(delta)) over(order by t,delta) active
     from events group by t,delta
    )
    select coalesce(max(active),0) max_active from timeline
   `,[start,end]);
   if(Number(concurrency.rows[0]?.max_active||0)>3)
    throw new Error("Chemical Line allows maximum 3 Flybars running at the same time");

   const spacing=Number(resource.launch_interval_minutes||60);
   const launch=await c.query(`
    select 1
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

  const batchQ=await c.query(`
   insert into planning_batch(
    batch_no,planning_date,area_id,standard_operation,recipe_key,
    total_jobs,total_qty,total_surface_dm2,process_minutes,
    planned_start,planned_end,priority,status,note,plan_source
   ) values(
    $1,$2::date,$3,$4,$5,
    0,0,0,$6,$7,$8,100,'PLANNED',$9,'MANUAL_GRID'
   )
   returning id,batch_no
  `,[batchNo,effectiveDate,areaId,op.standard_operation,recipeKey,Math.round(duration),start,end,note||'MANUAL SCHEDULE GRID']);

  const batchId=Number(batchQ.rows[0].id);
  const scheduleQ=await c.query(`
   insert into planning_schedule(
    batch_id,resource_code,schedule_date,planned_start,planned_end,
    duration_minutes,status,note,plan_source
   ) values(
    $1,$2,($3 at time zone 'Asia/Ho_Chi_Minh')::date,$3,$4,
    $5,'SCHEDULED',$6,'MANUAL_GRID'
   ) returning *
  `,[batchId,resourceCode,start,end,Math.round(duration),note]);

  await c.query("commit");
  return NextResponse.json({
   ok:true,
   batchId,
   batchNo,
   schedule:scheduleQ.rows[0],
   planSource:"MANUAL_GRID"
  });
 }catch(e){
  await c.query("rollback");
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }finally{
  c.release();
 }
}
