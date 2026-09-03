import type {PoolClient} from "pg";
import {bestRecipeMatch} from "@/lib/planning/live-recipe";
import {getCachedLiveRecipeContext} from "@/lib/planning/planning-static-cache";
import {rawStJobMatchSql,rawStOperationTypeSql} from "@/lib/planning/raw-st-visible-sql";


// V416 keeps Planning workload sections on the existing Planning-chain
// population, but the Surface + Qty Current Position chart has its own
// read-only ST visibility population:
//   PLANNING_OPERATION  -> Current Main / RAW NextOperation
//   INTERMEDIATE        -> resolved Current Main / auto Bridge RAW NextOperation
//   ST_SCOPE_ONLY       -> ST_SCOPE_ONLY / RAW NextOperation
// Auto Intermediate is derived from md_intermediate_bridge_* for sequence context,
// then Dashboard applies one extra RAW NextOperation ST-membership gate: the raw
// operation itself must still exist in active md_st_operation_scope. This prevents
// non-ST route steps physically located between two ST Mains from entering chart 2.
// ST_SCOPE_ONLY is chart/audit visibility only and still never enters
// Planning Chain / Batch / Schedule.

export type StDashboardMetric={jobs:number;qty:number;surface:number};
export type StDashboardStatus="WAIT"|"READY"|"PLANNED_UNSCHEDULED"|"SCHEDULED"|"HOLD";

export type StDashboardRecipeRow={
 recipeKey:string;
 recipeNo:string;
 recipeName:string;
 WAIT:StDashboardMetric;
 READY:StDashboardMetric;
 PLANNED_UNSCHEDULED:StDashboardMetric;
 SCHEDULED:StDashboardMetric;
 HOLD:StDashboardMetric;
 total:StDashboardMetric;
};

export type StDashboardMainRow={
 areaId:number;
 areaName:string;
 areaSort:number;
 standardOperation:string;
 mainOrder:number;
 WAIT:StDashboardMetric;
 READY:StDashboardMetric;
 PLANNED_UNSCHEDULED:StDashboardMetric;
 SCHEDULED:StDashboardMetric;
 HOLD:StDashboardMetric;
 total:StDashboardMetric;
 recipes:StDashboardRecipeRow[];
};

export type StDashboardImmediateRow={
 areaId:number;
 areaName:string;
 areaSort:number;
 standardOperation:string;
 mainOrder:number;
 immediateOperation:string;
 operationType:"PLANNING_OPERATION"|"INTERMEDIATE"|"ST_SCOPE_ONLY";
 total:StDashboardMetric;
};

export type StDashboardAreaRow={
 areaId:number;
 areaName:string;
 areaSort:number;
 total:StDashboardMetric;
 statuses:Record<StDashboardStatus,StDashboardMetric>;
 mainRows:StDashboardMainRow[];
};

export type StDashboardAuditJob={
 jobNum:string;
 operationType:string;
 partNum:string;
 revisionNum:string;
 priority:string;
 lastOperation:string;
 rawNextOperation:string;
 allOperation:string;
 resolverMode:string;
 previousMain:string;
 currentMain:string;
 currentMainSourceOperation:string;
 currentStatus:string;
 currentPlanningSeq:number;
 currentSourceSeq:number;
 nextMain:string;
 nextMainSourceOperation:string;
 nextPlanningSeq:number;
 wipQty:number;
 prodQty:number;
 qtyUsed:number;
 surfacePerPart:number;
 sourceTotalSurface:number|null;
 calculatedSurface:number;
 surfaceUsed:number;
};

export type StDashboardPriorityJob={
 jobNum:string;
 partNum:string;
 revisionNum:string;
 partDescription:string;
 priority:string;
 qty:number;
 surface:number;
 nextOperation:string;
 planningMain:string;
 planningStatus:string;
 batchMain:string;
 batchNo:string;
 batchStatus:string;
 resourceCode:string;
 scheduleStatus:string;
 plannedStart:string|null;
 plannedEnd:string|null;
};

