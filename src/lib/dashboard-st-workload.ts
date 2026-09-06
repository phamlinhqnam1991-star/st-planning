import type {PoolClient} from "pg";
import {bestRecipeMatch} from "@/lib/planning/live-recipe";
import {getCachedLiveRecipeContext} from "@/lib/planning/planning-static-cache";

// V423: keep one canonical Dashboard ST Job population, but preserve Planning workload statuses.
// 1) Resolve Current Main first from the live Planning Chain (LastOperation + RAW NextOperation).
// 2) Filter RAW NextOperation after resolution by Dashboard ST Scope:
//      PLANNING_OPERATION -> MAIN
//      INTERMEDIATE       -> IMMEDIATE (Dashboard-only ST membership)
//      ST_SCOPE_ONLY      -> ST ONLY
// 3) That one-row-per-open-Job population is the inclusion source of truth.
// 4) Area-Main-Recipe workload detail / Surface Workload chart then expand ONLY those
//    included Jobs back to their active Planning Chain occurrences so future LOCKED rows remain WAIT.
//    Current-position chart and CAT3/CAT5 remain one row per current open Job.
// INTERMEDIATE remains Dashboard-only and never syncs Planning Chain / Candidate / Batch / Schedule.

export type StDashboardMetric={jobs:number;qty:number;surface:number};
export type StDashboardWaitNextBreakdown={previousMain:string;metric:StDashboardMetric};
export type StDashboardReadyRecipeBreakdown={previousMain:string;recipeKey:string;recipeNo:string;recipeName:string;metric:StDashboardMetric};
export type StDashboardReadyNextRecipeBreakdown={nextMain:string;recipeKey:string;recipeNo:string;recipeName:string;metric:StDashboardMetric};
export type StDashboardStatus="WAIT"|"READY"|"PLANNED_UNSCHEDULED"|"SCHEDULED"|"HOLD"|"ST_ONLY";

export type StDashboardRecipeRow={
 recipeKey:string;
 recipeNo:string;
 recipeName:string;
 WAIT:StDashboardMetric;
 WAIT_NEXT_MAIN:StDashboardMetric;
 WAIT_FUTURE_MAIN:StDashboardMetric;
 READY:StDashboardMetric;
 READY_PREV_SCHEDULED:StDashboardMetric;
 READY_PREV_UNSCHEDULED:StDashboardMetric;
 PLANNED_UNSCHEDULED:StDashboardMetric;
 SCHEDULED:StDashboardMetric;
 HOLD:StDashboardMetric;
 ST_ONLY:StDashboardMetric;
 total:StDashboardMetric;
 waitNextBreakdown:StDashboardWaitNextBreakdown[];
 readyPrevScheduledBreakdown:StDashboardReadyRecipeBreakdown[];
 readyPrevUnscheduledBreakdown:StDashboardReadyRecipeBreakdown[];
 readyNextScheduledBreakdown:StDashboardReadyNextRecipeBreakdown[];
};

