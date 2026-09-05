"use client";
import {safeJson} from "@/lib/fetch-json";
import {Fragment,useEffect,useRef,useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";
import {calculatedScheduleEndTime} from "@/lib/schedule-time";
import {
 buildChemicalScheduleWindow,
 isPrecleanRecipe,
 selectChemicalHandlingRule,
 type ChemicalHandlingRule
} from "@/lib/chemical-line-schedule";
import {useErpConfirm} from "@/components/app-dialog-provider";

type OperationOption={standard_operation:string;st_group:string;batch_prefix:string|null};
type ResourceOption={resource_code:string;resource_name:string;resource_group:string};
type RecipeOption={
 recipe_key:string;recipe_no:string|null;recipe_name:string|null;process_family:string|null;
 default_standard_operation?:string|null;mapped_standard_operations?:string[]|null;
};
type ScheduleArea={
 schedule_area_code:string;schedule_area_name:string;resource_group:string|null;resource_code:string|null;
 display_order:number;default_rows:number;planner_owner:string;allow_manual_plan:boolean;allow_auto_plan:boolean;
 operations:{standard_operation:string}[];
};
type ScheduledRow={
 id:number;batch_id:number;batch_no:string;standard_operation:string;recipe_key:string|null;recipe_no:string|null;
 recipe_name:string|null;resource_code:string;resource_group:string;total_jobs:number;total_qty:number;
 total_surface_dm2:number;planned_start:string;planned_end:string;duration_minutes:number;sequence_no:number;
 loading_start?:string|null;loading_end?:string|null;loading_duration_minutes?:number|null;
 process_start?:string|null;process_end?:string|null;process_duration_minutes?:number|null;
 ndt_start?:string|null;ndt_end?:string|null;ndt_duration_minutes?:number|null;
 unloading_start?:string|null;unloading_end?:string|null;unloading_duration_minutes?:number|null;
 plan_source?:string|null;
};
type PreviousMainBatch={
 batch_id:number|null;
 batch_no:string|null;
 operation:string|null;
 schedule_status:"DONE"|"SCHEDULED"|"UNSCHEDULED"|"NOT_PLANNED"|string;
 resource_code:string|null;
 planned_start:string|null;
 planned_end:string|null;
};
type PlanningBatch={
 id:number;batch_no:string;standard_operation:string;recipe_key:string|null;recipe_no:string|null;recipe_name:string|null;
 total_jobs:number;total_qty:number;total_surface_dm2:number;process_minutes:number|null;
 schedule_id:number|null;
 previous_main_batches:PreviousMainBatch[];
};

type BatchScheduleStateDetail={
 batchId:number;
 scheduled:boolean;
 scheduleId:number|null;
 resourceCode?:string|null;
 plannedStart?:string|null;
 plannedEnd?:string|null;
 scheduleStatus?:string|null;
};

const BATCH_SCHEDULE_STATE_EVENT="st-batch-schedule-state";
function emitBatchScheduleState(detail:BatchScheduleStateDetail){
 if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent<BatchScheduleStateDetail>(BATCH_SCHEDULE_STATE_EVENT,{detail}));
}
type Draft={
 standardOperation:string;recipeKey:string;resourceCode:string;date:string;startTime:string;duration:string;noLoading?:boolean;chainFrom?:number|null;chainFromExisting?:number|null;startIso?:string|null;keep?:boolean;
 batchId:number|null;batchNo:string;totalJobs:number;totalQty:number;totalSurfaceDm2:number;
 overrides:{processStart:string|null;ndtStart:string|null;unloadingStart:string|null};
};

type ScheduleWorkloadMetric={jobs:number;qty:number;surface:number};
type ScheduleWaitNextBreakdown={previousMain:string;metric:ScheduleWorkloadMetric};
type ScheduleReadyRecipeBreakdown={previousMain:string;recipeKey:string;recipeNo:string;recipeName:string;metric:ScheduleWorkloadMetric};
type ScheduleWorkloadStatus="WAIT_NEXT_MAIN"|"WAIT_FUTURE_MAIN"|"READY_PREV_SCHEDULED"|"READY_PREV_UNSCHEDULED"|"PLANNED_UNSCHEDULED"|"SCHEDULED"|"HOLD";
type ScheduleWorkloadRecipeRow={
 recipeKey:string;recipeNo:string;recipeName:string;
 WAIT:ScheduleWorkloadMetric;WAIT_NEXT_MAIN:ScheduleWorkloadMetric;WAIT_FUTURE_MAIN:ScheduleWorkloadMetric;READY:ScheduleWorkloadMetric;READY_PREV_SCHEDULED:ScheduleWorkloadMetric;READY_PREV_UNSCHEDULED:ScheduleWorkloadMetric;PLANNED_UNSCHEDULED:ScheduleWorkloadMetric;SCHEDULED:ScheduleWorkloadMetric;HOLD:ScheduleWorkloadMetric;
 total:ScheduleWorkloadMetric;waitNextBreakdown?:ScheduleWaitNextBreakdown[];readyPrevScheduledBreakdown?:ScheduleReadyRecipeBreakdown[];readyPrevUnscheduledBreakdown?:ScheduleReadyRecipeBreakdown[];
};
type ScheduleWorkloadMainRow={
 areaId:number;areaName:string;areaSort:number;standardOperation:string;mainOrder:number;
 WAIT:ScheduleWorkloadMetric;WAIT_NEXT_MAIN:ScheduleWorkloadMetric;WAIT_FUTURE_MAIN:ScheduleWorkloadMetric;READY:ScheduleWorkloadMetric;READY_PREV_SCHEDULED:ScheduleWorkloadMetric;READY_PREV_UNSCHEDULED:ScheduleWorkloadMetric;PLANNED_UNSCHEDULED:ScheduleWorkloadMetric;SCHEDULED:ScheduleWorkloadMetric;HOLD:ScheduleWorkloadMetric;
 total:ScheduleWorkloadMetric;waitNextBreakdown?:ScheduleWaitNextBreakdown[];recipes:ScheduleWorkloadRecipeRow[];
};
type WorkloadQuickViewFilter={
 areaName:string;standardOperation:string;recipeKey:string;recipeNo:string;recipeName:string;status:ScheduleWorkloadStatus;previousMain:string;
};
type WorkloadQuickViewRow={
 planningJobOperationId:number;jobNum:string;partNum:string;revisionNum:string;partDescription:string;priority:string;qty:number;surface:number;
 previousMain:string;standardOperation:string;recipeKey:string;recipeNo:string;recipeName:string;nextMain:string;nextRecipeKey:string;nextRecipeNo:string;nextRecipeName:string;
 currentBatchNo:string;internalStatus:string;
};
type WorkloadQuickViewBatch={
 id:number;batchNo:string;standardOperation:string;recipeKey:string;recipeNo:string;recipeName:string;totalJobs:number;totalQty:number;totalSurface:number;scheduled:boolean;resourceCode:string;
};
type WorkloadQuickFilterKey=
 |"job"|"partRev"|"description"|"qty"|"surface"|"priority"|"previousMain"|"main"
 |"recipeNo"|"recipeName"|"nextMain"|"nextRecipeNo"|"nextRecipeName"|"batch";

function workloadQuickFilterText(row:WorkloadQuickViewRow,key:WorkloadQuickFilterKey){
 switch(key){
  case "job":return row.jobNum;
  case "partRev":return `${row.partNum||""} ${row.revisionNum||""}`;
  case "description":return row.partDescription;
  case "qty":return `${row.qty} ${fmt(row.qty,2)}`;
  case "surface":return `${row.surface} ${fmt(row.surface,2)}`;
  case "priority":return row.priority;
  case "previousMain":return row.previousMain||"START";
  case "main":return row.standardOperation;
  case "recipeNo":return row.recipeNo||"No Recipe";
  case "recipeName":return row.recipeName||"No Recipe";
  case "nextMain":return row.nextMain||"";
  case "nextRecipeNo":return row.nextRecipeNo||"";
  case "nextRecipeName":return row.nextRecipeName||"";
  case "batch":return row.currentBatchNo||"";
 }
}

const blank=(date:string,resourceCode=""):Draft=>({
 standardOperation:"",recipeKey:"",resourceCode,date,startTime:"",duration:"",noLoading:false,chainFrom:null,chainFromExisting:null,startIso:null,keep:false,
 batchId:null,batchNo:"",totalJobs:0,totalQty:0,totalSurfaceDm2:0,
 overrides:{processStart:"",ndtStart:"",unloadingStart:""}
});
function parseHHMM(v:string){const m=v.trim().match(/^(\d{1,3}):(\d{2})$/);if(!m)return null;const n=Number(m[1])*60+Number(m[2]);return Number(m[2])<60&&n>0?n:null}
// Ngày sản xuất chạy 06:00 → 06:00 hôm sau: giờ < 06:00 thuộc NGÀY TIẾP THEO (v221.16).
// Cộng ngày thuần túy trên chuỗi YYYY-MM-DD (không qua Date/UTC để tránh lệch múi giờ).
function timeDateOf(d:{date:string},hhmm:string):string{
 const m=parseHHMM(hhmm);
 if(!d.date||!m)return d.date||"";
 if(m>=360)return d.date;
 const [y,mo,da]=d.date.split("-").map(Number);
 const base=new Date(Date.UTC(y,(mo||1)-1,da||1));
 base.setUTCDate(base.getUTCDate()+1);
 return base.toISOString().slice(0,10);
}
function absStart(d:{date:string;startTime:string;startIso?:string|null}):Date|null{
 const m=parseHHMM(d.startTime);
 if(!d.date||!m)return null;
 // v221.23: lô đã Đề xuất có startIso = thời điểm Loading Start TUYỆT ĐỐI (đúng ngày, kể cả
 // giờ qua nửa đêm hoặc đúng mốc 06:00) → giữ NGÀY của startIso, áp giờ hiển thị lên.
 if(d.startIso){
  const iso=new Date(d.startIso);
  if(Number.isFinite(iso.getTime())){
   const isoDate=iso.toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"});
   return new Date(`${isoDate}T${d.startTime}:00+07:00`);
  }
 }
 return new Date(`${timeDateOf(d,d.startTime)}T${d.startTime}:00+07:00`);
}
// v221.23: ngày của 1 giờ override (Process/NDT/Unloading Start) tính THEO dòng:
// giờ nhỏ hơn giờ bắt đầu Loading của dòng → thuộc NGÀY KẾ của dòng (chạy qua nửa đêm);
// ngược lại cùng ngày với dòng. Tránh lệch 24h khi lưu giờ tay qua 0:00.
function overrideDateOf(d:Draft,hhmm:string):string{
 const m=parseHHMM(hhmm);
 if(!d.date||!m)return d.date||"";
 const base=absStart(d);
 if(!base)return d.date;
 const baseDate=base.toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"});
 if(m<(parseHHMM(d.startTime)||0)){
  const [y,mo,da]=baseDate.split("-").map(Number);
  const dd=new Date(Date.UTC(y,(mo||1)-1,da||1));dd.setUTCDate(dd.getUTCDate()+1);
  return dd.toISOString().slice(0,10);
 }
 return baseDate;
}
function fmt(v:unknown,d=2){const n=Number(v||0);return Number.isFinite(n)?new Intl.NumberFormat("vi-VN",{maximumFractionDigits:d}).format(n):"0"}
function time(v:string|Date|null|undefined){if(!v)return "—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleTimeString("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"})}
// v221.26: dấu NGÀY tại từng ô giờ — CHẤM (•) = giờ qua 0:00 (00:00–05:59 ngày kế, vẫn trong
// ngày sản xuất hiện tại 06:00→06:00); HOA THỊ (✱) = giờ từ 06:00 ngày kế trở đi (+1 ngày sản xuất).
function dayDot(dt:Date|null|undefined,baseDate:string){
 if(!dt||!Number.isFinite(dt.getTime()))return null;
 const dStr=dt.toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"});
 if(dStr===baseDate)return null;
 const min=parseHHMM(dt.toLocaleTimeString("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"}))||0;
 return min<360
  ?<span className="cell-day-dot" title="Giờ này QUA 0:00 — thuộc ngày tiếp theo (00:00–05:59, vẫn trong ngày sản xuất hiện tại)" />
  :<span className="cell-day-dot star" title="Giờ này thuộc NGÀY SẢN XUẤT KẾ TIẾP (+1 ngày, từ 06:00 trở đi)">✱</span>;
}
function durationHHMM(v:number){return `${String(Math.floor(v/60)).padStart(2,"0")}:${String(v%60).padStart(2,"0")}`}
function previewEnd(date:string,startTime:string,durationText:string){
 const duration=parseHHMM(durationText);
 if(!date||!startTime||!duration)return "—";
 return calculatedScheduleEndTime(`${date}T${startTime}:00+07:00`,duration);
}
function dateTime(v:string|null|undefined){
 if(!v)return "—";
 const d=new Date(v);
 if(Number.isNaN(d.getTime()))return "—";
 return d.toLocaleString("vi-VN",{
  timeZone:"Asia/Ho_Chi_Minh",
  day:"2-digit",
  month:"2-digit",
  year:"numeric",
  hour:"2-digit",
  minute:"2-digit"
 });
}