export type StDashboardData={
 generatedAt:string;
 total:StDashboardMetric;
 chartTotal:StDashboardMetric;
 statuses:Record<StDashboardStatus,StDashboardMetric>;
 areas:StDashboardAreaRow[];
 mainRows:StDashboardMainRow[];
 immediateRows:StDashboardImmediateRow[];
 auditJobs:StDashboardAuditJob[];
 cat3:StDashboardPriorityJob[];
 cat5:StDashboardPriorityJob[];
};

const zero=():StDashboardMetric=>({jobs:0,qty:0,surface:0});
const num=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
const text=(v:unknown)=>String(v??"").trim();
const iso=(v:unknown)=>{
 if(!v)return null;
 const d=v instanceof Date?v:new Date(String(v));
 return Number.isNaN(d.getTime())?null:d.toISOString();
};

const DASHBOARD_ST_RAW_SCOPE_SQL=(jobAlias="j")=>`exists(
 select 1
 from public.md_st_operation_scope dashboard_scope
 where dashboard_scope.is_active=true
   and dashboard_scope.operation_type in ('PLANNING_OPERATION','INTERMEDIATE')
   and upper(trim(dashboard_scope.operation_code))=upper(trim(coalesce(${jobAlias}.next_operation,'')))
)`;

const WORKLOAD_SQL=`
 with area_by_group as (
  select ag.st_group,min(ag.area_id) area_id
  from public.md_area_operation_group ag
  join public.md_area ax on ax.id=ag.area_id and ax.is_active=true
  where ag.is_active=true
  group by ag.st_group
 ), eligible_jobs as (
  -- V411: first enforce the canonical ST-visible RAW NextOperation gate used by
  -- All Open Jobs, then let the Planning Board resolver validate Current Main.
  select
   j.*,
   current_main.id current_planning_id,
   current_main.standard_operation current_standard_operation
  from public.open_job_current j
  join lateral (
   select p0.id,p0.standard_operation,p0.source_operation_code
   from public.planning_job_operation p0
   where p0.job_num=j.job_num
     and p0.is_active=true
     and p0.status in ('LOCKED','ELIGIBLE','PLANNED')
     and upper(trim(p0.standard_operation))<>'PIONBL'
   order by p0.planning_seq asc,p0.source_seq asc,p0.id asc
   limit 1
  ) current_main on true
  where j.is_open=true
    and ${DASHBOARD_ST_RAW_SCOPE_SQL("j")}
    and ${rawStJobMatchSql("j","current_main")}
 ), base as (
  select
   p.id,p.job_num,p.standard_operation,p.source_operation_code,p.planning_seq,p.recipe_key planning_recipe_key,
   (p.id=ej.current_planning_id) is_current_main,
   coalesce(ej.next_operation,'') raw_next_operation,
   coalesce(a.id,0)::bigint area_id,
   coalesce(a.area_name,'Unmapped') area_name,
   coalesce(a.sort_order,999999)::int area_sort,
   coalesce(om.planning_sort_order,scope.sort_order,999999)::int main_order,
   case
    when coalesce(p.is_hold,false)=true and active_batch.batch_id is null then 'HOLD'
    when active_schedule.schedule_id is not null then 'SCHEDULED'
    when active_batch.batch_id is not null then 'PLANNED_UNSCHEDULED'
    when p.status='PLANNED' then 'PLANNED_UNSCHEDULED'
    when p.status='ELIGIBLE' then 'READY'
    else 'WAIT'
   end bucket,
   coalesce(nullif(ej.current_good_wip_qty,0),ej.prod_qty,0)::float8 qty,
   coalesce(
    ej.total_surface,
    coalesce(nullif(ej.current_good_wip_qty,0),ej.prod_qty,0)*coalesce(ej.surface_per_part_dm2,0),
    0
   )::float8 surface,
   ej.part_num,ej.revision_num,ej.source_data,
   active_batch.recipe_key batch_recipe_key
  from public.planning_job_operation p
  join eligible_jobs ej on ej.job_num=p.job_num
  left join area_by_group abg on abg.st_group=p.st_group
  left join public.md_area a on a.id=abg.area_id and a.is_active=true
  left join public.md_operation_master om on om.standard_operation=p.standard_operation and om.is_active=true
  left join public.md_planning_operation_scope scope on scope.standard_operation=p.standard_operation and scope.is_active=true
  left join lateral (
   select b.id batch_id,b.batch_no,b.status batch_status,b.recipe_key
   from public.planning_batch_job bj
   join public.planning_batch b on b.id=bj.batch_id and b.status<>'CANCELLED'
   where bj.planning_job_operation_id=p.id
   order by b.created_at desc,b.id desc
   limit 1
  ) active_batch on true
  left join lateral (
   select s.id schedule_id,s.status schedule_status
   from public.planning_schedule s
   where s.batch_id=active_batch.batch_id and s.status<>'CANCELLED'
   order by s.planned_start desc,s.id desc
   limit 1
  ) active_schedule on true
  where p.is_active=true
    and p.status in ('LOCKED','ELIGIBLE','PLANNED')
    and upper(trim(p.standard_operation))<>'PIONBL'
 ), picked as (
  select distinct on (job_num,standard_operation,bucket)
   *
  from base
  order by job_num,standard_operation,bucket,coalesce(planning_seq,999999),id
 )
 select *
 from picked
 order by area_sort,main_order,standard_operation,bucket,job_num
`;


