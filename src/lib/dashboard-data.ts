import type {PoolClient} from "pg";
import {loadProductionExecution,type ProductionWorkItem} from "@/lib/production-execution";

export type DashboardAreaSummary={
 area:string;
 workItems:number;
 waiting:number;
 ongoing:number;
 done:number;
 delayed:number;
 jobs:number;
 qty:number;
 surface:number;
 plannedHours:number;
};

export type DashboardResourceSummary={
 resource:string;
 area:string;
 batches:number;
 jobs:number;
 qty:number;
 surface:number;
 plannedMinutes:number;
 plannedHours:number;
 firstStart:string|null;
 lastEnd:string|null;
};

export type DashboardRiskItem={
 area:string;
 resource:string;
 batchNo:string;
 operation:string;
 status:string;
 plannedStart:string|null;
 plannedEnd:string|null;
 jobs:number;
 qty:number;
 priorityJobs:string[];
};

export type DashboardReadyJob={
 jobNum:string;
 operation:string;
 priority:string;
 qty:number;
 surface:number;
 nextOperation:string;
};

export type DashboardTrendDay={
 date:string;
 scheduledBatches:number;
 doneBatches:number;
 plannedHours:number;
};


export type DashboardAiScopeSection={
 key:string;
 label:string;
 rows:number;
 limit:number|null;
 fields:string[];
 description:string;
};

export type DashboardAiScope={
 accessMode:"READ_ONLY_DATABASE_TOOLS";
 databaseAccess:{
  schema:string;
  discoverTables:boolean;
  inspectSchema:boolean;
  readRows:boolean;
  aggregate:boolean;
  domainContext:boolean;
  arbitrarySql:boolean;
  writeAccess:boolean;
  genericReadLimit:number;
 };
 sections:DashboardAiScopeSection[];
 notIncluded:string[];
};

export type DashboardData={
 scheduleDate:string;
 generatedAt:string;
 kpis:{
  openJobs:number;
  openWipQty:number;
  openSurface:number;
  readyJobs:number;
  unscheduledBatches:number;
  scheduledBatches:number;
  scheduledHours:number;
  executionWorkItems:number;
  waiting:number;
  ongoing:number;
  done:number;
  completionPct:number;
  delayed:number;
  scheduleConflicts:number;
 };
 areas:DashboardAreaSummary[];
 resources:DashboardResourceSummary[];
 risks:DashboardRiskItem[];
 readyJobs:DashboardReadyJob[];
 priorityWaitingJobs:Array<{
  jobNum:string;
  priority:string;
  area:string;
  batchNo:string;
  operation:string;
 }>;
 trend:DashboardTrendDay[];
 workItems:ProductionWorkItem[];
};

const clean=(v:unknown)=>String(v??"").trim();
const num=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
const iso=(v:unknown)=>{
 if(!v)return null;
 const d=v instanceof Date?v:new Date(String(v));
 return Number.isNaN(d.getTime())?null:d.toISOString();
};

function isLate(item:ProductionWorkItem,nowMs:number){
 if(item.status==="DONE")return false;
 const end=item.plannedEnd||item.targetTime;
 if(!end)return false;
 const t=new Date(end).getTime();
 return Number.isFinite(t)&&t<nowMs;
}

function durationHours(item:ProductionWorkItem){
 if(!item.plannedStart||!item.plannedEnd)return 0;
 const start=new Date(item.plannedStart).getTime();
 const end=new Date(item.plannedEnd).getTime();
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return 0;
 return (end-start)/3600000;
}

function priorityJobLabels(item:ProductionWorkItem){
 return item.jobDetails.filter(x=>clean(x.priority)).map(x=>`${x.jobNum} (${x.priority})`).slice(0,6);
}

