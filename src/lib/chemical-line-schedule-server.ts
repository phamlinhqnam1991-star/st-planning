import type {PoolClient} from "pg";
import {
 buildChemicalScheduleWindow,
 isPrecleanRecipe,
 selectChemicalHandlingRule,
 type ChemicalHandlingRule,
 type ChemicalScheduleWindow
} from "@/lib/chemical-line-schedule";

export async function resolveChemicalScheduleWindow(
 client:PoolClient,
 {
  loadingStart,processMinutes,totalQty,totalSurfaceDm2,recipeNo,excludeScheduleId
 }:{
  loadingStart:Date;
  processMinutes:number;
  totalQty:number;
  totalSurfaceDm2:number;
  recipeNo:unknown;
  excludeScheduleId?:number|null;
 }
):Promise<ChemicalScheduleWindow>{
 const rulesQ=await client.query(`
  select id,phase,priority,qty_min,qty_max,
         surface_min_dm2,surface_max_dm2,duration_minutes,note
  from md_chemical_handling_time_rule
  where is_active=true
  order by priority,id
 `);
 const rules=rulesQ.rows as ChemicalHandlingRule[];
 const loading=selectChemicalHandlingRule(rules,"LOADING",totalQty,totalSurfaceDm2);
 const unloading=selectChemicalHandlingRule(rules,"UNLOADING",totalQty,totalSurfaceDm2);

 if(!loading)
  throw new Error(`Chưa cấu hình Loading Time phù hợp Qty ${totalQty} / Surface ${totalSurfaceDm2} dm².`);
 if(!unloading)
  throw new Error(`Chưa cấu hình Unloading Time phù hợp Qty ${totalQty} / Surface ${totalSurfaceDm2} dm².`);

 let previousNdtStart:Date|null=null;
 if(isPrecleanRecipe(recipeNo)){
  // Serialize the NDT queue so two concurrent requests cannot receive the same slot.
  await client.query(`select pg_advisory_xact_lock(hashtext('CHEMICAL_LINE_NDT_QUEUE'))`);
  const existingQ=await client.query(`
   select ndt_start
   from planning_schedule
   where status<>'CANCELLED'
     and ndt_start is not null
     and ($1::bigint is null or id<>$1)
   order by ndt_start
  `,[excludeScheduleId||null]);
  const base=buildChemicalScheduleWindow({loadingStart,processMinutes,
   loadingMinutes:Number(loading.duration_minutes),unloadingMinutes:Number(unloading.duration_minutes),recipeNo});
  let candidate=base.processEnd;
  for(const row of existingQ.rows){
   const occupied=new Date(row.ndt_start);
   if(candidate.getTime()<=occupied.getTime()-90*60000)break;
   if(candidate.getTime()<occupied.getTime()+90*60000)
    candidate=new Date(occupied.getTime()+90*60000);
  }
  previousNdtStart=new Date(candidate.getTime()-90*60000);
 }

 return buildChemicalScheduleWindow({
  loadingStart,
  processMinutes,
  loadingMinutes:Number(loading.duration_minutes),
  unloadingMinutes:Number(unloading.duration_minutes),
  recipeNo,
  previousNdtStart
 });
}

export async function assertResourceAndChemicalCapacity(
 client:PoolClient,
 {
  resourceCode,resourceGroup,window,maxConcurrent,excludeScheduleId
 }:{
  resourceCode:string;
  resourceGroup:string;
  window:ChemicalScheduleWindow;
  maxConcurrent:number;
  excludeScheduleId?:number|null;
 }
){
 const overlap=await client.query(`
  select 1
  from planning_schedule
  where resource_code=$1
    and status<>'CANCELLED'
    and ($4::bigint is null or id<>$4)
    and planned_start<$3
    and planned_end>$2
  limit 1
 `,[resourceCode,window.loadingStart,window.unloadingEnd,excludeScheduleId||null]);
 if(overlap.rowCount)
  throw new Error(`${resourceCode} đang bận trong khoảng Loading → Unloading này.`);

 if(resourceGroup!=="CHEMICAL_LINE")return;

 const concurrency=await client.query(`
  with existing as (
   select
    coalesce(s.process_start,s.planned_start) segment_start,
    coalesce(s.process_end,s.planned_end) segment_end
   from planning_schedule s
   join md_schedule_resource r on r.resource_code=s.resource_code
   where r.resource_group='CHEMICAL_LINE'
     and s.status<>'CANCELLED'
     and ($3::bigint is null or s.id<>$3)
     and coalesce(s.process_start,s.planned_start)<$2
     and coalesce(s.process_end,s.planned_end)>$1
  ), events as (
   select segment_start t,1 delta from existing
   union all select segment_end t,-1 delta from existing
   union all select $1::timestamptz,1
   union all select $2::timestamptz,-1
  ), timeline as (
   select t,sum(sum(delta)) over(order by t,delta) active
   from events
   group by t,delta
  )
  select coalesce(max(active),0) max_active from timeline
 `,[window.processStart,window.processEnd,excludeScheduleId||null]);

 if(Number(concurrency.rows[0]?.max_active||0)>Math.max(1,maxConcurrent))
  throw new Error(`Chemical Line chỉ cho phép tối đa ${Math.max(1,maxConcurrent)} Flybar chạy Process cùng lúc.`);
}

export const chemicalScheduleColumns=(window:ChemicalScheduleWindow)=>({
 plannedStart:window.loadingStart,
 plannedEnd:window.unloadingEnd,
 durationMinutes:window.totalMinutes,
 loadingStart:window.loadingStart,
 loadingEnd:window.loadingEnd,
 loadingDurationMinutes:window.loadingMinutes,
 processStart:window.processStart,
 processEnd:window.processEnd,
 processDurationMinutes:window.processMinutes,
 ndtStart:window.ndtStart,
 ndtEnd:window.ndtEnd,
 ndtDurationMinutes:window.ndtMinutes,
 unloadingStart:window.unloadingStart,
 unloadingEnd:window.unloadingEnd,
 unloadingDurationMinutes:window.unloadingMinutes
});
