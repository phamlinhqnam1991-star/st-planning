import type {PoolClient} from "pg";
import {resolvePlanningView} from "@/lib/planning/planning-view-server";

export type PlanningWorkloadMetric={jobs:number;qty:number;surface:number};
export type PlanningWorkloadSummaryRow={
 areaId:number;
 areaName:string;
 areaSort:number;
 standardOperation:string;
 mainOrder:number;
 ready:PlanningWorkloadMetric;
 readyPrevScheduled:PlanningWorkloadMetric;
 readyPrevUnscheduled:PlanningWorkloadMetric;
 wait:PlanningWorkloadMetric;
 waitNextMain:PlanningWorkloadMetric;
 waitFutureMain:PlanningWorkloadMetric;
 hold:PlanningWorkloadMetric;
 total:PlanningWorkloadMetric;
};
export type PlanningWorkloadTotals={
 READY:PlanningWorkloadMetric;
 READY_PREV_SCHEDULED:PlanningWorkloadMetric;
 READY_PREV_UNSCHEDULED:PlanningWorkloadMetric;
 WAIT:PlanningWorkloadMetric;
 WAIT_NEXT_MAIN:PlanningWorkloadMetric;
 WAIT_FUTURE_MAIN:PlanningWorkloadMetric;
 HOLD:PlanningWorkloadMetric;
};
export type PlanningWorkloadSummaryResult={
 rows:PlanningWorkloadSummaryRow[];
 totals:PlanningWorkloadTotals;
 scope:{areaId:number|null;op:string|null;rowOperations:string[]|null};
};

const zeroMetric=():PlanningWorkloadMetric=>({jobs:0,qty:0,surface:0});
const addMetric=(target:PlanningWorkloadMetric,metric:PlanningWorkloadMetric)=>{
 target.jobs+=metric.jobs;
 target.qty+=metric.qty;
 target.surface+=metric.surface;
};