const CHART_SQL=`
 with area_by_group as (
  select ag.st_group,min(ag.area_id) area_id
  from public.md_area_operation_group ag
  join public.md_area ax on ax.id=ag.area_id and ax.is_active=true
  where ag.is_active=true
  group by ag.st_group
 ), classified as (
  select
   j.job_num,j.part_num,j.revision_num,j.priority_type,j.last_operation,
   coalesce(j.next_operation,'') raw_next_operation,
   coalesce(j.all_operation,'') all_operation,
   j.current_good_wip_qty,j.prod_qty,j.surface_per_part_dm2,j.total_surface,
   current_main.id current_planning_id,
   current_main.standard_operation current_main,
   current_main.source_operation_code current_main_source_operation,
   current_main.route_resolution_mode,
   current_main.previous_standard_operation_snapshot previous_main,
   current_main.planning_seq current_planning_seq,
   current_main.source_seq current_source_seq,
   current_main.status current_internal_status,
   current_main.is_hold current_is_hold,
   current_main.st_group current_st_group,
   ${rawStOperationTypeSql("j","current_main",{requireExplicitStScopeForIntermediate:true})} operation_type
  from public.open_job_current j
  left join lateral (
   select
    p0.id,p0.standard_operation,p0.source_operation_code,p0.route_resolution_mode,
    p0.previous_standard_operation_snapshot,p0.planning_seq,p0.source_seq,p0.status,p0.is_hold,p0.st_group
   from public.planning_job_operation p0
   where p0.job_num=j.job_num
     and p0.is_active=true
     and p0.status in ('LOCKED','ELIGIBLE','PLANNED')
     and upper(trim(p0.standard_operation))<>'PIONBL'
   order by p0.planning_seq asc,p0.source_seq asc,p0.id asc
   limit 1
  ) current_main on true
  where j.is_open=true
 ), visible as (
  select *
  from classified
  where operation_type in ('PLANNING_OPERATION','INTERMEDIATE','ST_SCOPE_ONLY')
 )
 select
  v.*,
  coalesce(nullif(v.current_good_wip_qty,0),v.prod_qty,0)::float8 qty_used,
  coalesce(
   v.total_surface,
   coalesce(nullif(v.current_good_wip_qty,0),v.prod_qty,0)*coalesce(v.surface_per_part_dm2,0),
   0
  )::float8 surface_used,
  case when v.operation_type='ST_SCOPE_ONLY' then -2 else coalesce(a.id,0)::bigint end area_id,
  case when v.operation_type='ST_SCOPE_ONLY' then 'ST Scope Only' else coalesce(a.area_name,'Unmapped') end area_name,
  case when v.operation_type='ST_SCOPE_ONLY' then 999999998 else coalesce(a.sort_order,999999)::int end area_sort,
  case when v.operation_type='ST_SCOPE_ONLY' then 'ST_SCOPE_ONLY' else coalesce(v.current_main,'UNRESOLVED') end chart_main,
  case when v.operation_type='ST_SCOPE_ONLY' then 999999998 else coalesce(om.planning_sort_order,scope.sort_order,999999)::int end main_order
 from visible v
 left join area_by_group abg on abg.st_group=v.current_st_group
 left join public.md_area a on a.id=abg.area_id and a.is_active=true
 left join public.md_operation_master om on om.standard_operation=v.current_main and om.is_active=true
 left join public.md_planning_operation_scope scope on scope.standard_operation=v.current_main and scope.is_active=true
 order by
  case v.operation_type when 'PLANNING_OPERATION' then 1 when 'INTERMEDIATE' then 2 else 3 end,
  area_sort,main_order,chart_main,upper(trim(v.raw_next_operation)),v.job_num
`;