export async function loadDashboardData(c:PoolClient,input:{scheduleDate:string}):Promise<DashboardData>{
 const scheduleDate=clean(input.scheduleDate);
 const nowMs=Date.now();

 const [workItems,openQ,readyQ,unscheduledQ,scheduleQ,conflictQ,resourceQ,trendQ]=await Promise.all([
  loadProductionExecution(c,{scheduleDate}),
  c.query(`
   select
    count(*)::int open_jobs,
    coalesce(sum(current_good_wip_qty),0)::numeric open_wip_qty,
    coalesce(sum(total_surface),0)::numeric open_surface
   from public.open_job_current
   where is_open=true
  `),
  c.query(`
   select
    count(*) over()::int total_ready,
    po.job_num,
    po.standard_operation,
    coalesce(j.priority_type,'') priority_type,
    coalesce(j.current_good_wip_qty,j.prod_qty,0)::numeric qty,
    coalesce(j.total_surface,0)::numeric surface,
    coalesce(j.next_operation,'') next_operation
   from public.planning_job_operation po
   join public.open_job_current j on j.job_num=po.job_num and j.is_open=true
   where po.is_active=true and po.status='ELIGIBLE'
   order by
    case when nullif(trim(coalesce(j.priority_type,'')),'') is null then 1 else 0 end,
    j.priority_type desc,
    coalesce(po.planning_seq,999999),po.job_num
   limit 20
  `),
  c.query(`
   select count(*)::int n
   from public.planning_batch b
   where b.status in ('PLANNED','RELEASED')
     and not exists(
      select 1 from public.planning_schedule s
      where s.batch_id=b.id and s.status<>'CANCELLED'
     )
  `),
  c.query(`
   select
    count(*)::int batches,
    coalesce(sum(s.duration_minutes),0)::numeric planned_minutes
   from public.planning_schedule s
   where s.status<>'CANCELLED'
     and s.planned_start >= (($1::date + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
     and s.planned_start <  (($1::date + interval '1 day' + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
  `,[scheduleDate]),
  c.query(`
   with schedule_rows as (
    select s.resource_code,s.planned_start,s.planned_end,coalesce(r.max_concurrent,1) max_concurrent
    from public.planning_schedule s
    left join public.md_schedule_resource r on r.resource_code=s.resource_code
    where s.status<>'CANCELLED'
     and s.planned_start >= (($1::date + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
     and s.planned_start <  (($1::date + interval '1 day' + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
   ), events as (
    select resource_code,planned_start ts,1 delta,max_concurrent from schedule_rows
    union all
    select resource_code,planned_end ts,-1 delta,max_concurrent from schedule_rows
   ), running as (
    select resource_code,ts,max_concurrent,
     sum(delta) over(partition by resource_code order by ts,delta rows between unbounded preceding and current row) concurrent
    from events
   )
   select count(distinct resource_code)::int n
   from running
   where concurrent>max_concurrent
  `,[scheduleDate]),
  c.query(`
   select
    s.resource_code,
    coalesce(r.area_name,'') area_name,
    count(*)::int batches,
    coalesce(sum(b.total_jobs),0)::numeric jobs,
    coalesce(sum(b.total_qty),0)::numeric qty,
    coalesce(sum(b.total_surface_dm2),0)::numeric surface,
    coalesce(sum(s.duration_minutes),0)::numeric planned_minutes,
    min(s.planned_start) first_start,
    max(s.planned_end) last_end
   from public.planning_schedule s
   join public.planning_batch b on b.id=s.batch_id and b.status<>'CANCELLED'
   left join public.md_schedule_resource r on r.resource_code=s.resource_code
   where s.status<>'CANCELLED'
     and s.planned_start >= (($1::date + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
     and s.planned_start <  (($1::date + interval '1 day' + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
   group by s.resource_code,r.area_name
   order by coalesce(sum(s.duration_minutes),0) desc,s.resource_code
  `,[scheduleDate]),
  c.query(`
   with days as (
    select generate_series($1::date-6,$1::date,'1 day'::interval)::date d
   ), daily as (
    select
     (((s.planned_start at time zone 'Asia/Ho_Chi_Minh') - interval '6 hours')::date) d,
     count(*)::int scheduled_batches,
     count(*) filter(where coalesce(pe.execution_status,'WAITING')='DONE')::int done_batches,
     coalesce(sum(s.duration_minutes),0)::numeric planned_minutes
    from public.planning_schedule s
    left join public.production_execution pe
      on pe.source_type='BATCH'
     and pe.source_key='BATCH:'||s.batch_id::text
    where s.status<>'CANCELLED'
      and s.planned_start >= ((($1::date-6) + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
      and s.planned_start <  (($1::date + interval '1 day' + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
    group by (((s.planned_start at time zone 'Asia/Ho_Chi_Minh') - interval '6 hours')::date)
   )
   select days.d,coalesce(daily.scheduled_batches,0)::int scheduled_batches,
          coalesce(daily.done_batches,0)::int done_batches,
          coalesce(daily.planned_minutes,0)::numeric planned_minutes
   from days left join daily on daily.d=days.d
   order by days.d
  `,[scheduleDate]).catch(async(e:any)=>{
    if(e?.code!=="42P01")throw e;
    return c.query(`
     with days as (select generate_series($1::date-6,$1::date,'1 day'::interval)::date d),
     daily as (
      select (((planned_start at time zone 'Asia/Ho_Chi_Minh') - interval '6 hours')::date) d,
             count(*)::int scheduled_batches,0::int done_batches,
             coalesce(sum(duration_minutes),0)::numeric planned_minutes
      from public.planning_schedule
      where status<>'CANCELLED'
        and planned_start >= ((($1::date-6) + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
        and planned_start <  (($1::date + interval '1 day' + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
      group by (((planned_start at time zone 'Asia/Ho_Chi_Minh') - interval '6 hours')::date)
     )
     select days.d,coalesce(daily.scheduled_batches,0)::int scheduled_batches,
            coalesce(daily.done_batches,0)::int done_batches,
            coalesce(daily.planned_minutes,0)::numeric planned_minutes
     from days left join daily on daily.d=days.d order by days.d
    `,[scheduleDate]);
  })
 ]);

 const areasMap=new Map<string,DashboardAreaSummary>();
 for(const item of workItems){
  const area=clean(item.area)||"Unassigned";
  const current=areasMap.get(area)||{
   area,workItems:0,waiting:0,ongoing:0,done:0,delayed:0,jobs:0,qty:0,surface:0,plannedHours:0
  };
  current.workItems+=1;
  if(item.status==="WAITING")current.waiting+=1;
  if(item.status==="ON-GOING")current.ongoing+=1;
  if(item.status==="DONE")current.done+=1;
  if(isLate(item,nowMs))current.delayed+=1;
  current.jobs+=num(item.jobs);
  current.qty+=num(item.qty);
  current.surface+=num(item.surface);
  current.plannedHours+=durationHours(item);
  areasMap.set(area,current);
 }
 const areas=[...areasMap.values()].sort((a,b)=>
  (b.delayed*5+b.waiting*3+b.ongoing)-(a.delayed*5+a.waiting*3+a.ongoing)||b.workItems-a.workItems||a.area.localeCompare(b.area)
 );

 const delayedItems=workItems.filter(x=>isLate(x,nowMs));
 const risks:DashboardRiskItem[]=delayedItems
  .sort((a,b)=>{
   const at=new Date(a.plannedEnd||a.targetTime||0).getTime();
   const bt=new Date(b.plannedEnd||b.targetTime||0).getTime();
   return at-bt;
  })
  .slice(0,12)
  .map(item=>({
   area:item.area,resource:item.resource,batchNo:item.batchNo,operation:item.operation,status:item.status,
   plannedStart:item.plannedStart,plannedEnd:item.plannedEnd,jobs:item.jobs,qty:item.qty,priorityJobs:priorityJobLabels(item)
  }));

 const priorityWaitingJobs=workItems
  .filter(x=>x.status!=="DONE")
  .flatMap(item=>item.jobDetails
   .filter(j=>clean(j.priority))
   .map(j=>({jobNum:j.jobNum,priority:j.priority,area:item.area,batchNo:item.batchNo,operation:item.operation})))
  .filter((x,index,arr)=>arr.findIndex(y=>y.jobNum===x.jobNum&&y.batchNo===x.batchNo&&y.area===x.area)===index)
  .slice(0,20);

 const waiting=workItems.filter(x=>x.status==="WAITING").length;
 const ongoing=workItems.filter(x=>x.status==="ON-GOING").length;
 const done=workItems.filter(x=>x.status==="DONE").length;
 const executionWorkItems=workItems.length;

 return {
  scheduleDate,
  generatedAt:new Date().toISOString(),
  kpis:{
   openJobs:num(openQ.rows[0]?.open_jobs),
   openWipQty:num(openQ.rows[0]?.open_wip_qty),
   openSurface:num(openQ.rows[0]?.open_surface),
   readyJobs:num(readyQ.rows[0]?.total_ready),
   unscheduledBatches:num(unscheduledQ.rows[0]?.n),
   scheduledBatches:num(scheduleQ.rows[0]?.batches),
   scheduledHours:num(scheduleQ.rows[0]?.planned_minutes)/60,
   executionWorkItems,
   waiting,ongoing,done,
   completionPct:executionWorkItems?Math.round(done*1000/executionWorkItems)/10:0,
   delayed:delayedItems.length,
   scheduleConflicts:num(conflictQ.rows[0]?.n),
  },
  areas,
  resources:resourceQ.rows.map((r:any)=>({
   resource:clean(r.resource_code),area:clean(r.area_name)||"Unassigned",batches:num(r.batches),jobs:num(r.jobs),qty:num(r.qty),surface:num(r.surface),
   plannedMinutes:num(r.planned_minutes),plannedHours:num(r.planned_minutes)/60,firstStart:iso(r.first_start),lastEnd:iso(r.last_end)
  })),
  risks,
  readyJobs:readyQ.rows.map((r:any)=>({
   jobNum:clean(r.job_num),operation:clean(r.standard_operation),priority:clean(r.priority_type),qty:num(r.qty),surface:num(r.surface),nextOperation:clean(r.next_operation)
  })),
  priorityWaitingJobs,
  trend:trendQ.rows.map((r:any)=>({date:clean(r.d).slice(0,10),scheduledBatches:num(r.scheduled_batches),doneBatches:num(r.done_batches),plannedHours:num(r.planned_minutes)/60})),
  workItems,
 };
}