export function ManualScheduleGrid({
 scheduleAreas,operations,resources,recipes,scheduledRows,planningBatches,handlingRules,date,planner
}:{
 scheduleAreas:ScheduleArea[];operations:OperationOption[];resources:ResourceOption[];recipes:RecipeOption[];
 scheduledRows:ScheduledRow[];planningBatches:PlanningBatch[];handlingRules:ChemicalHandlingRule[];
 date:string;planner:"1"|"2";
}){
 const confirmErp=useErpConfirm();
 const [rowCounts,setRowCounts]=useState<Record<string,number>>(()=>Object.fromEntries(
  scheduleAreas.map(a=>[a.schedule_area_code,Math.max(1,Number(a.default_rows)||20)])
 ));
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});
 // Ref đồng bộ với drafts: patch() ghi thẳng vào ref để draft() luôn đọc giá trị MỚI
 // trong cùng một lần chạy (quan trọng: lượt 2 của Đề xuất và ép chuỗi nối tiếp).
 const draftsRef=useRef<Record<string,Draft>>({});
 const [busy,setBusy]=useState("");
 const [rowBusy,setRowBusy]=useState("");
 const [actionBusy,setActionBusy]=useState("");
 const [editingScheduleId,setEditingScheduleId]=useState<number|null>(null);
 const [editDraft,setEditDraft]=useState({
  recipeKey:"",
  resourceCode:"",
  date:"",
  startTime:"",
  duration:""
 });
 const [message,setMessage]=useState("");
 usePopupMessage(message);
 const [liveRows,setLiveRows]=useState<ScheduledRow[]>(scheduledRows);
 const [liveBatches,setLiveBatches]=useState<PlanningBatch[]>(planningBatches);
 const [dropTarget,setDropTarget]=useState<string|null>(null);
 const [suggestBusy,setSuggestBusy]=useState<string|null>(null);
 const [saveAllBusy,setSaveAllBusy]=useState<string|null>(null);
 const [stWorkloadRows,setStWorkloadRows]=useState<ScheduleWorkloadMainRow[]>([]);
 const [stWorkloadLoading,setStWorkloadLoading]=useState(false);
 const [stWorkloadError,setStWorkloadError]=useState("");
 const [workloadQuickView,setWorkloadQuickView]=useState<WorkloadQuickViewFilter|null>(null);
 const [workloadQuickRows,setWorkloadQuickRows]=useState<WorkloadQuickViewRow[]>([]);
 const [workloadQuickBatches,setWorkloadQuickBatches]=useState<WorkloadQuickViewBatch[]>([]);
 const [workloadQuickLoading,setWorkloadQuickLoading]=useState(false);
 const [workloadQuickError,setWorkloadQuickError]=useState("");
 const [workloadQuickSelected,setWorkloadQuickSelected]=useState<Set<number>>(new Set());
 const [workloadQuickTargetBatch,setWorkloadQuickTargetBatch]=useState("");
 const [workloadQuickBusy,setWorkloadQuickBusy]=useState(false);
 const [workloadQuickFilters,setWorkloadQuickFilters]=useState<Partial<Record<WorkloadQuickFilterKey,string>>>({});
 const [workloadQuickFilterOpen,setWorkloadQuickFilterOpen]=useState<WorkloadQuickFilterKey|null>(null);


 function optimisticScheduledRow(batch:PlanningBatch,schedule:any):ScheduledRow|null{
  if(!schedule||!Number(schedule.id))return null;
  const resourceCode=String(schedule.resource_code||"");
  const resourceGroup=resources.find(x=>x.resource_code===resourceCode)?.resource_group||"";
  return {
   id:Number(schedule.id),
   batch_id:Number(batch.id),
   batch_no:String(batch.batch_no||""),
   standard_operation:String(batch.standard_operation||""),
   recipe_key:batch.recipe_key||null,
   recipe_no:batch.recipe_no||null,
   recipe_name:batch.recipe_name||null,
   resource_code:resourceCode,
   resource_group:resourceGroup,
   total_jobs:Number(batch.total_jobs||0),
   total_qty:Number(batch.total_qty||0),
   total_surface_dm2:Number(batch.total_surface_dm2||0),
   planned_start:String(schedule.planned_start||""),
   planned_end:String(schedule.planned_end||""),
   duration_minutes:Number(schedule.duration_minutes||0),
   sequence_no:Number(schedule.sequence_no||0),
   loading_start:schedule.loading_start||null,
   loading_end:schedule.loading_end||null,
   loading_duration_minutes:schedule.loading_duration_minutes==null?null:Number(schedule.loading_duration_minutes),
   process_start:schedule.process_start||null,
   process_end:schedule.process_end||null,
   process_duration_minutes:schedule.process_duration_minutes==null?null:Number(schedule.process_duration_minutes),
   ndt_start:schedule.ndt_start||null,
   ndt_end:schedule.ndt_end||null,
   ndt_duration_minutes:schedule.ndt_duration_minutes==null?null:Number(schedule.ndt_duration_minutes),
   unloading_start:schedule.unloading_start||null,
   unloading_end:schedule.unloading_end||null,
   unloading_duration_minutes:schedule.unloading_duration_minutes==null?null:Number(schedule.unloading_duration_minutes),
   plan_source:schedule.plan_source||null
  };
 }

 function applyScheduledBatchImmediately(batchId:number,schedule:any){
  const source=liveBatches.find(b=>Number(b.id)===Number(batchId))||planningBatches.find(b=>Number(b.id)===Number(batchId));
  if(source){
   const optimistic=optimisticScheduledRow(source,schedule);
   if(optimistic){
    setLiveRows(prev=>[...prev.filter(x=>Number(x.id)!==Number(optimistic.id)&&Number(x.batch_id)!==Number(batchId)),optimistic]);
   }
  }
  setLiveBatches(prev=>prev.filter(b=>Number(b.id)!==Number(batchId)));
  emitBatchScheduleState({
   batchId:Number(batchId),
   scheduled:true,
   scheduleId:Number(schedule?.id||0)||null,
   resourceCode:schedule?.resource_code||null,
   plannedStart:schedule?.planned_start||null,
   plannedEnd:schedule?.planned_end||null,
   scheduleStatus:schedule?.status||"SCHEDULED"
  });
  window.dispatchEvent(new Event("st-schedule-changed"));
 }

 function areaOps(a:ScheduleArea){
  const allowed=new Set((a.operations||[]).map(x=>x.standard_operation.toUpperCase()));
  return operations.filter(o=>allowed.has(o.standard_operation.toUpperCase()));
 }
 function recipeMatchesOperationSet(recipe:RecipeOption,allowed:Set<string>){
  return (recipe.mapped_standard_operations||[]).some(op=>allowed.has(String(op||"").trim().toUpperCase()));
 }
 function areaRecipeOptions(a:ScheduleArea,poolAllowed?:Set<string>,currentRecipeKey=""){
  const allowed=poolAllowed??new Set((a.operations||[]).map(x=>String(x.standard_operation||"").trim().toUpperCase()).filter(Boolean));
  const filtered=recipes.filter(recipe=>recipeMatchesOperationSet(recipe,allowed));
  // Existing Batch/Schedule may keep a historical Recipe after configuration changed.
  // Keep that current value visible, but do not expose other out-of-area Recipes for selection.
  if(currentRecipeKey&&!filtered.some(recipe=>recipe.recipe_key===currentRecipeKey)){
   const current=recipes.find(recipe=>recipe.recipe_key===currentRecipeKey);
   if(current)return [current,...filtered];
  }
  return filtered;
 }
 function areaResources(a:ScheduleArea){
  if(a.resource_code)return resources.filter(r=>r.resource_code===a.resource_code);
  if(a.resource_group)return resources.filter(r=>r.resource_group===a.resource_group);
  return resources;
 }
 function scheduledFor(a:ScheduleArea){
  const allowed=new Set((a.operations||[]).map(x=>x.standard_operation.toUpperCase()));

  return liveRows.filter(r=>{
   const op=String(r.standard_operation||"").toUpperCase();

   // IMPORTANT:
   // A Schedule Area with a concrete resource_code (CAB1/CAB2/CAB3, FB-01...)
   // only owns schedules on that exact resource.
   // Do not fall through to resource_group / operation matching, otherwise a CAB1
   // schedule is repeated in CAB2/CAB3 simply because all three are PAINTING.
   if(a.resource_code){
    return r.resource_code===a.resource_code;
   }

   // Area defined by Resource Group: require BOTH group + mapped operation.
   if(a.resource_group){
    return r.resource_group===a.resource_group&&allowed.has(op);
   }

   // Generic area without resource restriction.
   return allowed.has(op);
  }).sort((x,y)=>{
   const sx=Number(x.sequence_no||0);
   const sy=Number(y.sequence_no||0);

   if(sx>0||sy>0){
    const ax=sx>0?sx:999999;
    const ay=sy>0?sy:999999;
    if(ax!==ay)return ax-ay;
   }

   return new Date(x.planned_start).getTime()-new Date(y.planned_start).getTime();
  });
 }
 function unscheduledFor(a:ScheduleArea,poolAllowed?:Set<string>){
  const allowed=poolAllowed??new Set((a.operations||[]).map(x=>String(x.standard_operation||"").toUpperCase()));
  // V434: Unscheduled pool is also a PICKING pool. As soon as a Batch is loaded
  // into any draft row, hide it from every area/lane so the same Batch cannot be
  // picked twice before Save. Clearing that draft row immediately returns it.
  const pickedBatchIds=new Set(
   Object.values(drafts)
    .map(r=>Number(r?.batchId||0))
    .filter(id=>Number.isFinite(id)&&id>0)
  );
  return liveBatches
   .filter(b=>!b.schedule_id&&!pickedBatchIds.has(Number(b.id))&&allowed.has(String(b.standard_operation||"").toUpperCase()))
   .sort((x,y)=>
    String(x.standard_operation).localeCompare(String(y.standard_operation),undefined,{numeric:true})||
    String(x.batch_no).localeCompare(String(y.batch_no),undefined,{numeric:true})
   );
 }
 const key=(a:string,i:number)=>`${a}::${i}`;
 function draft(a:ScheduleArea,i:number){
  return draftsRef.current[key(a.schedule_area_code,i)]||blank(date,a.resource_code||"");
 }
 function patch(a:ScheduleArea,i:number,x:Partial<Draft>){
  const k=key(a.schedule_area_code,i);
  const cur=draftsRef.current[k]||blank(date,a.resource_code||"");
  draftsRef.current={...draftsRef.current,[k]:{...cur,...x}};
  setDrafts(draftsRef.current);
 }
 function toTimeInput(v:Date){
  return v.toLocaleTimeString("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"});
 }
 // Dựng trước toàn bộ khoảng chiếm dụng Flybar: Loading → Process → NDT → Unloading.
 // Dùng Loading/Unloading Duration từ cấu hình Qty/Surface và Process Duration đã nhập.
 function phaseWindow(a:ScheduleArea,i:number){
  const r=draft(a,i);
  const duration=parseHHMM(r.duration);
  if(!r.date||!r.startTime||!duration)return null;
  const recipe=recipes.find(x=>x.recipe_key===r.recipeKey);
  const loading=selectChemicalHandlingRule(handlingRules,"LOADING",0,0);
  const unloading=selectChemicalHandlingRule(handlingRules,"UNLOADING",0,0);
  if(!loading||!unloading)return null;
  const loadingStart=absStart(r);
  if(!loadingStart)return null;
  try{
   return buildChemicalScheduleWindow({
    loadingStart,
    processMinutes:duration,
    loadingMinutes:r.noLoading?0:Number(loading.duration_minutes),
    unloadingMinutes:Number(unloading.duration_minutes),
    recipeNo:recipe?.recipe_no||null,
    overrides:{
     processStart:r.overrides.processStart?new Date(`${overrideDateOf(r,r.overrides.processStart)}T${r.overrides.processStart}:00+07:00`):null,
     ndtStart:r.overrides.ndtStart?new Date(`${overrideDateOf(r,r.overrides.ndtStart)}T${r.overrides.ndtStart}:00+07:00`):null,
     unloadingStart:r.overrides.unloadingStart?new Date(`${overrideDateOf(r,r.overrides.unloadingStart)}T${r.overrides.unloadingStart}:00+07:00`):null
    }
   });
  }catch{return null}
 }
 function fillBatchRow(a:ScheduleArea,i:number,b:PlanningBatch){
  const hh=b.process_minutes&&Number(b.process_minutes)>0
   ?`${String(Math.floor(Number(b.process_minutes)/60)).padStart(2,"0")}:${String(Number(b.process_minutes)%60).padStart(2,"0")}`
   :"";
  patch(a,i,{
   batchId:b.id,batchNo:b.batch_no,standardOperation:b.standard_operation,
   recipeKey:b.recipe_key||"",resourceCode:a.resource_code||"",date,startTime:"",duration:hh,
   keep:true,
   totalJobs:Number(b.total_jobs||0),totalQty:Number(b.total_qty||0),totalSurfaceDm2:Number(b.total_surface_dm2||0)
  });
  setMessage(`${b.batch_no}: đã đưa xuống dòng ${i+1}. Chọn Resource / Start / Duration rồi Schedule.`);
 }
 function selectUnscheduledBatch(a:ScheduleArea,b:PlanningBatch){
  // Click card: dùng dòng trống đầu tiên trong vùng này.
  const count=rowCounts[a.schedule_area_code]||Math.max(1,Number(a.default_rows)||20);
  let target=0;
  for(let i=0;i<count;i++){
   const r=drafts[key(a.schedule_area_code,i)];
   if(!r?.batchId&&!r?.standardOperation){target=i;break}
  }
  fillBatchRow(a,target,b);
 }
 function clearDraft(a:ScheduleArea,i:number){
  const k=key(a.schedule_area_code,i);
  draftsRef.current={...draftsRef.current,[k]:blank(date,a.resource_code||"")};
  setDrafts(draftsRef.current);
 }
 async function persistRowCount(a:ScheduleArea,nextCount:number){
  const safeCount=Math.min(200,Math.max(1,nextCount));
  setRowBusy(a.schedule_area_code);

  try{
   const res=await fetch("/api/config/schedule-areas",{
    method:"PATCH",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
     schedule_area_code:a.schedule_area_code,
     schedule_area_name:a.schedule_area_name,
     resource_group:a.resource_group,
     resource_code:a.resource_code,
     planner_owner:a.planner_owner,
     display_order:a.display_order,
     default_rows:safeCount,
     allow_manual_plan:a.allow_manual_plan,
     allow_auto_plan:a.allow_auto_plan,
     is_active:true
    })
   });

   const text=await res.text();
   let data:any={};

   if(text){
    try{data=JSON.parse(text)}catch{}
   }

   if(!res.ok){
    throw new Error(data.error||`Không lưu được số dòng (${res.status}).`);
   }

   setRowCounts(p=>({...p,[a.schedule_area_code]:safeCount}));
   setMessage(`${a.schedule_area_name}: đã lưu ${safeCount} dòng mặc định.`);
   return true;
  }catch(e){
   setMessage(e instanceof Error?e.message:"Không lưu được số dòng.");
   return false;
  }finally{
   setRowBusy("");
  }
 }

 async function addRow(a:ScheduleArea){
  const count=rowCounts[a.schedule_area_code]||Math.max(1,Number(a.default_rows)||20);
  await persistRowCount(a,count+1);
 }

 async function removeRow(a:ScheduleArea){
  const count=rowCounts[a.schedule_area_code]||Math.max(1,Number(a.default_rows)||20);
  if(count<=1)return;

  const ok=await persistRowCount(a,count-1);
  if(!ok)return;

  const last=count-1;
  const k=key(a.schedule_area_code,last);

  const n={...draftsRef.current};
  delete n[k];
  draftsRef.current=n;
  setDrafts(n);
 }
 function beginEdit(row:ScheduledRow){
  const start=new Date(row.planned_start);
  const localDate=start.toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"});
  const localTime=start.toLocaleTimeString("en-GB",{
   timeZone:"Asia/Ho_Chi_Minh",
   hour:"2-digit",
   minute:"2-digit"
  });

  setEditingScheduleId(row.id);
  setEditDraft({
   recipeKey:row.recipe_key||"",
   resourceCode:row.resource_code||"",
   date:localDate,
   startTime:localTime,
   duration:durationHHMM(Number(row.process_duration_minutes||row.duration_minutes||0))
  });
  setMessage("");
 }

 async function saveEdit(row:ScheduledRow){
  const duration=parseHHMM(editDraft.duration);

  if(!editDraft.resourceCode||!editDraft.date||!editDraft.startTime||!duration){
   setMessage("Edit: Resource / Date / Start / Duration là bắt buộc.");
   return;
  }

  setActionBusy(`edit-${row.id}`);
  setMessage("");

  try{
   const plannedStart=absStart(editDraft)!.toISOString();

   const scheduleRes=await fetch("/api/schedule",{
    method:"PATCH",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
     scheduleId:row.id,
     resourceCode:editDraft.resourceCode,
     plannedStart,
     durationMinutes:duration
    })
   });

   const scheduleData=await safeJson(scheduleRes);

   if(!scheduleRes.ok)
    throw new Error(scheduleData.error||"Không sửa được Schedule.");

   if((editDraft.recipeKey||"")!==(row.recipe_key||"")){
    const recipeRes=await fetch(`/api/planning/batch/${row.batch_id}`,{
     method:"PATCH",
     headers:{"content-type":"application/json"},
     body:JSON.stringify({
      recipe_key:editDraft.recipeKey||null,
      allow_scheduled_recipe_edit:true
     })
    });

    const recipeData=await safeJson(recipeRes);

    if(!recipeRes.ok)
     throw new Error(
      `Schedule đã cập nhật nhưng Recipe chưa đổi: ${recipeData.error||"Recipe update failed"}`
     );
   }

   setEditingScheduleId(null);
   await refreshRows();
  }catch(e){
   setMessage(e instanceof Error?e.message:"Không sửa được Batch.");
  }finally{
   setActionBusy("");
  }
 }

 async function unscheduleBatch(row:ScheduledRow){
  const ok=await confirmErp({
   title:"Bỏ điều độ",
   message:`Bỏ ${row.batch_no} khỏi Scheduling Board?`,
   detail:"Batch và Job trong Batch được giữ nguyên. Chỉ hủy Schedule hiện tại; Batch sẽ quay lại danh sách Unscheduled Batches.",
   tone:"warning",
   confirmLabel:"Bỏ điều độ"
  });
  if(!ok)return;

  setActionBusy(`unschedule-${row.id}`);
  setMessage("");
  try{
   const res=await fetch("/api/schedule",{
    method:"DELETE",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({scheduleId:row.id})
   });
   const data=await safeJson(res);
   if(!res.ok)throw new Error(data.error||"Không bỏ được Schedule.");

   // Optimistic restore: keep all draft rows intact and return this Batch to the
   // Unscheduled pool immediately. refreshRows() then reconciles with server truth.
   const source=planningBatches.find(b=>Number(b.id)===Number(row.batch_id));
   if(source){
    const restored:PlanningBatch={...source,schedule_id:null};
    setLiveBatches(prev=>prev.some(b=>Number(b.id)===Number(restored.id))
     ?prev.map(b=>Number(b.id)===Number(restored.id)?restored:b)
     :[...prev,restored]);
   }
   setLiveRows(prev=>prev.filter(x=>Number(x.id)!==Number(row.id)));
   emitBatchScheduleState({batchId:Number(row.batch_id),scheduled:false,scheduleId:null,scheduleStatus:null});
   window.dispatchEvent(new Event("st-schedule-changed"));
   setMessage(`${row.batch_no}: đã bỏ điều độ; Batch quay lại Unscheduled Batches.`);
   await refreshRows();
  }catch(e){
   setMessage(e instanceof Error?e.message:"Không bỏ được Schedule.");
  }finally{
   setActionBusy("");
  }
 }

 async function deleteBatch(row:ScheduledRow){
  const ok=await confirmErp(
   `Xóa ${row.batch_no}?\\n\\nSchedule sẽ bị hủy. Job trong Batch sẽ quay lại Candidate/Eligible nếu Planning Chain cho phép.`
  );

  if(!ok)return;

  setActionBusy(`delete-${row.batch_id}`);
  setMessage("");

  try{
   const res=await fetch(`/api/planning/batch/${row.batch_id}`,{
    method:"DELETE"
   });

   const data=await safeJson(res);

   if(!res.ok)
    throw new Error(data.error||"Không xóa được Batch.");

   await refreshRows();
  }catch(e){
   setMessage(e instanceof Error?e.message:"Không xóa được Batch.");
  }finally{
   setActionBusy("");
  }
 }

 async function moveBatch(actual:ScheduledRow[],index:number,direction:-1|1){
  const target=index+direction;
  if(target<0||target>=actual.length)return;

  const reordered=[...actual];
  [reordered[index],reordered[target]]=[reordered[target],reordered[index]];

  setActionBusy(`order-${actual[index].id}`);
  setMessage("");

  try{
   const res=await fetch("/api/schedule/order",{
    method:"PUT",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
     schedule_ids:reordered.map(x=>x.id)
    })
   });

   const data=await safeJson(res);

   if(!res.ok)
    throw new Error(data.error||"Không lưu được thứ tự.");

   await refreshRows();
  }catch(e){
   setMessage(e instanceof Error?e.message:"Không lưu được thứ tự.");
  }finally{
   setActionBusy("");
  }
 }

 async function save(a:ScheduleArea,i:number){
  const r=draft(a,i),duration=parseHHMM(r.duration);
  // Bỏ cột Std Op: tự xác định Operation từ Recipe khi chưa chọn.
  let effOp=r.standardOperation;
  if(!effOp&&r.recipeKey){
   const rc=recipes.find(x=>x.recipe_key===r.recipeKey);
   const defOp=rc&&rc.default_standard_operation?rc.default_standard_operation:"";
   if(defOp&&areaOps(a).some(o=>o.standard_operation===defOp))effOp=defOp;
  }
  const allowed=areaOps(a).some(o=>o.standard_operation===effOp);
  if(!effOp||!allowed){
   setMessage(`${a.schedule_area_name}: dòng ${i+1} chưa xác định được Operation${
    r.recipeKey
     ?". Hãy chọn Operation trong ô xổ xuống cạnh Recipe (hoặc vào Cấu hình → Process Recipe → mục Operation Code → Recipe Mapping để map)."
     :". Hãy chọn Recipe để hệ thống tự tìm Operation, hoặc kéo lô từ Unscheduled vào dòng."}`);
   return;
  }
  if(!r.resourceCode||!r.date||!r.startTime){setMessage(`${a.schedule_area_name}: chọn Resource / Date / Start.`);return}
  if(!duration){setMessage("Duration phải HH:MM và > 00:00.");return}
  const k=key(a.schedule_area_code,i);setBusy(k);setMessage("");
  try{
   const plannedStart=absStart(r)!.toISOString();
   // Existing Planning Board Batch: schedule the same batch_id. New manual row:
   // create empty Batch + Schedule through manual-grid. Auto Schedule will reuse
   // the existing-Batch /api/schedule contract later.
   const existingBatch=Boolean(r.batchId);
   const endpoint=existingBatch?"/api/schedule":"/api/schedule/manual-grid";
   const overrides={
    process_start_override:r.overrides.processStart?new Date(`${overrideDateOf(r,r.overrides.processStart)}T${r.overrides.processStart}:00+07:00`).toISOString():null,
    ndt_start_override:r.overrides.ndtStart?new Date(`${overrideDateOf(r,r.overrides.ndtStart)}T${r.overrides.ndtStart}:00+07:00`).toISOString():null,
    unloading_start_override:r.overrides.unloadingStart?new Date(`${overrideDateOf(r,r.overrides.unloadingStart)}T${r.overrides.unloadingStart}:00+07:00`).toISOString():null,
    loading_minutes_override:r.noLoading?0:null
   };
   const payload=existingBatch
    ?{batchId:r.batchId,resourceCode:r.resourceCode,plannedStart,durationMinutes:duration,planSource:"MANUAL_EXISTING_BATCH",...overrides}
    :{schedule_area_code:a.schedule_area_code,standard_operation:effOp,recipe_key:r.recipeKey||null,
      resource_code:r.resourceCode,planning_date:r.date,planned_start:plannedStart,duration_minutes:duration,plan_source:"MANUAL_GRID",...overrides};
   const res=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
   const d=await safeJson(res);if(!res.ok)throw new Error(d.error||"Save failed");
   const adj=d.autoAdjusted
    ?` (tự đẩy giờ: ${time(d.autoAdjusted.from)} → ${time(d.autoAdjusted.to)} do ${d.autoAdjusted.reason})`
    :"";
   setMessage(existingBatch
    ?`${r.batchNo} · ${a.schedule_area_name} đã Schedule, không tạo Batch mới.${adj}`
    :`${d.batchNo} · ${a.schedule_area_name} đã tạo.${adj}`);
   if(existingBatch&&r.batchId){
    // V436: commit succeeded -> reflect SCHEDULED immediately in all client views.
    // No browser refresh is required; refreshRows only reconciles server truth afterwards.
    applyScheduledBatchImmediately(Number(r.batchId),d.schedule);
   }
   removeDraftRow(a,i);
   await refreshRows();
  }catch(e){setMessage(e instanceof Error?e.message:"Save failed")}finally{setBusy("")}
 }



 useEffect(()=>{setLiveRows(scheduledRows)},[scheduledRows]);
 useEffect(()=>{setLiveBatches(planningBatches)},[planningBatches]);

 async function refreshStWorkload(){
  setStWorkloadLoading(true);
  setStWorkloadError("");
  try{
   const res=await fetch("/api/schedule/st-workload-summary",{cache:"no-store"});
   const d=await safeJson(res);
   if(!res.ok)throw new Error(d?.error||"Không đọc được ST Workload Summary.");
   setStWorkloadRows(Array.isArray(d?.mainRows)?d.mainRows:[]);
  }catch(e){
   setStWorkloadError(e instanceof Error?e.message:String(e));
  }finally{
   setStWorkloadLoading(false);
  }
 }

 async function loadWorkloadQuickView(filter:WorkloadQuickViewFilter){
  setWorkloadQuickLoading(true);
  setWorkloadQuickError("");
  try{
   const qs=new URLSearchParams({
    standardOperation:filter.standardOperation,
    status:filter.status
   });
   if(filter.recipeKey)qs.set("recipeKey",filter.recipeKey);
   if(filter.previousMain)qs.set("previousMain",filter.previousMain);
   const res=await fetch(`/api/schedule/workload-quick-view?${qs.toString()}`,{cache:"no-store"});
   const d=await safeJson(res);
   if(!res.ok)throw new Error(d?.error||"Không đọc được Planning Board Quick View.");
   setWorkloadQuickRows(Array.isArray(d?.rows)?d.rows:[]);
   setWorkloadQuickBatches(Array.isArray(d?.batches)?d.batches:[]);
  }catch(e){
   setWorkloadQuickRows([]);
   setWorkloadQuickBatches([]);
   setWorkloadQuickError(e instanceof Error?e.message:String(e));
  }finally{
   setWorkloadQuickLoading(false);
  }
 }

 function openWorkloadQuickView(filter:WorkloadQuickViewFilter){
  setWorkloadQuickView(filter);
  setWorkloadQuickSelected(new Set());
  setWorkloadQuickTargetBatch("");
  setWorkloadQuickFilters({});
  setWorkloadQuickFilterOpen(null);
  void loadWorkloadQuickView(filter);
 }
 function closeWorkloadQuickView(){
  if(workloadQuickBusy)return;
  setWorkloadQuickView(null);
  setWorkloadQuickRows([]);
  setWorkloadQuickBatches([]);
  setWorkloadQuickSelected(new Set());
  setWorkloadQuickTargetBatch("");
  setWorkloadQuickFilters({});
  setWorkloadQuickFilterOpen(null);
  setWorkloadQuickError("");
 }
 function quickViewCanPlan(){
  return workloadQuickView?.status==="READY_PREV_SCHEDULED"||workloadQuickView?.status==="READY_PREV_UNSCHEDULED";
 }
 function toggleWorkloadQuickRow(row:WorkloadQuickViewRow){
  if(!quickViewCanPlan())return;
  setWorkloadQuickSelected(prev=>{
   const next=new Set(prev);
   if(next.has(row.planningJobOperationId)){next.delete(row.planningJobOperationId);return next;}
   const firstId=[...next][0];
   const first=workloadQuickRows.find(x=>x.planningJobOperationId===firstId);
   const firstRecipe=first?.recipeKey||"__NO_RECIPE__";
   const rowRecipe=row.recipeKey||"__NO_RECIPE__";
   if(first&&firstRecipe!==rowRecipe){
    setMessage("Quick View: chỉ chọn Job cùng Recipe trong một lần tạo/thêm Batch. Chọn từng Recipe riêng.");
    return prev;
   }
   next.add(row.planningJobOperationId);
   return next;
  });
 }
 function applyQuickBatchTarget(raw:any){
  if(!raw||!Number(raw.id))return;
  const row:PlanningBatch={
   id:Number(raw.id),batch_no:String(raw.batch_no||""),standard_operation:String(raw.standard_operation||""),
   recipe_key:raw.recipe_key||null,recipe_no:raw.recipe_no||null,recipe_name:raw.recipe_name||null,
   total_jobs:Number(raw.total_jobs||0),total_qty:Number(raw.total_qty||0),total_surface_dm2:Number(raw.total_surface_dm2||0),
   process_minutes:raw.process_minutes==null?null:Number(raw.process_minutes),schedule_id:raw.schedule_id==null?null:Number(raw.schedule_id),previous_main_batches:[]
  };
  setLiveBatches(prev=>[row,...prev.filter(x=>Number(x.id)!==Number(row.id))]);
 }
 async function saveWorkloadQuickSelection(mode:"CREATE"|"EXISTING"){
  if(!workloadQuickView||!quickViewCanPlan()||!workloadQuickSelected.size)return;
  const selected=workloadQuickRows.filter(x=>workloadQuickSelected.has(x.planningJobOperationId));
  if(!selected.length)return;
  const recipes=[...new Set(selected.map(x=>x.recipeKey||""))];
  if(recipes.length>1){setMessage("Quick View: các Job đang có Recipe khác nhau. Chọn từng Recipe riêng.");return;}
  const targetBatchId=mode==="EXISTING"?Number(workloadQuickTargetBatch||0):0;
  if(mode==="EXISTING"&&!targetBatchId){setMessage("Chọn Existing Batch trước khi Add to Batch.");return;}
  setWorkloadQuickBusy(true);
  try{
   const res=await fetch("/api/planning/batch",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({
     planning_job_operation_ids:selected.map(x=>x.planningJobOperationId),
     standard_operation:workloadQuickView.standardOperation,
     recipe_key:recipes[0]||null,
     planning_date:date,
     ...(targetBatchId?{target_batch_id:targetBatchId}:{})
    })
   });
   const d=await safeJson(res);
   if(!res.ok)throw new Error(d?.error||"Không thể tạo/thêm Batch từ Quick View.");
   applyQuickBatchTarget(d?.batchTarget);
   setMessage(targetBatchId
    ?`${d?.batchNo||"Batch"}: đã thêm ${selected.length} Job từ Scheduling Workload.`
    :`${Array.isArray(d?.batchNos)&&d.batchNos.length?d.batchNos.join(" & "):d?.batchNo||"Batch"}: đã tạo từ ${selected.length} Job trong Scheduling Workload.`);
   setWorkloadQuickSelected(new Set());
   await Promise.all([refreshStWorkload(),loadWorkloadQuickView(workloadQuickView)]);
   window.dispatchEvent(new Event("st-schedule-changed"));
  }catch(e){
   setWorkloadQuickError(e instanceof Error?e.message:String(e));
  }finally{
   setWorkloadQuickBusy(false);
  }
 }

 useEffect(()=>{
  void refreshStWorkload();
  const onChanged=()=>{void refreshStWorkload();};
  window.addEventListener("st-schedule-changed",onChanged);
  return ()=>window.removeEventListener("st-schedule-changed",onChanged);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);

 async function refreshRows(){
  try{
   const res=await fetch(`/api/schedule/rows?date=${encodeURIComponent(date)}`,{cache:"no-store"});
   const d=await safeJson(res);
   if(res.ok){
    setLiveRows((d.rows||[]) as ScheduledRow[]);
    const activeScheduledBatchIds=new Set<number>(
     (Array.isArray(d.activeScheduledBatchIds)?d.activeScheduledBatchIds:[])
      .map((id:any)=>Number(id))
      .filter((id:number)=>Number.isFinite(id)&&id>0)
    );
    // Server returns active Schedule ownership across ALL dates, not only the
    // currently viewed date. This prevents a Batch scheduled on another day from
    // incorrectly reappearing as Unscheduled after a local refresh.
    if(activeScheduledBatchIds.size){
     setLiveBatches(planningBatches
      .filter((b:PlanningBatch)=>!activeScheduledBatchIds.has(Number(b.id)))
      .map((b:PlanningBatch)=>({...b,schedule_id:null})));
    }else{
     // Empty set is valid after unscheduling the last Batch.
     setLiveBatches(planningBatches.map((b:PlanningBatch)=>({...b,schedule_id:null})));
    }
   }
  }catch{/* giữ nguyên danh sách cũ nếu lỗi mạng */}
  window.dispatchEvent(new Event("st-schedule-changed"));
 }

 function hasSuggestedRows(a:ScheduleArea){
  const cnt=rowCounts[a.schedule_area_code]||Math.max(1,Number(a.default_rows)||20);
  for(let i=0;i<cnt;i++){
   const r=draft(a,i);
   if(r.startTime||r.resourceCode||r.duration)return true;
  }
  return false;
 }
 function clearSuggestion(a:ScheduleArea){
  const cnt=rowCounts[a.schedule_area_code]||Math.max(1,Number(a.default_rows)||20);
  const affected:number[]=[];let kept=0;
  for(let i=0;i<cnt;i++){
   const r=draft(a,i);
   if(r.keep){kept++;continue;}
   if(!r.startTime&&!r.resourceCode&&!r.duration)continue;
   affected.push(i+1);
   patch(a,i,{
    resourceCode:"",startTime:"",duration:"",noLoading:false,
    overrides:{processStart:null,ndtStart:null,unloadingStart:null}
   });
  }
  setMessage(affected.length
   ?`${a.schedule_area_name}: đã xóa thời gian đề xuất ở ${affected.length} dòng (${affected.join(", ")}).${kept?` Giữ nguyên ${kept} dòng đang .`:""} Recipe và liên kết giữ nguyên — bấm Đề xuất lại nếu muốn.`
   :(kept?`Các dòng đang giữ được giữ nguyên; không có dòng nào khác được đề xuất.`:"Không có dòng nào được đề xuất."));
 }

 async function suggestAll(a:ScheduleArea){
  const count=rowCounts[a.schedule_area_code]||Math.max(1,Number(a.default_rows)||20);
  const buildRuns=():{rowIdx:number[];runs:any[];firstDate:string;firstStart:string}=>{
   const ri:number[]=[];const ru:any[]=[];
   const runRowIdx:number[]=[]; // run index của từng dòng (song song với runs)
   let fd="",fs="";
   for(let i=0;i<count;i++){
    const r=draft(a,i);
    if(!r.recipeKey)continue;
    if(!fd&&r.date)fd=r.date;
    if(!fs&&r.startTime)fs=r.startTime;
    ri.push(i);
    runRowIdx.push(i);
    const run:any={recipe_key:r.recipeKey};
    if(r.date&&r.startTime)run.desired_start=absStart(r)!.toISOString();
    // Giờ chỉnh tay ở cột Process/NDT/Unloading Start → gửi lên để Đề xuất tính luôn
    // (tránh gợi ý giờ cấn quá 3 FB Process cùng lúc, NDT queue…).
    if(r.date&&(r.overrides.processStart||r.overrides.ndtStart||r.overrides.unloadingStart)){
     const ov:any={};
     if(r.overrides.processStart)ov.processStart=`${overrideDateOf(r,r.overrides.processStart)}T${r.overrides.processStart}:00+07:00`;
     if(r.overrides.ndtStart)ov.ndtStart=`${overrideDateOf(r,r.overrides.ndtStart)}T${r.overrides.ndtStart}:00+07:00`;
     if(r.overrides.unloadingStart)ov.unloadingStart=`${overrideDateOf(r,r.overrides.unloadingStart)}T${r.overrides.unloadingStart}:00+07:00`;
     run.overrides=ov;
    }
    // Liên kết THỦ CÔNG: trỏ thẳng tới KẾT QUẢ của dòng nguồn trong CÙNG lượt chạy
    // (chain_from_run = run index của dòng nguồn) — engine tự neo Loading Start =
    // NDT End dòng nguồn (nếu nguồn là preclean có NDT) hoặc Unloading End (nguồn không NDT),
    // có kiểm tra đầy đủ ràng buộc với MỌI dòng khác.
    // Liên kết THỦ CÔNG tới LÔ ĐÃ LƯU (kéo dòng mới lên dòng đã lưu): gửi id schedule nguồn +
    // FB + giờ kết thúc (NDT End nếu nguồn có NDT, ngược lại Unloading End) — engine tự neo
    // và kiểm tra đầy đủ ràng buộc (≤3 Process, FB bận…) rồi đề xuất giờ tốt nhất.
    if(r.chainFromExisting!=null&&r.chainFromExisting<liveRows.length){
     const src=liveRows[r.chainFromExisting];
     if(src&&src.resource_code&&(src.ndt_end||src.planned_end)){
      run.manual_chain=true;
      run.preferred_fb=src.resource_code;
      run.continuation_from=new Date(String(src.ndt_end||src.planned_end)).toISOString();
      run.chain_source_schedule_id=Number(src.id);
     }
    } else if(r.chainFrom!=null&&r.chainFrom<i){
     const srcRunIdx=runRowIdx.indexOf(r.chainFrom);
     if(srcRunIdx>=0)run.chain_from_run=srcRunIdx;
    }
    // Nối tiếp tự động: lô có Previous Main đã điều độ → báo server ưu tiên FB đó (server tự kiểm chứng job).
    if(r.batchId&&!run.manual_chain){
     run.batch_id=String(r.batchId);
     const b=liveBatches.find(x=>x.id===r.batchId);
     let prevFb:string|null=null,prevEnd:number|null=null;
     for(const prev of ((b as any)?.previous_main_batches||[]) as any[]){
      if(prev.schedule_status!=="SCHEDULED"||!prev.resource_code||!prev.planned_end)continue;
      const t=new Date(String(prev.planned_end)).getTime();
      if(Number.isFinite(t)&&(prevEnd===null||t>prevEnd)){prevEnd=t;prevFb=String(prev.resource_code);}
     }
     if(prevFb&&prevEnd!==null){
      run.preferred_fb=prevFb;
      run.continuation_from=new Date(prevEnd).toISOString();
     }
    }
    ru.push(run);
   }
   return {rowIdx:ri,runs:ru,firstDate:fd,firstStart:fs};
  };
  let {rowIdx,runs,firstDate,firstStart}=buildRuns();
  if(!runs.length){setMessage(`${a.schedule_area_name}: chọn Recipe cho ít nhất 1 dòng rồi bấm Đề xuất.`);return;}
  setSuggestBusy(a.schedule_area_code);setMessage("");
  try{
   let applied=0,continuedCount=0;
   const applyResults=async()=>{
    const res=await fetch("/api/schedule/chemical-simulation",{
     method:"POST",headers:{"content-type":"application/json"},
     body:JSON.stringify({
      desired_start:`${firstDate||date}T${firstStart||"06:00"}:00+07:00`,
      allowed_operations:(a.operations||[]).map(o=>o.standard_operation),
      runs
     })
    });
    const d=await safeJson(res);
    if(!res.ok)throw new Error(d.error||"Không đề xuất được.");
    const results=(d.runs||[]) as any[];
    results.forEach((run:any,j:number)=>{
     const i=rowIdx[j];if(i===undefined||!run)return;
     const ld=new Date(run.loading_start);
     if(!Number.isFinite(ld.getTime()))return;
     const r=draft(a,i);
     const op=String(run.standard_operation||"");
     const ldStr=ld.toLocaleTimeString("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"});
     // v221.21: hiển thị NDT ĐÚNG theo kết quả đề xuất (có thể bị đẩy vì ≤2 FB NDT cùng lúc)
     // — không tự tính lại ở client (tránh lệch với server như trước đây).
     const ndtStr=run.ndt_start?new Date(run.ndt_start).toLocaleTimeString("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"}):null;
     const ov={...r.overrides};
     if(run.continued)ov.processStart=ldStr;
     if(ndtStr)ov.ndtStart=ndtStr;
     patch(a,i,{
      ...(op&&!r.standardOperation?{standardOperation:op}:{}),
      resourceCode:run.resource_code,
      date:ld.toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}),
      startTime:ldStr,
      startIso:ld.toISOString(),
      ...(run.continued||ndtStr?{noLoading:run.continued?true:r.noLoading,overrides:ov}:{}),
      ...(!r.duration&&Number(run.process_minutes)>0
       ?{duration:`${String(Math.floor(Number(run.process_minutes)/60)).padStart(2,"0")}:${String(Number(run.process_minutes)%60).padStart(2,"0")}`}
       :{})
     });
     applied++;
     if(run.continued)continuedCount++;
    });
   };
   await applyResults();
   // Sắp xếp lại các dòng theo giờ Loading Start cho dễ theo dõi (liên kết được giữ đúng).
   sortDraftsByTime(a);
   setMessage(`${a.schedule_area_name}: đã đề xuất ${applied} dòng (FB + giờ Loading + Duration)${continuedCount?`, trong đó ${continuedCount} dòng nối tiếp cùng FB (không loading)`:""}. Đã sắp xếp lại theo giờ — xem từng dòng rồi Save.`);
  }catch(e){
   setMessage(e instanceof Error?e.message:"Không đề xuất được.");
  }finally{setSuggestBusy("");}
 }


 // Sau Đề xuất: sắp xếp lại các dòng nhập theo giờ Loading Start (dòng sớm lên trước),
 // dòng chưa có giờ xuống cuối; liên kết nối tiếp được remap theo vị trí mới
 // và dòng nguồn luôn đứng trước dòng nối tiếp.
 function sortDraftsByTime(a:ScheduleArea){
  const cnt=rowCounts[a.schedule_area_code]||Math.max(1,Number(a.default_rows)||20);
  const rows:{idx:number;d:Draft}[]=[];
  for(let i=0;i<cnt;i++){
   const d=draftsRef.current[key(a.schedule_area_code,i)];
   if(d)rows.push({idx:i,d});
  }
  const sorted=[...rows].sort((x,y)=>{
   // Dòng nguồn của liên kết luôn đứng trước dòng nối tiếp (dù giờ lệch).
   if(y.d.chainFrom===x.idx)return -1;
   if(x.d.chainFrom===y.idx)return 1;
   // v221.19: sắp theo giờ bắt đầu PROCESS (công việc thật) thay vì Loading Start —
   // tránh cảnh dòng 13 Process 19:50 đứng TRÊN dòng 14 Process 19:30 (dòng 14 nối tiếp
   // nên không Loading → Process sớm hơn nhưng Loading Start muộn hơn).
   const pStart=(r:{idx:number;d:Draft})=>{
    const w=phaseWindow(a,r.idx);
    if(w&&w.processStart)return w.processStart.getTime();
    return absStart(r.d)?.getTime()??Number.MAX_SAFE_INTEGER;
   };
   return (pStart(x)-pStart(y))||x.idx-y.idx;
  });
  const pos=new Map<number,number>();
  sorted.forEach((r,newPos)=>{pos.set(r.idx,newPos)});
  const next:Record<string,Draft>={};
  sorted.forEach((r,newPos)=>{
   const d={...r.d};
   if(d.chainFrom!=null&&pos.has(d.chainFrom))d.chainFrom=pos.get(d.chainFrom)!;
   next[key(a.schedule_area_code,newPos)]=d;
  });
  draftsRef.current=next;
  setDrafts(next);
 }


 const kl=(qty:any,surf:any)=>{
  const n=Number(qty||0),m=Number(surf||0);
  return (!n&&!m)?"—":`${fmt(n,0)} pcs · ${fmt(m)} dm²`;
 };
 const FB_COLORS:Record<string,string>={
  "FB-01":"fb-01","FB-02":"fb-02","FB-03":"fb-03","FB-04":"fb-04","FB-05":"fb-05","FB-06":"fb-06"
 };
 const fbClass=(code:string)=>FB_COLORS[String(code||"").toUpperCase()]||"";
 const CHAIN_PAIR_CLASSES=["chain-pair-1","chain-pair-2","chain-pair-3","chain-pair-4","chain-pair-5","chain-pair-6"];
 function chainPairClass(token:string|number|null|undefined){
  const raw=String(token??"");
  let h=0;for(const ch of raw)h=(h*31+ch.charCodeAt(0))>>>0;
  return CHAIN_PAIR_CLASSES[h%CHAIN_PAIR_CLASSES.length];
 }
 function chainFromDraftUsed(a:ScheduleArea,sourceIndex:number,excludeChild?:number){
  const cnt=rowCounts[a.schedule_area_code]||Math.max(1,Number(a.default_rows)||20);
  for(let j=0;j<cnt;j++){
   if(j===excludeChild)continue;
   if(draft(a,j).chainFrom===sourceIndex)return j;
  }
  return null;
 }
 function chainFromExistingUsed(a:ScheduleArea,sourceLiveIndex:number,excludeChild?:number){
  const cnt=rowCounts[a.schedule_area_code]||Math.max(1,Number(a.default_rows)||20);
  for(let j=0;j<cnt;j++){
   if(j===excludeChild)continue;
   if(draft(a,j).chainFromExisting===sourceLiveIndex)return j;
  }
  return null;
 }
 function latestScheduledPrevious(batch:PlanningBatch|null|undefined){
  let best:PreviousMainBatch|null=null;let bestTs=-1;
  for(const prev of batch?.previous_main_batches||[]){
   if(prev.schedule_status!=="SCHEDULED"||!prev.resource_code||!prev.planned_end)continue;
   const ts=new Date(prev.planned_end).getTime();
   if(Number.isFinite(ts)&&ts>bestTs){best=prev;bestTs=ts;}
  }
  return best;
 }
 function draftChainVisual(a:ScheduleArea,i:number){
  const r=draft(a,i);
  if(r.chainFrom!=null)return {cls:chainPairClass(`draft:${r.chainFrom}`),label:`Dòng ${r.chainFrom+1}`,sourceDraft:r.chainFrom,sourceLive:null as number|null};
  if(r.chainFromExisting!=null){
   const src=liveRows[r.chainFromExisting];
   return {cls:chainPairClass(`schedule:${src?.id??r.chainFromExisting}`),label:src?`${src.resource_code} · ${src.batch_no}`:`Dòng đã lưu ${r.chainFromExisting+1}`,sourceDraft:null as number|null,sourceLive:r.chainFromExisting};
  }
  const batch=r.batchId?liveBatches.find(x=>x.id===r.batchId)||planningBatches.find(x=>x.id===r.batchId):null;
  const prev=latestScheduledPrevious(batch);
  if(prev?.batch_id){
   // Một Previous/Preclean Batch chỉ được tự nối cho MỘT draft. Draft đứng trước thắng.
   for(let j=0;j<i;j++){
    const jr=draft(a,j);
    if(jr.chainFrom!=null||jr.chainFromExisting!=null||!jr.batchId)continue;
    const jb=liveBatches.find(x=>x.id===jr.batchId)||planningBatches.find(x=>x.id===jr.batchId);
    if(latestScheduledPrevious(jb)?.batch_id===prev.batch_id)return null;
   }
   return {cls:chainPairClass(`batch:${prev.batch_id}`),label:`AUTO ${prev.resource_code} · ${prev.batch_no||"Previous"}`,sourceDraft:null as number|null,sourceLive:null as number|null};
  }
  return null;
 }
 function sourceDraftChainClass(a:ScheduleArea,i:number){
  const child=chainFromDraftUsed(a,i);
  return child==null?"":chainPairClass(`draft:${i}`);
 }
 function sourceActualChainClass(a:ScheduleArea,row:ScheduledRow){
  const liveIndex=liveRows.findIndex(x=>Number(x.id)===Number(row.id));
  if(liveIndex>=0&&chainFromExistingUsed(a,liveIndex)!=null)return chainPairClass(`schedule:${row.id}`);
  const cnt=rowCounts[a.schedule_area_code]||Math.max(1,Number(a.default_rows)||20);
  for(let j=0;j<cnt;j++){
   const r=draft(a,j);if(r.chainFrom!=null||r.chainFromExisting!=null||!r.batchId)continue;
   const b=liveBatches.find(x=>x.id===r.batchId)||planningBatches.find(x=>x.id===r.batchId);
   if(latestScheduledPrevious(b)?.batch_id===row.batch_id)return chainPairClass(`batch:${row.batch_id}`);
  }
  return "";
 }

 // v221.22: LƯU TẤT CẢ đề xuất 1 lần — lưu tuần tự, lô nguồn trước lô nối tiếp,
 // xóa các dòng đã lưu (index giảm dần) và refresh 1 lần; báo lỗi từng dòng.
 async function saveAll(a:ScheduleArea){
  const cnt=rowCounts[a.schedule_area_code]||Math.max(1,Number(a.default_rows)||20);
  const pending:number[]=[];
  for(let i=0;i<cnt;i++){
   const r=draft(a,i);
   if(r.recipeKey&&r.resourceCode&&r.date&&r.startTime&&parseHHMM(r.duration))pending.push(i);
  }
  if(!pending.length){setMessage(`${a.schedule_area_name}: không có dòng nào đủ thông tin để lưu (cần Recipe + FB + Date + Start + Duration).`);return;}
  // Sắp xếp: lô nguồn của liên kết lưu TRƯỚC lô nối tiếp.
  const order:number[]=[];
  while(pending.length){
   const before=pending.length;
   for(let k=0;k<pending.length;k++){
    const i=pending[k];const r=draft(a,i);
    if(r.chainFrom!=null&&pending.includes(r.chainFrom))continue; // chờ lô nguồn (cùng lượt) lưu trước
    order.push(i);pending.splice(k,1);k--;
   }
   if(pending.length===before){order.push(...pending);break;} // an toàn: tránh lặp vô hạn
  }
  if(!await confirmErp(`${a.schedule_area_name}: lưu TẤT CẢ ${order.length} dòng đề xuất? (mỗi dòng tạo 1 Batch + Schedule)`))return;
  setSaveAllBusy(a.schedule_area_code);setMessage(`${a.schedule_area_name}: đang lưu ${order.length} dòng…`);
  const okList:number[]=[];const failList:{i:number;msg:string}[]=[];
  try{
   for(const i of order){
    const r=draft(a,i);
    try{
     let effOp=r.standardOperation;
     if(!effOp&&r.recipeKey){
      const rc=recipes.find(x=>x.recipe_key===r.recipeKey);
      const defOp=rc&&rc.default_standard_operation?rc.default_standard_operation:"";
      if(defOp&&areaOps(a).some(o=>o.standard_operation===defOp))effOp=defOp;
     }
     if(!effOp)throw new Error("chưa xác định được Operation");
     const duration=parseHHMM(r.duration);
     if(!duration)throw new Error("Duration chưa hợp lệ");
     const plannedStart=absStart(r)!.toISOString();
     const existingBatch=Boolean(r.batchId);
     const endpoint=existingBatch?"/api/schedule":"/api/schedule/manual-grid";
     const overrides={
      process_start_override:r.overrides.processStart?new Date(`${timeDateOf(r,r.overrides.processStart)}T${r.overrides.processStart}:00+07:00`).toISOString():null,
      ndt_start_override:r.overrides.ndtStart?new Date(`${timeDateOf(r,r.overrides.ndtStart)}T${r.overrides.ndtStart}:00+07:00`).toISOString():null,
      unloading_start_override:r.overrides.unloadingStart?new Date(`${timeDateOf(r,r.overrides.unloadingStart)}T${r.overrides.unloadingStart}:00+07:00`).toISOString():null,
      loading_minutes_override:r.noLoading?0:null
     };
     const payload=existingBatch
      ?{batchId:r.batchId,resourceCode:r.resourceCode,plannedStart,durationMinutes:duration,planSource:"MANUAL_EXISTING_BATCH",...overrides}
      :{schedule_area_code:a.schedule_area_code,standard_operation:effOp,recipe_key:r.recipeKey||null,
        resource_code:r.resourceCode,planning_date:r.date,planned_start:plannedStart,duration_minutes:duration,plan_source:"MANUAL_GRID",...overrides};
     const res=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
     const dr=await safeJson(res);if(!res.ok)throw new Error(dr.error||"Save failed");
     if(existingBatch&&r.batchId){
      applyScheduledBatchImmediately(Number(r.batchId),dr.schedule);
     }
     okList.push(i);
    }catch(e){failList.push({i,msg:e instanceof Error?e.message:"Save failed"});}
   }
  }finally{
   [...okList].sort((x,y)=>y-x).forEach(i=>removeDraftRow(a,i));
   await refreshRows();
   setSaveAllBusy(null);
  }
  setMessage(`${a.schedule_area_name}: đã lưu ${okList.length}/${order.length} dòng.${
   failList.length?` Lỗi ${failList.length} dòng: ${failList.map(f=>`#${f.i+1} ${f.msg}`).join("; ")}. Sửa rồi bấm Save từng dòng.`:" Đã xóa khỏi danh sách nhập."}`);
 }

 function removeDraftRow(a:ScheduleArea,i:number){
  const oldCount=rowCounts[a.schedule_area_code]||Math.max(1,Number(a.default_rows)||20);
  setRowCounts(p=>({...p,[a.schedule_area_code]:Math.max(1,oldCount-1)}));
  const n={...draftsRef.current};
  delete n[key(a.schedule_area_code,i)];
  for(let j=i+1;j<oldCount;j++){
   const src=key(a.schedule_area_code,j),dst=key(a.schedule_area_code,j-1);
   if(n[src]!==undefined){
    const v={...n[src]};
    // dồn liên kết nối tiếp: nếu trỏ tới dòng đã xóa → xóa liên kết; nếu trỏ tới dòng sau → trừ 1
    if(v.chainFrom!=null){
     if(v.chainFrom===i)v.chainFrom=null;
     else if(v.chainFrom>i)v.chainFrom=v.chainFrom-1;
    }
    n[dst]=v;delete n[src];
   }
  }
  draftsRef.current=n;
  setDrafts(n);
 }

 // v232: khu gộp — area có resource_group nhưng KHÔNG resource_code (vd PAINTING) = khu chung chứa các lane con (cùng resource_group, có resource_code cụ thể)
 const hubByGroup=new Map<string,ScheduleArea>();
 for(const a of scheduleAreas){
  if(a.resource_group&&!a.resource_code&&!hubByGroup.has(a.resource_group))hubByGroup.set(a.resource_group,a);
 }
 const childrenByGroup=new Map<string,ScheduleArea[]>();
 for(const a of scheduleAreas){
  if(a.resource_group&&a.resource_code&&hubByGroup.has(a.resource_group)){
   const arr=childrenByGroup.get(a.resource_group)||[];arr.push(a);childrenByGroup.set(a.resource_group,arr);
  }
 }
 function poolOpsFor(hub:ScheduleArea,children:ScheduleArea[]){
  const set=new Set<string>();
  for(const area of [hub,...children])for(const op of (area.operations||[]))set.add(String(op.standard_operation||"").trim().toUpperCase());
  return set;
 }

 const workloadStatuses:ScheduleWorkloadStatus[]=["READY_PREV_SCHEDULED","READY_PREV_UNSCHEDULED","WAIT_NEXT_MAIN","WAIT_FUTURE_MAIN","HOLD"];
 const workloadLabel:Record<ScheduleWorkloadStatus,string>={
  READY_PREV_SCHEDULED:"READY · Previous Main Scheduled / Done",
  READY_PREV_UNSCHEDULED:"READY · Previous Main Not Yet Scheduled",
  WAIT_NEXT_MAIN:"WAIT · Next Main",
  WAIT_FUTURE_MAIN:"WAIT · Future Mains",
  PLANNED_UNSCHEDULED:"PLANNED-UNSCHEDULED",SCHEDULED:"SCHEDULED",HOLD:"HOLD"
 };
 function workloadMetric(metric:ScheduleWorkloadMetric|undefined,status:ScheduleWorkloadStatus,filter:Omit<WorkloadQuickViewFilter,"status"|"previousMain">){
  const m=metric||{jobs:0,qty:0,surface:0};
  const active=Number(m.jobs||0)>0;
  return <button type="button" disabled={!active} className={`schedule-area-workload-metric workload-card-button is-${status.toLowerCase().replace(/_/g,"-")}${active?" is-clickable":""}`}
   title={active?"Mở Planning Board Quick View theo đúng card này":"Không có Job"}
   onClick={()=>active&&openWorkloadQuickView({...filter,status,previousMain:""})}>
   <b>{fmt(m.surface)} dm²</b><span>{fmt(m.qty,0)} pcs · {fmt(m.jobs,0)} Job</span>
  </button>;
 }
 function workloadWaitNextBreakdown(groups:ScheduleWaitNextBreakdown[]|undefined,filter:Omit<WorkloadQuickViewFilter,"status"|"previousMain">){
  const list=(groups||[]).filter(x=>x&&x.metric&&Number(x.metric.jobs||0)>0);
  if(!list.length)return null;
  return <div className="schedule-area-wait-breakdown" aria-label="WAIT Next Main breakdown by nearest Previous Main">
   {list.map((x,index)=><button type="button" key={`${x.previousMain}-${index}`} title={`Mở ${x.previousMain} · ${fmt(x.metric.surface)} dm² · ${fmt(x.metric.qty,0)} pcs · ${fmt(x.metric.jobs,0)} Job`}
    onClick={(e)=>{e.stopPropagation();openWorkloadQuickView({...filter,status:"WAIT_NEXT_MAIN",previousMain:x.previousMain||"START"});}}>
    <b>← {x.previousMain||"START"}</b><em>{fmt(x.metric.jobs,0)} Job · {fmt(x.metric.qty,0)} pcs · {fmt(x.metric.surface)} dm²</em>
   </button>)}
  </div>;
 }


 function workloadReadyMainRecipeBreakdown(
  metric:ScheduleWorkloadMetric|undefined,
  status:"READY_PREV_SCHEDULED"|"READY_PREV_UNSCHEDULED",
  filter:Omit<WorkloadQuickViewFilter,"status"|"previousMain">
 ){
  const m=metric||{jobs:0,qty:0,surface:0};
  if(Number(m.jobs||0)<=0)return null;
  const unscheduled=status==="READY_PREV_UNSCHEDULED";
  const readyMain=filter.standardOperation||"—";
  const recipeLabel=filter.recipeNo||"—";
  const recipeName=filter.recipeName||"No Recipe";
  return <div className={`schedule-area-ready-breakdown${unscheduled?" is-unscheduled":""}`} aria-label={`${workloadLabel[status]} breakdown by READY Main Recipe`}>
   <button type="button" title={`Mở ${readyMain} · Recipe ${recipeLabel} · ${recipeName} · ${fmt(m.surface)} dm² · ${fmt(m.qty,0)} pcs · ${fmt(m.jobs,0)} Job`}
    onClick={(e)=>{e.stopPropagation();openWorkloadQuickView({...filter,status,previousMain:""});}}>
    <b>→ {readyMain} · {recipeLabel}</b><em>{fmt(m.jobs,0)} Job · {fmt(m.qty,0)} pcs · {fmt(m.surface)} dm²</em>
   </button>
  </div>;
 }
 function renderScheduleAreaWorkload(
  areaName:string,
  allowed:Set<string>,
  options?:{compactRecipesOnly?:boolean;showWaitNextBreakdown?:boolean}
 ){
  const compactRecipesOnly=Boolean(options?.compactRecipesOnly);
  const showWaitNextBreakdown=Boolean(options?.showWaitNextBreakdown);
  const rows=stWorkloadRows
   .filter(row=>allowed.has(String(row.standardOperation||"").trim().toUpperCase()))
   .sort((a,b)=>Number(a.mainOrder||999999)-Number(b.mainOrder||999999)||String(a.standardOperation).localeCompare(String(b.standardOperation)));
  const visibleGroups=compactRecipesOnly?rows.reduce((n,row)=>n+(row.recipes?.length||0),0):rows.length;
  const statusCell=(
   metric:ScheduleWorkloadMetric|undefined,
   status:ScheduleWorkloadStatus,
   filter:Omit<WorkloadQuickViewFilter,"status"|"previousMain">,
   options?:{waitNext?:ScheduleWaitNextBreakdown[];showReadyRecipeBreakdown?:boolean}
  )=>
   <>
    {workloadMetric(metric,status,filter)}
    {status==="WAIT_NEXT_MAIN"&&showWaitNextBreakdown&&workloadWaitNextBreakdown(options?.waitNext,filter)}
    {options?.showReadyRecipeBreakdown&&(status==="READY_PREV_SCHEDULED"||status==="READY_PREV_UNSCHEDULED")&&workloadReadyMainRecipeBreakdown(metric,status,filter)}
   </>;

  return <section className={`schedule-area-st-workload${compactRecipesOnly?" is-recipe-only":""}`}>
   <div className="schedule-area-st-workload-head">
    <div><b>ST Workload Summary · By Area</b><small>{areaName} · cùng canonical Dashboard ST workload, lọc theo Main Operation của khu vực điều độ{compactRecipesOnly?" · Flybar · Recipe rows only":""}</small></div>
    <span>{stWorkloadLoading?"Đang đọc…":`${visibleGroups} Workload Groups`}</span>
   </div>
   {stWorkloadError?<div className="schedule-area-st-workload-error">{stWorkloadError}</div>:
    <div className="table-wrap schedule-area-st-workload-wrap"><table className="erp-table schedule-area-st-workload-table">
     <thead><tr><th>Main Operation</th><th>Recipe No</th><th>Recipe Name</th>{workloadStatuses.map(status=><th key={status} className={`workload-head-${status.toLowerCase().replace(/_/g,"-")}`}>{workloadLabel[status]}</th>)}</tr></thead>
     <tbody>
      {rows.flatMap(row=>{
       const rowKey=`${areaName}-${row.standardOperation}`;
       const recipes=(row.recipes||[]).map((recipe,index)=><tr key={`${rowKey}-${recipe.recipeKey}-${index}`} className="schedule-area-st-workload-recipe">
        <td>{compactRecipesOnly?<b>{row.standardOperation}</b>:<span className="schedule-area-st-workload-indent">↳</span>}</td>
        <td><b className="mono">{recipe.recipeNo||"—"}</b></td>
        <td>{recipe.recipeName||"No Recipe"}</td>
        {workloadStatuses.map(status=><td key={status}>{statusCell(
         recipe[status],
         status,
         {areaName,standardOperation:row.standardOperation,recipeKey:recipe.recipeKey,recipeNo:recipe.recipeNo||"",recipeName:recipe.recipeName||""},
         {
          waitNext:recipe.waitNextBreakdown,
          showReadyRecipeBreakdown:true
         }
        )}</td>)}
       </tr>);
       if(compactRecipesOnly)return recipes;
       const main=<tr key={`${rowKey}-main`} className="schedule-area-st-workload-main">
        <td><b>{row.standardOperation}</b></td><td>—</td><td><b>MAIN TOTAL</b><small>{row.recipes?.length||0} Recipe groups</small></td>
        {workloadStatuses.map(status=><td key={status}>{statusCell(
         row[status],
         status,
         {areaName,standardOperation:row.standardOperation,recipeKey:"",recipeNo:"",recipeName:""},
         {waitNext:row.waitNextBreakdown,showReadyRecipeBreakdown:false}
        )}</td>)}
       </tr>;
       return [main,...recipes];
      })}
      {!rows.length&&!stWorkloadLoading&&<tr><td colSpan={3+workloadStatuses.length} className="muted">Khu vực này chưa có workload trong canonical Dashboard ST population.</td></tr>}
     </tbody>
    </table></div>}
  </section>;
 }

 function renderAreaBlock(a:ScheduleArea,poolAllowed?:Set<string>,showWorkload=true){
 const aOps=areaOps(a),aResources=areaResources(a),actual=scheduledFor(a),unscheduledArea=unscheduledFor(a,poolAllowed),count=rowCounts[a.schedule_area_code]||20;
 const chemical=a.resource_group==="CHEMICAL_LINE"||aResources.some(x=>x.resource_group==="CHEMICAL_LINE");
 const workloadOps=poolAllowed||new Set((a.operations||[]).map(x=>String(x.standard_operation||"").trim().toUpperCase()).filter(Boolean));
 const areaRecipes=areaRecipeOptions(a,poolAllowed);
 return <div className="schedule-area-grid-block" key={a.schedule_area_code}>
     <div className="schedule-area-grid-title">
      <div><b>{a.schedule_area_name}</b><small>{a.schedule_area_code} · {aOps.length?aOps.map(x=>x.standard_operation).join(" / "):"CHƯA MAP OPERATION"}</small></div>
      <div className="schedule-area-row-actions">
       <span>{actual.length} đã điều độ · {count} dòng nhập</span>
       {chemical&&<button type="button" className="btn primary" disabled={suggestBusy===a.schedule_area_code} onClick={()=>suggestAll(a)}>
        {suggestBusy===a.schedule_area_code?"Đang tính...":"Đề xuất"}
       </button>}
       {chemical&&<button type="button" className="btn" disabled={saveAllBusy===a.schedule_area_code} title="Lưu TẤT CẢ các dòng đề xuất cùng lúc (mỗi dòng tạo 1 Batch + Schedule). Lô nguồn lưu trước lô nối tiếp." onClick={()=>saveAll(a)}>
        {saveAllBusy===a.schedule_area_code?"Đang lưu...":"Lưu tất cả"}
       </button>}
       {chemical&&hasSuggestedRows(a)&&<button type="button" className="btn" title="Xóa hết giờ/FB đề xuất, quay lại như chưa đề xuất" onClick={async()=>{if(await confirmErp({title:"Xóa đề xuất",message:"Xóa hết giờ/FB đã đề xuất ở vùng này?",detail:"Recipe và liên kết nối tiếp được giữ nguyên.",tone:"warning",confirmLabel:"Xóa đề xuất"}))clearSuggestion(a);}}>↺ Xóa đề xuất</button>}

       <button
        type="button"
        className="btn small"
        disabled={rowBusy===a.schedule_area_code||count<=1}
        onClick={()=>removeRow(a)}
       >
        − Dòng
       </button>
       <button
        type="button"
        className="btn small primary"
        disabled={rowBusy===a.schedule_area_code||count>=200}
        onClick={()=>addRow(a)}
       >
        {rowBusy===a.schedule_area_code?"Saving...":"+ Row"}
       </button>
      </div>
     </div>

     {showWorkload&&renderScheduleAreaWorkload(a.schedule_area_name,workloadOps,{compactRecipesOnly:chemical,showWaitNextBreakdown:true})}

     {unscheduledArea.length>0&&
      <div className="schedule-area-unscheduled-strip">
       <div className="schedule-area-unscheduled-strip-head">
        <b>Unscheduled Batches</b>
        <span>{unscheduledArea.length} Batches</span>
       </div>
       <div className="schedule-area-unscheduled-cards">
        {unscheduledArea.map(b=>
         <button
          type="button"
          className="schedule-area-unscheduled-card"
          key={`area-unscheduled-${b.id}`}
          draggable
          onClick={()=>selectUnscheduledBatch(a,b)}
          onDragStart={(e)=>{e.dataTransfer.setData("text/plain",String(b.id));e.dataTransfer.effectAllowed="copy";}}
         >
          <div className="schedule-area-unscheduled-card-main">
           <strong>{b.batch_no}</strong>
           <span>
            {b.standard_operation}
            {b.recipe_no?` · ${b.recipe_no}`:""}
           </span>

           {b.recipe_name&&
            <small className="schedule-unscheduled-recipe-name">
             Recipe: {b.recipe_name}
            </small>}

           <small>
            {fmt(b.total_qty,0)} pcs · {fmt(b.total_surface_dm2)} dm²
            {Number(b.total_jobs||0)===0?" · EMPTY":""}
           </small>
          </div>

          <div className="schedule-previous-main-list">
           <b>Previous Main</b>

           {(b.previous_main_batches||[]).map((prev,index)=>
            <div
             className={`schedule-previous-main-row ${
              prev.schedule_status==="SCHEDULED"
               ?"is-scheduled"
               :prev.schedule_status==="DONE"
                ?"is-done"
                :prev.schedule_status==="UNSCHEDULED"
                 ?"is-unscheduled"
                 :"is-not-planned"
             }`}
             key={`${b.id}-prev-${prev.batch_id||"none"}-${prev.operation||"op"}-${index}`}
            >
             <div className="schedule-previous-main-top">
              <strong>{prev.schedule_status==="DONE"?"DONE":(prev.batch_no||"NO BATCH")}</strong>
              <span>{prev.operation||"—"}</span>
              <em>{prev.schedule_status||"UNSCHEDULED"}</em>
             </div>

             {prev.schedule_status==="SCHEDULED"
              ? <small>
                 {prev.resource_code&&<>Resource: {prev.resource_code} · </>}
                 Complete: {dateTime(prev.planned_end)}
                </small>
              :prev.schedule_status==="DONE"
               ? <small>Previous Main đã DONE theo tiến độ Job · không yêu cầu Batch/Schedule lịch sử</small>
               :prev.schedule_status==="UNSCHEDULED"
                ? <small>Previous Main có Batch nhưng chưa điều độ</small>
                : <small>Previous Main chưa DONE và chưa có Batch</small>}
            </div>
           )}

           {(!b.previous_main_batches||!b.previous_main_batches.length)&&
            <div className="schedule-previous-main-row no-previous">
             <small>Không có Previous Main Operation</small>
            </div>}
          </div>
         </button>
        )}
       </div>
      </div>}

     {!aOps.length&&<div className="schedule-area-unmapped">Khu vực chưa có Standard Operation. Vào Cấu hình → Schedule Area Mapping để thêm.</div>}
     <div className="table-wrap">
      <table className="erp-table schedule-area-entry-table">
       {chemical
        ? <colgroup>
           <col style={{width:"3%"}}/><col style={{width:"10%"}}/><col style={{width:"15%"}}/><col style={{width:"6.5%"}}/>
           <col style={{width:"5%"}}/><col style={{width:"5%"}}/>
           <col style={{width:"5%"}}/><col style={{width:"5%"}}/><col style={{width:"6.5%"}}/>
           <col style={{width:"5%"}}/><col style={{width:"5%"}}/>
           <col style={{width:"5%"}}/><col style={{width:"5%"}}/>
           <col style={{width:"6.5%"}}/><col style={{width:"12.5%"}}/>
          </colgroup>
        : <colgroup>
           <col style={{width:"3%"}}/><col style={{width:"10%"}}/><col style={{width:"14%"}}/><col style={{width:"7%"}}/>
           <col style={{width:"8%"}}/><col style={{width:"7%"}}/><col style={{width:"7%"}}/><col style={{width:"8%"}}/>
           <col style={{width:"6%"}}/><col style={{width:"7%"}}/><col style={{width:"7%"}}/><col style={{width:"16%"}}/>
          </colgroup>}
       <thead>
       {chemical ? (
        <>
         <tr>
          <th rowSpan={2}>#</th><th rowSpan={2}>Lô</th><th rowSpan={2}>Recipe</th><th rowSpan={2}>FB</th>
          <th colSpan={2} className="schedule-time-group ph-loading">LOADING</th>
          <th colSpan={3} className="schedule-time-group ph-process">PROCESS TIME</th>
          <th colSpan={2} className="schedule-time-group ph-ndt">NDT</th>
          <th colSpan={2} className="schedule-time-group ph-unloading">UNLOADING</th>
          <th rowSpan={2} className="num">KL</th><th rowSpan={2}>Tác vụ</th>
         </tr>
         <tr>
          <th className="time-sub ph-loading">Start</th><th className="time-sub ph-loading">End</th>
          <th className="time-sub ph-process">Start</th><th className="time-sub ph-process">End</th><th className="time-sub ph-process">Duration</th>
          <th className="time-sub ph-ndt">Start</th><th className="time-sub ph-ndt">End</th>
          <th className="time-sub ph-unloading">Start</th><th className="time-sub ph-unloading">End</th>
         </tr>
        </>
       ) : (
        <tr>
         <th>#</th><th>Batch</th><th>Recipe / Paint</th><th>Resource</th><th>Date</th><th>Start</th><th>End</th><th>Duration</th><th>Jobs</th><th>pcs</th><th>dm²</th><th>Actions</th>
        </tr>
       )}
       </thead>
       <tbody>
        {actual.map((x,i)=>{
         const editing=editingScheduleId===x.id;
         const editResources=areaResources(a);

         return <Fragment key={`actual-${x.id}`}>
         <tr
          className={`schedule-area-existing ${editing?"is-editing":""}${x.resource_code?` fb-row ${fbClass(x.resource_code)}`:" schema-drop-target-hint"} ${chemical?sourceActualChainClass(a,x):""}`}
          onDragOver={(e)=>{const raw=String(e.dataTransfer.getData("text/plain")||"");if(raw.startsWith("row:")){e.preventDefault();}}}
          onDrop={(e)=>{
           const raw=String(e.dataTransfer.getData("text/plain")||"");
           if(!raw.startsWith("row:"))return;
           e.preventDefault();
           // Kéo dòng MỚI (child) lên dòng ĐÃ LƯU (parent) → tạo liên kết nối tiếp
           const childDraft=Number(raw.slice(4));
           if(Number.isFinite(childDraft)&&childDraft>=0&&childDraft<Number(rowCounts[a.schedule_area_code]||0)){
            const sourceLiveIndex=liveRows.findIndex(row=>Number(row.id)===Number(x.id));
            if(sourceLiveIndex<0){setMessage("Không xác định được lô nguồn đã lưu.");return;}
            const usedBy=chainFromExistingUsed(a,sourceLiveIndex,childDraft);
            if(usedBy!=null){setMessage(`${x.resource_code} / ${x.batch_no} đã liên kết với Dòng ${usedBy+1}. Một FB Precleaning chỉ được liên kết với 1 FB nối tiếp.`);return;}
            patch(a,childDraft,{chainFrom:null,chainFromExisting:sourceLiveIndex});
            setMessage(`Đã liên kết 1-1: ${x.resource_code} / ${x.batch_no} → Dòng ${childDraft+1}. Hai dòng dùng cùng màu liên kết; một FB Precleaning không thể nối thêm dòng thứ hai.`);
           }
          }}
         >
          <td>
           {i+1}

          </td>
          <td><b>{x.batch_no}</b></td>

          <td>
           {editing
            ? <select
               className="input"
               value={editDraft.recipeKey}
               onChange={e=>setEditDraft(v=>({...v,recipeKey:e.target.value}))}
              >
               <option value="">No Recipe / Set later</option>
               {areaRecipeOptions(a,poolAllowed,x.recipe_key||"").map(recipe=>
                <option key={recipe.recipe_key} value={recipe.recipe_key}>
                 {recipe.recipe_no||recipe.recipe_key} · {recipe.recipe_name||"—"}
                </option>
               )}
              </select>
            : x.recipe_no
             ? <span className="recipe-cell"><b>{x.recipe_no}</b>{x.recipe_name?<span className="recipe-cell-name"> · {x.recipe_name}</span>:null}</span>
             : (x.recipe_name||"—")}
          </td>

          <td className={x.resource_code&&!editing?`fb-cell ${fbClass(x.resource_code)}`:""}>
           {editing
            ? <select
               className="input"
               value={editDraft.resourceCode}
               onChange={e=>setEditDraft(v=>({...v,resourceCode:e.target.value}))}
              >
               <option value="">Resource...</option>
               {editResources.map(r=>
                <option key={r.resource_code} value={r.resource_code}>
                 {r.resource_code}
                </option>
               )}
              </select>
            : <b>{x.resource_code}</b>}
          </td>

          {!chemical&&<td>
           {editing
            ? <input
               className="input"
               type="date"
               value={editDraft.date}
               onChange={e=>setEditDraft(v=>({...v,date:e.target.value}))}
              />
            : new Date(x.planned_start).toLocaleDateString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}
          </td>}

          <td className={`mono${chemical?" ph-loading":""}`}>
           {editing
            ? <input
               className="input mono"
               type="text"
               inputMode="numeric"
               autoComplete="off"
               placeholder="HH:MM"
               maxLength={5}
               value={editDraft.startTime}
               onChange={e=>setEditDraft(v=>({...v,startTime:e.target.value}))}
              />
            : time(x.planned_start)}
          </td>

          {chemical&&<td className="mono ph-loading">
           {Number(x.loading_duration_minutes||0)===0
            ? <span className="chain-mark" title="Nối tiếp — không Loading">↳</span>
            : (x.loading_end?time(x.loading_end):"—")}
          </td>}

          {chemical&&<td className="mono ph-process">{x.process_start?time(x.process_start):"—"}{x.process_start&&dayDot(new Date(x.process_start),date)}</td>}
          {chemical&&<td className="mono ph-process">{x.process_end?time(x.process_end):"—"}{x.process_end&&dayDot(new Date(x.process_end),date)}</td>}

          {!chemical&&<td className="mono schedule-calculated-end">
           {editing
            ? previewEnd(editDraft.date,editDraft.startTime,editDraft.duration)
            : calculatedScheduleEndTime(x.planned_start,x.duration_minutes)}
          </td>}

          <td className={`mono${chemical?" ph-process":""}`}>
           {editing
            ? <input
               className="input mono"
               value={editDraft.duration}
               placeholder="HH:MM"
               onChange={e=>setEditDraft(v=>({...v,duration:e.target.value}))}
              />
            : <>
               {String(Math.floor(Number(x.process_duration_minutes||x.duration_minutes||0)/60)).padStart(2,"0")}
               :
               {String(Number(x.process_duration_minutes||x.duration_minutes||0)%60).padStart(2,"0")}
              </>}
          </td>

          {chemical&&<td className="mono ph-ndt">{x.ndt_start?time(x.ndt_start):"—"}{x.ndt_start&&dayDot(new Date(x.ndt_start),date)}</td>}
          {chemical&&<td className="mono ph-ndt">{x.ndt_end?time(x.ndt_end):"—"}{x.ndt_end&&dayDot(new Date(x.ndt_end),date)}</td>}
          {chemical&&<td className="mono ph-unloading">{x.unloading_start?time(x.unloading_start):"—"}{x.unloading_start&&dayDot(new Date(x.unloading_start),date)}</td>}
          {chemical&&<td className="mono ph-unloading">{x.unloading_end?time(x.unloading_end):"—"}{x.unloading_end&&dayDot(new Date(x.unloading_end),date)}</td>}

          {chemical
           ? <td className="num kl-cell">{kl(x.total_qty,x.total_surface_dm2)}</td>
           : <>
              <td>{x.total_jobs}</td>
              <td>{fmt(x.total_qty,0)}</td>
              <td>{fmt(x.total_surface_dm2)}</td>
             </>}

          <td>
           <div className="schedule-batch-control-actions">
            {editing
             ? <>
                <button
                 type="button"
                 className="btn small primary"
                 disabled={actionBusy===`edit-${x.id}`}
                 onClick={()=>saveEdit(x)}
                >
                 {actionBusy===`edit-${x.id}`?"Saving...":"Save Edit"}
                </button>
                <button
                 type="button"
                 className="btn small"
                 disabled={Boolean(actionBusy)}
                 onClick={()=>setEditingScheduleId(null)}
                >
                 Cancel
                </button>
               </>
             : <>
                <button
                 type="button"
                 className="btn small schedule-order-btn"
                 title="Đưa lô lên"
                 disabled={i===0||Boolean(actionBusy)}
                 onClick={()=>moveBatch(actual,i,-1)}
                >
                 ↑
                </button>
                <button
                 type="button"
                 className="btn small schedule-order-btn"
                 title="Đưa lô xuống"
                 disabled={i===actual.length-1||Boolean(actionBusy)}
                 onClick={()=>moveBatch(actual,i,1)}
                >
                 ↓
                </button>
                <button
                 type="button"
                 className="btn small"
                 disabled={Boolean(actionBusy)}
                 onClick={()=>beginEdit(x)}
                >
                 Edit
                </button>
                <button
                 type="button"
                 className="btn small"
                 disabled={actionBusy===`unschedule-${x.id}`}
                 title="Chỉ bỏ Schedule; giữ nguyên Batch và trả Batch về Unscheduled Batches"
                 onClick={()=>unscheduleBatch(x)}
                >
                 {actionBusy===`unschedule-${x.id}`?"Đang bỏ...":"Bỏ điều độ"}
                </button>
                <button
                 type="button"
                 className="btn small danger-btn"
                 disabled={actionBusy===`delete-${x.batch_id}`}
                 title="Xóa hẳn Batch khỏi Planning"
                 onClick={()=>deleteBatch(x)}
                >
                 {actionBusy===`delete-${x.batch_id}`?"Deleting...":"Delete Batch"}
                </button>
                <a
                 className="btn small"
                 href={`/planning/batches/${x.batch_id}?returnTo=schedule&date=${encodeURIComponent(date)}`}
                >
                 Fill / Jobs
                </a>
               </>}
           </div>
          </td>
         </tr>
        </Fragment>
        })}
        {Array.from({length:count},(_,i)=>{const r=draft(a,i),k=key(a.schedule_area_code,i);const w=chemical?phaseWindow(a,i):null;const preclean=isPrecleanRecipe(recipes.find(x=>x.recipe_key===r.recipeKey)?.recipe_no);const currentRecipe=r.recipeKey&&!areaRecipes.some(x=>x.recipe_key===r.recipeKey)?recipes.find(x=>x.recipe_key===r.recipeKey):null;const rowRecipes=currentRecipe?[currentRecipe,...areaRecipes]:areaRecipes;const chainVisual=chemical?draftChainVisual(a,i):null;const sourceChainClass=chemical?sourceDraftChainClass(a,i):"";return <Fragment key={k}>
         <tr
          draggable
          className={`schedule-area-empty-row${dropTarget===k?" drop-target":""}${r.keep?" keep-row":""}${r.resourceCode?` fb-row ${fbClass(r.resourceCode)}`:""} ${chainVisual?.cls||sourceChainClass}`}
          onDragStart={(e)=>{e.dataTransfer.setData("text/plain",`row:${i}`);e.dataTransfer.effectAllowed="link";}}
          onDragOver={(e)=>{e.preventDefault();if(!r.batchId)setDropTarget(k);}}
          onDragLeave={()=>{if(dropTarget===k)setDropTarget(null);}}
          onDrop={(e)=>{
           e.preventDefault();setDropTarget(null);
           const raw=String(e.dataTransfer.getData("text/plain")||"");
           // Kéo dòng → dòng: tự tạo liên kết nối tiếp (dòng SAU nối tiếp dòng TRƯỚC)
           if(raw.startsWith("row:")){
            const src=Number(raw.slice(4));
            if(src===i){setMessage("Không liên kết với chính dòng đó.");return;}
            const srcIdx=Math.min(src,i),dstIdx=Math.max(src,i);
            const usedBy=chainFromDraftUsed(a,srcIdx,dstIdx);
            if(usedBy!=null){setMessage(`Dòng ${srcIdx+1} đã liên kết với Dòng ${usedBy+1}. Một FB Precleaning chỉ được liên kết với 1 FB nối tiếp.`);return;}
            patch(a,dstIdx,{chainFrom:srcIdx,chainFromExisting:null});
            setMessage(`Đã liên kết 1-1: Dòng ${srcIdx+1} → Dòng ${dstIdx+1}. Hai dòng dùng cùng màu để dễ nhận biết cặp FB.`);
            return;
           }
           const id=Number(raw);
           const b=liveBatches.find(x=>x.id===id);
           if(!b){setMessage("Không tìm thấy lô.");return;}
           if(r.batchId){setMessage(`Dòng ${i+1} đã có ${r.batchNo}. Chọn dòng trống.`);return;}
           const rowOp=(r.standardOperation||"").toUpperCase();
           const batchOp=String(b.standard_operation||"").toUpperCase();
           if(rowOp&&rowOp!==batchOp){setMessage(`${b.batch_no} thuộc Operation ${b.standard_operation} — không khớp dòng ${i+1} (${r.standardOperation}).`);return;}
           fillBatchRow(a,i,b);
          }}
         >
         <td>
          {actual.length+i+1}
          {chainVisual&&<span className={`row-chain-badge ${chainVisual.cls}`} title={`Liên kết 1-1: ${chainVisual.label}${(r.chainFrom!=null||r.chainFromExisting!=null)?" · Bấm X để xóa liên kết thủ công.":""}`} onClick={()=>{if(r.chainFrom!=null||r.chainFromExisting!=null)patch(a,i,{chainFrom:null,chainFromExisting:null});}}>×</span>}

         </td><td>{r.batchId?<b>{r.batchNo}</b>:<span className="muted">MỚI</span>}</td>
         <td>
          <select className="input" disabled={Boolean(r.batchId&&r.recipeKey)} value={r.recipeKey} onChange={e=>{
           const rc=recipes.find(x=>x.recipe_key===e.target.value);
           const defOp=rc&&rc.default_standard_operation?rc.default_standard_operation:"";
           // Dòng đã điền Recipe → TỰ ĐỘNG giữ (không bị Xóa đề xuất / không mất khi thêm dòng mới)
           patch(a,i,{
            recipeKey:e.target.value,
            keep:Boolean(e.target.value),
            ...(!r.standardOperation&&defOp&&aOps.some(o=>o.standard_operation===defOp)?{standardOperation:defOp}:{})
           });
          }}>
           <option value="">Set later</option>{rowRecipes.map(x=><option key={x.recipe_key} value={x.recipe_key}>{x.recipe_no||x.recipe_key} · {x.recipe_name||"—"}</option>)}
          </select>
          {Boolean(r.recipeKey)&&!r.standardOperation&&(
           <select className="input op-fallback-select" value={r.standardOperation} onChange={e=>patch(a,i,{standardOperation:e.target.value})}>
            <option value="">Operation...</option>{aOps.map(o=><option key={o.standard_operation}>{o.standard_operation}</option>)}
           </select>
          )}
         </td>
         <td className={r.resourceCode?`fb-cell ${fbClass(r.resourceCode)}`:""}><select className="input" value={r.resourceCode} onChange={e=>patch(a,i,{resourceCode:e.target.value})}>
          <option value="">Resource...</option>{aResources.map(x=><option key={x.resource_code} value={x.resource_code}>{x.resource_code}</option>)}
         </select></td>
         {!chemical&&<td><input className="input" type="date" value={r.date} onChange={e=>patch(a,i,{date:e.target.value})}/></td>}
         <td className={chemical?"ph-loading":""}><input className="input mono" type="text" inputMode="numeric" autoComplete="off" placeholder="HH:MM" maxLength={5} value={r.startTime} onChange={e=>patch(a,i,{startTime:e.target.value})}/></td>
         {chemical&&<td className="mono ph-loading">{w?(w.loadingMinutes===0?<span className="chain-mark" title="Nối tiếp — không Loading">↳</span>:time(w.loadingEnd)):"—"}{w&&w.loadingMinutes>0&&dayDot(w.loadingEnd,date)}</td>}
         {chemical&&<td className="ph-process"><input className="input mono" type="text" inputMode="numeric" autoComplete="off" placeholder="HH:MM" maxLength={5} title="Chỉnh Process Start (giờ 24h)" disabled={!w} value={r.overrides.processStart||(w?toTimeInput(w.processStart):"")} onChange={e=>patch(a,i,{overrides:{...r.overrides,processStart:e.target.value}})}/>{dayDot(w?.processStart,date)}</td>}
         {chemical&&<td className="mono ph-process">{w?time(w.processEnd):"—"}{dayDot(w?.processEnd,date)}</td>}
         {!chemical&&<td className="mono schedule-calculated-end">{previewEnd(r.date,r.startTime,r.duration)}</td>}
         <td className={chemical?"ph-process":""}><input className="input mono" placeholder="HH:MM" value={r.duration} onChange={e=>patch(a,i,{duration:e.target.value})}/></td>
         {chemical&&<td className={preclean?"ph-ndt":"mono ph-ndt"}>{(preclean&&w)?<input className="input mono" type="text" inputMode="numeric" autoComplete="off" placeholder="HH:MM" maxLength={5} title="Chỉnh NDT Start (giờ 24h)" value={r.overrides.ndtStart||(w.ndtStart?toTimeInput(w.ndtStart):"")} onChange={e=>patch(a,i,{overrides:{...r.overrides,ndtStart:e.target.value}})}/>:"—"}{preclean&&dayDot(w?.ndtStart,date)}</td>}
         {chemical&&<td className="mono ph-ndt">{w?.ndtEnd?time(w.ndtEnd):"—"}{dayDot(w?.ndtEnd,date)}</td>}
         {chemical&&<td className="ph-unloading"><input className="input mono" type="text" inputMode="numeric" autoComplete="off" placeholder="HH:MM" maxLength={5} title="Chỉnh Unloading Start (giờ 24h)" disabled={!w} value={r.overrides.unloadingStart||(w?toTimeInput(w.unloadingStart):"")} onChange={e=>patch(a,i,{overrides:{...r.overrides,unloadingStart:e.target.value}})}/>{dayDot(w?.unloadingStart,date)}</td>}
         {chemical&&<td className="mono ph-unloading">{w?time(w.unloadingEnd):"—"}{dayDot(w?.unloadingEnd,date)}</td>}

         {chemical
          ? <td className="num kl-cell">{r.batchId?kl(r.totalQty,r.totalSurfaceDm2):"—"}</td>
          : <><td>{r.batchId?r.totalJobs:0}</td><td>{r.batchId?fmt(r.totalQty,0):0}</td><td>{r.batchId?fmt(r.totalSurfaceDm2):0}</td></>}
         <td><div className="schedule-row-actions">
          <button type="button" className={`btn small keep-btn${r.keep?" on":""}`} title={r.keep?"Bỏ giữ dòng này":"Giữ dòng này (không bị Xóa đề xuất, có màu theo dõi)"} onClick={()=>patch(a,i,{keep:!r.keep})}>{r.keep?"Đang giữ":"Giữ"}</button>
          <button className="btn small primary" disabled={busy===k||!aOps.length} onClick={()=>save(a,i)}>{busy===k?"...":r.batchId?"Schedule":"Save"}</button>
          {r.batchId&&<button className="btn small" type="button" onClick={()=>clearDraft(a,i)}>Xóa nhập</button>}
         </div></td>
        </tr>

        </Fragment>
        })}
       </tbody>
      </table>
     </div>
     {chemical&&(
      <div className="chemical-legend">
       <span><i className="sw-l"></i>Loading</span>
       <span><i className="sw-p"></i>Process</span>
       <span><i className="sw-n"></i>NDT</span>
       <span><i className="sw-u"></i>Unloading</span>
      </div>
     )}
    </div>
   }

 function renderWorkloadQuickView(){
  if(!workloadQuickView)return null;
  const canPlan=quickViewCanPlan();
  const normalizedFilters=(Object.entries(workloadQuickFilters) as [WorkloadQuickFilterKey,string][]) .filter(([,value])=>String(value||"").trim());
  const visibleRows=workloadQuickRows.filter(row=>normalizedFilters.every(([key,value])=>
   workloadQuickFilterText(row,key).toLocaleLowerCase().includes(String(value).trim().toLocaleLowerCase())
  ));
  const selectedRows=workloadQuickRows.filter(x=>workloadQuickSelected.has(x.planningJobOperationId));
  const selectedQty=selectedRows.reduce((sum,x)=>sum+Number(x.qty||0),0);
  const selectedSurface=selectedRows.reduce((sum,x)=>sum+Number(x.surface||0),0);
  const selectedRecipe=selectedRows.length?(selectedRows[0].recipeKey||""):"";
  const targetBatches=workloadQuickBatches.filter(b=>!selectedRecipe||(b.recipeKey||"")===selectedRecipe);
  const visibleRecipeGroups=[...new Set(visibleRows.map(x=>x.recipeKey||"__NO_RECIPE__"))];
  const selectedRecipeGroups=[...new Set(selectedRows.map(x=>x.recipeKey||"__NO_RECIPE__"))];
  const allSelectable=canPlan&&visibleRows.length>0&&visibleRecipeGroups.length<=1&&(!selectedRecipeGroups.length||selectedRecipeGroups[0]===visibleRecipeGroups[0]);
  const allSelected=allSelectable&&visibleRows.every(x=>workloadQuickSelected.has(x.planningJobOperationId));
  const titleRecipe=workloadQuickView.recipeNo||workloadQuickView.recipeName
   ?` · ${workloadQuickView.recipeNo||"—"}${workloadQuickView.recipeName?` · ${workloadQuickView.recipeName}`:""}`:"";
  const activeFilterCount=normalizedFilters.length;
  const setQuickFilter=(key:WorkloadQuickFilterKey,value:string)=>setWorkloadQuickFilters(prev=>({...prev,[key]:value}));
  const quickFilterHeader=(label:string,key:WorkloadQuickFilterKey)=>{
   const value=String(workloadQuickFilters[key]||"");
   const open=workloadQuickFilterOpen===key;
   return <div className={`schedule-workload-quick-filter-head${value?" has-filter":""}`}>
    <div className="schedule-workload-quick-filter-label"><span>{label}</span><button type="button" className="schedule-workload-quick-filter-btn" title={`Filter ${label}`} aria-label={`Filter ${label}`} aria-expanded={open} onClick={()=>setWorkloadQuickFilterOpen(open?null:key)}>⌕</button></div>
    {open&&<div className="schedule-workload-quick-filter-input">
     <input className="input" autoFocus value={value} placeholder="Filter..." onChange={e=>setQuickFilter(key,e.target.value)} onKeyDown={e=>{if(e.key==="Escape")setWorkloadQuickFilterOpen(null);}}/>
     {value&&<button type="button" className="btn small" title={`Clear ${label} filter`} aria-label={`Clear ${label} filter`} onClick={()=>setQuickFilter(key,"")}>×</button>}
    </div>}
   </div>;
  };
  return <div className="schedule-workload-quick-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)closeWorkloadQuickView();}}>
   <section className="schedule-workload-quick-modal" role="dialog" aria-modal="true" aria-label="Planning Board Quick View">
    <div className="schedule-workload-quick-head">
     <div>
      <div className="erp-object-eyebrow">PLANNING BOARD QUICK VIEW</div>
      <b>{workloadQuickView.areaName} · {workloadQuickView.standardOperation}{titleRecipe}</b>
      <small>{workloadLabel[workloadQuickView.status]}{workloadQuickView.previousMain?` · Previous Main ${workloadQuickView.previousMain}`:""}</small>
     </div>
     <button type="button" className="btn small" disabled={workloadQuickBusy} onClick={closeWorkloadQuickView}>✕</button>
    </div>
    {workloadQuickError&&<div className="notice danger">{workloadQuickError}</div>}
    {!canPlan&&<div className="notice warning">
     {workloadQuickView.status==="HOLD"
      ?"HOLD: xem danh sách được nhưng phải bỏ HOLD trước khi thêm Job vào Batch."
      :"WAIT: xem danh sách được nhưng chưa được tạo/thêm Batch. Previous Main phải có Plan/Batch để mở đúng Next Main READY."}
    </div>}
    <div className="schedule-workload-quick-summary">
     <span><b>{fmt(visibleRows.length,0)}</b>{activeFilterCount?` / ${fmt(workloadQuickRows.length,0)}`:""} Job in card</span>
     <span><b>{fmt(selectedRows.length,0)}</b> Selected</span>
     <span><b>{fmt(selectedQty,0)}</b> pcs</span>
     <span><b>{fmt(selectedSurface)}</b> dm²</span>
     {activeFilterCount>0&&<button type="button" className="btn small" onClick={()=>{setWorkloadQuickFilters({});setWorkloadQuickFilterOpen(null);}}>Clear filters</button>}
    </div>
    <div className="table-wrap schedule-workload-quick-table-wrap">
     <table className="erp-table schedule-workload-quick-table">
      <thead><tr>
       <th className="quick-pick">{canPlan?<input type="checkbox" aria-label="Chọn tất cả" title={visibleRecipeGroups.length>1?"Card đang lọc có nhiều Recipe: chọn Job cùng Recipe thủ công.":"Chọn tất cả Job đang hiển thị"} disabled={!allSelectable} checked={allSelected} onChange={()=>{
        setWorkloadQuickSelected(prev=>{
         const next=new Set(prev);
         if(allSelected){visibleRows.forEach(x=>next.delete(x.planningJobOperationId));return next;}
         visibleRows.forEach(x=>next.add(x.planningJobOperationId));
         return next;
        });
       }}/>:null}</th>
       <th>{quickFilterHeader("Job","job")}</th><th>{quickFilterHeader("Part / Rev","partRev")}</th><th>{quickFilterHeader("Description","description")}</th><th>{quickFilterHeader("Qty","qty")}</th><th>{quickFilterHeader("dm²","surface")}</th><th>{quickFilterHeader("Priority","priority")}</th><th>{quickFilterHeader("Previous Main","previousMain")}</th><th>{quickFilterHeader("Main","main")}</th><th>{quickFilterHeader("Recipe No","recipeNo")}</th><th>{quickFilterHeader("Recipe Name","recipeName")}</th><th>{quickFilterHeader("Next Main","nextMain")}</th><th>{quickFilterHeader("Next Recipe No","nextRecipeNo")}</th><th>{quickFilterHeader("Next Recipe Name","nextRecipeName")}</th><th>{quickFilterHeader("Batch","batch")}</th>
      </tr></thead>
      <tbody>
       {visibleRows.map(row=><tr key={row.planningJobOperationId}>
        <td className="quick-pick">{canPlan?<input type="checkbox" aria-label={`Chọn ${row.jobNum}`} checked={workloadQuickSelected.has(row.planningJobOperationId)} onChange={()=>toggleWorkloadQuickRow(row)}/>:null}</td>
        <td><b>{row.jobNum}</b></td>
        <td>{row.partNum||"—"}{row.revisionNum?` / ${row.revisionNum}`:""}</td>
        <td>{row.partDescription||"—"}</td>
        <td className="num">{fmt(row.qty,0)}</td><td className="num">{fmt(row.surface)}</td>
        <td>{row.priority||"—"}</td><td>{row.previousMain||"START"}</td><td><b>{row.standardOperation}</b></td>
        <td className="mono">{row.recipeNo||"—"}</td><td>{row.recipeName||"No Recipe"}</td>
        <td><b>{row.nextMain||"—"}</b></td><td className="mono">{row.nextRecipeNo||"—"}</td><td>{row.nextRecipeName||"—"}</td>
        <td>{row.currentBatchNo||"—"}</td>
       </tr>)}
       {!visibleRows.length&&!workloadQuickLoading&&<tr><td colSpan={15} className="muted">{workloadQuickRows.length&&activeFilterCount?"No Job matches the active column filters.":"Không còn Job phù hợp với card này."}</td></tr>}
       {workloadQuickLoading&&<tr><td colSpan={15} className="muted">Đang tải danh sách Planning Board…</td></tr>}
      </tbody>
     </table>
    </div>
    <div className="schedule-workload-quick-actions">
     {canPlan?<>
      <div className="schedule-workload-quick-target">
       <label>Existing Batch
        <select className="input" value={workloadQuickTargetBatch} onChange={e=>setWorkloadQuickTargetBatch(e.target.value)}>
         <option value="">Select Batch...</option>
         {targetBatches.map(b=><option key={b.id} value={b.id}>{b.batchNo} · {b.recipeNo||"No Recipe"} · {fmt(b.totalJobs,0)} Job · {fmt(b.totalQty,0)} pcs{b.scheduled?` · Scheduled ${b.resourceCode||""}`:""}</option>)}
        </select>
       </label>
       <button type="button" className="btn" disabled={workloadQuickBusy||!workloadQuickSelected.size||!workloadQuickTargetBatch} onClick={()=>void saveWorkloadQuickSelection("EXISTING")}>{workloadQuickBusy?"Saving...":"Add to Batch"}</button>
      </div>
      <button type="button" className="btn primary" disabled={workloadQuickBusy||!workloadQuickSelected.size} onClick={()=>void saveWorkloadQuickSelection("CREATE")}>{workloadQuickBusy?"Saving...":"Create New Batch"}</button>
     </>:<button type="button" className="btn" onClick={closeWorkloadQuickView}>Close</button>}
    </div>
   </section>
  </div>;
 }

 const workloadMainOrderByOperation=new Map<string,number>(
  stWorkloadRows.map(row=>[String(row.standardOperation||"").trim().toUpperCase(),Number(row.mainOrder||999999)] as [string,number])
 );
 const workloadAreaOrderByOperation=new Map<string,number>(
  stWorkloadRows.map(row=>[String(row.standardOperation||"").trim().toUpperCase(),Number(row.areaSort||999999)] as [string,number])
 );
 const scheduleAreaAreaOrder=(area:ScheduleArea)=>{
  const own:number[]=(area.operations||[]).map(x=>workloadAreaOrderByOperation.get(String(x.standard_operation||"").trim().toUpperCase())??999999);
  const children=area.resource_group&&!area.resource_code?(childrenByGroup.get(area.resource_group)||[]):[];
  const childOrders:number[]=children.flatMap(ch=>(ch.operations||[]).map(x=>workloadAreaOrderByOperation.get(String(x.standard_operation||"").trim().toUpperCase())??999999));
  return Math.min(...own,...childOrders,999999);
 };
 const scheduleAreaMainOrder=(area:ScheduleArea)=>{
  const own:number[]=(area.operations||[]).map(x=>workloadMainOrderByOperation.get(String(x.standard_operation||"").trim().toUpperCase())??999999);
  const children=area.resource_group&&!area.resource_code?(childrenByGroup.get(area.resource_group)||[]):[];
  const childOrders:number[]=children.flatMap(ch=>(ch.operations||[]).map(x=>workloadMainOrderByOperation.get(String(x.standard_operation||"").trim().toUpperCase())??999999));
  return Math.min(...own,...childOrders,999999);
 };
 const orderedScheduleAreas=[...scheduleAreas].sort((a,b)=>
  scheduleAreaAreaOrder(a)-scheduleAreaAreaOrder(b)||scheduleAreaMainOrder(a)-scheduleAreaMainOrder(b)||Number(a.display_order||999999)-Number(b.display_order||999999)||a.schedule_area_code.localeCompare(b.schedule_area_code)
 );

 return <section className="erp-table-panel section schedule-area-direct-grid">
  <div className="erp-panel-head">
   <div><b>Điều độ trực tiếp · Planner {planner}</b>
    <small className="planning-sub">Chọn Batch ở Unscheduled để đưa lô vào dòng trống và gán lịch; NEW dùng để tạo lô trống thủ công.</small></div>
   <span>{scheduleAreas.length} areas</span>
  </div>
  <div className="schedule-area-grid-stack">
  {orderedScheduleAreas.map(a=>{
   const hub=hubByGroup.get(String(a.resource_group||""));
   if(a.resource_group&&!a.resource_code){
    const children=childrenByGroup.get(a.resource_group)||[];
    // v254: CHỈ gộp khi khu có lane con thật (vd PAINTING có CAB1/CAB2/CAB3).
    // Khu không có area con (vd CHEMICAL_LINE/Flybar# — điều độ qua resource
    // FB-01..06, không có area con) → TRẢ VỀ BLOCK NHƯ CŨ, không gộp.
    if(children.length){
     const pool=poolOpsFor(a,children);
     return <div className="schedule-area-grid-block schedule-area-group-block" key={a.schedule_area_code}>
      <div className="schedule-area-grid-title">
       <div><b>{a.schedule_area_name}</b><small>{a.schedule_area_code} · khu gộp {children.map(c=>c.schedule_area_name).join(" / ")} — mỗi lane dùng chung lô Unscheduled của cả khu, chọn vào lane nào tùy ý</small></div>
       <div className="schedule-area-row-actions"><span>{children.length} lane · từng cabin điều độ riêng (logic giữ nguyên)</span></div>
      </div>
      {renderScheduleAreaWorkload(a.schedule_area_name,pool,{compactRecipesOnly:a.resource_group==="CHEMICAL_LINE",showWaitNextBreakdown:true})}
      <div className="schedule-area-group-children">
       {[...children].sort((x,y)=>scheduleAreaMainOrder(x)-scheduleAreaMainOrder(y)||Number(x.display_order)-Number(y.display_order)).map(ch=>renderAreaBlock(ch,pool,false))}
      </div>
     </div>;
    }
   }
   if(a.resource_code&&hub)return null;
   return renderAreaBlock(a);
  })}
  </div>
  {renderWorkloadQuickView()}
 </section>
}