const AUDIT_SQL=`
 with classified as (
  select
   j.job_num,j.part_num,j.revision_num,j.priority_type,j.last_operation,
   coalesce(j.next_operation,'') raw_next_operation,
   coalesce(j.all_operation,'') all_operation,
   j.current_good_wip_qty,j.prod_qty,j.surface_per_part_dm2,j.total_surface,
   current_main.id current_planning_id,
   current_main.standard_operation current_main,
   current_main.source_operation_code current_main_source_operation,
   current_main.route_resolution_mode,
   current_main.previous_standard_operation_snapshot previous_main,
   current_main.planning_seq current_planning_seq,
   current_main.source_seq current_source_seq,
   current_main.status current_internal_status,
   current_main.is_hold current_is_hold,
   ${rawStOperationTypeSql("j","current_main",{requireExplicitStScopeForIntermediate:true})} operation_type
  from public.open_job_current j
  left join lateral (
   select
    p0.id,p0.standard_operation,p0.source_operation_code,p0.route_resolution_mode,
    p0.previous_standard_operation_snapshot,p0.planning_seq,p0.source_seq,p0.status,p0.is_hold
   from public.planning_job_operation p0
   where p0.job_num=j.job_num
     and p0.is_active=true
     and p0.status in ('LOCKED','ELIGIBLE','PLANNED')
     and upper(trim(p0.standard_operation))<>'PIONBL'
   order by p0.planning_seq asc,p0.source_seq asc,p0.id asc
   limit 1
  ) current_main on true
  where j.is_open=true
 )
 select
  c.*,
  coalesce(nullif(c.current_good_wip_qty,0),c.prod_qty,0)::float8 qty_used,
  (coalesce(nullif(c.current_good_wip_qty,0),c.prod_qty,0)*coalesce(c.surface_per_part_dm2,0))::float8 calculated_surface,
  coalesce(
   c.total_surface,
   coalesce(nullif(c.current_good_wip_qty,0),c.prod_qty,0)*coalesce(c.surface_per_part_dm2,0),
   0
  )::float8 surface_used,
  case
   when c.operation_type='ST_SCOPE_ONLY' then 'ST_SCOPE_ONLY'
   when coalesce(c.current_is_hold,false)=true and current_batch.batch_id is null then 'HOLD'
   when current_schedule.schedule_id is not null then 'SCHEDULED'
   when current_batch.batch_id is not null then 'PLANNED-UNSCHEDULED'
   when c.current_internal_status='PLANNED' then 'PLANNED-UNSCHEDULED'
   when c.current_internal_status='ELIGIBLE' then 'READY'
   else 'WAIT'
  end current_status,
  coalesce(next_main.standard_operation,'') next_main,
  coalesce(next_main.source_operation_code,'') next_main_source_operation,
  coalesce(next_main.planning_seq,0)::int next_planning_seq
 from classified c
 left join lateral (
  select p1.standard_operation,p1.source_operation_code,p1.planning_seq
  from public.planning_job_operation p1
  where c.current_planning_id is not null
    and p1.job_num=c.job_num
    and p1.is_active=true
    and p1.status in ('LOCKED','ELIGIBLE','PLANNED')
    and upper(trim(p1.standard_operation))<>'PIONBL'
  order by p1.planning_seq asc,p1.source_seq asc,p1.id asc
  offset 1 limit 1
 ) next_main on true
 left join lateral (
  select b.id batch_id
  from public.planning_batch_job bj
  join public.planning_batch b on b.id=bj.batch_id and b.status<>'CANCELLED'
  where bj.planning_job_operation_id=c.current_planning_id
  order by b.created_at desc,b.id desc
  limit 1
 ) current_batch on true
 left join lateral (
  select s.id schedule_id
  from public.planning_schedule s
  where s.batch_id=current_batch.batch_id and s.status<>'CANCELLED'
  order by s.planned_start desc,s.id desc
  limit 1
 ) current_schedule on true
 where c.operation_type in ('PLANNING_OPERATION','INTERMEDIATE','ST_SCOPE_ONLY')
 order by
  case c.operation_type when 'PLANNING_OPERATION' then 1 when 'INTERMEDIATE' then 2 else 3 end,
  coalesce(c.current_planning_seq,999999),coalesce(c.current_main,'ST_SCOPE_ONLY'),
  upper(trim(c.raw_next_operation)),c.job_num
`;