export type StDashboardMainRow={
 areaId:number;
 areaName:string;
 areaSort:number;
 standardOperation:string;
 mainOrder:number;
 WAIT:StDashboardMetric;
 WAIT_NEXT_MAIN:StDashboardMetric;
 WAIT_FUTURE_MAIN:StDashboardMetric;
 READY:StDashboardMetric;
 READY_PREV_SCHEDULED:StDashboardMetric;
 READY_PREV_UNSCHEDULED:StDashboardMetric;
 PLANNED_UNSCHEDULED:StDashboardMetric;
 SCHEDULED:StDashboardMetric;
 HOLD:StDashboardMetric;
 ST_ONLY:StDashboardMetric;
 total:StDashboardMetric;
 waitNextBreakdown:StDashboardWaitNextBreakdown[];
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

export type StDashboardPriorityJob={
 jobNum:string;
 operationType:"PLANNING_OPERATION"|"INTERMEDIATE"|"ST_SCOPE_ONLY";
 bridgeRole:string;
 partNum:string;
 revisionNum:string;
 partDescription:string;
 priority:string;
 qty:number;
 surface:number;
 nextOperation:string;
 mainOrder:number;
 nextOperationOrder:number|null;
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

const DASHBOARD_BRIDGE_MATCH_SQL=(jobAlias="j",currentMainAlias="current_main")=>{
 const raw=`upper(trim(coalesce(${jobAlias}.next_operation,'')))`;
 const currentMain=`upper(trim(coalesce(${currentMainAlias}.standard_operation,'')))`;
 return `exists(
  select 1
  from public.md_intermediate_bridge_operation bo
  join public.md_intermediate_bridge_segment bs
    on bs.id=bo.segment_id
   and bs.is_active=true
  where upper(trim(bo.operation_code))=${raw}
    and upper(trim(bs.next_main_operation))=${currentMain}
 )`;
};

const DASHBOARD_DIRECT_MAIN_MATCH_SQL=(jobAlias="j",currentMainAlias="current_main")=>{
 const raw=`upper(trim(coalesce(${jobAlias}.next_operation,'')))`;
 const currentMain=`upper(trim(coalesce(${currentMainAlias}.standard_operation,'')))`;
 const currentSource=`upper(trim(coalesce(${currentMainAlias}.source_operation_code,'')))`;
 return `(
  ${currentMainAlias}.id is not null
  and (
   ${currentSource}=${raw}
   or ${currentMain}=${raw}
   or exists(
    select 1
    from public.md_st_operation_mapping dm
    where dm.is_active=true
      and upper(trim(dm.source_operation_code))=${raw}
      and upper(trim(dm.standard_operation_rule))=${currentMain}
   )
  )
 )`;
};

// Canonical one-row-per-open-Job Dashboard population. Do not add a separate RAW gate
// before Current Main resolution. The ST Scope filter is deliberately applied afterwards.
const DASHBOARD_VISIBLE_SQL=`
 with area_by_group as (
  select ag.st_group,min(ag.area_id) area_id
  from public.md_area_operation_group ag
  join public.md_area ax on ax.id=ag.area_id and ax.is_active=true
  where ag.is_active=true
  group by ag.st_group
 ), resolved as (
  select
   j.job_num,j.part_num,j.revision_num,j.part_description,j.priority_type,j.last_operation,
   coalesce(j.next_operation,'') raw_next_operation,
   coalesce(j.all_operation,'') all_operation,
   j.current_good_wip_qty,j.prod_qty,j.surface_per_part_dm2,j.total_surface,j.source_data,
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
   current_main.recipe_key current_planning_recipe_key,
   ${DASHBOARD_DIRECT_MAIN_MATCH_SQL("j","current_main")} direct_matches_current_main,
   ${DASHBOARD_BRIDGE_MATCH_SQL("j","current_main")} bridge_matches_current_main
  from public.open_job_current j
  left join lateral (
   select
    p0.id,p0.standard_operation,p0.source_operation_code,p0.route_resolution_mode,
    p0.previous_standard_operation_snapshot,p0.planning_seq,p0.source_seq,p0.status,
    p0.is_hold,p0.st_group,p0.recipe_key
   from public.planning_job_operation p0
   where p0.job_num=j.job_num
     and p0.is_active=true
     and p0.status in ('LOCKED','ELIGIBLE','PLANNED')
     and upper(trim(p0.standard_operation))<>'PIONBL'
   order by p0.planning_seq asc,p0.source_seq asc,p0.id asc
   limit 1
  ) current_main on true
  where j.is_open=true
 ), st_scope as (
  select
   upper(trim(operation_code)) operation_code,
   case
    when bool_or(operation_type='ST_SCOPE_ONLY') then 'ST_SCOPE_ONLY'
    when bool_or(operation_type='INTERMEDIATE') then 'INTERMEDIATE'
    when bool_or(operation_type='PLANNING_OPERATION') then 'PLANNING_OPERATION'
    else null
   end operation_type
  from public.md_st_operation_scope
  where is_active=true
    and operation_type in ('PLANNING_OPERATION','INTERMEDIATE','ST_SCOPE_ONLY')
    and nullif(trim(operation_code),'') is not null
  group by upper(trim(operation_code))
 ), classified as (
  select
   r.*,
   case
    when r.current_planning_id is null then 'UNRESOLVED'
    when r.direct_matches_current_main then 'MAIN'
    when r.bridge_matches_current_main then 'INTERMEDIATE'
    else 'RESOLVED_CONTEXT'
   end bridge_role,
   scope.operation_type st_scope_type,
   case
    when scope.operation_type='ST_SCOPE_ONLY' then 'ST_SCOPE_ONLY'
    when r.current_planning_id is null then null
    when scope.operation_type='PLANNING_OPERATION' then 'PLANNING_OPERATION'
    when scope.operation_type='INTERMEDIATE' then 'INTERMEDIATE'
    else null
   end operation_type
  from resolved r
  join st_scope scope
    on scope.operation_code=upper(trim(r.raw_next_operation))
 ), visible as (
  select *
  from classified
  where operation_type in ('PLANNING_OPERATION','INTERMEDIATE','ST_SCOPE_ONLY')
 )
 select
  v.*,
  coalesce(nullif(v.current_good_wip_qty,0),v.prod_qty,0)::float8 qty_used,
  (coalesce(nullif(v.current_good_wip_qty,0),v.prod_qty,0)*coalesce(v.surface_per_part_dm2,0))::float8 calculated_surface,
  coalesce(
   v.total_surface,
   coalesce(nullif(v.current_good_wip_qty,0),v.prod_qty,0)*coalesce(v.surface_per_part_dm2,0),
   0
  )::float8 surface_used,
  case when v.operation_type='ST_SCOPE_ONLY' then -2 else coalesce(a.id,0)::bigint end area_id,
  case when v.operation_type='ST_SCOPE_ONLY' then 'ST Scope Only' else coalesce(a.area_name,'Unmapped') end area_name,
  case when v.operation_type='ST_SCOPE_ONLY' then 999999998 else coalesce(a.sort_order,999999)::int end area_sort,
  case when v.operation_type='ST_SCOPE_ONLY' then 'ST_SCOPE_ONLY' else coalesce(v.current_main,'UNRESOLVED') end chart_main,
  case when v.operation_type='ST_SCOPE_ONLY' then 999999998 else coalesce(om.planning_sort_order,pscope.sort_order,999999)::int end main_order,
  nextopmaster.planning_sort_order next_operation_order,
  case
   when v.operation_type='ST_SCOPE_ONLY' then 'ST_ONLY'
   when coalesce(v.current_is_hold,false)=true and current_batch.batch_id is null then 'HOLD'
   when current_schedule.schedule_id is not null then 'SCHEDULED'
   when current_batch.batch_id is not null then 'PLANNED_UNSCHEDULED'
   when v.current_internal_status='PLANNED' then 'PLANNED_UNSCHEDULED'
   when v.current_internal_status='ELIGIBLE' then 'READY'
   else 'WAIT'
  end dashboard_status,
  current_batch.recipe_key current_batch_recipe_key,
  current_batch.batch_no current_batch_no,
  current_batch.batch_status current_batch_status,
  current_schedule.resource_code current_resource_code,
  current_schedule.schedule_status current_schedule_status,
  current_schedule.planned_start current_planned_start,
  current_schedule.planned_end current_planned_end,
  coalesce(next_main.standard_operation,'') next_main,
  coalesce(next_main.source_operation_code,'') next_main_source_operation,
  coalesce(next_main.planning_seq,0)::int next_planning_seq,
  coalesce(latest_batch.standard_operation,'') latest_batch_main,
  coalesce(latest_batch.batch_no,'') latest_batch_no,
  coalesce(latest_batch.batch_status,'') latest_batch_status,
  coalesce(latest_schedule.resource_code,'') latest_resource_code,
  coalesce(latest_schedule.schedule_status,'') latest_schedule_status,
  latest_schedule.planned_start latest_planned_start,
  latest_schedule.planned_end latest_planned_end
 from visible v
 left join area_by_group abg on abg.st_group=v.current_st_group
 left join public.md_area a on a.id=abg.area_id and a.is_active=true
 left join public.md_operation_master om on om.standard_operation=v.current_main and om.is_active=true
 left join public.md_planning_operation_scope pscope on pscope.standard_operation=v.current_main and pscope.is_active=true
 -- Dashboard CAT3/CAT5 primary order is RAW NextOperation Order from md_operation.planning_sort_order.
 -- Resolved Main Planning Order is only a deterministic fallback for RAW codes without an explicit order.
 -- LATERAL + LIMIT 1 avoids multiplying a Job when historical md_operation duplicates exist.
 left join lateral (
  select mo.planning_sort_order
  from public.md_operation mo
  where mo.is_active=true
    and upper(trim(mo.operation_code))=upper(trim(v.raw_next_operation))
  order by
    mo.planning_sort_order asc nulls last,
    mo.updated_at desc nulls last,
    mo.operation_code asc
  limit 1
 ) nextopmaster on true
 left join lateral (
  select b.id batch_id,b.batch_no,b.status batch_status,b.recipe_key
  from public.planning_batch_job bj
  join public.planning_batch b on b.id=bj.batch_id and b.status<>'CANCELLED'
  where v.current_planning_id is not null
    and bj.planning_job_operation_id=v.current_planning_id
  order by b.created_at desc,b.id desc
  limit 1
 ) current_batch on true
 left join lateral (
  select s.id schedule_id,s.resource_code,s.status schedule_status,s.planned_start,s.planned_end
  from public.planning_schedule s
  where s.batch_id=current_batch.batch_id and s.status<>'CANCELLED'
  order by s.planned_start desc,s.id desc
  limit 1
 ) current_schedule on true
 left join lateral (
  select p1.standard_operation,p1.source_operation_code,p1.planning_seq
  from public.planning_job_operation p1
  where v.current_planning_id is not null
    and p1.job_num=v.job_num
    and p1.is_active=true
    and p1.status in ('LOCKED','ELIGIBLE','PLANNED')
    and upper(trim(p1.standard_operation))<>'PIONBL'
  order by p1.planning_seq asc,p1.source_seq asc,p1.id asc
  offset 1 limit 1
 ) next_main on true
 left join lateral (
  select bj.standard_operation,b.id batch_id,b.batch_no,b.status batch_status,b.created_at
  from public.planning_batch_job bj
  join public.planning_batch b on b.id=bj.batch_id and b.status<>'CANCELLED'
  where bj.job_num=v.job_num
  order by b.created_at desc,b.id desc,bj.id desc
  limit 1
 ) latest_batch on true
 left join lateral (
  select s.resource_code,s.status schedule_status,s.planned_start,s.planned_end
  from public.planning_schedule s
  where s.batch_id=latest_batch.batch_id and s.status<>'CANCELLED'
  order by s.planned_start desc,s.id desc
  limit 1
 ) latest_schedule on true
 order by
  case v.operation_type when 'PLANNING_OPERATION' then 1 when 'INTERMEDIATE' then 2 else 3 end,
  area_sort,main_order,chart_main,upper(trim(v.raw_next_operation)),v.job_num
`;


const DASHBOARD_CHAIN_WORKLOAD_SQL=`
 with current_scope as (
  select * from unnest($1::text[],$2::bigint[]) as x(job_num,current_planning_id)
 ), area_by_group as (
  select ag.st_group,min(ag.area_id) area_id
  from public.md_area_operation_group ag
  join public.md_area ax on ax.id=ag.area_id and ax.is_active=true
  where ag.is_active=true
  group by ag.st_group
 ), base as (
  select
   p.id,p.job_num,p.standard_operation,p.source_operation_code,p.planning_seq,p.source_seq,
   p.recipe_key planning_recipe_key,p.status internal_status,p.is_hold,p.st_group,
   coalesce(a.id,0)::bigint area_id,
   coalesce(a.area_name,'Unmapped') area_name,
   coalesce(a.sort_order,999999)::int area_sort,
   coalesce(om.planning_sort_order,pscope.sort_order,999999)::int main_order,
   case
    when coalesce(p.is_hold,false)=true and active_batch.batch_id is null then 'HOLD'
    when active_schedule.schedule_id is not null then 'SCHEDULED'
    when active_batch.batch_id is not null then 'PLANNED_UNSCHEDULED'
    when p.status='PLANNED' then 'PLANNED_UNSCHEDULED'
    when p.status='ELIGIBLE' then 'READY'
    else 'WAIT'
   end dashboard_status,
   case
    when p.status='LOCKED' then case when not exists (
     select 1
     from public.planning_job_operation pw
     where pw.job_num=p.job_num
       and pw.is_active=true
       and (pw.status='LOCKED' or coalesce(pw.is_hold,false)=true)
       and upper(trim(pw.standard_operation))<>'PIONBL'
       and (coalesce(pw.planning_seq,2147483647),coalesce(pw.source_seq,2147483647),pw.id)
           < (coalesce(p.planning_seq,2147483647),coalesce(p.source_seq,2147483647),p.id)
    ) then 'NEXT_MAIN' else 'FUTURE_MAIN' end
    else null
   end wait_level,
   nullif(trim(coalesce(prev_ident.previous_operation,'')),'') previous_main_operation,
   coalesce(prev_batch.recipe_key,prev_live.recipe_key) previous_recipe_key,
   active_batch.recipe_key batch_recipe_key,
   active_batch.batch_no active_batch_no,
   case
    when p.status<>'ELIGIBLE' then null
    when nullif(trim(coalesce(prev_ident.previous_operation,'')),'') is null then 'SCHEDULED'
    when prev_schedule.schedule_id is not null then 'SCHEDULED'
    -- V476: First Main has no predecessor, so it belongs to the same READY handoff
    -- bucket as Previous Main Scheduled / Done.
    -- V473: canonical Current Main means Previous Main is already behind
    -- physical progress, even when legacy history has no Batch/Schedule.
    when p.id=cs.current_planning_id then 'SCHEDULED'
    else 'UNSCHEDULED'
   end ready_previous_schedule
  from public.planning_job_operation p
  join current_scope cs on cs.job_num=p.job_num
  left join area_by_group abg on abg.st_group=p.st_group
  left join public.md_area a on a.id=abg.area_id and a.is_active=true
  left join public.md_operation_master om on om.standard_operation=p.standard_operation and om.is_active=true
  left join public.md_planning_operation_scope pscope on pscope.standard_operation=p.standard_operation and pscope.is_active=true
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
  left join lateral (
   select p2.standard_operation,p2.source_operation_code,p2.source_seq,p2.recipe_key
   from public.planning_job_operation p2
   where p2.job_num=p.job_num
     and p2.is_active=true
     and upper(trim(p2.standard_operation))<>'PIONBL'
     and (
      (p.planning_seq is not null and p2.planning_seq<p.planning_seq)
      or (p.planning_seq is null and p.source_seq is not null and p2.source_seq<p.source_seq)
     )
   order by p2.planning_seq desc nulls last,p2.source_seq desc nulls last,p2.id desc
   limit 1
  ) prev_live on true
  left join lateral (
   select
    coalesce(nullif(trim(prev_live.standard_operation),''),nullif(trim(p.previous_standard_operation_snapshot),'')) previous_operation,
    coalesce(prev_live.source_seq,p.previous_source_seq_snapshot) previous_source_seq,
    coalesce(nullif(trim(prev_live.source_operation_code),''),nullif(trim(p.previous_source_operation_code_snapshot),'')) previous_source_operation
  ) prev_ident on true
  left join lateral (
   select hb.id batch_id,hb.recipe_key
   from public.planning_batch_job hbj
   join public.planning_batch hb on hb.id=hbj.batch_id and hb.status<>'CANCELLED'
   left join public.planning_job_operation hp on hp.id=hbj.planning_job_operation_id
   where hbj.job_num=p.job_num
     and nullif(trim(coalesce(prev_ident.previous_operation,'')),'') is not null
     and upper(trim(coalesce(nullif(hbj.standard_operation,''),hp.standard_operation,'')))=upper(trim(prev_ident.previous_operation))
     and (
      prev_ident.previous_source_seq is null
      or coalesce(hbj.source_seq_snapshot,hp.source_seq)=prev_ident.previous_source_seq
      or (
       nullif(trim(coalesce(prev_ident.previous_source_operation,'')),'') is not null
       and upper(trim(coalesce(nullif(hbj.source_operation_code,''),hp.source_operation_code,'')))=upper(trim(prev_ident.previous_source_operation))
      )
     )
   order by hb.created_at desc,hbj.id desc
   limit 1
  ) prev_batch on true
  left join lateral (
   select ps.id schedule_id
   from public.planning_schedule ps
   where ps.batch_id=prev_batch.batch_id and ps.status<>'CANCELLED' and ps.planned_start is not null
   order by ps.planned_start desc,ps.id desc
   limit 1
  ) prev_schedule on true
  where p.is_active=true
    and p.status in ('LOCKED','ELIGIBLE','PLANNED')
    and upper(trim(p.standard_operation))<>'PIONBL'
 ), picked as (
  select distinct on (job_num,standard_operation,dashboard_status)
   *
  from base
  order by job_num,standard_operation,dashboard_status,coalesce(planning_seq,999999),coalesce(source_seq,999999),id
 )
 select *
 from picked
 order by area_sort,main_order,standard_operation,dashboard_status,job_num
`;

function addMetric(target:StDashboardMetric,metric:StDashboardMetric){
 target.jobs+=metric.jobs;
 target.qty+=metric.qty;
 target.surface+=metric.surface;
}

function addWaitNextBreakdown(target:StDashboardWaitNextBreakdown[],previousMain:string,metric:StDashboardMetric){
 const key=text(previousMain)||"START";
 let row=target.find(x=>x.previousMain===key);
 if(!row){row={previousMain:key,metric:zero()};target.push(row);}
 addMetric(row.metric,metric);
}

function addReadyRecipeBreakdown(
 target:StDashboardReadyRecipeBreakdown[],
 input:{previousMain:string;recipeKey:string;recipeNo:string;recipeName:string},
 metric:StDashboardMetric
){
 const previousMain=text(input.previousMain);
 if(!previousMain)return; // First Main / START has no upstream recipe to break down.
 const recipeKey=text(input.recipeKey)||"__NO_RECIPE__";
 const recipeNo=text(input.recipeNo);
 const recipeName=text(input.recipeName)||"No Recipe";
 let row=target.find(x=>x.previousMain===previousMain&&x.recipeKey===recipeKey);
 if(!row){row={previousMain,recipeKey,recipeNo,recipeName,metric:zero()};target.push(row);}
 addMetric(row.metric,metric);
}

function addReadyNextRecipeBreakdown(
 target:StDashboardReadyNextRecipeBreakdown[],
 input:{nextMain:string;recipeKey:string;recipeNo:string;recipeName:string},
 metric:StDashboardMetric
){
 const nextMain=text(input.nextMain);
 if(!nextMain)return;
 const recipeKey=text(input.recipeKey)||"__NO_RECIPE__";
 const recipeNo=text(input.recipeNo);
 const recipeName=text(input.recipeName)||"No Recipe";
 let row=target.find(x=>x.nextMain===nextMain&&x.recipeKey===recipeKey);
 if(!row){row={nextMain,recipeKey,recipeNo,recipeName,metric:zero()};target.push(row);}
 addMetric(row.metric,metric);
}

function emptyStatusRecord():Record<StDashboardStatus,StDashboardMetric>{
 return {WAIT:zero(),READY:zero(),PLANNED_UNSCHEDULED:zero(),SCHEDULED:zero(),HOLD:zero(),ST_ONLY:zero()};
}

function emptyMainRow(input:{areaId:number;areaName:string;areaSort:number;standardOperation:string;mainOrder:number}):StDashboardMainRow{
 return {
  ...input,
  WAIT:zero(),WAIT_NEXT_MAIN:zero(),WAIT_FUTURE_MAIN:zero(),READY:zero(),READY_PREV_SCHEDULED:zero(),READY_PREV_UNSCHEDULED:zero(),PLANNED_UNSCHEDULED:zero(),SCHEDULED:zero(),HOLD:zero(),ST_ONLY:zero(),
  total:zero(),waitNextBreakdown:[],recipes:[]
 };
}

function toPriorityJob(raw:any):StDashboardPriorityJob{
 const operationType=text(raw.operation_type) as StDashboardPriorityJob["operationType"];
 const rawNext=text(raw.raw_next_operation);
 const planningMain=operationType==="ST_SCOPE_ONLY"?`ST ONLY / ${rawNext||"—"}`:text(raw.current_main);
 return {
  jobNum:text(raw.job_num),operationType,bridgeRole:text(raw.bridge_role),partNum:text(raw.part_num),revisionNum:text(raw.revision_num),
  partDescription:text(raw.part_description),priority:text(raw.priority_type),qty:num(raw.qty_used),surface:num(raw.surface_used),nextOperation:rawNext,
  mainOrder:num(raw.main_order),
  nextOperationOrder:raw.next_operation_order===null||raw.next_operation_order===undefined?null:num(raw.next_operation_order),
  planningMain,planningStatus:text(raw.dashboard_status),batchMain:text(raw.latest_batch_main),batchNo:text(raw.latest_batch_no),batchStatus:text(raw.latest_batch_status),
  resourceCode:text(raw.latest_resource_code),scheduleStatus:text(raw.latest_schedule_status),plannedStart:iso(raw.latest_planned_start),plannedEnd:iso(raw.latest_planned_end)
 };
}

export async function loadStDashboardData(c:PoolClient):Promise<StDashboardData>{
 const [visibleQ,ctx,recipeMetaQ]=await Promise.all([
  c.query(DASHBOARD_VISIBLE_SQL),
  getCachedLiveRecipeContext(c),
  c.query(`select recipe_key,recipe_no,recipe_name from public.md_process_recipe`)
 ]);

 const visibleRows=visibleQ.rows as any[];
 const visibleByJob=new Map<string,any>();
 const planningJobNums:string[]=[];
 const planningCurrentIds:number[]=[];
 for(const raw of visibleRows){
  const jobNum=text(raw.job_num);
  if(!jobNum)continue;
  visibleByJob.set(jobNum,raw);
  if(text(raw.operation_type)!=="ST_SCOPE_ONLY"){planningJobNums.push(jobNum);planningCurrentIds.push(num(raw.current_planning_id));}
 }
 const workloadQ=planningJobNums.length
  ?await c.query(DASHBOARD_CHAIN_WORKLOAD_SQL,[planningJobNums,planningCurrentIds])
  :{rows:[] as any[]};
 const workloadRows=workloadQ.rows as any[];

 const recipeMeta=new Map<string,{recipeNo:string;recipeName:string}>();
 for(const r of recipeMetaQ.rows as any[]){
  recipeMeta.set(text(r.recipe_key),{recipeNo:text(r.recipe_no),recipeName:text(r.recipe_name)});
 }

 // V503: READY Previous Main Scheduled/Done on Scheduling Board shows the NEXT Main Recipe.
 // Build the per-Job chain once so the canonical workload totals stay unchanged while the UI
 // receives an exact next-Main/next-Recipe breakdown for the READY Scheduled bucket.
 const chainByJob=new Map<string,any[]>();
 for(const wr of workloadRows){
  const jobNum=text(wr.job_num);
  if(!jobNum)continue;
  const list=chainByJob.get(jobNum)||[];
  list.push(wr);chainByJob.set(jobNum,list);
 }
 for(const list of chainByJob.values())list.sort((a,b)=>{
  const ap=num(a.planning_seq)||2147483647,bp=num(b.planning_seq)||2147483647;
  const as=num(a.source_seq)||2147483647,bs=num(b.source_seq)||2147483647;
  return ap-bp||as-bs||num(a.id)-num(b.id);
 });
 const resolveWorkloadRecipe=(wr:any,source:any)=>{
  const batchRecipeKey=text(wr?.batch_recipe_key);
  const liveMatch=batchRecipeKey?null:bestRecipeMatch(ctx,{
   standardOperation:text(wr?.standard_operation),
   sourceOperationCode:text(wr?.source_operation_code),
   partNum:source?.part_num,
   revisionNum:source?.revision_num,
   sourceData:source?.source_data||null,
   ruleSuggestion:null
  });
  const recipeKey=batchRecipeKey||liveMatch?.recipeKey||text(wr?.planning_recipe_key);
  const meta=recipeKey?recipeMeta.get(recipeKey):null;
  return {recipeKey,recipeNo:meta?.recipeNo||"",recipeName:meta?.recipeName||""};
 };

 const statuses=emptyStatusRecord();
 const total=zero();
 const chartTotal=zero();
 const rows=new Map<string,StDashboardMainRow>();
 const immediateRowsMap=new Map<string,StDashboardImmediateRow>();
 const cat3:StDashboardPriorityJob[]=[];
 const cat5:StDashboardPriorityJob[]=[];

 // Current-position population: one row per open Job. This drives the Immediate/Main/ST Only
 // combo chart and priority tables. It is also the ONLY source allowed to admit a Job to Dashboard.
 for(const raw of visibleRows){
  const operationType=text(raw.operation_type) as StDashboardImmediateRow["operationType"];
  if(!["PLANNING_OPERATION","INTERMEDIATE","ST_SCOPE_ONLY"].includes(operationType))continue;
  const currentMetric={jobs:1,qty:num(raw.qty_used),surface:num(raw.surface_used)};
  addMetric(chartTotal,currentMetric);

  const rawNext=text(raw.raw_next_operation)||"—";
  const areaId=num(raw.area_id);
  const areaName=text(raw.area_name)||"Unmapped";
  const areaSort=num(raw.area_sort)||999999;
  const mainOrder=num(raw.main_order)||999999;
  const immediateKey=`${operationType}|${areaId}|${text(raw.chart_main)}|${rawNext}`;
  let immediateRow=immediateRowsMap.get(immediateKey);
  if(!immediateRow){
   immediateRow={
    areaId,areaName,areaSort,standardOperation:text(raw.chart_main)||(operationType==="ST_SCOPE_ONLY"?"ST_SCOPE_ONLY":"UNRESOLVED"),
    mainOrder,immediateOperation:rawNext,operationType,total:zero()
   };
   immediateRowsMap.set(immediateKey,immediateRow);
  }
  addMetric(immediateRow.total,currentMetric);

  const priority=text(raw.priority_type).toUpperCase();
  if(priority==="CAT3")cat3.push(toPriorityJob(raw));
  if(priority==="CAT5")cat5.push(toPriorityJob(raw));
 }

 // Planning workload grain: expand only canonical visible Jobs to all active Planning Chain
 // occurrences. This is what restores future LOCKED operations as WAIT while keeping the new
 // Dashboard ST Scope gate intact.
 for(const wr of workloadRows){
  const source=visibleByJob.get(text(wr.job_num));
  if(!source)continue;
  const bucket=text(wr.dashboard_status) as StDashboardStatus;
  if(!(bucket in statuses)||bucket==="ST_ONLY")continue;
  const metric={jobs:1,qty:num(source.qty_used),surface:num(source.surface_used)};
  addMetric(total,metric);
  addMetric(statuses[bucket],metric);

  const areaId=num(wr.area_id);
  const areaName=text(wr.area_name)||"Unmapped";
  const areaSort=num(wr.area_sort)||999999;
  const standardOperation=text(wr.standard_operation)||"UNRESOLVED";
  const mainOrder=num(wr.main_order)||999999;
  const mainKey=`${areaId}|${standardOperation}`;
  let row=rows.get(mainKey);
  if(!row){
   row=emptyMainRow({areaId,areaName,areaSort,standardOperation,mainOrder});
   rows.set(mainKey,row);
  }
  addMetric(row[bucket],metric);
  if(bucket==="WAIT"){
   const waitKey:"WAIT_NEXT_MAIN"|"WAIT_FUTURE_MAIN"=text(wr.wait_level)==="NEXT_MAIN"?"WAIT_NEXT_MAIN":"WAIT_FUTURE_MAIN";
   addMetric(row[waitKey],metric);
   if(waitKey==="WAIT_NEXT_MAIN")addWaitNextBreakdown(row.waitNextBreakdown,text(wr.previous_main_operation),metric);
  }
  if(bucket==="READY"){
   const readyKey=text(wr.ready_previous_schedule)==="SCHEDULED"?"READY_PREV_SCHEDULED":"READY_PREV_UNSCHEDULED";
   addMetric(row[readyKey],metric);
  }

  const currentRecipe=resolveWorkloadRecipe(wr,source);
  const recipeKey=currentRecipe.recipeKey;
  const recipeNo=currentRecipe.recipeNo;
  const recipeName=currentRecipe.recipeName;
  const recipeGroupKey=recipeKey||"__NO_RECIPE__";
  let recipe=row.recipes.find(x=>x.recipeKey===recipeGroupKey);
  if(!recipe){
   recipe={
    recipeKey:recipeGroupKey,recipeNo,recipeName,
    WAIT:zero(),WAIT_NEXT_MAIN:zero(),WAIT_FUTURE_MAIN:zero(),READY:zero(),READY_PREV_SCHEDULED:zero(),READY_PREV_UNSCHEDULED:zero(),PLANNED_UNSCHEDULED:zero(),SCHEDULED:zero(),HOLD:zero(),ST_ONLY:zero(),total:zero(),waitNextBreakdown:[],readyPrevScheduledBreakdown:[],readyPrevUnscheduledBreakdown:[],readyNextScheduledBreakdown:[]
   };
   row.recipes.push(recipe);
  }
  addMetric(recipe[bucket],metric);
  if(bucket==="WAIT"){
   const waitKey:"WAIT_NEXT_MAIN"|"WAIT_FUTURE_MAIN"=text(wr.wait_level)==="NEXT_MAIN"?"WAIT_NEXT_MAIN":"WAIT_FUTURE_MAIN";
   addMetric(recipe[waitKey],metric);
   if(waitKey==="WAIT_NEXT_MAIN")addWaitNextBreakdown(recipe.waitNextBreakdown,text(wr.previous_main_operation),metric);
  }
  if(bucket==="READY"){
   const readyKey=text(wr.ready_previous_schedule)==="SCHEDULED"?"READY_PREV_SCHEDULED":"READY_PREV_UNSCHEDULED";
   addMetric(recipe[readyKey],metric);
   const previousRecipeKey=text(wr.previous_recipe_key);
   const previousRecipeMeta=previousRecipeKey?recipeMeta.get(previousRecipeKey):null;
   addReadyRecipeBreakdown(
    readyKey==="READY_PREV_SCHEDULED"?recipe.readyPrevScheduledBreakdown:recipe.readyPrevUnscheduledBreakdown,
    {
     previousMain:text(wr.previous_main_operation),
     recipeKey:previousRecipeKey,
     recipeNo:previousRecipeMeta?.recipeNo||"",
     recipeName:previousRecipeMeta?.recipeName||"No Recipe"
    },
    metric
   );
   if(readyKey==="READY_PREV_SCHEDULED"){
    const chain=chainByJob.get(text(wr.job_num))||[];
    const index=chain.findIndex(x=>Number(x.id)===Number(wr.id));
    const next=index>=0?chain[index+1]||null:null;
    if(next){
     const nextRecipe=resolveWorkloadRecipe(next,source);
     addReadyNextRecipeBreakdown(recipe.readyNextScheduledBreakdown,{
      nextMain:text(next.standard_operation),
      recipeKey:nextRecipe.recipeKey,
      recipeNo:nextRecipe.recipeNo,
      recipeName:nextRecipe.recipeName||"No Recipe"
     },metric);
    }
   }
  }
 }

 // ST_SCOPE_ONLY has no Planning Chain occurrence by design, so keep it as a standalone
 // Dashboard workload row after the canonical current-position scope filter.
 for(const raw of visibleRows){
  if(text(raw.operation_type)!=="ST_SCOPE_ONLY")continue;
  const bucket:StDashboardStatus="ST_ONLY";
  const metric={jobs:1,qty:num(raw.qty_used),surface:num(raw.surface_used)};
  addMetric(total,metric);
  addMetric(statuses[bucket],metric);
  const rawNext=text(raw.raw_next_operation)||"—";
  const areaId=num(raw.area_id);
  const areaName=text(raw.area_name)||"ST Scope Only";
  const areaSort=num(raw.area_sort)||999999998;
  const standardOperation=`ST ONLY / ${rawNext}`;
  const mainOrder=num(raw.main_order)||999999998;
  const mainKey=`${areaId}|${standardOperation}`;
  let row=rows.get(mainKey);
  if(!row){
   row=emptyMainRow({areaId,areaName,areaSort,standardOperation,mainOrder});
   rows.set(mainKey,row);
  }
  addMetric(row[bucket],metric);
  let recipe=row.recipes.find(x=>x.recipeKey==="__ST_SCOPE_ONLY__");
  if(!recipe){
   recipe={recipeKey:"__ST_SCOPE_ONLY__",recipeNo:"",recipeName:"ST Scope Only",WAIT:zero(),WAIT_NEXT_MAIN:zero(),WAIT_FUTURE_MAIN:zero(),READY:zero(),READY_PREV_SCHEDULED:zero(),READY_PREV_UNSCHEDULED:zero(),PLANNED_UNSCHEDULED:zero(),SCHEDULED:zero(),HOLD:zero(),ST_ONLY:zero(),total:zero(),waitNextBreakdown:[],readyPrevScheduledBreakdown:[],readyPrevUnscheduledBreakdown:[],readyNextScheduledBreakdown:[]};
   row.recipes.push(recipe);
  }
  addMetric(recipe[bucket],metric);
 }

 const mainRows=[...rows.values()].map(row=>{
  row.waitNextBreakdown.sort((a,b)=>b.metric.surface-a.metric.surface||b.metric.jobs-a.metric.jobs||a.previousMain.localeCompare(b.previousMain));
  const metrics=[row.WAIT,row.READY,row.PLANNED_UNSCHEDULED,row.SCHEDULED,row.HOLD,row.ST_ONLY];
  row.total=metrics.reduce((acc,m)=>{addMetric(acc,m);return acc;},zero());
  row.recipes=row.recipes.map(recipe=>{
   recipe.waitNextBreakdown.sort((a,b)=>b.metric.surface-a.metric.surface||b.metric.jobs-a.metric.jobs||a.previousMain.localeCompare(b.previousMain));
   const sortReadyBreakdown=(a:StDashboardReadyRecipeBreakdown,b:StDashboardReadyRecipeBreakdown)=>b.metric.surface-a.metric.surface||b.metric.jobs-a.metric.jobs||a.previousMain.localeCompare(b.previousMain)||a.recipeNo.localeCompare(b.recipeNo,undefined,{numeric:true})||a.recipeName.localeCompare(b.recipeName);
   recipe.readyPrevScheduledBreakdown.sort(sortReadyBreakdown);
   recipe.readyPrevUnscheduledBreakdown.sort(sortReadyBreakdown);
   recipe.readyNextScheduledBreakdown.sort((a,b)=>b.metric.surface-a.metric.surface||b.metric.jobs-a.metric.jobs||a.nextMain.localeCompare(b.nextMain)||a.recipeNo.localeCompare(b.recipeNo,undefined,{numeric:true})||a.recipeName.localeCompare(b.recipeName));
   const rm=[recipe.WAIT,recipe.READY,recipe.PLANNED_UNSCHEDULED,recipe.SCHEDULED,recipe.HOLD,recipe.ST_ONLY];
   recipe.total=rm.reduce((acc,m)=>{addMetric(acc,m);return acc;},zero());
   return recipe;
  }).sort((a,b)=>{
   if(a.recipeKey==="__ST_SCOPE_ONLY__"&&b.recipeKey!=="__ST_SCOPE_ONLY__")return 1;
   if(b.recipeKey==="__ST_SCOPE_ONLY__"&&a.recipeKey!=="__ST_SCOPE_ONLY__")return -1;
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
   area={areaId:row.areaId,areaName:row.areaName,areaSort:row.areaSort,total:zero(),statuses:emptyStatusRecord(),mainRows:[]};
   areasMap.set(key,area);
  }
  area.mainRows.push(row);
  addMetric(area.total,row.total);
  for(const status of ["WAIT","READY","PLANNED_UNSCHEDULED","SCHEDULED","HOLD","ST_ONLY"] as StDashboardStatus[]){
   addMetric(area.statuses[status],row[status]);
  }
 }
 const areas=[...areasMap.values()].sort((a,b)=>a.areaSort-b.areaSort||a.areaName.localeCompare(b.areaName));

 const typeOrder:Record<StDashboardImmediateRow["operationType"],number>={PLANNING_OPERATION:1,INTERMEDIATE:2,ST_SCOPE_ONLY:3};
 const immediateRows=[...immediateRowsMap.values()].sort((a,b)=>
  typeOrder[a.operationType]-typeOrder[b.operationType]||a.areaSort-b.areaSort||a.mainOrder-b.mainOrder||a.standardOperation.localeCompare(b.standardOperation)||a.immediateOperation.localeCompare(b.immediateOperation,undefined,{numeric:true})
 );
 const comparePriorityByNextOperationOrder=(a:StDashboardPriorityJob,b:StDashboardPriorityJob)=>{
  // CAT3/CAT5 are a current-position list, so the primary order must be the
  // RAW NextOperation order itself (md_operation.planning_sort_order).
  // Main Planning Order is only the fallback when a RAW operation has no explicit order.
  const aCodeMissing=a.nextOperationOrder===null||!Number.isFinite(Number(a.nextOperationOrder));
  const bCodeMissing=b.nextOperationOrder===null||!Number.isFinite(Number(b.nextOperationOrder));
  if(aCodeMissing!==bCodeMissing)return aCodeMissing?1:-1;
  if(!aCodeMissing&&!bCodeMissing&&Number(a.nextOperationOrder)!==Number(b.nextOperationOrder)){
   return Number(a.nextOperationOrder)-Number(b.nextOperationOrder);
  }

  if(a.mainOrder!==b.mainOrder)return a.mainOrder-b.mainOrder;

  const nextCmp=(a.nextOperation||"").localeCompare(b.nextOperation||"",undefined,{numeric:true,sensitivity:"base"});
  if(nextCmp!==0)return nextCmp;

  const aMainGroup=a.operationType==="ST_SCOPE_ONLY"?"ST_SCOPE_ONLY":(a.planningMain||"");
  const bMainGroup=b.operationType==="ST_SCOPE_ONLY"?"ST_SCOPE_ONLY":(b.planningMain||"");
  const mainCmp=aMainGroup.localeCompare(bMainGroup,undefined,{numeric:true,sensitivity:"base"});
  if(mainCmp!==0)return mainCmp;

  return (a.jobNum||"").localeCompare(b.jobNum||"",undefined,{numeric:true,sensitivity:"base"});
 };
 cat3.sort(comparePriorityByNextOperationOrder);
 cat5.sort(comparePriorityByNextOperationOrder);

 return {
  generatedAt:new Date().toISOString(),
  total,
  chartTotal,
  statuses,
  areas,
  mainRows,
  immediateRows,
  cat3,
  cat5
 };
}

// V492 · Scheduling Workload Quick View.
// This reuses the exact canonical Dashboard-visible population + Planning Chain workload SQL above,
// then only filters the requested Main/Recipe/Bucket for the Scheduling popup. No second READY/WAIT
// classifier is introduced here.
export type StWorkloadQuickViewStatus="READY_PREV_SCHEDULED"|"READY_PREV_UNSCHEDULED"|"WAIT_NEXT_MAIN"|"WAIT_FUTURE_MAIN"|"HOLD";
export type StWorkloadQuickViewRow={
 planningJobOperationId:number;
 jobNum:string;
 partNum:string;
 revisionNum:string;
 partDescription:string;
 priority:string;
 qty:number;
 surface:number;
 previousMain:string;
 standardOperation:string;
 recipeKey:string;
 recipeNo:string;
 recipeName:string;
 nextMain:string;
 nextRecipeKey:string;
 nextRecipeNo:string;
 nextRecipeName:string;
 currentBatchNo:string;
 internalStatus:string;
};
export type StWorkloadQuickViewBatch={
 id:number;
 batchNo:string;
 standardOperation:string;
 recipeKey:string;
 recipeNo:string;
 recipeName:string;
 totalJobs:number;
 totalQty:number;
 totalSurface:number;
 scheduled:boolean;
 resourceCode:string;
};

function workloadTuple(raw:any){
 return [num(raw.planning_seq)||2147483647,num(raw.source_seq)||2147483647,num(raw.id)||2147483647] as const;
}
function compareWorkloadTuple(a:any,b:any){
 const ta=workloadTuple(a),tb=workloadTuple(b);
 return ta[0]-tb[0]||ta[1]-tb[1]||ta[2]-tb[2];
}

export async function loadStWorkloadQuickView(c:PoolClient,input:{
 standardOperation:string;
 recipeKey?:string|null;
 status:StWorkloadQuickViewStatus;
 previousMain?:string|null;
 nextMain?:string|null;
 nextRecipeKey?:string|null;
}){
 const requestedMain=text(input.standardOperation).toUpperCase();
 const requestedRecipe=text(input.recipeKey);
 const requestedPrevious=text(input.previousMain).toUpperCase();
 const requestedNextMain=text(input.nextMain).toUpperCase();
 const requestedNextRecipe=text(input.nextRecipeKey);
 if(!requestedMain)throw new Error("Main Operation là bắt buộc.");

 const [visibleQ,ctx,recipeMetaQ]=await Promise.all([
  c.query(DASHBOARD_VISIBLE_SQL),
  getCachedLiveRecipeContext(c),
  c.query(`select recipe_key,recipe_no,recipe_name from public.md_process_recipe`)
 ]);
 const visibleRows=visibleQ.rows as any[];
 const visibleByJob=new Map<string,any>();
 const planningJobNums:string[]=[];
 const planningCurrentIds:number[]=[];
 for(const raw of visibleRows){
  const jobNum=text(raw.job_num);
  if(!jobNum)continue;
  visibleByJob.set(jobNum,raw);
  if(text(raw.operation_type)!=="ST_SCOPE_ONLY"){
   planningJobNums.push(jobNum);
   planningCurrentIds.push(num(raw.current_planning_id));
  }
 }
 const workloadQ=planningJobNums.length
  ?await c.query(DASHBOARD_CHAIN_WORKLOAD_SQL,[planningJobNums,planningCurrentIds])
  :{rows:[] as any[]};
 const workloadRows=workloadQ.rows as any[];
 const recipeMeta=new Map<string,{recipeNo:string;recipeName:string}>();
 for(const r of recipeMetaQ.rows as any[]){
  recipeMeta.set(text(r.recipe_key),{recipeNo:text(r.recipe_no),recipeName:text(r.recipe_name)});
 }
 const chainByJob=new Map<string,any[]>();
 for(const wr of workloadRows){
  const key=text(wr.job_num);
  if(!key)continue;
  const list=chainByJob.get(key)||[];
  list.push(wr);chainByJob.set(key,list);
 }
 for(const list of chainByJob.values())list.sort(compareWorkloadTuple);

 const resolveRecipe=(wr:any,source:any)=>{
  const batchRecipeKey=text(wr?.batch_recipe_key);
  const liveMatch=batchRecipeKey?null:bestRecipeMatch(ctx,{
   standardOperation:text(wr?.standard_operation),
   sourceOperationCode:text(wr?.source_operation_code),
   partNum:source?.part_num,
   revisionNum:source?.revision_num,
   sourceData:source?.source_data||null,
   ruleSuggestion:null
  });
  const recipeKey=batchRecipeKey||liveMatch?.recipeKey||text(wr?.planning_recipe_key);
  const meta=recipeKey?recipeMeta.get(recipeKey):null;
  return {recipeKey,recipeNo:meta?.recipeNo||"",recipeName:meta?.recipeName||""};
 };
 const statusMatches=(wr:any)=>{
  const bucket=text(wr.dashboard_status);
  if(input.status==="READY_PREV_SCHEDULED")return bucket==="READY"&&text(wr.ready_previous_schedule)==="SCHEDULED";
  if(input.status==="READY_PREV_UNSCHEDULED")return bucket==="READY"&&text(wr.ready_previous_schedule)!=="SCHEDULED";
  if(input.status==="WAIT_NEXT_MAIN")return bucket==="WAIT"&&text(wr.wait_level)==="NEXT_MAIN";
  if(input.status==="WAIT_FUTURE_MAIN")return bucket==="WAIT"&&text(wr.wait_level)!=="NEXT_MAIN";
  return bucket==="HOLD";
 };

 const rows:StWorkloadQuickViewRow[]=[];
 for(const wr of workloadRows){
  if(text(wr.standard_operation).toUpperCase()!==requestedMain||!statusMatches(wr))continue;
  if(requestedPrevious){
   const actualPrevious=text(wr.previous_main_operation).toUpperCase();
   if(requestedPrevious==="START" ? Boolean(actualPrevious) : actualPrevious!==requestedPrevious)continue;
  }
  const source=visibleByJob.get(text(wr.job_num));
  if(!source)continue;
  const currentRecipe=resolveRecipe(wr,source);
  const currentRecipeGroup=currentRecipe.recipeKey||"__NO_RECIPE__";
  if(requestedRecipe&&requestedRecipe!==currentRecipeGroup)continue;

  const chain=chainByJob.get(text(wr.job_num))||[];
  const index=chain.findIndex(x=>Number(x.id)===Number(wr.id));
  const next=index>=0?chain[index+1]||null:null;
  const nextRecipe=next?resolveRecipe(next,source):{recipeKey:"",recipeNo:"",recipeName:""};
  if(requestedNextMain&&text(next?.standard_operation).toUpperCase()!==requestedNextMain)continue;
  if(requestedNextRecipe&&(nextRecipe.recipeKey||"__NO_RECIPE__")!==requestedNextRecipe)continue;
  rows.push({
   planningJobOperationId:num(wr.id),
   jobNum:text(wr.job_num),
   partNum:text(source.part_num),
   revisionNum:text(source.revision_num),
   partDescription:text(source.part_description),
   priority:text(source.priority_type),
   qty:num(source.qty_used),
   surface:num(source.surface_used),
   previousMain:text(wr.previous_main_operation),
   standardOperation:text(wr.standard_operation),
   recipeKey:currentRecipe.recipeKey,
   recipeNo:currentRecipe.recipeNo,
   recipeName:currentRecipe.recipeName,
   nextMain:text(next?.standard_operation),
   nextRecipeKey:nextRecipe.recipeKey,
   nextRecipeNo:nextRecipe.recipeNo,
   nextRecipeName:nextRecipe.recipeName,
   currentBatchNo:text(wr.active_batch_no||wr.batch_no),
   internalStatus:text(wr.internal_status)
  });
 }
 rows.sort((a,b)=>a.jobNum.localeCompare(b.jobNum,undefined,{numeric:true,sensitivity:"base"}));

 const batchParams:any[]=[requestedMain];
 let recipeWhere="";
 if(requestedRecipe){
  if(requestedRecipe==="__NO_RECIPE__")recipeWhere=" and b.recipe_key is null";
  else{batchParams.push(requestedRecipe);recipeWhere=` and b.recipe_key=$${batchParams.length}`;}
 }
 const batchQ=await c.query(`
  select b.id,b.batch_no,b.standard_operation,b.recipe_key,b.total_jobs,b.total_qty,b.total_surface_dm2,
         r.recipe_no,r.recipe_name,
         sch.schedule_id,sch.resource_code
  from public.planning_batch b
  left join public.md_process_recipe r on r.recipe_key=b.recipe_key
  left join lateral (
   select s.id schedule_id,s.resource_code
   from public.planning_schedule s
   where s.batch_id=b.id and s.status<>'CANCELLED'
   order by s.planned_start desc,s.id desc
   limit 1
  ) sch on true
  where upper(trim(b.standard_operation))=upper(trim($1))
    and upper(trim(coalesce(b.status,''))) not in ('CANCELLED','COMPLETED')
    ${recipeWhere}
  order by b.created_at desc,b.id desc
  limit 200
 `,batchParams);
 const batches:StWorkloadQuickViewBatch[]=batchQ.rows.map((b:any)=>({
  id:num(b.id),batchNo:text(b.batch_no),standardOperation:text(b.standard_operation),recipeKey:text(b.recipe_key),
  recipeNo:text(b.recipe_no),recipeName:text(b.recipe_name),totalJobs:num(b.total_jobs),totalQty:num(b.total_qty),
  totalSurface:num(b.total_surface_dm2),scheduled:Boolean(b.schedule_id),resourceCode:text(b.resource_code)
 }));
 return {rows,batches};
}
