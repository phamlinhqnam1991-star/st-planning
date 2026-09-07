import type {PoolClient} from "pg";
import {selectProcessMinutesFromRules,type ProcessTimeRuleRow} from "@/lib/planning/batch-utils";
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

 // v221.15: NDT bám sát Process End (không đẩy giờ vô lý). v221.21: thêm ràng buộc
 // KHÔNG QUÁ 2 FB NDT CÙNG LÚC — nếu tại NDT Start đang có 2 NDT chạy, đẩy NDT sang lúc
 // chỉ còn ≤1 NDT (giữ nguyên Loading/Process; lô nối tiếp bám NDT End mới).
 let previousNdtStart:Date|null=null;

 const effectiveLoadingMinutes=Number(overrides?.loadingMinutes ?? loading.duration_minutes);
 let window=buildChemicalScheduleWindow({
  loadingStart,
  processMinutes,
  loadingMinutes:effectiveLoadingMinutes,
  unloadingMinutes:Number(unloading.duration_minutes),
  recipeNo,
  previousNdtStart,
  overrides
 });
 if(isPrecleanRecipe(recipeNo)&&window.ndtStart){
  // Khóa serial để 2 yêu cầu lưu đồng thời không nhận cùng slot NDT.
  await client.query(`select pg_advisory_xact_lock(hashtext('CHEMICAL_LINE_NDT_QUEUE'))`);
  const ndtQ=await client.query(`
   select ndt_start,ndt_end
   from planning_schedule
   where status<>'CANCELLED'
     and ndt_start is not null
     and ($1::bigint is null or id<>$1)
   order by ndt_start
  `,[excludeScheduleId||null]);
  const ndtWindows=ndtQ.rows.map((row:any)=>(
   {s:new Date(String(row.ndt_start)).getTime(),e:row.ndt_end?new Date(String(row.ndt_end)).getTime():new Date(String(row.ndt_start)).getTime()+300*60000}
  )).filter((w:any)=>Number.isFinite(w.s)&&Number.isFinite(w.e));
  let t=window.ndtStart.getTime();
  for(let iter=0;iter<60;iter++){
   const act=ndtWindows.filter(n=>n.s<=t&&t<n.e);
   if(act.length<2)break;
   t=Math.min(...act.map(n=>n.e));
  }
  if(t>window.ndtStart.getTime()){
   window=buildChemicalScheduleWindow({
    loadingStart,
    processMinutes,
    loadingMinutes:effectiveLoadingMinutes,
    unloadingMinutes:Number(unloading.duration_minutes),
    recipeNo,
    previousNdtStart:null,
    overrides:{...(overrides||{}),ndtStart:new Date(t)}
   });
  }
 }

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
  resourceCode,resourceGroup,window,maxConcurrent,excludeScheduleId,excludeScheduleIds
 }:{
  resourceCode:string;
  resourceGroup:string;
  window:ChemicalScheduleWindow;
  maxConcurrent:number;
  excludeScheduleId?:number|null;
  excludeScheduleIds?:(number|null)[];
 }
){
 // Có thể loại nhiều schedule khỏi kiểm tra (vd đang xử lý hàng loạt lô cũ:
 // các lô chưa xử lý được loại ra để lô sớm hơn được ưu tiên giữ vị trí).
 const excluded=(excludeScheduleIds||[])
  .map(x=>x==null?null:Number(x))
  .filter((x):x is number=>Number.isFinite(x));
 if(excludeScheduleId!=null&&!excluded.includes(Number(excludeScheduleId)))excluded.push(Number(excludeScheduleId));
 const exclParam=excluded.length?[excluded]:[];

 const overlap=await client.query(`
  select s.planned_start,s.planned_end,b.batch_no
  from planning_schedule s
  left join planning_batch b on b.id=s.batch_id
  where s.resource_code=$1
    and s.status<>'CANCELLED'
    ${excluded.length?"and not (s.id = any($4::bigint[]))":""}
    and s.planned_start<$3
    and s.planned_end>$2
  order by s.planned_start
  limit 3
 `,[resourceCode,window.loadingStart,window.unloadingEnd,...exclParam]);
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

 // v195: Chỉ 1 Flybar được Loading tại 1 thời điểm (dùng chung trạm Loading).
 const loadingOverlap=await client.query(`
  select s.id,s.resource_code,
         coalesce(s.loading_start,s.planned_start) ls,
         coalesce(s.loading_end,s.process_start,s.planned_start) le,
         b.batch_no
  from planning_schedule s
  join md_schedule_resource r on r.resource_code=s.resource_code
  left join planning_batch b on b.id=s.batch_id
  where r.resource_group='CHEMICAL_LINE'
    and s.status<>'CANCELLED'
    ${excluded.length?"and not (s.id = any($3::bigint[]))":"and ($3::bigint is null or s.id<>$3)"}
    and coalesce(s.loading_start,s.planned_start) < $2
    and coalesce(s.loading_end,s.process_start,s.planned_start) > $1
  order by s.loading_start,s.id
  limit 3
 `,[window.loadingStart,window.loadingEnd,...(excluded.length?exclParam:[excludeScheduleId||null])]);
 if(loadingOverlap.rowCount){
  const fmt=(v:unknown)=>v
   ?new Date(String(v)).toLocaleTimeString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hour12:false})
   :"—";
  throw new Error(
   `Chỉ 1 Flybar được Loading cùng lúc: Loading ${fmt(window.loadingStart)}–${fmt(window.loadingEnd)} `+
   `trùng với ${loadingOverlap.rows.map((r:any)=>`${r.batch_no||("schedule #"+r.id)} (${r.resource_code} · ${fmt(r.ls)}–${fmt(r.le)})`).join(", ")}. `+
   `Hãy đổi giờ Loading Start hoặc chọn khoảng trống sau.`
  );
 }

 const concurrency=await client.query(`
  with existing as (
   select
    coalesce(s.process_start,s.planned_start) segment_start,
    coalesce(s.process_end,s.planned_end) segment_end
   from planning_schedule s
   join md_schedule_resource r on r.resource_code=s.resource_code
   where r.resource_group='CHEMICAL_LINE'
     and s.status<>'CANCELLED'
     ${excluded.length?"and not (s.id = any($3::bigint[]))":"and ($3::bigint is null or s.id<>$3)"}
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
 `,[window.processStart,window.processEnd,...(excluded.length?exclParam:[excludeScheduleId||null])]);

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
 processMinutes:number|null,
 options?:{previousProcessMinutes?:number|null}
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
 const scheduledProcess=Math.round(Number(sched.process_duration_minutes||0));
 const previousStandard=Math.round(Number(options?.previousProcessMinutes||0));
 // Nếu planner đã chỉnh Process Duration khác Standard trước đó, giữ override.
 // Nếu schedule đang đúng bằng Standard cũ, Batch thay đổi sẽ dùng Standard mới.
 const hasManualProcessOverride=scheduledProcess>0 &&
  (previousStandard<=0 || scheduledProcess!==previousStandard);
 const duration=hasManualProcessOverride
  ?scheduledProcess
  :(Number.isFinite(Number(processMinutes))&&Number(processMinutes)>0
    ?Math.round(Number(processMinutes))
    :Math.max(1,scheduledProcess||60));

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