async function loadPriorityJobs(c:PoolClient,priority:string):Promise<StDashboardPriorityJob[]>{
 const q=await c.query(`
  select
   j.job_num,j.part_num,j.revision_num,j.part_description,j.priority_type,
   coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)::float8 qty,
   coalesce(
    j.total_surface,
    coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)*coalesce(j.surface_per_part_dm2,0),
    0
   )::float8 surface,
   coalesce(j.next_operation,'') next_operation,
   coalesce(focus.standard_operation,'') planning_main,
   coalesce(focus.display_status,'') planning_status,
   coalesce(latest_batch.standard_operation,'') batch_main,
   coalesce(latest_batch.batch_no,'') batch_no,
   coalesce(latest_batch.batch_status,'') batch_status,
   coalesce(latest_schedule.resource_code,'') resource_code,
   coalesce(latest_schedule.schedule_status,'') schedule_status,
   latest_schedule.planned_start,
   latest_schedule.planned_end
  from public.open_job_current j
  join lateral (
   -- Same Current Main already used by Planning Board Candidate: first active
   -- occurrence of the synced chain suffix positioned by LastOperation + RAW
   -- NextOperation.
   select
    p.id,p.standard_operation,p.source_operation_code,p.planning_seq,
    case
     when coalesce(p.is_hold,false)=true and fb.batch_id is null then 'HOLD'
     when fs.schedule_id is not null then 'SCHEDULED'
     when fb.batch_id is not null then 'PLANNED-UNSCHEDULED'
     when p.status='PLANNED' then 'PLANNED-UNSCHEDULED'
     when p.status='ELIGIBLE' then 'READY'
     else 'WAIT'
    end display_status
   from public.planning_job_operation p
   left join lateral (
    select b.id batch_id
    from public.planning_batch_job bj
    join public.planning_batch b on b.id=bj.batch_id and b.status<>'CANCELLED'
    where bj.planning_job_operation_id=p.id
    order by b.created_at desc,b.id desc
    limit 1
   ) fb on true
   left join lateral (
    select s.id schedule_id
    from public.planning_schedule s
    where s.batch_id=fb.batch_id and s.status<>'CANCELLED'
    order by s.planned_start desc,s.id desc
    limit 1
   ) fs on true
   where p.job_num=j.job_num
     and p.is_active=true
     and p.status in ('LOCKED','ELIGIBLE','PLANNED')
     and upper(trim(p.standard_operation))<>'PIONBL'
   order by p.planning_seq asc,p.source_seq asc,p.id asc
   limit 1
  ) focus on true
  left join lateral (
   select
    bj.standard_operation,b.id batch_id,b.batch_no,b.status batch_status,b.created_at
   from public.planning_batch_job bj
   join public.planning_batch b on b.id=bj.batch_id and b.status<>'CANCELLED'
   where bj.job_num=j.job_num
   order by b.created_at desc,b.id desc,bj.id desc
   limit 1
  ) latest_batch on true
  left join lateral (
   select
    s.resource_code,s.status schedule_status,s.planned_start,s.planned_end
   from public.planning_schedule s
   where s.batch_id=latest_batch.batch_id and s.status<>'CANCELLED'
   order by s.planned_start desc,s.id desc
   limit 1
  ) latest_schedule on true
  where j.is_open=true
    and ${DASHBOARD_ST_RAW_SCOPE_SQL("j")}
    and ${rawStJobMatchSql("j","focus")}
    and upper(trim(coalesce(j.priority_type,'')))=$1
  order by j.job_num
 `,[priority]);
 return (q.rows as any[]).map(r=>({
  jobNum:text(r.job_num),partNum:text(r.part_num),revisionNum:text(r.revision_num),partDescription:text(r.part_description),priority:text(r.priority_type),
  qty:num(r.qty),surface:num(r.surface),nextOperation:text(r.next_operation),planningMain:text(r.planning_main),planningStatus:text(r.planning_status),
  batchMain:text(r.batch_main),batchNo:text(r.batch_no),batchStatus:text(r.batch_status),resourceCode:text(r.resource_code),scheduleStatus:text(r.schedule_status),
  plannedStart:iso(r.planned_start),plannedEnd:iso(r.planned_end)
 }));
}