export function dashboardAiPayload(data:DashboardData){
 return {
  scheduleDate:data.scheduleDate,
  generatedAt:data.generatedAt,
  kpis:data.kpis,
  areas:data.areas.slice(0,20),
  resources:data.resources.slice(0,30),
  executionWorkItems:data.workItems.slice(0,25).map(item=>({
   area:item.area,
   resource:item.resource,
   batchNo:item.batchNo,
   operation:item.operation,
   status:item.status,
   plannedStart:item.plannedStart,
   plannedEnd:item.plannedEnd,
   targetTime:item.targetTime,
   jobs:item.jobs,
   qty:item.qty,
   surface:item.surface,
   priorityJobs:priorityJobLabels(item),
  })),
  delayedRisks:data.risks.slice(0,12),
  readyJobs:data.readyJobs.slice(0,15),
  priorityWaitingJobs:data.priorityWaitingJobs.slice(0,15),
  sevenDayTrend:data.trend,
 };
}

export function dashboardAiScope(data:DashboardData):DashboardAiScope{
 return {
  accessMode:"READ_ONLY_DATABASE_TOOLS",
  databaseAccess:{
   schema:"public",discoverTables:true,inspectSchema:true,readRows:true,aggregate:true,domainContext:true,
   arbitrarySql:false,writeAccess:false,genericReadLimit:50,
  },
  sections:[
   {
    key:"kpis",label:"Dashboard KPI",rows:1,limit:null,
    fields:["Open Jobs","Current Good WIP Qty","Open Surface","READY Jobs","Unscheduled Batches","Scheduled Batches / Hours","Execution Waiting / On-going / Done","Completion %","Delayed","Schedule Conflicts"],
    description:"High-level production and planning health for the selected day."
   },
   {
    key:"areas",label:"Area Summary",rows:Math.min(data.areas.length,20),limit:20,
    fields:["Area","Work Items","Waiting","On-going","Done","Delayed","Jobs","Qty","Surface","Planned Hours"],
    description:"Area workload and bottleneck summary."
   },
   {
    key:"resources",label:"Resource Workload",rows:Math.min(data.resources.length,30),limit:30,
    fields:["Resource","Area","Batches","Jobs","Qty","Surface","Planned Hours","First Start","Last End"],
    description:"Scheduled resource load for the selected production day."
   },
   {
    key:"execution",label:"Execution Work Items",rows:Math.min(data.workItems.length,25),limit:25,
    fields:["Area","Resource","Batch No.","Operation","Status","Planned Start / End","Target Time","Jobs","Qty","Surface","Priority Jobs"],
    description:"Compact batch/work-item context used to explain current production status."
   },
   {
    key:"risks",label:"Delayed / At-Risk Work",rows:Math.min(data.risks.length,12),limit:12,
    fields:["Area","Resource","Batch","Operation","Status","Planned Start / End","Jobs","Priority Jobs"],
    description:"Oldest delayed work items that are not DONE."
   },
   {
    key:"ready",label:"READY Work Queue",rows:Math.min(data.readyJobs.length,15),limit:15,
    fields:["Job","Main Operation","NextOperation","Priority","Qty","Surface"],
    description:"First READY jobs available for the next planning action."
   },
   {
    key:"priority",label:"Priority Waiting Jobs",rows:Math.min(data.priorityWaitingJobs.length,15),limit:15,
    fields:["Job","Priority","Area","Batch","Operation"],
    description:"Priority-tagged jobs that are not DONE."
   },
   {
    key:"trend",label:"7-Day Trend",rows:data.trend.length,limit:7,
    fields:["Date","Scheduled Batches","Done Batches","Planned Hours"],
    description:"Recent schedule and completion trend."
   },
  ],
  notIncluded:[
   "INSERT / UPDATE / DELETE / ALTER / DROP or any database write",
   "Arbitrary free-form SQL generated by the model",
   "Non-public database schemas (for example Supabase auth/storage internals)",
   "Automatic bulk dump of the whole database into every prompt; the agent reads only the rows needed for the question",
   "Any ability to create, edit or delete Planning / Batch / Schedule / Execution / Configuration data",
  ],
 };
}