// =====================================================================
// SIMULATION CẢ NGÀY — Tự đề xuất FB + giờ Loading cho một danh sách lô.
// Nguyên tắc:
//  - Chỉ 1 Flybar Loading tại 1 thời điểm (chuỗi Loading nối tiếp).
//  - FB bận từ Loading Start → Unloading End.
//  - Ưu tiên FB trống sớm nhất; nếu FB bận → đẩy giờ muộn hơn.
//  - NDT (preclean) cách NDT trước ≥ 01:30, kéo dài 05:00.
//  - Tối đa 3 Flybar chạy Process cùng lúc.
// Đọc-only: không ghi gì vào database.
// =====================================================================
export type SimulatedRun={
 index:number;
 recipe_key:string;
 standard_operation:string|null;
 continued:boolean;
 recipe_no:string|null;
 recipe_name:string|null;
 resource_code:string;
 loading_start:string;
 loading_end:string;
 loading_minutes:number;
 process_start:string;
 process_end:string;
 process_minutes:number;
 ndt_start:string|null;
 ndt_end:string|null;
 ndt_minutes:number|null;
 unloading_start:string;
 unloading_end:string;
 unloading_minutes:number;
 duration_minutes:number;
};

export async function simulateChemicalDay(
 client:PoolClient,
 {
  desiredStart,
  runs,
  allowedOperations
 }:{
  desiredStart:Date;
  runs:{recipe_key:string;desired_start?:string;preferred_fb?:string;continuation_from?:string;batch_id?:string;manual_chain?:boolean;chain_from_run?:number;chain_source_schedule_id?:number|string;overrides?:{processStart?:string|null;ndtStart?:string|null;unloadingStart?:string|null}}[];
  allowedOperations?:string[];
 }
):Promise<SimulatedRun[]>{
 if(!runs.length)return [];

 const batchIds=[...new Set(runs.map(r=>Number(r.batch_id)).filter(Number.isFinite))];
 const [handlingQ,timeRulesQ,recipesQ,existingQ,maxConcQ,opMapQ,fbQ,batchJobDataQ]=await Promise.all([
  client.query(`
   select id,phase,priority,qty_min,qty_max,surface_min_dm2,surface_max_dm2,duration_minutes
   from md_chemical_handling_time_rule
   where is_active=true order by priority,id
  `),
  client.query(`
   select t.id,t.recipe_key,t.calc_type,t.priority,t.qty_min,t.qty_max,
          t.surface_min_dm2,t.surface_max_dm2,t.fixed_hours,t.standard_hours,
          coalesce((
            select jsonb_agg(jsonb_build_object(
              'source_column',cnd.source_column,
              'source_value',cnd.source_value
            ) order by cnd.condition_order,cnd.id)
            from md_recipe_time_rule_condition cnd
            where cnd.rule_id=t.id and cnd.is_active=true
          ),'[]'::jsonb) conditions
   from md_recipe_time_rule t
   where t.is_active=true
  `),
  client.query(`
   select recipe_key,recipe_no,recipe_name
   from md_process_recipe
   where is_active=true
  `),
  client.query(`
   select s.id,s.resource_code,
          s.loading_start,s.loading_end,s.process_start,s.process_end,s.ndt_start,s.ndt_end,s.planned_end
   from planning_schedule s
   join md_schedule_resource r on r.resource_code=s.resource_code
   where r.resource_group='CHEMICAL_LINE'
     and s.status<>'CANCELLED'
     and s.planned_start between $1::timestamptz - interval '48 hours' and $1::timestamptz + interval '96 hours'
  `,[desiredStart]),
  client.query(`
   select coalesce(max(max_concurrent),3) max_concurrent
   from md_schedule_resource
   where resource_group='CHEMICAL_LINE' and is_active=true
  `),
  client.query(`
   select recipe_key,operation_code,standard_operation,priority,is_default
   from md_main_operation_recipe
   where is_active=true
   order by priority,recipe_key
  `),
  client.query(`
   select resource_code
   from md_schedule_resource
   where resource_group='CHEMICAL_LINE' and is_active=true
   order by resource_code
  `),
  batchIds.length?client.query(`
   select bj.batch_id,b.total_qty,b.total_surface_dm2,
          coalesce(j.source_data,'{}'::jsonb) || (to_jsonb(j)-'source_data') condition_data
   from planning_batch_job bj
   join planning_batch b on b.id=bj.batch_id
   join open_job_current j on j.job_num=bj.job_num
   where bj.batch_id=any($1::bigint[])
   order by bj.batch_id,bj.id
  `,[batchIds]):Promise.resolve({rows:[]} as any)
 ]);

 const handlingRules=handlingQ.rows as ChemicalHandlingRule[];
 const maxConcurrent=Math.max(1,Number(maxConcQ.rows[0]?.max_concurrent||3));
 const recipeMap=new Map<string,{recipe_no:string|null;recipe_name:string|null}>();
 for(const r of recipesQ.rows)recipeMap.set(String(r.recipe_key),{recipe_no:r.recipe_no,recipe_name:r.recipe_name});
 const allowedOpSet=allowedOperations&&allowedOperations.length
  ?new Set(allowedOperations.map((x:string)=>String(x).toUpperCase()))
  :null;
 const opByRecipe=new Map<string,string[]>();
 for(const r of opMapQ.rows as any[]){
  const key=String(r.recipe_key||"");
  const op=String(r.operation_code||r.standard_operation||"");
  if(!key||!op)continue;
  const list=opByRecipe.get(key)||[];
  list.push(op);
  opByRecipe.set(key,list);
 }
 const opFor=(recipeKey:string):string|null=>{
  const list=opByRecipe.get(recipeKey)||[];
  if(!list.length)return null;
  if(allowedOpSet)return list.find(x=>allowedOpSet.has(x.toUpperCase()))||null;
  return list[0];
 };

 // Process minutes theo Recipe + điều kiện All Open Job của Batch.
 // Simulation chưa có Qty/Surface chi tiết nên vẫn dùng 0/0 như logic cũ;
 // riêng điều kiện cột sẽ match theo toàn bộ Job của batch_id nếu có.
 const processJobDataByBatch=new Map<number,Record<string,unknown>[]>();
 const processTotalsByBatch=new Map<number,{qty:number;surface:number}>();
 for(const row of batchJobDataQ.rows as any[]){
  const id=Number(row.batch_id);
  if(!Number.isFinite(id))continue;
  const list=processJobDataByBatch.get(id)||[];
  list.push((row.condition_data||{}) as Record<string,unknown>);
  processJobDataByBatch.set(id,list);
  if(!processTotalsByBatch.has(id)){
   processTotalsByBatch.set(id,{
    qty:Number(row.total_qty)||0,
    surface:Number(row.total_surface_dm2)||0
   });
  }
 }
 const allTimeRules=(timeRulesQ.rows as any[]).map(r=>({
  ...r,
  id:Number(r.id),
  priority:Number(r.priority)||100,
  qty_min:r.qty_min==null?null:Number(r.qty_min),
  qty_max:r.qty_max==null?null:Number(r.qty_max),
  surface_min_dm2:r.surface_min_dm2==null?null:Number(r.surface_min_dm2),
  surface_max_dm2:r.surface_max_dm2==null?null:Number(r.surface_max_dm2),
  fixed_hours:r.fixed_hours==null?null:Number(r.fixed_hours),
  standard_hours:r.standard_hours==null?null:Number(r.standard_hours),
  conditions:Array.isArray(r.conditions)?r.conditions:[]
 })) as ProcessTimeRuleRow[];
 const processMinutesFor=(recipeKey:string,batchId:unknown):number=>{
  const rules=allTimeRules.filter(r=>r.recipe_key===recipeKey);
  const id=Number(batchId);
  const totals=Number.isFinite(id)?processTotalsByBatch.get(id):null;
  return selectProcessMinutesFromRules(
   rules,totals?.qty||0,totals?.surface||0,
   Number.isFinite(id)?(processJobDataByBatch.get(id)||[]):[]
  )||0;
 };

 // Trạng thái hiện có (đã lưu).
 const fbBusyUntil=new Map<string,number>();
 let lastLoadingEnd=0;
 const processWindows:{s:number;e:number}[]=[];
 const processStarts:number[]=[];
 const ndtWindows:{s:number;e:number}[]=[];
 for(const s of existingQ.rows as any[]){
  const fb=String(s.resource_code||"");
  const busy=s.planned_end?new Date(String(s.planned_end)).getTime():0;
  if(busy)fbBusyUntil.set(fb,Math.max(fbBusyUntil.get(fb)||0,busy));
  const ls=s.loading_start?new Date(String(s.loading_start)).getTime():0;
  const le=s.loading_end?new Date(String(s.loading_end)).getTime():(s.process_start?new Date(String(s.process_start)).getTime():ls);
  const lDur=Number(s.loading_duration_minutes||0);
  if(ls&&le&&lDur>0)lastLoadingEnd=Math.max(lastLoadingEnd,le);
  const ps=s.process_start?new Date(String(s.process_start)).getTime():0;
  const pe=s.process_end?new Date(String(s.process_end)).getTime():0;
  if(ps&&pe)processWindows.push({s:ps,e:pe});
  if(ps&&Number.isFinite(ps))processStarts.push(ps);
  if(s.ndt_start){
   const st=new Date(String(s.ndt_start)).getTime();
   if(Number.isFinite(st))ndtWindows.push({s:st,e:s.ndt_end?new Date(String(s.ndt_end)).getTime():st+300*60000});
  }
 }

 const FBs=(fbQ.rows as {resource_code:string}[]).map(r=>String(r.resource_code)).filter(Boolean);
 if(!FBs.length)FBs.push("FB-01","FB-02","FB-03","FB-04","FB-05","FB-06");
 const out:SimulatedRun[]=new Array(runs.length).fill(null as any);

 // Thứ tự xử lý ưu tiên chuỗi liên kết: dòng liên kết chạy NGAY SAU dòng nguồn
 // (tránh dòng khác chen vào FB giữa chừng làm gãy chuỗi).
 const chainChildren=new Map<number,number[]>();
 const usedExistingChainSources=new Set<number>();
 runs.forEach((r,i)=>{
  if(r.chain_from_run!=null&&r.chain_from_run<i){
   const list=chainChildren.get(r.chain_from_run)||[];
   if(list.length)throw new Error(`Dòng ${r.chain_from_run+1}: một FB Precleaning chỉ được liên kết với 1 FB nối tiếp.`);
   list.push(i);
   chainChildren.set(r.chain_from_run,list);
  }
  if(r.manual_chain&&r.chain_source_schedule_id!=null){
   const sid=Number(r.chain_source_schedule_id);
   if(Number.isFinite(sid)){
    if(usedExistingChainSources.has(sid))throw new Error(`Schedule nguồn #${sid}: một FB Precleaning chỉ được liên kết với 1 FB nối tiếp.`);
    usedExistingChainSources.add(sid);
   }
  }
 });
 const order:number[]=[];const seen=new Array(runs.length).fill(false);
 const visit=(i:number)=>{
  if(seen[i])return;
  seen[i]=true;order.push(i);
  for(const c of (chainChildren.get(i)||[]).sort((a,b)=>a-b))visit(c);
 };
 for(let i=0;i<runs.length;i++)visit(i);

 const usedAutoPreviousBatches=new Set<number>();
 for(const idx of order){
  const recipeKey=String(runs[idx].recipe_key||"").trim();
  const meta=recipeMap.get(recipeKey);
  if(!meta)throw new Error(`Lô ${idx+1}: Recipe không tồn tại hoặc đã inactive.`);
  const runDesired=runs[idx].desired_start?new Date(String(runs[idx].desired_start)).getTime():desiredStart.getTime();
  // Nối tiếp cùng FB: lô của cùng nhóm job (vd BSAUNSLD sau CPBILP) nên chạy ngay
  // trên chính FB của lô trước, không loading lại.
  let preferredFb=String(runs[idx].preferred_fb||"").trim()||null;
  let continuationFrom=runs[idx].continuation_from?new Date(String(runs[idx].continuation_from)).getTime():null;
  // Liên kết THỦ CÔNG (kéo-thả): trỏ thẳng vào KẾT QUẢ của dòng nguồn trong CÙNG lượt chạy
  // → Loading Start = Unloading End dòng nguồn, đúng FB nguồn; mọi ràng buộc (≤3 Process,
  // FB bận, NDT queue) kiểm tra với TOÀN BỘ các dòng khác trong cùng lượt — không còn lỗi
  // "2 lô trùng sát nhau trên cùng FB" do lượt 2 không biết giờ các dòng khác.
  let manualChainFb:string|null=null;
  const chainSrc=runs[idx].chain_from_run;
  if(chainSrc!=null&&chainSrc<idx&&out[chainSrc]){
   const srcOut=out[chainSrc];
   preferredFb=srcOut.resource_code;
   // Quy tắc user chốt (v221.13): lô nối tiếp từ FB preclean bám vào thời điểm NDT XONG của
   // lô nguồn — phần đã qua NDT là SẴN SÀNG sang FB kế, không phải chờ Unloading xong.
   // Lô nguồn không có NDT → bám Unloading End như cũ. FB đích bận (vd liên kết cùng FB,
   // hoặc FB đó còn lô khác) → vòng lặp dưới tự đẩy giờ Loading cho tới khi hết bận.
   const srcNdtEnd=srcOut.ndt_end?new Date(String(srcOut.ndt_end)).getTime():null;
   continuationFrom=srcNdtEnd!=null?srcNdtEnd:new Date(String(srcOut.unloading_end)).getTime();
   manualChainFb=preferredFb;
  }
  // v221.18: liên kết THỦ CÔNG tới LÔ ĐÃ LƯU (nguồn không nằm trong lượt chạy): client gửi
  // chain_source_schedule_id + preferred_fb + continuation_from (= NDT End / Unloading End nguồn).
  // Neo đúng FB nguồn + giờ nguồn; cửa sổ của CHÍNH lô nguồn không chặn bar (bar rảnh tại
  // NDT End); chỉ lô KHÁC trên cùng FB kết thúc sau lô nguồn mới chặn. Kiểm tra đủ ≤3 Process.
  if(chainSrc==null&&runs[idx].manual_chain&&runs[idx].chain_source_schedule_id!=null&&preferredFb&&continuationFrom){
   const srcRow=(existingQ.rows as any[]).find((r:any)=>Number(r.id)===Number(runs[idx].chain_source_schedule_id));
   if(srcRow){
    const srcEnd=srcRow.planned_end?new Date(String(srcRow.planned_end)).getTime():continuationFrom;
    const fbBusy=fbBusyUntil.get(preferredFb)||0;
    if(fbBusy>srcEnd+5*60000)continuationFrom=Math.max(continuationFrom,fbBusy);
    manualChainFb=preferredFb;
   }
  }
  // CHỈ nối tiếp khi hệ thống PHÁT HIỆN ĐƯỢC các job chung: lô này có job, và job đó nằm
  // trong lô Previous Main đã được điều độ đúng FB + đúng giờ kết thúc. Không phát hiện → không nối tiếp.
  if(preferredFb&&continuationFrom&&runs[idx].batch_id&&!runs[idx].manual_chain&&chainSrc==null){
   const vq=await client.query(`
    select prevhist.previous_batch_id,prevsch.resource_code,prevsch.planned_end
    from planning_batch_job cbj
    join planning_job_operation cur on cur.id=cbj.planning_job_operation_id
    join lateral (
     select hb.id previous_batch_id
     from planning_batch_job hbj
     join planning_batch hb on hb.id=hbj.batch_id and hb.status<>'CANCELLED'
     left join planning_job_operation hp on hp.id=hbj.planning_job_operation_id
     where hbj.job_num=cbj.job_num
       and hbj.batch_id<>cbj.batch_id
       and hbj.standard_operation<>'PIONBL'
       and coalesce(hbj.source_seq_snapshot,hp.source_seq,-1)<coalesce(cbj.source_seq_snapshot,cur.source_seq,2147483647)
     order by coalesce(hbj.source_seq_snapshot,hp.source_seq) desc,hb.id desc,hbj.id desc
     limit 1
    ) prevhist on true
    join lateral (
     select ps2.resource_code,ps2.planned_end
     from planning_schedule ps2
     where ps2.batch_id=prevhist.previous_batch_id
       and ps2.status<>'CANCELLED'
     order by ps2.planned_start desc,ps2.id desc
     limit 1
    ) prevsch on true
    where cbj.batch_id=$1
    limit 1
   `,[runs[idx].batch_id]);
   const v=vq.rows[0];
   const previousBatchId=Number(v?.previous_batch_id||0);
   if(!v||String(v.resource_code||"")!==preferredFb||Math.abs(new Date(String(v.planned_end)).getTime()-continuationFrom)>5*60000){
    preferredFb=null;continuationFrom=null; // không phát hiện được job chung → không nối tiếp
   }else if(previousBatchId>0&&usedAutoPreviousBatches.has(previousBatchId)){
    // Một FB/Previous Preclean Batch chỉ được cấp cho đúng một lô nối tiếp.
    preferredFb=null;continuationFrom=null;
   }else if(previousBatchId>0){
    usedAutoPreviousBatches.add(previousBatchId);
   }
  }

  const loading=selectChemicalHandlingRule(handlingRules,"LOADING",0,0);
  const unloading=selectChemicalHandlingRule(handlingRules,"UNLOADING",0,0);
  const skipLoadingIntent=Boolean(preferredFb&&continuationFrom);
  if(!loading||!unloading)
   throw new Error(`Lô ${idx+1} (${meta.recipe_no||recipeKey}): chưa cấu hình Loading/Unloading Time phù hợp (Qty 0).`);

  const processMinutes=processMinutesFor(recipeKey,runs[idx].batch_id);
  if(processMinutes<=0)
   throw new Error(`Lô ${idx+1} (${meta.recipe_no||recipeKey}): chưa cấu hình Process Time cho recipe này.`);

  const preclean=isPrecleanRecipe(meta.recipe_no);
  // Lô NỐI TIẾP (liên kết): Loading Start bám điểm kết thúc của lô nguồn — NDT End nếu nguồn
  // là preclean (có NDT), Unloading End nếu nguồn không có NDT. Không bị đẩy bởi giờ Loading
  // của các lô khác hay giờ mong muốn của dòng.
  let startCandidate=preferredFb&&continuationFrom
   ?continuationFrom
   :Math.max(runDesired,lastLoadingEnd,continuationFrom||0);
  let chosen:any=null;
  let attempts=0;
  const maxAttempts=7*24*4; // 15 phút × 7 ngày

  while(!chosen&&attempts<maxAttempts){
   // Xét FB theo thứ tự trống sớm nhất (busyUntil nhỏ trước, trùng thì FB nhỏ hơn).
   const ordered=skipLoadingIntent
    ?[preferredFb as string] // lô liên kết: BẮT BUỘC đúng FB dòng nguồn (bận → đẩy giờ, không đổi FB)
    :preferredFb
     ?[preferredFb,...[...FBs].filter(f=>f!==preferredFb).sort((a,b)=>{
       const da=fbBusyUntil.get(a)||0,db=fbBusyUntil.get(b)||0;
       return (da-db)||a.localeCompare(b);
      })]
     :[...FBs].sort((a,b)=>{
       const da=fbBusyUntil.get(a)||0,db=fbBusyUntil.get(b)||0;
       return (da-db)||a.localeCompare(b);
      });
   for(const fb of ordered){
    // Lô liên kết THỦ CÔNG bám NDT End của lô nguồn: FB của chính lô nguồn được coi là RẢNH
    // ngay khi NDT xong (bar đã qua kiểm tra → sẵn sàng cho bước kế; bước Unloading còn lại
    // của lô nguồn không chặn bar). Chỉ các lô KHÁC trên FB đó mới chặn giờ (qua fbBusyUntil).
    // Lưu ý: DFS xếp lô liên kết NGAY SAU lô nguồn → chưa có lô nào khác xen vào FB nguồn,
    // nên bỏ qua fbBusyUntil tại đây là an toàn; các lô sau vẫn bị chặn bởi fbBusyUntil mới.
    const srcFbIsThisFb=skipLoadingIntent&&manualChainFb===fb;
    const startMs=srcFbIsThisFb
     ?Math.max(startCandidate,continuationFrom??startCandidate)
     :Math.max(startCandidate,fbBusyUntil.get(fb)||0);
    // v221.17: TỐI ƯU TRẠM LOADING — FB chưa rảnh tại thời điểm candidate thì KHÔNG nhận
    // (đẩy candidate +15' thử lại) thay vì chấp nhận loading muộn trên FB đó → giảm khoảng
    // trống "trạm Loading không làm gì" (vd loading xong 12:00 nhưng dòng kế ra 17:20).
    // Riêng lô liên kết thủ công (srcFbIsThisFb) vẫn bám đúng FB nguồn như quy tắc đã chốt.
    if(!srcFbIsThisFb&&startMs>startCandidate+5*60000)continue;
    // Chỉ "không loading" khi lô bắt đầu NGAY tại thời điểm lô trước vừa xong (±5 phút).
    // Lô trước đã xong từ lâu → vẫn Loading bình thường.
    // Lô liên kết THỦ CÔNG (manualChainFb) LUÔN không loading — bị cấn (FB bận / ≥3 Process)
    // thì CHỜ rồi nối tiếp, không hoá thành loading lại. Lô nối tiếp TỰ ĐỘNG giữ quy tắc cũ
    // (±5'): lệch quá thì xếp như lô Loading bình thường.
    const isImmediate=skipLoadingIntent&&continuationFrom!==null
     &&(manualChainFb===fb||Math.abs(startMs-continuationFrom)<=5*60000);
    // Override từ cột Start chỉnh tay (Process/NDT/Unloading) phải được tính khi kiểm tra
    // ràng buộc (tối đa 3 Process cùng lúc, NDT queue…) để Đề xuất không gợi ý giờ cấn nhau.
    const ov=runs[idx].overrides;
    const overrides=ov?{
     processStart:ov.processStart?new Date(String(ov.processStart)):null,
     ndtStart:ov.ndtStart?new Date(String(ov.ndtStart)):null,
     unloadingStart:ov.unloadingStart?new Date(String(ov.unloadingStart)):null
    }:null;
    // v221.15: NDT bám sát Process End. v221.21: thêm ràng buộc KHÔNG QUÁ 2 FB NDT CÙNG LÚC —
    // nếu tại Process End đang có 2 NDT chạy, đẩy NDT sang lúc chỉ còn ≤1 NDT (giữ nguyên
    // Loading/Process; lô nối tiếp bám NDT End MỚI — client hiển thị đúng NDT từ kết quả này).
    let window=buildChemicalScheduleWindow({
     loadingStart:new Date(startMs),
     processMinutes,
     loadingMinutes:isImmediate?0:Number(loading.duration_minutes),
     unloadingMinutes:Number(unloading.duration_minutes),
     recipeNo:meta.recipe_no,
     previousNdtStart:null,
     overrides
    });
    if(preclean&&window.ndtStart&&!overrides?.ndtStart){
     let t=window.ndtStart.getTime();
     for(let iter=0;iter<60;iter++){
      const act=ndtWindows.filter(n=>n.s<=t&&t<n.e);
      if(act.length<2)break;
      t=Math.min(...act.map(n=>n.e));
     }
     if(t>window.ndtStart.getTime()){
      window=buildChemicalScheduleWindow({
       loadingStart:new Date(startMs),
       processMinutes,
       loadingMinutes:isImmediate?0:Number(loading.duration_minutes),
       unloadingMinutes:Number(unloading.duration_minutes),
       recipeNo:meta.recipe_no,
       previousNdtStart:null,
       overrides:{...(overrides||{}),ndtStart:new Date(t)}
      });
     }
    }
    const s=window.processStart.getTime(),e=window.processEnd.getTime();
    const concurrent=processWindows.filter(w=>w.s<e&&w.e>s).length;
    if(concurrent>=maxConcurrent)continue;
    // v221.20: PROCESS START cách nhau ÍT NHẤT 1 GIỜ (mọi lô, kể cả lô nối tiếp) —
    // tránh cảnh dòng 13 Process 19:50 sát dòng 14 Process 19:30 (chỉ 20 phút).
    if(processStarts.some(p=>Math.abs(p-s)<60*60000))continue;
    chosen={fb,startMs,window,processMinutes,immediate:isImmediate};
    break;
   }
   if(!chosen)startCandidate+=15*60000;
   attempts++;
  }

  if(!chosen)
   throw new Error(`Lô ${idx+1} (${meta.recipe_no||recipeKey}): không tìm được FB trống trong 7 ngày.`);

  const w=chosen.window;
  processStarts.push(w.processStart.getTime());
  if(w.ndtStart)ndtWindows.push({s:w.ndtStart.getTime(),e:w.ndtEnd?w.ndtEnd.getTime():w.ndtStart.getTime()+300*60000});
  fbBusyUntil.set(chosen.fb,w.unloadingEnd.getTime());
  // Lô nối tiếp (Loading 0 phút) KHÔNG chiếm trạm Loading chung — chỉ lô có Loading thật mới đẩy chuỗi Loading.
  if(w.loadingMinutes>0)lastLoadingEnd=Math.max(lastLoadingEnd,w.loadingEnd.getTime());
  processWindows.push({s:w.processStart.getTime(),e:w.processEnd.getTime()});

  out[idx]={
   index:idx+1,
   recipe_key:recipeKey,
   standard_operation:opFor(recipeKey),
   continued:Boolean(chosen.immediate),
   recipe_no:meta.recipe_no,
   recipe_name:meta.recipe_name,
   resource_code:chosen.fb,
   loading_start:w.loadingStart.toISOString(),
   loading_end:w.loadingEnd.toISOString(),
   loading_minutes:w.loadingMinutes,
   process_start:w.processStart.toISOString(),
   process_end:w.processEnd.toISOString(),
   process_minutes:w.processMinutes,
   ndt_start:w.ndtStart?w.ndtStart.toISOString():null,
   ndt_end:w.ndtEnd?w.ndtEnd.toISOString():null,
   ndt_minutes:w.ndtMinutes,
   unloading_start:w.unloadingStart.toISOString(),
   unloading_end:w.unloadingEnd.toISOString(),
   unloading_minutes:w.unloadingMinutes,
   duration_minutes:w.totalMinutes
  };
 }

 return out;
}