export async function loadStDashboardData(c:PoolClient):Promise<StDashboardData>{
 const [workloadQ,totalQ,chartQ,auditQ,cat3,cat5,ctx,recipeMetaQ]=await Promise.all([
  c.query(WORKLOAD_SQL),
  c.query(`
   with per_job as (
    select
     j.job_num,
     coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)::numeric qty,
     coalesce(
      j.total_surface,
      coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)*coalesce(j.surface_per_part_dm2,0),
      0
     )::numeric surface
    from public.open_job_current j
    join lateral (
     select p0.id,p0.standard_operation,p0.source_operation_code
     from public.planning_job_operation p0
     where p0.job_num=j.job_num
       and p0.is_active=true
       and p0.status in ('LOCKED','ELIGIBLE','PLANNED')
       and upper(trim(p0.standard_operation))<>'PIONBL'
     order by p0.planning_seq asc,p0.source_seq asc,p0.id asc
     limit 1
    ) current_main on true
    where j.is_open=true
      and ${DASHBOARD_ST_RAW_SCOPE_SQL("j")}
      and ${rawStJobMatchSql("j","current_main")}
   )
   select count(*)::int jobs,coalesce(sum(qty),0)::float8 qty,coalesce(sum(surface),0)::float8 surface
   from per_job
  `),
  c.query(CHART_SQL),
  c.query(AUDIT_SQL),
  loadPriorityJobs(c,"CAT3"),
  loadPriorityJobs(c,"CAT5"),
  getCachedLiveRecipeContext(c),
  c.query(`select recipe_key,recipe_no,recipe_name from public.md_process_recipe`)
 ]);

 const auditJobs:StDashboardAuditJob[]=(auditQ.rows as any[]).map(r=>({
  jobNum:text(r.job_num),operationType:text(r.operation_type),partNum:text(r.part_num),revisionNum:text(r.revision_num),priority:text(r.priority_type),
  lastOperation:text(r.last_operation),rawNextOperation:text(r.raw_next_operation),allOperation:text(r.all_operation),
  resolverMode:text(r.route_resolution_mode),previousMain:text(r.previous_main),currentMain:text(r.current_main),
  currentMainSourceOperation:text(r.current_main_source_operation),currentStatus:text(r.current_status),
  currentPlanningSeq:num(r.current_planning_seq),currentSourceSeq:num(r.current_source_seq),
  nextMain:text(r.next_main),nextMainSourceOperation:text(r.next_main_source_operation),nextPlanningSeq:num(r.next_planning_seq),
  wipQty:num(r.current_good_wip_qty),prodQty:num(r.prod_qty),qtyUsed:num(r.qty_used),surfacePerPart:num(r.surface_per_part_dm2),
  sourceTotalSurface:r.total_surface==null?null:num(r.total_surface),calculatedSurface:num(r.calculated_surface),surfaceUsed:num(r.surface_used)
 }));

 const statuses:Record<StDashboardStatus,StDashboardMetric>={
  WAIT:zero(),READY:zero(),PLANNED_UNSCHEDULED:zero(),SCHEDULED:zero(),HOLD:zero()
 };
 const rows=new Map<string,StDashboardMainRow>();
 const areaUniqueJobs=new Map<string,Map<string,StDashboardMetric>>();
 const recipeMeta=new Map<string,{recipeNo:string;recipeName:string}>();
 for(const r of recipeMetaQ.rows as any[]){
  recipeMeta.set(text(r.recipe_key),{recipeNo:text(r.recipe_no),recipeName:text(r.recipe_name)});
 }

 for(const raw of workloadQ.rows as any[]){
  const bucket=text(raw.bucket) as StDashboardStatus;
  if(!(bucket in statuses))continue;
  const metric={jobs:1,qty:num(raw.qty),surface:num(raw.surface)};
  statuses[bucket].jobs+=1;statuses[bucket].qty+=metric.qty;statuses[bucket].surface+=metric.surface;

  const areaKey=String(raw.area_id);
  let areaJobs=areaUniqueJobs.get(areaKey);
  if(!areaJobs){areaJobs=new Map<string,StDashboardMetric>();areaUniqueJobs.set(areaKey,areaJobs);}
  const jobNum=text(raw.job_num);
  if(jobNum&&!areaJobs.has(jobNum))areaJobs.set(jobNum,{jobs:1,qty:metric.qty,surface:metric.surface});

  const mainKey=`${raw.area_id}|${raw.standard_operation}`;
  let row=rows.get(mainKey);
  if(!row){
   row={
    areaId:num(raw.area_id),areaName:text(raw.area_name)||"Unmapped",areaSort:num(raw.area_sort)||999999,
    standardOperation:text(raw.standard_operation),mainOrder:num(raw.main_order)||999999,
    WAIT:zero(),READY:zero(),PLANNED_UNSCHEDULED:zero(),SCHEDULED:zero(),HOLD:zero(),total:zero(),recipes:[]
   };
   rows.set(mainKey,row);
  }
  row[bucket].jobs+=1;row[bucket].qty+=metric.qty;row[bucket].surface+=metric.surface;

  const batchRecipeKey=text(raw.batch_recipe_key);
  const liveMatch=batchRecipeKey?null:bestRecipeMatch(ctx,{
   standardOperation:raw.standard_operation,
   sourceOperationCode:raw.source_operation_code,
   partNum:raw.part_num,
   revisionNum:raw.revision_num,
   sourceData:raw.source_data||null,
   ruleSuggestion:null
  });
  const recipeKey=batchRecipeKey||liveMatch?.recipeKey||text(raw.planning_recipe_key);
  const meta=recipeKey?recipeMeta.get(recipeKey):null;
  const recipeNo=meta?.recipeNo||"";
  const recipeName=meta?.recipeName||"";
  const recipeGroupKey=recipeKey||"__NO_RECIPE__";
  let recipe=row.recipes.find(x=>x.recipeKey===recipeGroupKey);
  if(!recipe){
   recipe={recipeKey:recipeGroupKey,recipeNo,recipeName,WAIT:zero(),READY:zero(),PLANNED_UNSCHEDULED:zero(),SCHEDULED:zero(),HOLD:zero(),total:zero()};
   row.recipes.push(recipe);
  }
  recipe[bucket].jobs+=1;recipe[bucket].qty+=metric.qty;recipe[bucket].surface+=metric.surface;
 }

 const mainRows=[...rows.values()].map(row=>{
  const metrics=[row.WAIT,row.READY,row.PLANNED_UNSCHEDULED,row.SCHEDULED,row.HOLD];
  row.total={jobs:metrics.reduce((s,x)=>s+x.jobs,0),qty:metrics.reduce((s,x)=>s+x.qty,0),surface:metrics.reduce((s,x)=>s+x.surface,0)};
  row.recipes=row.recipes.map(recipe=>{
   const rm=[recipe.WAIT,recipe.READY,recipe.PLANNED_UNSCHEDULED,recipe.SCHEDULED,recipe.HOLD];
   recipe.total={jobs:rm.reduce((s,x)=>s+x.jobs,0),qty:rm.reduce((s,x)=>s+x.qty,0),surface:rm.reduce((s,x)=>s+x.surface,0)};
   return recipe;
  }).sort((a,b)=>{
   if(a.recipeKey==="__NO_RECIPE__"&&b.recipeKey!=="__NO_RECIPE__")return 1;
   if(b.recipeKey==="__NO_RECIPE__"&&a.recipeKey!=="__NO_RECIPE__")return -1;
   return (a.recipeNo||"999999").localeCompare(b.recipeNo||"999999",undefined,{numeric:true})||a.recipeName.localeCompare(b.recipeName);
  });
  return row;
 }).sort((a,b)=>a.areaSort-b.areaSort||a.mainOrder-b.mainOrder||a.standardOperation.localeCompare(b.standardOperation));
 const areasMap=new Map<string,StDashboardAreaRow>();
 for(const row of mainRows){
  const key=String(row.areaId);
  let area=areasMap.get(key);
  if(!area){
   area={
    areaId:row.areaId,areaName:row.areaName,areaSort:row.areaSort,total:zero(),
    statuses:{WAIT:zero(),READY:zero(),PLANNED_UNSCHEDULED:zero(),SCHEDULED:zero(),HOLD:zero()},
    mainRows:[]
   };
   areasMap.set(key,area);
  }
  area.mainRows.push(row);
  for(const status of ["WAIT","READY","PLANNED_UNSCHEDULED","SCHEDULED","HOLD"] as StDashboardStatus[]){
   area.statuses[status].jobs+=row[status].jobs;
   area.statuses[status].qty+=row[status].qty;
   area.statuses[status].surface+=row[status].surface;
  }
 }
 const areas=[...areasMap.values()].map(area=>{
  const unique=areaUniqueJobs.get(String(area.areaId));
  if(unique){
   for(const metric of unique.values()){
    area.total.jobs+=1;
    area.total.qty+=metric.qty;
    area.total.surface+=metric.surface;
   }
  }
  return area;
 }).sort((a,b)=>a.areaSort-b.areaSort||a.areaName.localeCompare(b.areaName));
 const immediateRowsMap=new Map<string,StDashboardImmediateRow>();
 const chartTotal=zero();
 for(const raw of chartQ.rows as any[]){
  const operationType=text(raw.operation_type) as StDashboardImmediateRow["operationType"];
  if(!["PLANNING_OPERATION","INTERMEDIATE","ST_SCOPE_ONLY"].includes(operationType))continue;
  const metric={jobs:1,qty:num(raw.qty_used),surface:num(raw.surface_used)};
  chartTotal.jobs+=1;chartTotal.qty+=metric.qty;chartTotal.surface+=metric.surface;
  const standardOperation=text(raw.chart_main)||(operationType==="ST_SCOPE_ONLY"?"ST_SCOPE_ONLY":"UNRESOLVED");
  const immediateOperation=text(raw.raw_next_operation)||"—";
  const immediateKey=`${operationType}|${raw.area_id}|${standardOperation}|${immediateOperation}`;
  let immediateRow=immediateRowsMap.get(immediateKey);
  if(!immediateRow){
   immediateRow={
    areaId:num(raw.area_id),areaName:text(raw.area_name)||"Unmapped",areaSort:num(raw.area_sort)||999999,
    standardOperation,mainOrder:num(raw.main_order)||999999,immediateOperation,operationType,total:zero()
   };
   immediateRowsMap.set(immediateKey,immediateRow);
  }
  immediateRow.total.jobs+=1;immediateRow.total.qty+=metric.qty;immediateRow.total.surface+=metric.surface;
 }
 const typeOrder:Record<StDashboardImmediateRow["operationType"],number>={PLANNING_OPERATION:1,INTERMEDIATE:2,ST_SCOPE_ONLY:3};
 const immediateRows=[...immediateRowsMap.values()].sort((a,b)=>
  typeOrder[a.operationType]-typeOrder[b.operationType]||
  a.areaSort-b.areaSort||a.mainOrder-b.mainOrder||a.standardOperation.localeCompare(b.standardOperation)||a.immediateOperation.localeCompare(b.immediateOperation,undefined,{numeric:true})
 );
 const tr=totalQ.rows[0]||{};
 return {generatedAt:new Date().toISOString(),total:{jobs:num(tr.jobs),qty:num(tr.qty),surface:num(tr.surface)},chartTotal,statuses,areas,mainRows,immediateRows,auditJobs,cat3,cat5};
}

