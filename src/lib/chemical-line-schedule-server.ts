import type {PoolClient} from "pg";
import {
 buildChemicalScheduleWindow,
 isPrecleanRecipe,
 selectChemicalHandlingRule,
 type ChemicalHandlingRule,
 type ChemicalScheduleOverrides,
 type ChemicalScheduleWindow
} from "@/lib/chemical-line-schedule";

const fmt=(v:Date)=>v.toLocaleTimeString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hour12:false});

export async function resolveChemicalScheduleWindow(
 client:PoolClient,
 {
  loadingStart,processMinutes,totalQty,totalSurfaceDm2,recipeNo,excludeScheduleId,overrides
 }:{
  loadingStart:Date;
  processMinutes:number;
  totalQty:number;
  totalSurfaceDm2:number;
  recipeNo:unknown;
  excludeScheduleId?:number|null;
  overrides?:ChemicalScheduleOverrides|null;
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

 const window=buildChemicalScheduleWindow({
  loadingStart,
  processMinutes,
  loadingMinutes:Number(loading.duration_minutes),
  unloadingMinutes:Number(unloading.duration_minutes),
  recipeNo,
  previousNdtStart,
  overrides
 });

 // Kiểm tra ràng buộc tối thiểu khi planner override giờ từng đoạn.
 if(overrides?.processStart){
  if(overrides.processStart.getTime()<window.loadingEnd.getTime())
   throw new Error(`Process Start không được trước Loading End (${fmt(window.loadingEnd)}).`);
 }
 if(overrides?.ndtStart){
  if(!isPrecleanRecipe(recipeNo))
   throw new Error("Recipe không phải Pre-cleaning nên không có NDT.");
  if(overrides.ndtStart.getTime()<window.processEnd.getTime())
   throw new Error(`NDT Start phải sau Process End (${fmt(window.processEnd)}).`);
  if(previousNdtStart && overrides.ndtStart.getTime()<previousNdtStart.getTime()+90*60000)
   throw new Error(`NDT Start phải cách NDT trước (${fmt(previousNdtStart)}) ít nhất 01:30 — tối thiểu ${fmt(new Date(previousNdtStart.getTime()+90*60000))}.`);
 }
 if(overrides?.unloadingStart){
  const chainEnd=window.ndtEnd||window.processEnd;
  if(overrides.unloadingStart.getTime()<chainEnd.getTime())
   throw new Error(`Unloading Start không được trước ${window.ndtEnd?"NDT End":"Process End"} (${fmt(chainEnd)}).`);
 }

 return window;
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
  select s.planned_start,s.planned_end,b.batch_no
  from planning_schedule s
  left join planning_batch b on b.id=s.batch_id
  where s.resource_code=$1
    and s.status<>'CANCELLED'
    and ($4::bigint is null or s.id<>$4)
    and s.planned_start<$3
    and s.planned_end>$2
  order by s.planned_start
  limit 3
 `,[resourceCode,window.loadingStart,window.unloadingEnd,excludeScheduleId||null]);
 if(overlap.rowCount){
  const fmt=(v:unknown)=>v
   ?new Date(String(v)).toLocaleTimeString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hour12:false})
   :"—";
  throw new Error(
   `${resourceCode} bị cấn: khoảng Loading ${fmt(window.loadingStart)} → Unloading ${fmt(window.unloadingEnd)} `+
   `trùng với ${overlap.rows.map((r:any)=>`${r.batch_no||("schedule #"+r.id)} (${fmt(r.planned_start)}–${fmt(r.planned_end)})`).join(", ")}. `+
   `Hãy chọn Flybar khác hoặc đổi giờ Loading Start.`
  );
 }

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

// =====================================================================
// TỰ ĐỘNG ĐIỀU CHỈNH LỊCH CHEMICAL LINE khi thêm/bớt Job trong Batch
// đã Schedule: qty/dm² mới → Loading/Unloading theo rule Qty/Surface,
// Process theo Process Time của Recipe → cập nhật toàn bộ segment.
// Giữ nguyên Loading Start (điểm neo); nếu window mới bị cấn với lịch
// khác trên cùng Flybar → ném lỗi (rollback, không cho thêm/bớt).
// =====================================================================
export async function autoAdjustChemicalSchedule(
 client:PoolClient,
 batchId:number,
 processMinutes:number|null
):Promise<ChemicalScheduleWindow|null>{
 const schedQ=await client.query(`
  select s.id,s.planned_start,s.loading_start,s.process_duration_minutes,s.resource_code,
         b.total_qty,b.total_surface_dm2,
         r.recipe_no
  from planning_schedule s
  join planning_batch b on b.id=s.batch_id
  left join md_process_recipe r on r.recipe_key=b.recipe_key and r.is_active=true
  join md_schedule_resource res on res.resource_code=s.resource_code
  where s.batch_id=$1
    and s.status<>'CANCELLED'
    and res.resource_group='CHEMICAL_LINE'
  order by s.id desc
  limit 1
 `,[batchId]);
 if(!schedQ.rowCount)return null;
 const sched=schedQ.rows[0];

 const loadingStart=sched.loading_start
  ?new Date(String(sched.loading_start))
  :new Date(String(sched.planned_start));
 const duration=Number.isFinite(Number(processMinutes))&&Number(processMinutes)>0
  ?Math.round(Number(processMinutes))
  :Math.round(Number(sched.process_duration_minutes||60));

 const window=await resolveChemicalScheduleWindow(client,{
  loadingStart,
  processMinutes:duration,
  totalQty:Number(sched.total_qty||0),
  totalSurfaceDm2:Number(sched.total_surface_dm2||0),
  recipeNo:sched.recipe_no,
  excludeScheduleId:Number(sched.id)
 });

 const resQ=await client.query(`
  select resource_code,resource_group,max_concurrent
  from md_schedule_resource
  where resource_code=$1
  limit 1
 `,[sched.resource_code]);
 const resource=resQ.rows[0];

 // Window mới phải không đè lên lịch khác trên cùng Flybar.
 await assertResourceAndChemicalCapacity(client,{
  resourceCode:String(sched.resource_code),
  resourceGroup:String(resource?.resource_group||"CHEMICAL_LINE"),
  window,
  maxConcurrent:Number(resource?.max_concurrent||3),
  excludeScheduleId:Number(sched.id)
 });

 const cols=chemicalScheduleColumns(window);
 await client.query(`
  update planning_schedule
  set planned_start=$2,
      planned_end=$3,
      duration_minutes=$4,
      loading_start=$5,loading_end=$6,loading_duration_minutes=$7,
      process_start=$8,process_end=$9,process_duration_minutes=$10,
      ndt_start=$11,ndt_end=$12,ndt_duration_minutes=$13,
      unloading_start=$14,unloading_end=$15,unloading_duration_minutes=$16,
      updated_at=now()
  where id=$1
 `,[
  sched.id,cols.loadingStart,cols.unloadingEnd,cols.durationMinutes,
  cols.loadingStart,cols.loadingEnd,cols.loadingDurationMinutes,
  cols.processStart,cols.processEnd,cols.processDurationMinutes,
  cols.ndtStart,cols.ndtEnd,cols.ndtDurationMinutes,
  cols.unloadingStart,cols.unloadingEnd,cols.unloadingDurationMinutes
 ]);

 await client.query(`
  update planning_batch
  set planned_end=$2,updated_at=now()
  where id=$1
 `,[batchId,cols.unloadingEnd]);

 return window;
}

// v187: Auto suggest Flybar based on loading start time
export async function suggestChemicalFlybar(
 client:PoolClient,
 loadingStart:Date,
 excludeScheduleId?:number|null
):Promise<{resourceCode:string;availableAt:Date|null;reason:string}[]>{
 const suggestions:{resourceCode:string;availableAt:Date|null;reason:string}[]=[];
 
 // Get all chemical line flybars
 const resourcesQ=await client.query(`
  select resource_code
  from md_schedule_resource
  where resource_group='CHEMICAL_LINE'
    and is_active=true
  order by sort_order,resource_code
 `);
 
 for(const row of resourcesQ.rows){
  const resourceCode=String(row.resource_code);
  
  // Check if this FB is occupied during the window
  const occupiedQ=await client.query(`
   select 1
   from planning_schedule
   where resource_code=$1
     and status<>'CANCELLED'
     and ($2::bigint is null or id<>$2)
     and planned_start<$4
     and planned_end>$3
   limit 1
  `,[resourceCode,excludeScheduleId||null,loadingStart,new Date(loadingStart.getTime()+8*60*60*1000)]); // Check 8-hour window initially
  
  if(!occupiedQ.rowCount){
   suggestions.push({
    resourceCode,
    availableAt:loadingStart,
    reason:'Available immediately'
   });
  }else{
   // Find earliest available time for this FB
   const nextAvailableQ=await client.query(`
    select max(planned_end) as next_available
    from planning_schedule
    where resource_code=$1
      and status<>'CANCELLED'
      and ($2::bigint is null or id<>$2)
    `,[resourceCode,excludeScheduleId||null]);
   
   const nextAvailable=nextAvailableQ.rows[0]?.next_available
    ? new Date(nextAvailableQ.rows[0].next_available)
    : loadingStart;
   
   suggestions.push({
    resourceCode,
    availableAt:nextAvailable,
    reason:`Occupied until ${nextAvailable?.toISOString()||'unknown'}`
   });
  }
 }
 
 // Sort by availability time
 suggestions.sort((a,b)=>{
  const timeA=a.availableAt?.getTime()||Infinity;
  const timeB=b.availableAt?.getTime()||Infinity;
  return timeA-timeB;
 });
 
 return suggestions;
}