export async function loadPlanningWorkloadSummary(
 c:PoolClient,
 options:{
  areaId?:number|null;
  areaIdRaw?:string;
  op?:string;
  rowOperations?:string[];
 }={}
):Promise<PlanningWorkloadSummaryResult>{
 const areaId=options.areaId&&Number(options.areaId)>0?Number(options.areaId):null;
 const areaIdRaw=String(options.areaIdRaw??(areaId||"")).trim();
 const op=String(options.op||"").trim();
 const rowOperations=[...new Set((options.rowOperations||[]).map(x=>String(x||"").trim().toUpperCase()).filter(Boolean))];

 // Candidate membership is always resolved first from the same Planning ST View
 // as the Route Matrix. rowOperations only narrows which active Planning Chain
 // rows are summarized AFTER Candidate membership has been established.
 const {stViewParams}=await resolvePlanningView(c,op,areaIdRaw);
 if(!stViewParams.length){
  return {
   rows:[],
   totals:{
    READY:zeroMetric(),READY_PREV_SCHEDULED:zeroMetric(),READY_PREV_UNSCHEDULED:zeroMetric(),
    WAIT:zeroMetric(),WAIT_NEXT_MAIN:zeroMetric(),WAIT_FUTURE_MAIN:zeroMetric(),HOLD:zeroMetric()
   },
   scope:{areaId,op:op||null,rowOperations:rowOperations.length?rowOperations:null}
  };
 }

 const params:any[]=[stViewParams];
 const candidateWhere=[
  "j.is_open=true",
  "current_main.id is not null",
  "upper(trim(coalesce(j.next_operation,''))) = any($1::text[])"
 ];
 const baseWhere=[
  "j.is_open=true",
  "p.is_active=true",
  "upper(trim(p.standard_operation))<>'PIONBL'",
  "(coalesce(p.is_hold,false)=true or p.status in ('ELIGIBLE','LOCKED'))"
 ];

 if(areaId){
  params.push(areaId);
  const n=params.length;
  candidateWhere.push(`candidate_area.area_id=$${n}`);
  baseWhere.push(`row_area.area_id=$${n}`);
 }
 if(op){
  params.push(op);
  const n=params.length;
  candidateWhere.push(`upper(trim(current_main.standard_operation))=upper(trim($${n}))`);
  baseWhere.push(`upper(trim(p.standard_operation))=upper(trim($${n}))`);
 }
 if(rowOperations.length){
  params.push(rowOperations);
  const n=params.length;
  baseWhere.push(`upper(trim(p.standard_operation))=any($${n}::text[])`);
 }

 const q=await c.query(`
  with candidate_jobs as (
   select j.job_num,current_main.id current_planning_id
   from public.open_job_current j
   left join lateral (
    select p0.id,p0.standard_operation,p0.source_operation_code,p0.st_group
    from public.planning_job_operation p0
    where p0.job_num=j.job_num
      and p0.is_active=true
      and p0.status in ('LOCKED','ELIGIBLE','PLANNED')
    order by p0.planning_seq asc,p0.source_seq asc,p0.id asc
    limit 1
   ) current_main on true
   left join lateral (
    select ag.area_id
    from public.md_area_operation_group ag
    join public.md_area ax
      on ax.id=ag.area_id
     and ax.is_active=true
    where current_main.id is not null
      and ag.st_group=current_main.st_group
      and ag.is_active=true
    order by ax.sort_order asc nulls last,ax.area_name asc,ag.area_id asc
    limit 1
   ) candidate_area on true
   where ${candidateWhere.join(" and ")}
  ), base as (
   select
    p.job_num,
    p.standard_operation,
    coalesce(a.id,0)::bigint area_id,
    coalesce(a.area_name,'Unmapped') area_name,
    coalesce(a.sort_order,999999)::int area_sort,
    coalesce(om.planning_sort_order,scope.sort_order,999999)::int main_order,
    case
     when coalesce(p.is_hold,false) then 'HOLD'
     when p.status='ELIGIBLE' then 'READY'
     when p.status='LOCKED' then 'WAIT'
     else null
    end bucket,
    case
     when p.status='LOCKED' then 1 + (
      select count(*)::int
      from public.planning_job_operation pw
      where pw.job_num=p.job_num
        and pw.is_active=true
        and (pw.status='LOCKED' or coalesce(pw.is_hold,false)=true)
        and upper(trim(pw.standard_operation))<>'PIONBL'
        and (
         coalesce(pw.planning_seq,2147483647),coalesce(pw.source_seq,2147483647),pw.id
        ) < (
         coalesce(p.planning_seq,2147483647),coalesce(p.source_seq,2147483647),p.id
        )
     )
     else null
    end wait_rank,
    case
     when p.status<>'ELIGIBLE' then null
     when nullif(trim(coalesce(prev_ident.previous_operation,'')),'') is null then 'SCHEDULED'
     when prev_schedule.schedule_id is not null then 'SCHEDULED'
     -- V476: First Main has no predecessor, so it is physically ready at chain start and
     -- belongs to the same READY handoff bucket as Previous Main Scheduled / Done.
     -- V473: if this READY row is the canonical current Main, its Previous Main
     -- is already behind physical progress even when legacy production had no Batch.
     -- Treat that as the same READY handoff bucket as Previous Main Scheduled.
     when p.id=cj.current_planning_id then 'SCHEDULED'
     else 'UNSCHEDULED'
    end ready_previous_schedule,
    coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)::numeric qty,
    coalesce(
     j.total_surface,
     coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0) * coalesce(j.surface_per_part_dm2,0),
     0
    )::numeric surface
   from candidate_jobs cj
   join public.open_job_current j on j.job_num=cj.job_num
   join public.planning_job_operation p on p.job_num=cj.job_num
   left join lateral (
    select ag.area_id
    from public.md_area_operation_group ag
    join public.md_area ax
      on ax.id=ag.area_id
     and ax.is_active=true
    where ag.st_group=p.st_group
      and ag.is_active=true
    order by ax.sort_order asc nulls last,ax.area_name asc,ag.area_id asc
    limit 1
   ) row_area on true
   left join public.md_area a on a.id=row_area.area_id and a.is_active=true
   left join public.md_operation_master om on om.standard_operation=p.standard_operation and om.is_active=true
   left join public.md_planning_operation_scope scope on scope.standard_operation=p.standard_operation and scope.is_active=true

   -- Immediate Previous Main for READY classification. Prefer the active chain
   -- occurrence immediately before p; if it already moved behind the live chain,
   -- fall back to the durable snapshots stored on the current occurrence.
   left join lateral (
    select p2.standard_operation,p2.source_operation_code,p2.source_seq
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
    select hb.id batch_id
    from public.planning_batch_job hbj
    join public.planning_batch hb
      on hb.id=hbj.batch_id
     and hb.status<>'CANCELLED'
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
    order by
     case when prev_ident.previous_source_seq is not null and coalesce(hbj.source_seq_snapshot,hp.source_seq)=prev_ident.previous_source_seq then 0 else 1 end,
     hb.created_at desc,hbj.id desc
    limit 1
   ) prev_batch on true
   left join lateral (
    select ps.id schedule_id
    from public.planning_schedule ps
    where ps.batch_id=prev_batch.batch_id
      and ps.status<>'CANCELLED'
      and ps.planned_start is not null
    order by ps.planned_start desc,ps.id desc
    limit 1
   ) prev_schedule on true

   where ${baseWhere.join(" and ")}
  ), per_job_main as (
   -- One physical Job is counted once for the same Main + status bucket.
   -- Repeated occurrences in the same bucket must not multiply pcs/surface.
   select
    job_num,standard_operation,area_id,area_name,area_sort,main_order,bucket,
    max(ready_previous_schedule) ready_previous_schedule,
    min(wait_rank) wait_rank,
    max(qty) qty,max(surface) surface
   from base
   where bucket is not null
   group by job_num,standard_operation,area_id,area_name,area_sort,main_order,bucket
  )
  select
   area_id,area_name,area_sort,standard_operation,main_order,bucket,ready_previous_schedule,
   case when bucket='WAIT' then case when min(wait_rank)=1 then 'NEXT_MAIN' else 'FUTURE_MAIN' end else null end wait_level,
   count(*)::int jobs,
   coalesce(sum(qty),0)::float8 qty,
   coalesce(sum(surface),0)::float8 surface
  from per_job_main
  group by area_id,area_name,area_sort,standard_operation,main_order,bucket,ready_previous_schedule
  order by area_sort,main_order,standard_operation,bucket,ready_previous_schedule
 `,params);

 const byKey=new Map<string,PlanningWorkloadSummaryRow>();
 const totals:PlanningWorkloadTotals={
  READY:zeroMetric(),READY_PREV_SCHEDULED:zeroMetric(),READY_PREV_UNSCHEDULED:zeroMetric(),
  WAIT:zeroMetric(),WAIT_NEXT_MAIN:zeroMetric(),WAIT_FUTURE_MAIN:zeroMetric(),HOLD:zeroMetric()
 };

 for(const raw of q.rows as any[]){
  const key=`${raw.area_id}|${raw.standard_operation}`;
  let row=byKey.get(key);
  if(!row){
   row={
    areaId:Number(raw.area_id||0),areaName:String(raw.area_name||"Unmapped"),areaSort:Number(raw.area_sort||999999),
    standardOperation:String(raw.standard_operation||""),mainOrder:Number(raw.main_order||999999),
    ready:zeroMetric(),readyPrevScheduled:zeroMetric(),readyPrevUnscheduled:zeroMetric(),wait:zeroMetric(),waitNextMain:zeroMetric(),waitFutureMain:zeroMetric(),hold:zeroMetric(),total:zeroMetric()
   };
   byKey.set(key,row);
  }

  const metric:PlanningWorkloadMetric={jobs:Number(raw.jobs||0),qty:Number(raw.qty||0),surface:Number(raw.surface||0)};
  const bucket=String(raw.bucket||"").toUpperCase();
  if(bucket==="READY"){
   addMetric(row.ready,metric);
   addMetric(totals.READY,metric);
   if(String(raw.ready_previous_schedule||"").toUpperCase()==="SCHEDULED"){
    addMetric(row.readyPrevScheduled,metric);
    addMetric(totals.READY_PREV_SCHEDULED,metric);
   }else{
    addMetric(row.readyPrevUnscheduled,metric);
    addMetric(totals.READY_PREV_UNSCHEDULED,metric);
   }
  }else if(bucket==="WAIT"){
   addMetric(row.wait,metric);
   addMetric(totals.WAIT,metric);
   if(String(raw.wait_level||"").toUpperCase()==="NEXT_MAIN"){
    addMetric(row.waitNextMain,metric);
    addMetric(totals.WAIT_NEXT_MAIN,metric);
   }else{
    addMetric(row.waitFutureMain,metric);
    addMetric(totals.WAIT_FUTURE_MAIN,metric);
   }
  }else if(bucket==="HOLD"){
   addMetric(row.hold,metric);
   addMetric(totals.HOLD,metric);
  }
 }

 const rows=[...byKey.values()].map(row=>{
  row.total={
   jobs:row.ready.jobs+row.wait.jobs+row.hold.jobs,
   qty:row.ready.qty+row.wait.qty+row.hold.qty,
   surface:row.ready.surface+row.wait.surface+row.hold.surface
  };
  return row;
 }).sort((a,b)=>a.areaSort-b.areaSort||a.mainOrder-b.mainOrder||a.standardOperation.localeCompare(b.standardOperation));

 return {rows,totals,scope:{areaId,op:op||null,rowOperations:rowOperations.length?rowOperations:null}};
}
