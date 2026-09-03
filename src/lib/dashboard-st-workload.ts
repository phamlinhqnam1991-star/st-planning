import type {PoolClient} from "pg";
import {bestRecipeMatch} from "@/lib/planning/live-recipe";
import {getCachedLiveRecipeContext} from "@/lib/planning/planning-static-cache";
import {RAW_ST_VISIBLE_CTE_SQL} from "@/lib/planning/raw-st-visible-sql";

export type StDashboardMetric={jobs:number;qty:number;surface:number};
export type StDashboardStatus="WAIT"|"READY"|"PLANNED"|"PLANNED_UNSCHEDULED"|"SCHEDULED"|"HOLD";

export type StDashboardRecipeRow={
 recipeKey:string;
 recipeNo:string;
 recipeName:string;
 WAIT:StDashboardMetric;
 READY:StDashboardMetric;
 PLANNED:StDashboardMetric;
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
 PLANNED:StDashboardMetric;
 PLANNED_UNSCHEDULED:StDashboardMetric;
 SCHEDULED:StDashboardMetric;
 HOLD:StDashboardMetric;
 total:StDashboardMetric;
 recipes:StDashboardRecipeRow[];
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
 statuses:Record<StDashboardStatus,StDashboardMetric>;
 areas:StDashboardAreaRow[];
 mainRows:StDashboardMainRow[];
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

const WORKLOAD_SQL=`
 with ${RAW_ST_VISIBLE_CTE_SQL}, area_by_group as (
  select ag.st_group,min(ag.area_id) area_id
  from public.md_area_operation_group ag
  join public.md_area ax on ax.id=ag.area_id and ax.is_active=true
  where ag.is_active=true
  group by ag.st_group
 ), base as (
  select
   p.id,p.job_num,p.standard_operation,p.source_operation_code,p.planning_seq,p.recipe_key planning_recipe_key,
   coalesce(a.id,0)::bigint area_id,
   coalesce(a.area_name,'Unmapped') area_name,
   coalesce(a.sort_order,999999)::int area_sort,
   coalesce(om.planning_sort_order,scope.sort_order,999999)::int main_order,
   case
    when coalesce(p.is_hold,false)=true and active_batch.batch_id is null then 'HOLD'
    when active_schedule.schedule_id is not null then 'SCHEDULED'
    when active_batch.batch_id is not null then 'PLANNED_UNSCHEDULED'
    when p.status='PLANNED' then 'PLANNED'
    when p.status='ELIGIBLE' then 'READY'
    else 'WAIT'
   end bucket,
   coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)::float8 qty,
   coalesce(
    j.total_surface,
    coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)*coalesce(j.surface_per_part_dm2,0),
    0
   )::float8 surface,
   j.part_num,j.revision_num,j.source_data,
   active_batch.recipe_key batch_recipe_key
  from public.planning_job_operation p
  join public.open_job_current j on j.job_num=p.job_num and j.is_open=true
  join visible_st_raw rawst on rawst.operation_code=upper(trim(coalesce(j.next_operation,'')))
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


async function loadPriorityJobs(c:PoolClient,priority:string):Promise<StDashboardPriorityJob[]>{
 const q=await c.query(`
  with ${RAW_ST_VISIBLE_CTE_SQL}
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
  join visible_st_raw rawst on rawst.operation_code=upper(trim(coalesce(j.next_operation,'')))
  left join lateral (
   select
    p.id,p.standard_operation,p.planning_seq,
    case
     when coalesce(p.is_hold,false)=true and fb.batch_id is null then 'HOLD'
     when fs.schedule_id is not null then 'SCHEDULED'
     when fb.batch_id is not null then 'PLANNED-UNSCHEDULED'
     when p.status='PLANNED' then 'PLANNED'
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
   where p.job_num=j.job_num and p.is_active=true and upper(trim(p.standard_operation))<>'PIONBL'
   order by
    case
     when coalesce(p.is_hold,false)=true and fb.batch_id is null then 0
     when p.status='ELIGIBLE' then 1
     when p.status='PLANNED' then 2
     else 3
    end,
    case when p.status='PLANNED' then -coalesce(p.planning_seq,0) else coalesce(p.planning_seq,999999) end,
    p.id
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
  where j.is_open=true and upper(trim(coalesce(j.priority_type,'')))=$1
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
 const [workloadQ,totalQ,cat3,cat5,ctx,recipeMetaQ]=await Promise.all([
  c.query(WORKLOAD_SQL),
  c.query(`
   with ${RAW_ST_VISIBLE_CTE_SQL}, per_job as (
    select
     j.job_num,
     max(coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0))::numeric qty,
     max(coalesce(
       j.total_surface,
       coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)*coalesce(j.surface_per_part_dm2,0),
       0
     ))::numeric surface
    from public.open_job_current j
    join visible_st_raw rawst on rawst.operation_code=upper(trim(coalesce(j.next_operation,'')))
    join public.planning_job_operation p on p.job_num=j.job_num and p.is_active=true
    where j.is_open=true and upper(trim(p.standard_operation))<>'PIONBL'
    group by j.job_num
   )
   select count(*)::int jobs,coalesce(sum(qty),0)::float8 qty,coalesce(sum(surface),0)::float8 surface
   from per_job
  `),
  loadPriorityJobs(c,"CAT3"),
  loadPriorityJobs(c,"CAT5"),
  getCachedLiveRecipeContext(c),
  c.query(`select recipe_key,recipe_no,recipe_name from public.md_process_recipe`)
 ]);

 const statuses:Record<StDashboardStatus,StDashboardMetric>={
  WAIT:zero(),READY:zero(),PLANNED:zero(),PLANNED_UNSCHEDULED:zero(),SCHEDULED:zero(),HOLD:zero()
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
    WAIT:zero(),READY:zero(),PLANNED:zero(),PLANNED_UNSCHEDULED:zero(),SCHEDULED:zero(),HOLD:zero(),total:zero(),recipes:[]
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
   recipe={recipeKey:recipeGroupKey,recipeNo,recipeName,WAIT:zero(),READY:zero(),PLANNED:zero(),PLANNED_UNSCHEDULED:zero(),SCHEDULED:zero(),HOLD:zero(),total:zero()};
   row.recipes.push(recipe);
  }
  recipe[bucket].jobs+=1;recipe[bucket].qty+=metric.qty;recipe[bucket].surface+=metric.surface;
 }

 const mainRows=[...rows.values()].map(row=>{
  const metrics=[row.WAIT,row.READY,row.PLANNED,row.PLANNED_UNSCHEDULED,row.SCHEDULED,row.HOLD];
  row.total={jobs:metrics.reduce((s,x)=>s+x.jobs,0),qty:metrics.reduce((s,x)=>s+x.qty,0),surface:metrics.reduce((s,x)=>s+x.surface,0)};
  row.recipes=row.recipes.map(recipe=>{
   const rm=[recipe.WAIT,recipe.READY,recipe.PLANNED,recipe.PLANNED_UNSCHEDULED,recipe.SCHEDULED,recipe.HOLD];
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
    statuses:{WAIT:zero(),READY:zero(),PLANNED:zero(),PLANNED_UNSCHEDULED:zero(),SCHEDULED:zero(),HOLD:zero()},
    mainRows:[]
   };
   areasMap.set(key,area);
  }
  area.mainRows.push(row);
  for(const status of ["WAIT","READY","PLANNED","PLANNED_UNSCHEDULED","SCHEDULED","HOLD"] as StDashboardStatus[]){
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
 const tr=totalQ.rows[0]||{};
 return {generatedAt:new Date().toISOString(),total:{jobs:num(tr.jobs),qty:num(tr.qty),surface:num(tr.surface)},statuses,areas,mainRows,cat3,cat5};
}

