"use client";

import {pushAppToast} from "@/components/app-toast-provider";

import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties,type MouseEvent as ReactMouseEvent} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";
import {safeJson} from "@/lib/fetch-json";

const formatNumber=(value:unknown, maxDecimals=2)=>{
 const n=Number(value??0);
 if(!Number.isFinite(n))return "0";
 const fixed=n.toFixed(maxDecimals);
 let [whole,decimal]=fixed.split(".");
 whole=whole.replace(/\B(?=(\d{3})+(?!\d))/g,".");
 decimal=(decimal||"").replace(/0+$/,"");
 return decimal?`${whole},${decimal}`:whole;
};

type RouteStatusItem={
 route_key:string;
 source_operation:string;
 source_seq:number;
 occurrence:number;
 standard_operation:string|null;
 planning_job_operation_id:number|null;
 planning_job_status:string|null;
 is_hold?:boolean;
 hold_reason?:string|null;
 hold_note?:string|null;
 held_at?:string|null;
 held_by?:string|null;
 ready_source_seq:number|null;
 route_status:
  |"DONE"
  |"READY"
  |"WAITING"
  |"PLANNED-UNSCHEDULED"
  |"SCHEDULED"
  |"RUNNING"
  |"COMPLETED"
  |"HOLD"
  |string;
 batch_id:number|null;
 batch_no:string|null;
 batch_nos?:string[]|null;
 batch_status:string|null;
 schedule_id:number|null;
 schedule_status:string|null;
 resource_code:string|null;
 planned_start:string|null;
 planned_end:string|null;
 recipe_no:string|null;
 recipe_name:string|null;
 // v290: live Recipe of this exact route occurrence (not the representative Candidate row).
 effective_recipe_key?:string|null;
 effective_recipe_mapping_id?:number|null;
 effective_recipe_no?:string|null;
 effective_recipe_name?:string|null;
 batch_key_suggest?:string|null;
 batch_prefix_suggest?:string|null;
};

type Candidate={
 id:number;
 job_num:string;
 part_num:string|null;
 revision_num:string|null;
 program:string|null;
 part_master_primer1:string|null;
 part_master_primer2:string|null;
 part_master_primer3:string|null;
 part_master_topcoat1:string|null;
 part_master_topcoat2:string|null;
 part_master_antiabration:string|null;
 part_master_varnish:string|null;
 plan_qty:number;
 plan_surface:number;
 source_operation_code:string;
 standard_operation:string;
 st_group:string|null;
 area_name:string|null;
 recipe_key:string|null;
 recipe_mapping_id?:number|null;
 recipe_no:string|null;
 recipe_name:string|null;
 previous_standard_operation:string|null;
 next_standard_operation:string|null;
 priority_type:string|null;
 recipe_required:boolean;
 planning_status:"LOCKED"|"ELIGIBLE"|"PLANNED"|"HOLD";
 is_hold?:boolean;
 hold_reason?:string|null;
 hold_note?:string|null;
 held_at?:string|null;
 held_by?:string|null;
 has_planning_chain?:boolean;
 next_operation_type?:"PLANNING_OPERATION"|"INTERMEDIATE"|"ST_SCOPE_ONLY"|null;
 intermediate_previous_main?:string|null;
 intermediate_next_main?:string|null;
 source_seq:number|null;
 batch_no:string|null;
 batch_id:number|null;
 batch_status:string|null;
 previous_planning_status:string|null;
 previous_planning_operation:string|null;
 previous_batch_no:string|null;
 previous_batch_id:number|null;
 previous_batch_status:string|null;
 previous_batch_operation:string|null;
 previous_batch_source_operation:string|null;
 previous_batch_source_seq:number|null;

 // v262/v266: recipe theo CẤU HÌNH HIỆN TẠI (paint Part+Rev → op code ưu tiên).
 effective_recipe_key:string|null;
 effective_recipe_mapping_id?:number|null;
 // Mã lô mẫu + Prefix (gộp từ Batch Key / Recipe Rules).
 batch_key_suggest:string|null;
 batch_prefix_suggest:string|null;

 part_cluster:string|null;
 part_description:string|null;
 prod_qty:number|null;
 current_good_wip_qty:number|null;
 last_labor_qty:number|null;
 last_operation:string|null;
 next_operation:string|null;
 next_operation_planning_sort_order:number|null;
 all_operation:string|null;
 total_surface:number|null;
 surface_per_part_dm2:number|null;
 open_dmr:string|null;
 st:string|null;
 st_wip_area:string|null;
 wip_sequence:string|null;
 cat35_transit:string|null;
 impact_sale_value:string|null;
 last_import_status:string|null;
 first_seen_at:string|null;
 last_seen_at:string|null;
 last_changed_at:string|null;
 source_data:Record<string,unknown>|null;
 route_status:RouteStatusItem[];
 route_status_loaded?:boolean;
};







type TimeRule={
 calc_type:string;
 priority:number;
 qty_min:number|null;
 qty_max:number|null;
 surface_min_dm2:number|null;
 surface_max_dm2:number|null;
 fixed_hours:number|null;
 standard_hours:number|null;
};

function minutesToHHMM(v:number|null){
 if(v==null)return "—";
 const h=Math.floor(v/60);
 const m=v%60;
 return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

function estimateMinutes(
 rules:TimeRule[],
 qty:number,
 surface:number
){
 const sorted=[...rules].sort((a,b)=>a.priority-b.priority);

 for(const r of sorted){
   if(r.calc_type==="FIXED_HOURS" && r.fixed_hours!=null)
     return Math.round(Number(r.fixed_hours)*60);

   if(r.calc_type==="QTY_SURFACE"){
     const okQty=
       (r.qty_min==null || qty>=Number(r.qty_min)) &&
       (r.qty_max==null || qty<=Number(r.qty_max));

     const okSurface=
       (r.surface_min_dm2==null || surface>=Number(r.surface_min_dm2)) &&
       (r.surface_max_dm2==null || surface<=Number(r.surface_max_dm2));

     if(okQty && okSurface && r.standard_hours!=null)
       return Math.round(Number(r.standard_hours)*60);
   }
 }

 return null;
}


type MainOperationMaster={
 standard_operation:string;
 st_group:string|null;
 area_id:number|null;
 area_name:string|null;
 area_sort:number|null;
 st_group_sort:number|null;
 operation_sort:number|null;
 planning_sort_order:number|null;
};

type OperationMappingMaster={
 source_operation_code:string;
 st_group:string|null;
 standard_operation_rule:string;
 mapping_rule?:string|null;
 sort_order?:number|null;
};

const splitAllOperationForView=(value:unknown)=>{
 const x=String(value??"").trim().replace(/^\[/,"").replace(/\]$/,"").trim();
 if(!x)return [] as string[];
 return x.split(/\s*\|\s*/).map(v=>v.replace(/^\[/,"").replace(/\]$/,"").trim()).filter(Boolean);
};

const deriveMainOperationsFromAllOperation=(
 allOperation:unknown,
 mappingBySource:Map<string,OperationMappingMaster>,
 scopeCanonical:Map<string,string>
)=>{
 const raw=splitAllOperationForView(allOperation);
 const primerCodes=new Set<string>();
 const topcoatCodes=new Set<string>();
 for(const [code,m] of mappingBySource){
  const group=String(m.st_group??"").trim().toUpperCase();
  if(group==="PRIMER")primerCodes.add(code);
  if(group==="TOPCOAT")topcoatCodes.add(code);
 }
 let primerOccurrence=0;
 let topcoatOccurrence=0;
 const out:string[]=[];
 const seen=new Set<string>();
 const canonical=(name:string)=>scopeCanonical.get(name.trim().toUpperCase())||"";

 for(let i=0;i<raw.length;i++){
  const sourceCode=raw[i].trim();
  const key=sourceCode.toUpperCase();
  if(!sourceCode||key==="PIONBL")continue;
  const mapping=mappingBySource.get(key);
  if(!mapping)continue;

  let standardOperation="";
  if(primerCodes.has(key)){
   primerOccurrence++;
   standardOperation=canonical(primerOccurrence===1?"PRIMER":primerOccurrence===2?"PRIMER2":"PRIMER3");
  }else if(topcoatCodes.has(key)){
   topcoatOccurrence++;
   standardOperation=canonical(topcoatOccurrence===1?"TOPCOAT1":"TOPCOAT2");
  }else if(key==="HE-BAKE"){
   const prev=String(raw[i-1]??"").trim().toUpperCase();
   const next=String(raw[i+1]??"").trim().toUpperCase();
   const target=(prev==="PLA-ZINI"||next==="PLA-CC")
    ?"HE-BAKE AFTER PLATING"
    :(next==="A-DBLST"||next==="M-DBLST")
     ?"HE-BAKE BEFORE BLASTING"
     :"HE-BAKE";
   standardOperation=canonical(target);
  }else{
   standardOperation=canonical(String(mapping.standard_operation_rule??""));
  }

  if(!standardOperation)continue;
  const normalizedMain=standardOperation.trim().toUpperCase();
  if(seen.has(normalizedMain))continue;
  seen.add(normalizedMain);
  out.push(standardOperation);
 }
 return out;
};

type CandidateColumn={
 key:string;
 label:string;
 group:"planning"|"route"|"allopen";
};

// v344: these internal planning-order fields are intentionally hidden from
// Planning Board. They remain available in master/config because chain logic
// still needs them, but planners do not use them as Candidate columns.
const isHiddenPlanningBoardSourceColumn=(name:string)=>{
 const key=String(name||"").trim().toUpperCase().replace(/[\s_-]+/g," ");
 return key==="MAIN PLANNING ORDER" || key==="PLANNING ORDER" || key==="PLANNING SORT ORDER";
};

// All Open Job may also expose a raw NextOperation source column. Keep
// that column visible if the planner wants it, but do not offer a SECOND text
// sort for it. The special `next_operation` sort below is the only canonical
// sort: Main Planning Order first; md_operation.planning_sort_order is only the raw-code tie-breaker.
const isRawNextOperationSourceColumn=(name:string)=>
 String(name||"").trim().toUpperCase().replace(/[^A-Z0-9]+/g,"")==="NEXTOPERATION";

const PLANNING_COLUMNS:CandidateColumn[]=[
 {key:"job",label:"Job",group:"planning"},
 {key:"standard_operation",label:"Standard Operation",group:"planning"},
 {key:"part_rev",label:"Part / Rev",group:"planning"},
 {key:"qty",label:"Qty",group:"planning"},
 {key:"surface",label:"Surface",group:"planning"},
 {key:"source_op",label:"Source Op",group:"planning"},
 {key:"previous_op",label:"Previous Plan Op",group:"planning"},
 {key:"next_op",label:"Next Main Plan Op",group:"planning"},
 {key:"recipe",label:"Recipe",group:"planning"},
 {key:"primer1",label:"Part Master PRIMER1",group:"planning"},
 {key:"primer2",label:"Part Master PRIMER2",group:"planning"},
 {key:"primer3",label:"Part Master PRIMER3",group:"planning"},
 {key:"priority",label:"Priority",group:"planning"},
 {key:"status",label:"Status",group:"planning"},
 {key:"batch_no",label:"Batch No",group:"planning"},
 {key:"previous_status",label:"Previous Plan Status",group:"planning"},
 {key:"previous_batch_no",label:"Previous Batch No",group:"planning"},
 {key:"actual_progress",label:"Actual Progress",group:"planning"},
];

type SortDirection="asc"|"desc";
type SortRule={field:string;direction:SortDirection};

const CANDIDATE_SORT_SPECIAL_FIELDS=[
 {key:"next_main",label:"Next Main Plan Op"},
 {key:"next_operation",label:"NextOperation"},
 {key:"primer1",label:"Part Master PRIMER1"},
 {key:"primer2",label:"Part Master PRIMER2"},
 {key:"primer3",label:"Part Master PRIMER3"},
 {key:"recipe",label:"Recipe No"},
 {key:"previous_batch",label:"Previous Batch No"},
 {key:"priority",label:"Priority"},
 {key:"part",label:"Part Num"},
 {key:"program",label:"Program"},
 {key:"qty",label:"Qty"},
 {key:"surface",label:"Surface"},
 {key:"job",label:"Job"}
] as const;

const SORT_STORAGE_KEY="st-planning:candidate-sort:v1";
const VIEW_STORAGE_KEY="st-planning:candidate-view-by-operation:v1";
const COLUMN_STORAGE_KEY="st-planning:candidate-columns:v6";
const COLUMN_LAYOUT_STORAGE_KEY="st-planning:candidate-column-layout:v1";
const ERP_MATRIX_DEFAULT_COLUMNS=["job","part_rev","qty","surface","priority"] as const;
// v388: Area Candidate focus must keep the same operational context columns
// for every Area. Older AREA presets (Chemical Line in particular) may have
// been saved before the current ERP matrix and can be too sparse. These source
// fields are therefore guaranteed in Area focus when the catalog exposes them;
// the rest of the planner's saved/custom columns are still preserved.
const ERP_AREA_CONTEXT_SOURCE_FIELDS=[
 "PartDescription",
 "CurrentGoodWIPQty",
 "TotalSurface",
 "LastLaborOp",
 "NextOperation",
 "OpenDMR"
] as const;
const ALL_OPEN_JOB_GROUP_KEY="group:allopen";

function collapsedColumnLayoutFromVisible(keys:string[]){
 const out:string[]=[];
 let groupAdded=false;
 for(const raw of keys){
  const key=String(raw||"");
  if(key.startsWith("source:")){
   if(!groupAdded){out.push(ALL_OPEN_JOB_GROUP_KEY);groupAdded=true;}
   continue;
  }
  if(key && !out.includes(key))out.push(key);
 }
 if(!groupAdded)out.push(ALL_OPEN_JOB_GROUP_KEY);
 return out;
}

/* v260 — Excel-style Freeze Pane (chọn vị trí rồi chốt; lưu localStorage). */
const FREEZE_STORAGE_KEY="st-planning:freeze:v1";
const FREEZE_MAX_COLS=16;
// v338: các trạng thái có thể lọc trên cột Main Planning.
const ROUTE_STATUS_FILTER_OPTIONS=["READY","PLANNED","PLANNED-UNSCHEDULED","SCHEDULED","RUNNING","HOLD","COMPLETED","DONE","WAITING"];
type FreezeCfg={mode:"off"|"header"|"col"; col?:number};
const loadFreeze=():FreezeCfg=>{
  if(typeof window==="undefined")return {mode:"off"};
  try{
    const raw=localStorage.getItem(FREEZE_STORAGE_KEY);
    if(raw){
      const j=JSON.parse(raw);
      if(j&&(j.mode==="header"||(j.mode==="col"&&Number.isInteger(j.col)&&(j.col as number)>=1)))return j;
    }
  }catch{}
  return {mode:"off"};
};

type BatchTargetOption={
 id:number;
 batch_no:string;
 standard_operation:string;
 recipe_key:string|null;
 recipe_mapping_id?:number|null;
 recipe_no:string|null;
 recipe_name:string|null;
 total_jobs:number;
 total_qty:number;
 total_surface_dm2:number;
 process_minutes:number|null;
 status:string|null;
 schedule_id:number|null;
 schedule_status:string|null;
 resource_code:string|null;
 schedule_start:string|null;
 schedule_end:string|null;
};

type BatchCompatibilityCondition={source_column:string;source_value:string|null;operator?:string};
type BatchCompatibilityLock={
 key:string;
 loading:boolean;
 error:string;
 profile:{
  source:"JOB"|"BATCH";
  batchId?:number|null;
  anchorId?:number|null;
  standardOperation:string;
  recipeKey:string;
  recipeMappingId:number|null;
  recipeNo:string|null;
  recipeName:string|null;
  conditions:BatchCompatibilityCondition[];
  selectedConditions:BatchCompatibilityCondition[];
  selectedConditionColumns:string[];
  conditionText:string;
 }|null;
 compatibleIds:number[];
 reasons:Record<string,string[]|string>;
 total:number;
 compatible:number;
 locked:number;
};

type CompatibilityConditionChoice={identity:string;columns:string[]};
type JobHoldDialogTarget={
 id:number;
 jobNum:string;
 standardOperation:string;
 sourceOperation:string;
 isHold:boolean;
 holdReason?:string|null;
 holdNote?:string|null;
 heldAt?:string|null;
 heldBy?:string|null;
};
type JobHoldContextMenuState={
 x:number;
 y:number;
 target:JobHoldDialogTarget;
};

type WorkloadMetric={jobs:number;qty:number;surface:number};
type WorkloadSummaryRow={
 areaId:number;
 areaName:string;
 areaSort:number;
 standardOperation:string;
 mainOrder:number;
 ready:WorkloadMetric;
 readyPrevScheduled:WorkloadMetric;
 readyPrevUnscheduled:WorkloadMetric;
 wait:WorkloadMetric;
 hold:WorkloadMetric;
 total:WorkloadMetric;
};
type WorkloadBucket="READY_PREV_SCHEDULED"|"READY_PREV_UNSCHEDULED"|"WAIT"|"HOLD";
type WorkloadTotals={
 READY:WorkloadMetric;
 READY_PREV_SCHEDULED:WorkloadMetric;
 READY_PREV_UNSCHEDULED:WorkloadMetric;
 WAIT:WorkloadMetric;
 HOLD:WorkloadMetric;
};
const EMPTY_WORKLOAD_TOTALS:WorkloadTotals={
 READY:{jobs:0,qty:0,surface:0},
 READY_PREV_SCHEDULED:{jobs:0,qty:0,surface:0},
 READY_PREV_UNSCHEDULED:{jobs:0,qty:0,surface:0},
 WAIT:{jobs:0,qty:0,surface:0},
 HOLD:{jobs:0,qty:0,surface:0}
};

type CandidateViewPreset={
 columns:string[];
 // v292: virtual layout item. All Open Job columns can stay collapsed in one group
 // while selected source columns are extracted before/after the group.
 columnLayout?:string[];
 // v241: VIEW CÔNG ĐOẠN ST (tách riêng) — danh sách next operation được chọn hiển thị.
 stView?:string[];
 filters:{
  nextMain:string;
  nextOperation:string;
  primer1:string;
  primer2:string;
  primer3:string;
  // v338: lọc theo trạng thái từng cột Main Planning (Route Matrix).
  routeMain?:Record<string,string>;
  // v339: Excel-style column filter — key cột → các giá trị đang chọn.
  colFilters?:Record<string,string[]>;
 };
 sortRules:SortRule[];
 density?:"normal"|"compact"|"ultra";
 routeFocus?:boolean;
};
const LEGACY_COLUMN_STORAGE_KEY="st-planning:candidate-columns:v5";
// v298: pagination is gone — ALL Candidates render progressively instead.
// 100 rows paint immediately; each scroll approach appends 100 more.
// v331: measured faster than rendering every row at once on production data.
const CANDIDATE_INITIAL_DOM_ROWS=100;
const CANDIDATE_DOM_ROW_STEP=100;
const MATRIX_ZOOM_STORAGE_KEY="st-planning:matrix-zoom:v380";
const ERP_BATCH_PREVIOUS_CONTEXT_KEY="route-context:previous";
const ERP_BATCH_NEXT_CONTEXT_KEY="route-context:next";

// Client fetch dùng safeJson chung từ @/lib/fetch-json để mọi màn hình báo lỗi HTTP/HTML nhất quán.

export function PlanningBoardClient({
 presentation="legacy",
 candidates,
 availableBatches,
 standardOperation,
 areaMode,
 selectedAreaId,
 mainOperations,
 stOperations,
 nextOperations,
 sourceColumnNames,
 operationMappings,
 recipeKey,
 timeRules,
 today,
 initialView,
 initialServerViews,
 pagination,
 onVisibleCandidateIds,
 onReloadCandidates,
 onCandidateMutation,
 onAfterMutation
}: {
 presentation?:"legacy"|"erp";
 candidates:Candidate[];
 availableBatches:BatchTargetOption[];
 standardOperation:string;
 areaMode:boolean;
 selectedAreaId:string;
 mainOperations:MainOperationMaster[];
 stOperations:{operation_code:string;standard_operation:string|null;operation_type?:string|null;config_status?:string|null}[];
 nextOperations:{operation_code:string;jobs:number}[];
 sourceColumnNames:string[];
 operationMappings:OperationMappingMaster[];
 recipeKey:string;
 timeRules:TimeRule[];
 today:string;
 initialView?:CandidateViewPreset|null;
 initialServerViews?:Record<string,unknown>|null;
 pagination:{page:number;pageSize:number;totalCandidates:number;totalPages:number};
 onVisibleCandidateIds?:(ids:number[])=>void|Promise<void>;
 onReloadCandidates?:()=>void;
 // v390: all normal Planning Board saves refresh only affected Jobs. Optional
 // operationState lets Hold/Unhold patch the visible cell immediately before
 // the canonical delta refresh completes.
 onCandidateMutation?:(event:{
  affectedJobNums:string[];
  batchTarget?:BatchTargetOption|null;
  operationState?:any|null;
 })=>void|Promise<void>;
 // Full refresh remains available for explicit structural mutations such as
 // Rebuild Planning Chain.
 onAfterMutation?:()=>void;
}){
 const erpMode=presentation==="erp";
 const erpColumnLabels:Record<string,string>={
  job:"Job",standard_operation:"Main Operation",part_rev:"Part / Rev",qty:"Qty",surface:"Diện tích",source_op:"Operation Code",
  previous_op:"Công đoạn trước",next_op:"Main Operation tiếp theo",recipe:"Recipe",
  primer1:"Primer 1",primer2:"Primer 2",primer3:"Primer 3",priority:"Ưu tiên",status:"Trạng thái",
  batch_no:"Batch",previous_status:"Trạng thái kế hoạch trước",previous_batch_no:"Batch trước",actual_progress:"Tiến độ thực tế"
 };
 const planningColumnLabel=(col:CandidateColumn)=>erpMode?(erpColumnLabels[col.key]||col.label):col.label;
 const sortFieldLabel=(key:string,label:string)=>{
  if(!erpMode)return label;
  const labels:Record<string,string>={
   next_main:"Main Operation tiếp theo",next_operation:"Next Operation",primer1:"Primer 1",primer2:"Primer 2",primer3:"Primer 3",
   recipe:"Recipe",previous_batch:"Batch trước",priority:"Ưu tiên",part:"Part",program:"Program",qty:"Qty",surface:"Diện tích",job:"Job"
  };
  return labels[key]||label;
 };
 const columnStorageKey=erpMode?"st-planning:erp-matrix-columns:v1":COLUMN_STORAGE_KEY;
 const columnLayoutStorageKey=erpMode?"st-planning:erp-matrix-column-layout:v1":COLUMN_LAYOUT_STORAGE_KEY;
 const [selected,setSelected]=useState<number[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [holdDialog,setHoldDialog]=useState<JobHoldDialogTarget|null>(null);
 const [holdContextMenu,setHoldContextMenu]=useState<JobHoldContextMenuState|null>(null);
 const [holdReason,setHoldReason]=useState("DMR");
 const [holdNote,setHoldNote]=useState("");
 const [holdBusy,setHoldBusy]=useState(false);
 const [targetBatchId,setTargetBatchId]=useState("");
 useEffect(()=>{
  if(!holdContextMenu)return;
  const close=()=>setHoldContextMenu(null);
  const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")close();};
  window.addEventListener("click",close);
  window.addEventListener("keydown",onKey);
  window.addEventListener("scroll",close,true);
  window.addEventListener("resize",close);
  return ()=>{
   window.removeEventListener("click",close);
   window.removeEventListener("keydown",onKey);
   window.removeEventListener("scroll",close,true);
   window.removeEventListener("resize",close);
  };
 },[holdContextMenu]);
 // v336: first READY Job (or Existing Batch) establishes Recipe + Process
 // condition compatibility. Only incompatible READY cells of that Main are dimmed/disabled; other Main columns stay untouched.
 const [compatibilityLock,setCompatibilityLock]=useState<BatchCompatibilityLock|null>(null);
 const [compatibilityConditionChoice,setCompatibilityConditionChoice]=useState<CompatibilityConditionChoice|null>(null);
 const compatibilitySeq=useRef(0);
 const compatibilityAnchorId=useRef<number|null>(null);
 usePopupMessage(message);
 // v298: pagination removed — clear row selection whenever a fresh Candidate
 // set (new total) arrives.
 const paginationKey=`${pagination.page}|${pagination.pageSize}|${pagination.totalCandidates}`;
 useEffect(()=>{
  setSelected([]);
  setTargetBatchId("");
  setCompatibilityLock(null);
  setCompatibilityConditionChoice(null);
  compatibilityAnchorId.current=null;
 },[paginationKey]);
 const [columnPickerOpen,setColumnPickerOpen]=useState(false);
 const [columnSearch,setColumnSearch]=useState("");
 const [operationPickerOpen,setOperationPickerOpen]=useState(false);
 const [opSearch,setOpSearch]=useState("");
 // v261: khởi tạo NGAY từ Default View máy chủ (SSR) → không hiện "hình 1" (169 cột).
const [stViewOverride,setStViewOverride]=useState<string[]|null>(initialView?.stView??null);
 const [visibleColumns,setVisibleColumns]=useState<string[]|null>(
  erpMode
   ?[...ERP_MATRIX_DEFAULT_COLUMNS]
   :initialView&&Array.isArray(initialView.columns)&&initialView.columns.length
    ?initialView.columns
    :null
 );
 const [columnLayout,setColumnLayout]=useState<string[]|null>(
  erpMode
   ?collapsedColumnLayoutFromVisible([...ERP_MATRIX_DEFAULT_COLUMNS])
   :initialView&&Array.isArray(initialView.columnLayout)&&initialView.columnLayout.length
    ?initialView.columnLayout
    :null
 );
 const [displayRulesOpen,setDisplayRulesOpen]=useState(false);
 const [filterNextMain,setFilterNextMain]=useState(initialView?.filters?.nextMain||"");
 const [filterNextOperation,setFilterNextOperation]=useState(initialView?.filters?.nextOperation||"");
 const [filterPrimer1,setFilterPrimer1]=useState(initialView?.filters?.primer1||"");
 const [filterPrimer2,setFilterPrimer2]=useState(initialView?.filters?.primer2||"");
 const [filterPrimer3,setFilterPrimer3]=useState(initialView?.filters?.primer3||"");
 // v334: chip lọc nhanh theo trạng thái — "" = tất cả, hoặc ELIGIBLE / PLANNED / WAIT / NO CHAIN.
 const [statusFilter,setStatusFilter]=useState("");
 // v338: lọc theo trạng thái từng cột Main Planning — map normalized op → giá trị lọc.
 const [filterRouteMain,setFilterRouteMain]=useState<Record<string,string>>({});
 // v339: Excel-style column filter — key cột → các giá trị đang chọn; menu đang mở.
 const [colFilters,setColFilters]=useState<Record<string,string[]>>({});
 const [colFilterMenu,setColFilterMenu]=useState<{key:string;rect:{left:number;top:number;width:number}}|null>(null);
 const [colFilterSearch,setColFilterSearch]=useState("");
 const [sortRules,setSortRules]=useState<SortRule[]>(
  initialView&&Array.isArray(initialView.sortRules)&&initialView.sortRules.length
   ?(initialView.sortRules as SortRule[])
   :[
     {field:"next_operation",direction:"asc"},
     {field:"priority",direction:"desc"},
     {field:"job",direction:"asc"}
    ]
 );
 const [viewLoadedFor,setViewLoadedFor]=useState("");
 const [viewMessage,setViewMessage]=useState("");
 const [serverViews,setServerViews]=useState<Record<string,CandidateViewPreset>|null>(
  initialServerViews&&typeof initialServerViews==="object"
   ?initialServerViews as Record<string,CandidateViewPreset>
   :null
 );
 const [dragColumnKey,setDragColumnKey]=useState("");
 const [dragSortIndex,setDragSortIndex]=useState<number|null>(null);
 const [dragCandidateId,setDragCandidateId]=useState<number|null>(null);
 const [fullView,setFullView]=useState(false);
 const [candidateDomLimit,setCandidateDomLimit]=useState(CANDIDATE_INITIAL_DOM_ROWS);
 const candidateDomSentinelRef=useRef<HTMLTableRowElement|null>(null);
 const candidateTableWrapRef=useRef<HTMLDivElement|null>(null);
 const [candidateDensity,setCandidateDensity]=useState<"normal"|"compact"|"ultra">(erpMode?"compact":(initialView?.density??"compact"));
 const [matrixZoom,setMatrixZoom]=useState(100);
 const [workloadOpen,setWorkloadOpen]=useState(true);
 const [workloadLoading,setWorkloadLoading]=useState(false);
 const [workloadError,setWorkloadError]=useState("");
 const [workloadRows,setWorkloadRows]=useState<WorkloadSummaryRow[]>([]);
 const [workloadTotals,setWorkloadTotals]=useState(EMPTY_WORKLOAD_TOTALS);
 const [workloadDrill,setWorkloadDrill]=useState<{main:string;bucket:WorkloadBucket}|null>(null);
 const [workloadDrillLoading,setWorkloadDrillLoading]=useState("");
 const [routeFocus,setRouteFocus]=useState(erpMode?true:Boolean(initialView?.routeFocus));
 useEffect(()=>{
  if(!erpMode)return;
  try{
   const saved=Number(window.localStorage.getItem(MATRIX_ZOOM_STORAGE_KEY)||100);
   if(Number.isFinite(saved))setMatrixZoom(Math.max(70,Math.min(130,Math.round(saved/10)*10)));
  }catch{}
 },[erpMode]);
 const changeMatrixZoom=(next:number)=>{
  const value=Math.max(70,Math.min(130,Math.round(next/10)*10));
  setMatrixZoom(value);
  try{window.localStorage.setItem(MATRIX_ZOOM_STORAGE_KEY,String(value));}catch{}
 };

 const refreshWorkloadSummary=useCallback(async()=>{
  if(!erpMode)return;
  setWorkloadLoading(true);
  setWorkloadError("");
  try{
   const qs=new URLSearchParams();
   if(selectedAreaId)qs.set("areaId",selectedAreaId);
   if(standardOperation)qs.set("op",standardOperation);
   const r=await fetch(`/api/planning/workload-summary${qs.toString()?`?${qs.toString()}`:""}`,{cache:"no-store"});
   const d=await safeJson(r);
   if(!r.ok)throw new Error(d?.error||"Không đọc được Workload Summary.");
   setWorkloadRows(Array.isArray(d.rows)?d.rows:[]);
   setWorkloadTotals({
    READY:{jobs:Number(d?.totals?.READY?.jobs||0),qty:Number(d?.totals?.READY?.qty||0),surface:Number(d?.totals?.READY?.surface||0)},
    READY_PREV_SCHEDULED:{jobs:Number(d?.totals?.READY_PREV_SCHEDULED?.jobs||0),qty:Number(d?.totals?.READY_PREV_SCHEDULED?.qty||0),surface:Number(d?.totals?.READY_PREV_SCHEDULED?.surface||0)},
    READY_PREV_UNSCHEDULED:{jobs:Number(d?.totals?.READY_PREV_UNSCHEDULED?.jobs||0),qty:Number(d?.totals?.READY_PREV_UNSCHEDULED?.qty||0),surface:Number(d?.totals?.READY_PREV_UNSCHEDULED?.surface||0)},
    WAIT:{jobs:Number(d?.totals?.WAIT?.jobs||0),qty:Number(d?.totals?.WAIT?.qty||0),surface:Number(d?.totals?.WAIT?.surface||0)},
    HOLD:{jobs:Number(d?.totals?.HOLD?.jobs||0),qty:Number(d?.totals?.HOLD?.qty||0),surface:Number(d?.totals?.HOLD?.surface||0)}
   });
  }catch(e){
   setWorkloadError(e instanceof Error?e.message:String(e));
  }finally{setWorkloadLoading(false);}
 },[erpMode,selectedAreaId,standardOperation]);
 useEffect(()=>{void refreshWorkloadSummary();},[refreshWorkloadSummary]);
 const workloadGrandTotal=useMemo(()=>({
  jobs:workloadTotals.READY.jobs+workloadTotals.WAIT.jobs+workloadTotals.HOLD.jobs,
  qty:workloadTotals.READY.qty+workloadTotals.WAIT.qty+workloadTotals.HOLD.qty,
  surface:workloadTotals.READY.surface+workloadTotals.WAIT.surface+workloadTotals.HOLD.surface
 }),[workloadTotals]);

 // v282: Chẩn đoán Recipe + So sánh Cấu hình ↔ Board.
 const [recipeDiag,setRecipeDiag]=useState<any|null>(null);
 const [recipeDiagLoading,setRecipeDiagLoading]=useState(false);
 const [recipeCompare,setRecipeCompare]=useState<any|null>(null);
 const [recipeCompareLoading,setRecipeCompareLoading]=useState(false);
 const [recipeCompareOpen,setRecipeCompareOpen]=useState(false);
useEffect(()=>{
  if(!fullView)return;
  const old=document.body.style.overflow;
  document.body.style.overflow="hidden";
  const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")setFullView(false);};
  window.addEventListener("keydown",onKey);
  return ()=>{
   document.body.style.overflow=old;
   window.removeEventListener("keydown",onKey);
  };
 },[fullView]);

 // v283: use the server-cached All Open Job column catalog, but preserve
 // the existing board order as closely as possible: keys from the first loaded
 // source_data row come first, then catalog-only columns are appended. This
 // avoids scanning source_data for every Candidate without changing saved views.
 const sourceColumns=useMemo(()=>{
   const out=Object.keys(candidates[0]?.source_data||{}).filter(key=>!isHiddenPlanningBoardSourceColumn(key));
   const seen=new Set(out);
   for(const key of sourceColumnNames){
    if(isHiddenPlanningBoardSourceColumn(key))continue;
    if(!seen.has(key)){seen.add(key);out.push(key);}
   }
   return out;
 },[sourceColumnNames,candidates.length?candidates[0]?.source_data:null]);

 // v291: VIEW CÔNG ĐOẠN ST has one job-filter responsibility only:
 // Candidate Jobs are included when RAW NextOperation belongs to this set.
 const defaultStView=useMemo(()=>{
   const set=new Set<string>();
   for(const x of (stOperations||[])){
    // V404: the ST RAW selector follows the same population inputs used by the
    // Current Main resolver: direct Planning Operations plus active Bridge
    // Intermediate Operations. ST_SCOPE_ONLY is not returned by stOperations.
    const type=normalized(x.operation_type);
    if(type!=="PLANNING_OPERATION"&&type!=="INTERMEDIATE")continue;
    const c=normalized(x.operation_code);
    if(c)set.add(c);
   }
   return set;
  },[stOperations]);

 // Legacy saved views could contain bridge/intermediate or unrelated RAW Ops.
 // Keep the user subset, but always intersect it with the canonical ST set.
 useEffect(()=>{
  if(stViewOverride===null)return;
  const safe=[...new Set(stViewOverride.map(normalized).filter(code=>defaultStView.has(code)))];
  const current=[...new Set(stViewOverride.map(normalized).filter(Boolean))];
  if(safe.length!==current.length||safe.some((code,index)=>code!==current[index]))setStViewOverride(safe);
 },[defaultStView,stViewOverride]);

 const effectiveStView=useMemo(
   ()=>new Set((stViewOverride??[...defaultStView]).map(normalized).filter(code=>defaultStView.has(code))),
   [stViewOverride,defaultStView]
  );

 const selectedAreaMainOperationSet=useMemo(()=>{
   const set=new Set<string>();
   if(!selectedAreaId)return set;
   for(const op of mainOperations){
    if(String(op.area_id||"")!==String(selectedAreaId))continue;
    const main=normalized(op.standard_operation);
    if(main)set.add(main);
   }
   return set;
 },[mainOperations,selectedAreaId]);

 const routeColumns=useMemo<CandidateColumn[]>(()=>{
   // v291 canonical UI rule:
   // VIEW ST filters rows by RAW NextOperation; Main columns come from the
   // displayed Jobs' own AllOperation, standardized with the same mapping/scope.
   const mappingBySource=new Map<string,OperationMappingMaster>();
   for(const m of operationMappings||[]){
    const source=normalized(m.source_operation_code);
    if(source&&!mappingBySource.has(source))mappingBySource.set(source,m);
   }

   const scopeCanonical=new Map<string,string>();
   for(const op of mainOperations){
    const key=normalized(op.standard_operation);
    if(key&&!scopeCanonical.has(key))scopeCanonical.set(key,String(op.standard_operation));
   }

   const needed=new Set<string>();
   for(const row of candidates){
    const nextOp=normalized(row.next_operation);
    if(!nextOp||!effectiveStView.has(nextOp))continue;
    for(const main of deriveMainOperationsFromAllOperation(row.all_operation,mappingBySource,scopeCanonical)){
     needed.add(normalized(main));
    }
   }

   // v386 Area focus: when the planner loads Candidates for one Area, the
   // matrix must show every configured Main Operation of that Area, not every
   // upstream/downstream Main found in the Jobs' AllOperation. Previous handoff
   // information is represented by the virtual Previous Main column instead.
   if(erpMode&&areaMode&&selectedAreaId){
    needed.clear();
    for(const main of selectedAreaMainOperationSet)needed.add(main);
   }

   const ordered=[...mainOperations].sort((a,b)=>{
    const ap=a.planning_sort_order==null?Number.NaN:Number(a.planning_sort_order);
    const bp=b.planning_sort_order==null?Number.NaN:Number(b.planning_sort_order);
    const aScope=a.operation_sort==null?999999:Number(a.operation_sort);
    const bScope=b.operation_sort==null?999999:Number(b.operation_sort);
    const ao=Number.isFinite(ap)?ap:aScope;
    const bo=Number.isFinite(bp)?bp:bScope;
    if(ao!==bo)return ao-bo;
    const aa=a.area_sort==null?999999:Number(a.area_sort);
    const ba=b.area_sort==null?999999:Number(b.area_sort);
    if(aa!==ba)return aa-ba;
    const ag=a.st_group_sort==null?999999:Number(a.st_group_sort);
    const bg=b.st_group_sort==null?999999:Number(b.st_group_sort);
    if(ag!==bg)return ag-bg;
    return normalized(a.standard_operation).localeCompare(normalized(b.standard_operation),undefined,{numeric:true,sensitivity:"base"});
   });

   const seen=new Set<string>();
   const columns:CandidateColumn[]=[];
   for(const op of ordered){
    const mainOperation=normalized(op.standard_operation);
    if(!mainOperation||!needed.has(mainOperation)||seen.has(mainOperation))continue;
    seen.add(mainOperation);
    columns.push({key:`route-main:${mainOperation}`,label:mainOperation,group:"route"});
   }
   return columns;
 },[mainOperations,operationMappings,candidates,effectiveStView,erpMode,areaMode,selectedAreaId,selectedAreaMainOperationSet]);

 const configurableColumns=useMemo<CandidateColumn[]>(()=>[
   ...PLANNING_COLUMNS,
   ...sourceColumns.map(col=>({
     key:`source:${col}`,
     label:col,
     group:"allopen" as const
   }))
 ],[sourceColumns]);

 const allColumns=useMemo<CandidateColumn[]>(()=>[
   ...PLANNING_COLUMNS,
   {key:ERP_BATCH_PREVIOUS_CONTEXT_KEY,label:"Previous Main",group:"route" as const},
   {key:ERP_BATCH_NEXT_CONTEXT_KEY,label:"Next Main Planning",group:"route" as const},
   ...routeColumns,
   ...sourceColumns.map(col=>({
     key:`source:${col}`,
     label:col,
     group:"allopen" as const
   }))
 ],[sourceColumns,routeColumns]);

 const areaContextSourceKeys=useMemo(()=>{
   const normalizeSourceName=(value:string)=>String(value||"")
    .trim().toUpperCase().replace(/[^A-Z0-9]+/g,"");
   const byNormalized=new Map<string,string>();
   for(const col of sourceColumns){
    const token=normalizeSourceName(col);
    if(token&&!byNormalized.has(token))byNormalized.set(token,col);
   }
   const out:string[]=[];
   for(const wanted of ERP_AREA_CONTEXT_SOURCE_FIELDS){
    const actual=byNormalized.get(normalizeSourceName(wanted));
    if(actual)out.push(`source:${actual}`);
   }
   return out;
 },[sourceColumns]);

 const candidateSortFields=useMemo(()=>{
   const seen=new Set<string>();
   const result:{key:string;label:string}[]=[];

   const add=(key:string,label:string)=>{
     if(seen.has(key))return;
     seen.add(key);
     result.push({key,label});
   };

   CANDIDATE_SORT_SPECIAL_FIELDS.forEach(x=>add(x.key,sortFieldLabel(x.key,x.label)));

   // Every selectable/displayable Candidate column, including all raw
   // All Open Job source_data columns, is also available in Sort Priority.
   allColumns.forEach(col=>{
     if(col.group==="allopen" && isRawNextOperationSourceColumn(col.label))return;
     add(`column:${col.key}`,planningColumnLabel(col));
   });

   return result;
 },[allColumns,erpMode]);

 // v291: user column preferences control only planning/info + All Open Job
 // fields. Route/Main columns are automatic from the displayed Jobs' AllOperation
 // and cannot be hidden by an old Columns preset.
 useEffect(()=>{
   if(!erpMode&&initialView&&Array.isArray(initialView.columns)&&initialView.columns.length)return;
   try{
     const raw=
       window.localStorage.getItem(columnStorageKey) ||
       (!erpMode?window.localStorage.getItem(LEGACY_COLUMN_STORAGE_KEY):null);

     const valid=new Set(configurableColumns.map(x=>x.key));
     if(!raw){
       setVisibleColumns(erpMode?[...ERP_MATRIX_DEFAULT_COLUMNS]:configurableColumns.map(x=>x.key));
       return;
     }

     const saved=JSON.parse(raw);
     if(Array.isArray(saved)){
       let next=saved.filter((x:unknown)=>typeof x==="string"&&valid.has(x)) as string[];
       if(!window.localStorage.getItem(columnStorageKey)){
         for(const key of ["status","batch_no","previous_status","previous_batch_no","actual_progress"]){
           if(valid.has(key)&&!next.includes(key))next.push(key);
         }
         window.localStorage.setItem(columnStorageKey,JSON.stringify(next));
       }
       setVisibleColumns(next);
     }else{
       setVisibleColumns(erpMode?[...ERP_MATRIX_DEFAULT_COLUMNS]:configurableColumns.map(x=>x.key));
     }
   }catch{
     setVisibleColumns(erpMode?[...ERP_MATRIX_DEFAULT_COLUMNS]:configurableColumns.map(x=>x.key));
   }
 },[configurableColumns,erpMode,columnStorageKey]);

 useEffect(()=>{
   try{
     const raw=window.localStorage.getItem(SORT_STORAGE_KEY);
     if(!raw)return;
     const saved=JSON.parse(raw);
     if(Array.isArray(saved)){
       const valid=new Set(candidateSortFields.map(x=>x.key));
       const next=saved
        .filter((x:any)=>x && valid.has(String(x.field)) && ["asc","desc"].includes(String(x.direction)))
        .slice(0,10)
        .map((x:any)=>({field:String(x.field),direction:x.direction as SortDirection}));
       if(next.length)setSortRules(next);
     }
   }catch{}
 },[]);

 const configurableKeySet=useMemo(()=>new Set(configurableColumns.map(x=>x.key)),[configurableColumns]);
 const configurableActiveColumns=useMemo(()=>{
   const source=visibleColumns??configurableColumns.map(x=>x.key);
   const seen=new Set<string>();
   return source.filter(key=>{
    if(!configurableKeySet.has(key)||key.startsWith("route-main:")||seen.has(key))return false;
    seen.add(key);return true;
   });
 },[visibleColumns,configurableColumns,configurableKeySet]);

 // v292: Column Layout is a light-weight layout layer on top of visibility.
 // All Open Job source columns that are not explicitly extracted live inside
 // one virtual package. The package itself can move as one item.
 const effectiveColumnLayout=useMemo(()=>{
   const visibleSet=new Set(configurableActiveColumns);
   const raw=columnLayout??collapsedColumnLayoutFromVisible(configurableActiveColumns);
   const out:string[]=[];
   const seen=new Set<string>();
   let hasGroup=false;
   for(const item0 of raw){
    const item=String(item0||"");
    if(item===ALL_OPEN_JOB_GROUP_KEY){
     if(!hasGroup){out.push(item);hasGroup=true;}
     continue;
    }
    if(!visibleSet.has(item)||!configurableKeySet.has(item)||seen.has(item))continue;
    seen.add(item);out.push(item);
   }
   if(!hasGroup){out.push(ALL_OPEN_JOB_GROUP_KEY);hasGroup=true;}

   // Planning columns are individual layout items. If an old preset did not
   // contain them, keep every visible planning column before the package.
   const groupIndex=Math.max(0,out.indexOf(ALL_OPEN_JOB_GROUP_KEY));
   const missingPlanning=configurableActiveColumns.filter(key=>!key.startsWith("source:")&&!seen.has(key));
   if(missingPlanning.length)out.splice(groupIndex,0,...missingPlanning);
   return out;
 },[columnLayout,configurableActiveColumns,configurableKeySet]);

 const explicitSourceKeys=useMemo(
  ()=>new Set(effectiveColumnLayout.filter(key=>key.startsWith("source:"))),
  [effectiveColumnLayout]
 );
 // v293: package membership is independent from visibility. Every catalogued
 // All Open Job column belongs to the package by default; only columns that the
 // planner explicitly extracts before/after the package are removed from it.
 const allSourceColumnKeys=useMemo(
  ()=>sourceColumns.map(col=>`source:${col}`),
  [sourceColumns]
 );
 const groupedSourceColumns=useMemo(
  ()=>allSourceColumnKeys.filter(key=>!explicitSourceKeys.has(key)),
  [allSourceColumnKeys,explicitSourceKeys]
 );
 // The package is a layout bucket, not a command to render all 188+ columns.
 // Preserve the existing visibility set so opening Planning Board stays light.
 const visibleGroupedSourceColumns=useMemo(
  ()=>groupedSourceColumns.filter(key=>configurableActiveColumns.includes(key)),
  [groupedSourceColumns,configurableActiveColumns]
 );

 const activeColumns=useMemo(()=>{
   const routeKeys=routeColumns.map(x=>x.key);
   const out:string[]=[];
   let routeInserted=false;
   for(const item of effectiveColumnLayout){
    if(item===ALL_OPEN_JOB_GROUP_KEY){
     // Keep the automatic Main Operation matrix adjacent to the All Open Job
     // package, exactly where the package is positioned by the planner.
     if(!routeInserted){out.push(...routeKeys);routeInserted=true;}
     out.push(...visibleGroupedSourceColumns);
     continue;
    }
    if(configurableActiveColumns.includes(item))out.push(item);
   }
   if(!routeInserted)out.push(...routeKeys);
   return out;
 },[effectiveColumnLayout,visibleGroupedSourceColumns,configurableActiveColumns,routeColumns]);
 const isColumnVisible=(key:string)=>
   key.startsWith("route-main:")
    ?routeColumns.some(x=>x.key===key)
    :configurableActiveColumns.includes(key);

 useEffect(()=>{
  if(columnLayout!==null)return;
  let next:string[]|null=null;
  // A server Default View has priority. For legacy presets without columnLayout,
  // collapse their current visible All Open Job columns into one package.
  if(initialView){
   next=Array.isArray(initialView.columnLayout)&&initialView.columnLayout.length
    ?initialView.columnLayout
    :collapsedColumnLayoutFromVisible(configurableActiveColumns);
  }else{
   try{
    const raw=window.localStorage.getItem(columnLayoutStorageKey);
    const parsed=raw?JSON.parse(raw):null;
    if(Array.isArray(parsed)&&parsed.length)next=parsed.map((x:unknown)=>String(x));
   }catch{}
   if(!next)next=collapsedColumnLayoutFromVisible(configurableActiveColumns);
  }
  setColumnLayout(next);
 },[columnLayout,configurableActiveColumns,initialView,columnLayoutStorageKey,erpMode]);

 // v227: Default View lưu trên MÁY CHỦ (dùng chung mọi môi trường).
 useEffect(()=>{
   // SSR/API already supplied the relevant OP/AREA/SYSTEM presets. Do not
   // issue a second board-view request on every PlanningBoard mount.
   if(initialServerViews&&typeof initialServerViews==="object")return;
   let alive=true;
   fetch("/api/planning/board-view",{cache:"no-store"})
    .then(r=>safeJson(r))
    .then(d=>{
     if(alive){
      const v=(d&&typeof d.views==="object")?d.views:{};
      setServerViews(v as Record<string,CandidateViewPreset>);
     }
    })
    .catch(()=>{if(alive)setServerViews({});});
   return ()=>{alive=false;};
 },[initialServerViews]);

 const readOperationViews=():Record<string,CandidateViewPreset>=>{
   // Ưu tiên dữ liệu từ máy chủ; nếu chưa tải xong thì đọc legacy localStorage.
   if(serverViews!==null)return serverViews;
   try{
     const raw=window.localStorage.getItem(VIEW_STORAGE_KEY);
     const parsed=raw?JSON.parse(raw):{};
     return parsed&&typeof parsed==="object"?parsed:{};
   }catch{
     return {};
   }
 };

 const selectedAreaName=useMemo(()=>{
   if(!selectedAreaId)return "";
   const row=mainOperations.find(x=>String(x.area_id||"")===String(selectedAreaId));
   return row?.area_name||`Area ${selectedAreaId}`;
 },[selectedAreaId,mainOperations]);

 // Default view scope:
 // OP:<Standard Operation> -> AREA:<Area ID> -> SYSTEM.
 // Saving always writes to the exact scope currently being viewed.
 const exactViewKey=
   standardOperation
    ?`OP:${standardOperation}`
    :selectedAreaId
     ?`AREA:${selectedAreaId}`
     :"SYSTEM";

 const exactViewLabel=
   standardOperation
    ?`${erpMode?"Main Operation":"Operation"} ${standardOperation}`
    :selectedAreaId
     ?`${erpMode?"Khu vực":"Area"} ${selectedAreaName}`
     :(erpMode?"Toàn hệ thống":"System");

 const applyViewPreset=(preset:CandidateViewPreset)=>{
   const validColumns=new Set(configurableColumns.map(x=>x.key));
   const cols=Array.isArray(preset.columns)
    ? preset.columns.filter(x=>validColumns.has(x)&&!x.startsWith("route-main:"))
    : configurableColumns.map(x=>x.key);

   setVisibleColumns(cols);
   setColumnLayout(
    Array.isArray(preset.columnLayout)&&preset.columnLayout.length
     ?preset.columnLayout.map(x=>String(x))
     :collapsedColumnLayoutFromVisible(cols)
   );
   if(Array.isArray(preset.stView)){
    setStViewOverride([...new Set(preset.stView.map(normalized).filter(code=>defaultStView.has(code)))]);
   }
   setFilterNextMain(preset.filters?.nextMain||"");
   const presetNextOperation=normalized(preset.filters?.nextOperation||"");
   setFilterNextOperation(presetNextOperation&&defaultStView.has(presetNextOperation)?presetNextOperation:"");
   setFilterPrimer1(preset.filters?.primer1||"");
   setFilterPrimer2(preset.filters?.primer2||"");
   setFilterPrimer3(preset.filters?.primer3||"");
   setFilterRouteMain(preset.filters?.routeMain||{});
   const presetColFilters={...(preset.filters?.colFilters||{})};
   delete presetColFilters["__current_main"];
   for(const key of Object.keys(presetColFilters)){
    if(key.startsWith("source:")&&isHiddenPlanningBoardSourceColumn(key.slice("source:".length)))delete presetColFilters[key];
   }
   setColFilters(presetColFilters);

   const validSortFields=new Set(candidateSortFields.map(x=>x.key));
   const rules=(preset.sortRules||[])
    .filter(r=>validSortFields.has(r.field) && ["asc","desc"].includes(r.direction))
    .slice(0,10);

   setSortRules(
    rules.length
     ? rules
     : [
        {field:"next_main",direction:"asc"},
        {field:"next_operation",direction:"asc"},
        {field:"primer1",direction:"asc"}
       ]
   );

   if(["normal","compact","ultra"].includes(String(preset.density||""))){
     setCandidateDensity(preset.density as "normal"|"compact"|"ultra");
   }

   if(typeof preset.routeFocus==="boolean"){
     setRouteFocus(preset.routeFocus);
   }
 };

 const findDefaultView=()=>{
   const views=readOperationViews();

   // 1. Exact Operation Default
   if(standardOperation){
     const opKey=`OP:${standardOperation}`;
     if(views[opKey])return {key:opKey,preset:views[opKey]};

     // Backward compatibility with previous versions where Operation name itself was the key.
     if(views[standardOperation])
       return {key:standardOperation,preset:views[standardOperation]};
   }

   // 2. Area Default
   if(selectedAreaId){
     const areaKey=`AREA:${selectedAreaId}`;
     if(views[areaKey])return {key:areaKey,preset:views[areaKey]};
   }

   // 3. System Default
   if(views.SYSTEM)return {key:"SYSTEM",preset:views.SYSTEM};

   return null;
 };

 const loadCurrentDefault=()=>{
   const found=findDefaultView();

   if(!found){
     setViewLoadedFor("");
     setViewMessage(erpMode?`${exactViewLabel}: chưa có bố cục mặc định.`:`${exactViewLabel}: chưa có Default View.`);
     setTimeout(()=>setViewMessage(""),1800);
     return false;
   }

   applyViewPreset(found.preset);
   setViewLoadedFor(found.key);

   const label=
    found.key.startsWith("OP:")
     ?`${erpMode?"Main Operation":"Operation"} ${found.key.slice(3)}`
     :found.key.startsWith("AREA:")
      ?(erpMode?"Bố cục khu vực":"Area Default")
      :found.key==="SYSTEM"
       ?(erpMode?"Bố cục hệ thống":"System Default")
       :`${erpMode?"Main Operation":"Operation"} ${found.key}`;

   setViewMessage(erpMode?`Đã áp dụng ${label}.`:`Đã load ${label}.`);
   setTimeout(()=>setViewMessage(""),1800);
   return true;
 };

 const saveCurrentDefault=async()=>{
   const payload:CandidateViewPreset={
     columns:[...configurableActiveColumns],
     columnLayout:[...effectiveColumnLayout],
     stView:[...effectiveStView],
     filters:{
      nextMain:filterNextMain,
      nextOperation:filterNextOperation,
      primer1:filterPrimer1,
      primer2:filterPrimer2,
      primer3:filterPrimer3,
      routeMain:filterRouteMain,
      colFilters
     },
     sortRules:[...sortRules],
     density:candidateDensity,
     routeFocus
   };

   // Cập nhật ngay trên màn hình (optimistic).
   const views={...(serverViews||{}),[exactViewKey]:payload};
   setServerViews(views);
   try{window.localStorage.setItem(VIEW_STORAGE_KEY,JSON.stringify(views));}catch{}

   try{
     const r=await fetch("/api/planning/board-view",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({action:"save",view_key:exactViewKey,payload})
     });
     const d=await safeJson(r);
     if(!r.ok)throw new Error(d?.error||(erpMode?"Không lưu được bố cục mặc định.":"Không lưu được Default View."));

     setViewLoadedFor(exactViewKey);
     setViewMessage(erpMode?`Đã lưu bố cục mặc định cho ${exactViewLabel}.`:`Đã lưu Default View cho ${exactViewLabel} (đã lưu trên máy chủ — dùng chung mọi môi trường).`);
   }catch(e){
     setViewMessage(erpMode?`Không lưu được bố cục mặc định: ${e instanceof Error?e.message:String(e)}`:`Không lưu được Default View: ${e instanceof Error?e.message:String(e)}`);
   }
   setTimeout(()=>setViewMessage(""),2600);
 };

 const deleteCurrentDefault=async()=>{
   const views=readOperationViews();

   if(!views[exactViewKey]){
     setViewMessage(erpMode?`${exactViewLabel}: không có bố cục mặc định riêng để xóa.`:`${exactViewLabel}: không có Default View riêng để xóa.`);
     setTimeout(()=>setViewMessage(""),1800);
     return;
   }

   const next={...views};
   delete next[exactViewKey];
   setServerViews(next);
   try{window.localStorage.setItem(VIEW_STORAGE_KEY,JSON.stringify(next));}catch{}

   try{
     const r=await fetch("/api/planning/board-view",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({action:"delete",view_key:exactViewKey})
     });
     await safeJson(r);
   }catch(e){
     setViewMessage(erpMode?`Không xóa được bố cục mặc định: ${e instanceof Error?e.message:String(e)}`:`Xóa Default View thất bại: ${e instanceof Error?e.message:String(e)}`);
     setTimeout(()=>setViewMessage(""),2600);
     return;
   }

   setViewLoadedFor("");
   setViewMessage(erpMode?`Đã xóa bố cục mặc định của ${exactViewLabel}.`:`Đã xóa Default View của ${exactViewLabel} trên máy chủ.`);
   setTimeout(()=>setViewMessage(""),2000);
 };

 const resetToCurrentDefault=()=>{
   if(!loadCurrentDefault()){
     resetDisplayRules();
   }
 };

 useEffect(()=>{
   if(!allColumns.length)return;

   // Auto-load follows the same precedence:
   // Operation -> Area -> System.
   const found=findDefaultView();
   if(found){
     applyViewPreset(found.preset);
     setViewLoadedFor(found.key);
   }else{
     setViewLoadedFor("");
   }
 },[standardOperation,selectedAreaId,configurableColumns,serverViews]);
 const persistColumnsToView=async(next:string[],nextLayout:string[]=effectiveColumnLayout)=>{
   try{
    const views=readOperationViews();
    const existing=views[exactViewKey];
    const payload:CandidateViewPreset={
     columns:next,
     columnLayout:[...nextLayout],
     stView:[...effectiveStView],
     filters:existing?.filters ?? {nextMain:filterNextMain,nextOperation:filterNextOperation,primer1:filterPrimer1,primer2:filterPrimer2,primer3:filterPrimer3,routeMain:filterRouteMain,colFilters},
     sortRules:existing?.sortRules ?? [...sortRules],
     density:existing?.density ?? candidateDensity,
     routeFocus:existing?.routeFocus ?? routeFocus
    };
    const nextViews={...views,[exactViewKey]:payload};
    setServerViews(nextViews);
    try{window.localStorage.setItem(VIEW_STORAGE_KEY,JSON.stringify(nextViews));}catch{}
    await fetch("/api/planning/board-view",{
     method:"POST",
     headers:{"content-type":"application/json"},
     body:JSON.stringify({action:"save",view_key:exactViewKey,payload})
    });
   }catch{}
 };

 const normalizeLayoutForVisible=(layout:string[],visible:string[])=>{
   const visibleSet=new Set(visible);
   const out:string[]=[];
   const seen=new Set<string>();
   let hasGroup=false;
   for(const raw of layout){
    const item=String(raw||"");
    if(item===ALL_OPEN_JOB_GROUP_KEY){
     if(!hasGroup){out.push(item);hasGroup=true;}
     continue;
    }
    if(!visibleSet.has(item)||!configurableKeySet.has(item)||seen.has(item))continue;
    seen.add(item);out.push(item);
   }
   if(!hasGroup)out.push(ALL_OPEN_JOB_GROUP_KEY);
   const groupIndex=Math.max(0,out.indexOf(ALL_OPEN_JOB_GROUP_KEY));
   const missingPlanning=visible.filter(key=>!key.startsWith("source:")&&!seen.has(key));
   if(missingPlanning.length)out.splice(groupIndex,0,...missingPlanning);
   return out;
 };

 const saveColumns=(next:string[],nextLayout?:string[])=>{
   const seen=new Set<string>();
   const sanitized=next.filter(key=>{
    if(!configurableKeySet.has(key)||key.startsWith("route-main:")||seen.has(key))return false;
    seen.add(key);return true;
   });
   const layout=normalizeLayoutForVisible(nextLayout??effectiveColumnLayout,sanitized);
   setVisibleColumns(sanitized);
   setColumnLayout(layout);
   try{
    window.localStorage.setItem(columnStorageKey,JSON.stringify(sanitized));
    window.localStorage.setItem(columnLayoutStorageKey,JSON.stringify(layout));
   }catch{}
   // Route/Main columns are automatic and are deliberately not persisted here.
   void persistColumnsToView(sanitized,layout);
 };

 // v245/v291: đổi VIEW CÔNG ĐOẠN ST → lọc NGAY trên dữ liệu đã tải.
 // Main columns update from the matching Jobs' AllOperation; to fetch Jobs from
 // newly selected NextOperations that are not on this page yet, press Apply.
 const changeStView=(next:string[])=>{
   setStViewOverride(next);
 };

 const toggleColumn=(key:string)=>{
   if(key.startsWith("route-main:"))return;
   if(configurableActiveColumns.includes(key)){
    saveColumns(
     configurableActiveColumns.filter(x=>x!==key),
     effectiveColumnLayout.filter(x=>x!==key)
    );
    return;
   }
   const nextVisible=[...configurableActiveColumns,key];
   if(key.startsWith("source:")){
    // Source columns enter the All Open Job package by default.
    saveColumns(nextVisible,effectiveColumnLayout);
   }else{
    const nextLayout=[...effectiveColumnLayout];
    const groupIndex=nextLayout.indexOf(ALL_OPEN_JOB_GROUP_KEY);
    nextLayout.splice(groupIndex<0?nextLayout.length:groupIndex,0,key);
    saveColumns(nextVisible,nextLayout);
   }
 };

 const moveLayoutItemTo=(key:string,targetIndex:number)=>{
   const current=[...effectiveColumnLayout];
   const index=current.indexOf(key);
   if(index<0)return;
   const next=[...current];
   next.splice(index,1);
   const safe=Math.max(0,Math.min(targetIndex,next.length));
   next.splice(safe,0,key);
   saveColumns(configurableActiveColumns,next);
 };
 const moveLayoutItem=(key:string,direction:-1|1)=>{
   const index=effectiveColumnLayout.indexOf(key);
   if(index<0)return;
   const target=index+direction;
   if(target<0||target>=effectiveColumnLayout.length)return;
   moveLayoutItemTo(key,target);
 };

 const placeSourceRelativeToGroup=(key:string,side:"before"|"after")=>{
   if(!key.startsWith("source:"))return;
   const nextVisible=configurableActiveColumns.includes(key)
    ?[...configurableActiveColumns]
    :[...configurableActiveColumns,key];
   const nextLayout=effectiveColumnLayout.filter(x=>x!==key);
   let groupIndex=nextLayout.indexOf(ALL_OPEN_JOB_GROUP_KEY);
   if(groupIndex<0){nextLayout.push(ALL_OPEN_JOB_GROUP_KEY);groupIndex=nextLayout.length-1;}
   const insertAt=side==="before"?groupIndex:groupIndex+1;
   nextLayout.splice(insertAt,0,key);
   saveColumns(nextVisible,nextLayout);
 };

 const putSourceInGroup=(key:string)=>{
   if(!key.startsWith("source:"))return;
   const nextVisible=configurableActiveColumns.includes(key)
    ?[...configurableActiveColumns]
    :[...configurableActiveColumns,key];
   saveColumns(nextVisible,effectiveColumnLayout.filter(x=>x!==key));
 };

 const collapseAllOpenJobColumns=()=>{
   const nextLayout=effectiveColumnLayout.filter(x=>!x.startsWith("source:"));
   saveColumns(configurableActiveColumns,nextLayout);
 };

 const orderedColumnChoices=useMemo(()=>{
   const byKey=new Map<string,CandidateColumn>(
    configurableColumns.map((c:CandidateColumn)=>[c.key,c] as [string,CandidateColumn])
   );
   const ordered:CandidateColumn[]=[];

   for(const key of configurableActiveColumns){
     const col=byKey.get(key);
     if(col)ordered.push(col);
   }

   for(const col of configurableColumns){
     if(!configurableActiveColumns.includes(col.key))ordered.push(col);
   }

   return ordered;
 },[configurableColumns,configurableActiveColumns]);

 const filteredColumnChoices=orderedColumnChoices.filter(c=>{
   const q=columnSearch.trim().toUpperCase();
   return !q || c.label.toUpperCase().includes(q);
 });

 const displaySourceValue=(v:unknown)=>{
   if(v===null||v===undefined||v==="")return "—";
   if(typeof v==="number")return formatNumber(v);
   if(typeof v==="object"){
     try{return JSON.stringify(v)}catch{return String(v)}
   }
   return String(v);
 };

 function normalized(v:unknown){return String(v??"").trim().toUpperCase();}

const currentPriorityMonth=useMemo(()=>{
   const m=String(today||"").match(/^(\d{4})-(\d{2})-\d{2}$/);
   if(!m)return "";

   const year=Number(m[1]);
   const month=Number(m[2]);
   if(!Number.isFinite(year)||!Number.isFinite(month)||month<1||month>12)return "";

   const names=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
   return `${names[month-1]}-${String(year).slice(-2)}`;
 },[today]);

 const priorityRank=(value:unknown)=>{
   const p=normalized(value)
    .replace(/\s+/g," ")
    .replace(/_/g,"-");

   if(p==="CAT3" || p.startsWith("CAT3 "))return 400;
   if(p==="CAT5" || p.startsWith("CAT5 "))return 300;

   if(
     p==="SALE" ||
     p==="SALES" ||
     p.startsWith("SALE ") ||
     p.startsWith("SALES ")
   )return 200;

   if(currentPriorityMonth){
     const monthCompact=currentPriorityMonth.replace("-","");
     const pCompact=p.replace(/[-\/\s]/g,"");

     if(
       p===currentPriorityMonth ||
       p.startsWith(`${currentPriorityMonth} `) ||
       pCompact===monthCompact ||
       pCompact.startsWith(monthCompact)
     )return 100;
   }

   return 0;
 };

 const priorityClass=(value:unknown)=>{
   const rank=priorityRank(value);
   if(rank===400)return "priority-cat3";
   if(rank===300)return "priority-cat5";
   if(rank===200)return "priority-sales";
   if(rank===100)return "priority-current-month";
   return "";
 };

 const distinctValues=(get:(x:Candidate)=>unknown)=>[
   ...new Set(candidates.map(get).map(v=>String(v??"").trim()).filter(Boolean))
 ].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"}));

 const nextMainOptions=useMemo(()=>distinctValues(x=>x.next_standard_operation),[candidates]);
 // Raw shop-floor NextOperation comes from All Open Job/imported open_job_current.
 // It may contain codes that are not yet configured in ST Operation Mapping.
 const nextOperationOptions=useMemo(()=>distinctValues(x=>x.next_operation),[candidates]);
 const primer1Options=useMemo(()=>distinctValues(x=>x.part_master_primer1),[candidates]);
 const primer2Options=useMemo(()=>distinctValues(x=>x.part_master_primer2),[candidates]);
 const primer3Options=useMemo(()=>distinctValues(x=>x.part_master_primer3),[candidates]);

 const sourceSortValue=(value:unknown):string|number=>{
   if(value===null || value===undefined || value==="")return "";

   if(typeof value==="number" && Number.isFinite(value))
     return value;

   if(typeof value==="boolean")
     return value?1:0;

   const raw=String(value).trim();
   if(!raw)return "";

   const compact=raw.replace(/\s/g,"");

   // Plain numeric: 1, 2.5, -3
   if(/^[-+]?\d+(?:\.\d+)?$/.test(compact)){
     const n=Number(compact);
     if(Number.isFinite(n))return n;
   }

   // US grouping: 1,234 or 1,234.56
   if(/^[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(compact)){
     const n=Number(compact.replace(/,/g,""));
     if(Number.isFinite(n))return n;
   }

   return normalized(raw);
 };

 const getColumnSortValue=(x:Candidate,key:string):string|number=>{
   switch(key){
     case "standard_operation":
       return normalized(x.standard_operation);
     case "job":
       return normalized(x.job_num);

     case "part_rev":
       return `${normalized(x.part_num)}\u0001${normalized(x.revision_num)}`;

     case "qty":
       return Number(x.plan_qty||0);

     case "surface":
       return Number(x.plan_surface||0);

     case "source_op":
       return normalized(x.source_operation_code);

     case "previous_op":
       return normalized(x.previous_standard_operation||"START");

     case "next_op":
       return normalized(x.next_standard_operation||"END");

     case "recipe":
       return `${normalized(x.recipe_no)}\u0001${normalized(x.recipe_name)}`;

     case "primer1":
       return sourceSortValue(x.part_master_primer1);

     case "primer2":
       return sourceSortValue(x.part_master_primer2);

     case "primer3":
       return sourceSortValue(x.part_master_primer3);

     case "priority":
       return normalized(x.priority_type);

     case "status":
       return normalized(x.planning_status);

     case "batch_no":
       return normalized(x.batch_no);

     case "previous_status":
       return `${normalized(x.previous_planning_operation||"START")}\u0001${normalized(x.previous_planning_status)}`;

     case "previous_batch_no":
       return normalized(x.previous_batch_no);

     case "actual_progress":
       return `${normalized(x.last_operation||"START")}\u0001${normalized(x.next_operation||"END")}`;

     default:
       if(key.startsWith("route-main:")){
         const mainOperation=normalized(key.slice("route-main:".length));
         const items=(x.route_status||[])
          .filter(r=>
           normalized(
            r.standard_operation ||
            (normalized(r.source_operation)==="PIONBL"?"PIONBL":"")
           )===mainOperation
          )
          .sort((a,b)=>Number(a.source_seq||0)-Number(b.source_seq||0));

         const statusRank:Record<string,number>={
          "DONE":10,
          "COMPLETED":20,
          "RUNNING":30,
          "SCHEDULED":40,
          "PLANNED-UNSCHEDULED":50,
          "READY":60,
          "WAITING":70,
          "HOLD":80
         };

         const item=
          items.find(r=>!["DONE","COMPLETED"].includes(String(r.route_status))) ||
          items[items.length-1];

         return `${String(statusRank[item?.route_status||""]??999).padStart(3,"0")}${normalized(item?.batch_no)}`;
       }

       // Dynamic All Open Job columns are stored as:
       // allColumns key = source:<original Excel column>
       if(key.startsWith("source:")){
         const sourceKey=key.slice("source:".length);
         return sourceSortValue(x.source_data?.[sourceKey]);
       }

       return "";
   }
 };

 // Latest canonical NextOperation presentation order:
 // RAW NextOperation -> ST Operation Mapping -> Main Operation -> Main Planning Order.
 // md_operation.planning_sort_order is only an optional tie-breaker inside the same Main.
 const mainPlanningOrderByCode=useMemo(()=>{
   const map=new Map<string,number>();
   for(const op of mainOperations){
    const key=normalized(op.standard_operation);
    const order=Number(op.planning_sort_order);
    if(key&&Number.isFinite(order))map.set(key,order);
   }
   return map;
 },[mainOperations]);
 const mappedMainBySource=useMemo(()=>{
   const map=new Map<string,string>();
   for(const m of operationMappings){
    const source=normalized(m.source_operation_code);
    const main=normalized(m.standard_operation_rule);
    if(source&&main&&!map.has(source))map.set(source,main);
   }
   return map;
 },[operationMappings]);

 const getSortValue=(x:Candidate,field:string):string|number=>{
   // Every visible/selectable Candidate column.
   if(field.startsWith("column:")){
     return getColumnSortValue(x,field.slice("column:".length));
   }

   // Convenience/special fields kept for existing saved views.
   switch(field){
     case "next_main":
       return normalized(x.next_standard_operation||"END");

     case "primer1":
       return sourceSortValue(x.part_master_primer1);

     case "primer2":
       return sourceSortValue(x.part_master_primer2);

     case "primer3":
       return sourceSortValue(x.part_master_primer3);

     case "recipe":
       return `${normalized(x.recipe_no)}\u0001${normalized(x.recipe_name)}`;

     case "previous_batch":
       return normalized(x.previous_batch_no);

     case "part":
       return normalized(x.part_num);

     case "program":
       return normalized(x.program);

     case "qty":
       return Number(x.plan_qty||0);

     case "surface":
       return Number(x.plan_surface||0);

     case "job":
     default:
       return normalized(x.job_num);
   }
 };

 // v238: Công đoạn được chọn trong bảng "Công đoạn" kiêm bộ LỌC JOB:
 // bỏ chọn hết → Candidate Jobs EMPTY; chọn một phần → chỉ hiện Job liên quan
 // tới các công đoạn đang chọn (có ô trạng thái ở cột đó, kể cả ô fallback của
 // Candidate Main). Khớp cùng quy tắc render ô ma trận (standard_operation + PIONBL).
 // v239 (đơn giản theo ý user): Candidate Jobs chỉ hiện Job có NEXT OPERATION
 // thuộc các công đoạn ST (danh sách panel "Các công đoạn được hiển thị").
 // Bỏ chọn hết trong bảng "Công đoạn" → danh sách Job trống; chọn một phần →
 // chỉ Job có next operation thuộc nhóm source của công đoạn đang chọn.
 // V404 — VIEW CÔNG ĐOẠN ST is a subset of the canonical ST RAW catalog:
 // direct Planning Operations + active Bridge Intermediate Operations. A Job
 // still needs the live Current Main already resolved by Planning Chain; the
 // selector cannot create or widen a chain by itself.
 const allNextOps=useMemo(()=>{
   const seen=new Set<string>();
   const panel=new Set<string>();
   const jobsByCode=new Map<string,number>();
   for(const n of (nextOperations||[]))jobsByCode.set(normalized(n.operation_code),Number(n.jobs||0));
   for(const x of (stOperations||[])){
    const type=normalized(x.operation_type);
    if(type!=="PLANNING_OPERATION"&&type!=="INTERMEDIATE")continue;
    const c=normalized(x.operation_code);
    if(c)panel.add(c);
   }
   const out:{code:string;jobs:number;inPanel:boolean}[]=[];
   for(const code of panel){
    if(!code||seen.has(code))continue;
    seen.add(code);
    out.push({code,jobs:Number(jobsByCode.get(code)||0),inPanel:true});
   }
   return out.sort((a,b)=>Number(b.jobs)-Number(a.jobs)||a.code.localeCompare(b.code));
  },[nextOperations,stOperations]);

 const loadedByOp=useMemo(()=>{
   const m=new Map<string,number>();
   for(const x of candidates){
    const op=normalized(x.next_operation);
    if(op)m.set(op,(m.get(op)||0)+1);
   }
   return m;
  },[candidates]);

 const filteredAllOps=useMemo(()=>{
   const q=opSearch.trim().toUpperCase();
   return allNextOps.filter(o=>!q||o.code.includes(q));
  },[allNextOps,opSearch]);

 const routeOpMatch=(x:Candidate)=>{
   const nextOp=normalized(x.next_operation);
   return Boolean(nextOp)&&effectiveStView.has(nextOp);
 };

 const routeStatusFilterPass=(x:Candidate)=>{
   const entries=Object.entries(filterRouteMain);
   if(!entries.length)return true;
   const route=Array.isArray(x.route_status)?x.route_status:[];
   for(const [op,val] of entries){
    if(!op||!val)continue;
    const items=route.filter(r=>normalized(r.standard_operation)===op);
    if(val==="__ANY__"){if(!items.length)return false;continue;}
    if(val==="__NONE__"){if(items.length)return false;continue;}
    if(!items.some(r=>normalized(r.route_status)===val))return false;
   }
   return true;
  };

 // V426: READY is split by the immediate Previous Main scheduling context.
 // This is a read/filter classification only; it does not change Planning Chain.
 const readyPreviousScheduleState=(x:Candidate,mainOperation:string):"SCHEDULED"|"UNSCHEDULED"|null=>{
  const main=normalized(mainOperation);
  if(!main)return null;
  const route=(Array.isArray(x.route_status)?x.route_status:[])
   .filter(r=>r.standard_operation&&normalized(r.standard_operation)!=="PIONBL")
   .sort((a,b)=>Number(a.source_seq||0)-Number(b.source_seq||0));

  const targets=route.filter(r=>normalized(r.standard_operation)===main&&normalized(r.route_status)==="READY");
  const target=targets[0]||null;
  if(!target)return null;

  let previous:RouteStatusItem|null=null;
  const targetSeq=Number(target.source_seq);
  if(Number.isFinite(targetSeq)){
   for(const item of route){
    const seq=Number(item.source_seq);
    if(!Number.isFinite(seq)||seq>=targetSeq)break;
    previous=item;
   }
  }

  // First Main / no previous Main belongs to the "not scheduled / START" side.
  if(!previous)return "UNSCHEDULED";
  return previous.schedule_id&&previous.planned_start?"SCHEDULED":"UNSCHEDULED";
 };

 const workloadReadyPreviousFilterPass=(x:Candidate)=>{
  if(!workloadDrill)return true;
  if(workloadDrill.bucket!=="READY_PREV_SCHEDULED"&&workloadDrill.bucket!=="READY_PREV_UNSCHEDULED")return true;
  const state=readyPreviousScheduleState(x,workloadDrill.main);
  return workloadDrill.bucket==="READY_PREV_SCHEDULED"?state==="SCHEDULED":state==="UNSCHEDULED";
 };

 // v339: giá trị hiển thị của 1 dòng theo cột (để lọc Excel-style).
 // Trả về MẢNG — cột route có thể có nhiều occurrence.
 const colFilterValues=(x:Candidate,key:string):string[]=>{
   const one=(v:unknown)=>[String(v??"").trim()];
   switch(key){
    case "job": return one(x.job_num);
    case "standard_operation": return one(x.standard_operation);
    case "part_rev": return [`${x.part_num||""} / ${x.revision_num||""}`.replace(/\s*\/\s*$/,"")];
    case "qty": return one(x.plan_qty==null?"":String(x.plan_qty));
    case "surface": return one(x.plan_surface==null?"":String(x.plan_surface));
    case "source_op": return one(x.source_operation_code);
    case "previous_op": return one(x.previous_standard_operation||"START");
    case "next_op": return one(x.next_standard_operation||"END");
    case "recipe": return one(x.recipe_no||x.recipe_key||"");
    case "primer1": return one(x.part_master_primer1||"—");
    case "primer2": return one(x.part_master_primer2||"—");
    case "primer3": return one(x.part_master_primer3||"—");
    case "priority": return one(x.priority_type||"—");
    case "status": return one(x.planning_status);
    case "batch_no": return one(x.batch_no||"—");
    case "previous_status": return one(x.previous_planning_status||"—");
    case "previous_batch_no": return one(x.previous_batch_no||"—");
    case "actual_progress": return one(`${x.last_operation||"START"} → ${x.next_operation||"END"}`);
    default:
     if(key.startsWith("route-main:")){
      const op=normalized(key.slice("route-main:".length));
      const items=(x.route_status||[]).filter(r=>normalized(r.standard_operation)===op);
      if(!items.length)return ["—"];
      return [...new Set(items.map(r=>String(r.route_status||"").trim()).filter(Boolean))];
     }
     if(key.startsWith("source:")){
      const sk=key.slice("source:".length);
      const v=displaySourceValue((x.source_data||{})[sk]);
      return one(v);
     }
     return [];
   }
  };

 const colFilterPass=(x:Candidate)=>{
   const entries=Object.entries(colFilters);
   if(!entries.length)return true;
   for(const [key,sel] of entries){
    if(!sel.length)continue;
    const vals=colFilterValues(x,key).filter(Boolean);
    if(!vals.some(v=>sel.includes(v)))return false;
   }
   return true;
  };

 const openColFilter=(key:string,e:ReactMouseEvent)=>{
   e.preventDefault();
   e.stopPropagation();
   const th=(e.currentTarget as HTMLElement).closest("th");
   const rect=th?.getBoundingClientRect();
   if(!rect)return;
   setColFilterSearch("");
   setColFilterMenu({key,rect:{left:rect.left,top:rect.bottom,width:rect.width}});
  };

 const toggleColFilterValue=(key:string,v:string)=>{
   setColFilters(prev=>{
    const sel=prev[key]||[];
    const next=sel.includes(v)?sel.filter(x=>x!==v):[...sel,v];
    const copy={...prev};
    if(next.length)copy[key]=next;else delete copy[key];
    return copy;
   });
  };

 const setAllColFilter=(key:string,vals:string[])=>{
   setColFilters(prev=>{
    const copy={...prev};
    if(vals.length)copy[key]=vals;else delete copy[key];
    return copy;
   });
  };

 // v339: danh sách giá trị distinct của cột đang mở menu (kèm search).
 const colFilterOptions=useMemo(()=>{
   if(!colFilterMenu)return [];
   const key=colFilterMenu.key;
   const set=new Set<string>();
   for(const x of candidates){
    for(const v of colFilterValues(x,key)){
     const s=String(v??"").trim();
     if(s)set.add(s);
    }
   }
   const q=colFilterSearch.trim().toUpperCase();
   return [...set]
    .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"}))
    .filter(v=>!q||v.toUpperCase().includes(q));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[colFilterMenu,colFilterSearch,candidates]);

 const colFilterMenuLabel=useMemo(()=>{
   if(!colFilterMenu)return "";
   const key=colFilterMenu.key;
   return allColumns.find(c=>c.key===key)?.label||key;
 },[colFilterMenu,allColumns]);

 useEffect(()=>{
   if(!colFilterMenu)return;
   const close=()=>setColFilterMenu(null);
   const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")close();};
   window.addEventListener("click",close);
   window.addEventListener("keydown",onKey);
   window.addEventListener("scroll",close,true);
   return ()=>{
    window.removeEventListener("click",close);
    window.removeEventListener("keydown",onKey);
    window.removeEventListener("scroll",close,true);
   };
 },[colFilterMenu]);

 const displayCandidates=useMemo(()=>{
   const filtered=candidates.filter(x=>
     (!filterNextMain || normalized(x.next_standard_operation||"END")===normalized(filterNextMain)) &&
     (!filterNextOperation || normalized(x.next_operation)===normalized(filterNextOperation)) &&
     (!filterPrimer1 || normalized(x.part_master_primer1)===normalized(filterPrimer1)) &&
     (!filterPrimer2 || normalized(x.part_master_primer2)===normalized(filterPrimer2)) &&
     (!filterPrimer3 || normalized(x.part_master_primer3)===normalized(filterPrimer3)) &&
     routeOpMatch(x) &&
     routeStatusFilterPass(x) &&
     workloadReadyPreviousFilterPass(x) &&
     colFilterPass(x) &&
     (statusFilter===""
       || (statusFilter==="NO_CHAIN"&&x.has_planning_chain===false)
       || (statusFilter==="ELIGIBLE"&&x.planning_status==="ELIGIBLE")
       || (statusFilter==="PLANNED"&&x.planning_status==="PLANNED")
       || (statusFilter==="HOLD"&&x.planning_status==="HOLD")
       || (statusFilter==="WAIT"&&x.planning_status==="LOCKED"&&x.has_planning_chain!==false))
   );

   return [...filtered].sort((a,b)=>{
     // Sort Priority remains the only presentation order. When NextOperation is selected,
     // resolve RAW -> Main and inherit Main Planning Order; no hidden level precedes user rules.
     for(const rule of sortRules){
       let cmp=0;

       if(rule.field==="next_operation"){
         const aRaw=normalized(a.next_operation);
         const bRaw=normalized(b.next_operation);
         const aMain=mappedMainBySource.get(aRaw)||normalized(a.standard_operation);
         const bMain=mappedMainBySource.get(bRaw)||normalized(b.standard_operation);
         const aMainOrder=mainPlanningOrderByCode.get(aMain);
         const bMainOrder=mainPlanningOrderByCode.get(bMain);
         const aMainMissing=aMainOrder===undefined;
         const bMainMissing=bMainOrder===undefined;
         // Main without Main Planning Order always stays at the end.
         if(aMainMissing!==bMainMissing)return aMainMissing?1:-1;
         if(!aMainMissing&&!bMainMissing)cmp=Number(aMainOrder)-Number(bMainOrder);
         // Keep different Mains grouped deterministically if their order is equal/missing.
         if(cmp===0)cmp=aMain.localeCompare(bMain,undefined,{numeric:true,sensitivity:"base"});

         if(cmp===0){
          // Old Operation Code Order is only a tie-breaker inside the same Main.
          const aCodeOrderRaw=a.next_operation_planning_sort_order;
          const bCodeOrderRaw=b.next_operation_planning_sort_order;
          const aCodeOrder=Number(aCodeOrderRaw);
          const bCodeOrder=Number(bCodeOrderRaw);
          const aCodeMissing=aCodeOrderRaw===null||aCodeOrderRaw===undefined||!Number.isFinite(aCodeOrder);
          const bCodeMissing=bCodeOrderRaw===null||bCodeOrderRaw===undefined||!Number.isFinite(bCodeOrder);
          if(aCodeMissing!==bCodeMissing)return aCodeMissing?1:-1;
          if(!aCodeMissing&&!bCodeMissing)cmp=aCodeOrder-bCodeOrder;
         }
         if(cmp===0)cmp=aRaw.localeCompare(bRaw,undefined,{numeric:true,sensitivity:"base"});
       }else if(rule.field==="priority"){
         cmp=priorityRank(a.priority_type)-priorityRank(b.priority_type);
       }else{
         const av=getSortValue(a,rule.field);
         const bv=getSortValue(b,rule.field);
         if(typeof av==="number" && typeof bv==="number")cmp=av-bv;
         else cmp=String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:"base"});
       }

       if(cmp!==0)return rule.direction==="desc"?-cmp:cmp;
     }

     // Stable deterministic fallback only; it is not a user-visible sort level.
     return normalized(a.job_num).localeCompare(
      normalized(b.job_num),undefined,{numeric:true,sensitivity:"base"}
     );
   });
 },[
   candidates,filterNextMain,filterNextOperation,
   filterPrimer1,filterPrimer2,filterPrimer3,sortRules,stOperations,effectiveStView,statusFilter,filterRouteMain,colFilters,
   mappedMainBySource,mainPlanningOrderByCode,workloadDrill
 ]);

 const candidateIdentityKey=useMemo(
  ()=>candidates.map(x=>String(x.id)).join(","),
  [candidates]
 );
 const displayRuleKey=useMemo(()=>JSON.stringify({
  filterNextMain,filterNextOperation,filterPrimer1,filterPrimer2,filterPrimer3,statusFilter,filterRouteMain,colFilters,sortRules
 }),[filterNextMain,filterNextOperation,filterPrimer1,filterPrimer2,filterPrimer3,statusFilter,filterRouteMain,colFilters,sortRules]);
 useEffect(()=>{
  setCandidateDomLimit(CANDIDATE_INITIAL_DOM_ROWS);
 },[candidateIdentityKey,displayRuleKey]);

 const eligibleCandidates=useMemo(
   ()=>displayCandidates.filter(x=>x.planning_status==="ELIGIBLE"),
   [displayCandidates]
 );

 const plannedCandidates=useMemo(
   ()=>displayCandidates.filter(x=>x.planning_status==="PLANNED"),
   [displayCandidates]
 );

 const waitingCandidates=useMemo(
   ()=>displayCandidates.filter(x=>x.planning_status==="LOCKED"&&x.has_planning_chain!==false),
   [displayCandidates]
 );

 const holdCandidates=useMemo(
   ()=>displayCandidates.filter(x=>x.planning_status==="HOLD"),
   [displayCandidates]
 );

 const noChainCandidates=useMemo(
   ()=>displayCandidates.filter(x=>x.has_planning_chain===false),
   [displayCandidates]
 );


 const selectedTargets=useMemo(()=>{
   const out:{
    id:number;
    candidate:Candidate;
    standardOperation:string;
    sourceOperation:string;
    routeItem:RouteStatusItem|null;
   }[]=[];

   for(const id of selected){
     const direct=candidates.find(x=>x.id===id);
     if(direct){
      out.push({
       id,
       candidate:direct,
       standardOperation:direct.standard_operation,
       sourceOperation:direct.source_operation_code,
       routeItem:null
      });
      continue;
     }

     for(const candidate of candidates){
      const item=(candidate.route_status||[]).find(
       r=>Number(r.planning_job_operation_id)===id
      );
      if(!item)continue;
      out.push({
       id,
       candidate,
       standardOperation:String(item.standard_operation||""),
       sourceOperation:String(item.source_operation||""),
       routeItem:item
      });
      break;
     }
   }

   const seen=new Set<number>();
   return out.filter(x=>{
    if(seen.has(x.id))return false;
    seen.add(x.id);
    return true;
   });
 },[candidates,selected]);

 const selectedRows=useMemo(
   ()=>selectedTargets.map(x=>x.candidate),
   [selectedTargets]
 );

 // v342: Tổng hợp Recipe theo CHÍNH Planning Operation target đang được chọn.
 // Candidate row chỉ là dòng đại diện để hiển thị; checkbox/cell có thể trỏ tới
 // Current Main hoặc immediate-next Main đang READY. Các Main sau đó luôn WAIT.
 // Không được dùng candidate.effective_recipe_key khi target là Main khác.
 const selectedRecipeTargets=useMemo(()=>selectedTargets.map(target=>{
   const routeItem=target.routeItem;
   const exactCandidateTarget=
     normalized(target.standardOperation)===normalized(target.candidate.standard_operation) &&
     normalized(target.sourceOperation)===normalized(target.candidate.source_operation_code);

   if(routeItem){
     return {
       target,
       recipeKey:routeItem.effective_recipe_key||null,
       recipeMappingId:routeItem.effective_recipe_mapping_id||null,
       recipeNo:routeItem.effective_recipe_no||null,
       recipeName:routeItem.effective_recipe_name||null,
       batchKey:routeItem.batch_key_suggest||null,
       batchPrefix:routeItem.batch_prefix_suggest||null
     };
   }

   return {
     target,
     recipeKey:exactCandidateTarget?target.candidate.effective_recipe_key:null,
     recipeMappingId:exactCandidateTarget?(target.candidate.effective_recipe_mapping_id||null):null,
     recipeNo:exactCandidateTarget?target.candidate.recipe_no:null,
     recipeName:exactCandidateTarget?target.candidate.recipe_name:null,
     batchKey:exactCandidateTarget?target.candidate.batch_key_suggest:null,
     batchPrefix:exactCandidateTarget?target.candidate.batch_prefix_suggest:null
   };
 }),[selectedTargets]);

 const suggestionSummary=useMemo(()=>{
   if(!selectedRecipeTargets.length)return null;

   const withRecipe=selectedRecipeTargets.filter(x=>x.recipeKey);
   const keys=[...new Set(withRecipe.map(x=>x.recipeKey).filter(Boolean))];
   const mappingIds=[...new Set(withRecipe.map(x=>x.recipeMappingId).filter((x):x is number=>Number.isFinite(Number(x))&&Number(x)>0))];
   const labels=[...new Set(withRecipe.map(x=>
     `${x.recipeNo||"—"}${x.recipeName?` · ${x.recipeName}`:""}`
   ))];
   const batchKeys=[...new Set(withRecipe.map(x=>x.batchKey).filter(Boolean))];
   const prefixes=[...new Set(withRecipe.map(x=>x.batchPrefix).filter(Boolean))];

   return {
     count:selectedRecipeTargets.length,
     unmatchedCount:selectedRecipeTargets.length-withRecipe.length,
     unanimousRecipe:keys.length===1?keys[0]:null,
     unanimousRecipeMappingId:mappingIds.length===1?mappingIds[0]:null,
     unanimousRecipeLabel:labels.length===1?labels[0]:null,
     unanimousKey:batchKeys.length===1?batchKeys[0]:null,
     unanimousPrefix:prefixes.length===1?prefixes[0]:null,
     allSameRecipe:keys.length===1,
     mixedRecipes:keys.length>1
   };
 },[selectedRecipeTargets]);

 // Chẩn đoán đúng target Operation, không chẩn đoán Candidate row đại diện.
 const firstUnmatchedTarget=useMemo(
  ()=>selectedRecipeTargets.find(x=>!x.recipeKey)||null,
  [selectedRecipeTargets]
 );

 const runRecipeDiagnosis=async()=>{
   const unresolved=firstUnmatchedTarget;
   if(!unresolved)return;
   const target=unresolved.target;
   setRecipeDiagLoading(true);
   setRecipeDiag(null);
   try{
    const r=await fetch("/api/planning/recipe-diagnosis",{
     method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({
      mode:"job",
      source_operation_code:target.sourceOperation,
      standard_operation:target.standardOperation,
      part_num:target.candidate.part_num,
      revision_num:target.candidate.revision_num,
      source_data:target.candidate.source_data||null
     })
    });
    const data=await safeJson(r);
    if(!r.ok)throw new Error(data?.error||"Lỗi máy chủ.");
    setRecipeDiag(data);
   }catch(e){
    setRecipeDiag({error:e instanceof Error?e.message:String(e)});
   }finally{
    setRecipeDiagLoading(false);
   }
 };

 const runRecipeCompare=async()=>{
   setRecipeCompareLoading(true);
   try{
    const r=await fetch("/api/planning/recipe-diagnosis",{
     method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({mode:"compare"})
    });
    const data=await safeJson(r);
    if(!r.ok)throw new Error(data?.error||"Lỗi máy chủ.");
    setRecipeCompare(data);
    setRecipeCompareOpen(true);
   }catch(e){
    setRecipeCompare({error:e instanceof Error?e.message:String(e)});
    setRecipeCompareOpen(true);
   }finally{
    setRecipeCompareLoading(false);
   }
 };



 // Single source for row/checkbox/drag selection:
 // a Candidate row may be PLANNED at Current Main while ONLY the immediate
 // next unlocked Main is READY; later Main(s) remain WAIT. Route-cell selection must therefore target the exact occurrence.
 const computeSelectableTarget=(row:Candidate)=>{
   const route=(row.route_status||[])
    .filter(r=>r.standard_operation&&normalized(r.standard_operation)!=="PIONBL")
    .sort((a,b)=>Number(a.source_seq||0)-Number(b.source_seq||0));

   // 1) Exact persisted READY occurrence with a Planning Operation ID.
   const persistedReady=route.find(r=>
    normalized(r.route_status)==="READY" &&
    Number.isFinite(Number(r.planning_job_operation_id))
   );

   if(persistedReady){
    return {
     id:Number(persistedReady.planning_job_operation_id),
     standardOperation:String(persistedReady.standard_operation||""),
     sourceOperation:String(persistedReady.source_operation||""),
     routeItem:persistedReady
    };
   }

   // 2) Same fallback READY source used by renderRouteStatusCell().
   // Candidate itself is the Planning Operation and therefore row.id is the
   // selectable operation ID. Do NOT require a duplicated route_status ID.
   if(
    row.planning_status==="ELIGIBLE" &&
    Number.isFinite(Number(row.id)) &&
    row.standard_operation
   ){
    return {
     id:Number(row.id),
     standardOperation:String(row.standard_operation||""),
     sourceOperation:String(row.source_operation_code||""),
     routeItem:null as RouteStatusItem|null
    };
   }

   // 3) Recovery for rows whose previous Main is already planned/scheduled:
   // the first READY route occurrence may be computed by the Route Matrix but
   // its planning_job_operation_id is absent. If that READY Main is the
   // candidate's own standard_operation, row.id is still the correct Planning
   // Operation target.
   const computedReady=route.find(r=>normalized(r.route_status)==="READY");
   if(
    computedReady &&
    normalized(computedReady.standard_operation)===normalized(row.standard_operation) &&
    Number.isFinite(Number(row.id))
   ){
    return {
     id:Number(row.id),
     standardOperation:String(row.standard_operation||computedReady.standard_operation||""),
     sourceOperation:String(row.source_operation_code||computedReady.source_operation||""),
     routeItem:computedReady
    };
   }

   return null;
 };

 // v283: this used to sort/scan route_status repeatedly for checkbox, row
 // class, drag, toggle-all and Batch Builder. Compute once per Candidate data
 // revision and reuse the result throughout the render.
 const selectableTargetMap=useMemo(()=>{
  const map=new Map<number,ReturnType<typeof computeSelectableTarget>>();
  for(const row of candidates)map.set(Number(row.id),computeSelectableTarget(row));
  return map;
 },[candidates]);
 const selectableTargetFor=(row:Candidate)=>selectableTargetMap.get(Number(row.id))??null;

 // v339: Compatibility must follow the EXACT Main Operation being batched.
 // A row can have multiple READY route cells; using the first READY target of the
 // row incorrectly locks later READY columns. Resolve a target specifically for
 // the selected/Target-Batch Main Operation instead.
 const targetBatchForCompatibility=useMemo(
  ()=>availableBatches.find(b=>String(b.id)===String(targetBatchId||""))||null,
  [availableBatches,targetBatchId]
 );
 const compatibilityOperation=String(
  selectedTargets[0]?.standardOperation ||
  targetBatchForCompatibility?.standard_operation ||
  ""
 );

 const selectableTargetForOperation=useCallback((row:Candidate,operation:string)=>{
  const op=normalized(operation);
  if(!op)return null;
  const route=(row.route_status||[])
   .filter(r=>normalized(r.standard_operation)===op)
   .sort((a,b)=>Number(a.source_seq||0)-Number(b.source_seq||0));

  const persistedReady=route.find(r=>
   normalized(r.route_status)==="READY" &&
   Number.isFinite(Number(r.planning_job_operation_id))
  );
  if(persistedReady){
   return {
    id:Number(persistedReady.planning_job_operation_id),
    standardOperation:String(persistedReady.standard_operation||operation),
    sourceOperation:String(persistedReady.source_operation||""),
    routeItem:persistedReady
   };
  }

  // Current Candidate itself is the persisted Planning Operation.
  if(
   normalized(row.standard_operation)===op &&
   row.planning_status==="ELIGIBLE" &&
   Number.isFinite(Number(row.id))
  ){
   return {
    id:Number(row.id),
    standardOperation:String(row.standard_operation||operation),
    sourceOperation:String(row.source_operation_code||""),
    routeItem:null as RouteStatusItem|null
   };
  }

  // Same fallback rule used by the Route Matrix: a computed READY occurrence
  // without its own ID can use row.id only when it is the Candidate's own Main.
  const computedReady=route.find(r=>normalized(r.route_status)==="READY");
  if(
   computedReady &&
   normalized(row.standard_operation)===op &&
   Number.isFinite(Number(row.id))
  ){
   return {
    id:Number(row.id),
    standardOperation:String(row.standard_operation||operation),
    sourceOperation:String(row.source_operation_code||computedReady.source_operation||""),
    routeItem:computedReady
   };
  }
  return null;
 },[]);

 const compatibilityCandidates=useMemo(()=>{
  if(!compatibilityOperation)return [];
  const out:{id:number;recipeKey:string|null;recipeMappingId:number|null;standardOperation:string;sourceOperation:string}[]=[];
  const seen=new Set<number>();
  for(const row of candidates){
   const target=selectableTargetForOperation(row,compatibilityOperation);
   if(!target||seen.has(Number(target.id)))continue;
   seen.add(Number(target.id));
   const exactCurrent=
    normalized(target.standardOperation)===normalized(row.standard_operation) &&
    normalized(target.sourceOperation)===normalized(row.source_operation_code);
   const liveRecipe=target.routeItem?.effective_recipe_key ||
    (exactCurrent?row.effective_recipe_key:null) || null;
   const liveRecipeMappingId=target.routeItem?.effective_recipe_mapping_id ||
    (exactCurrent?(row.effective_recipe_mapping_id||null):null) || null;
   out.push({
    id:Number(target.id),
    recipeKey:liveRecipe,
    recipeMappingId:liveRecipeMappingId,
    standardOperation:String(target.standardOperation||compatibilityOperation),
    sourceOperation:String(target.sourceOperation||"")
   });
  }
  return out;
 },[candidates,compatibilityOperation,selectableTargetForOperation]);
 const compatibilityScopeKey=useMemo(
  ()=>`${normalized(compatibilityOperation)}|${compatibilityCandidates.map(x=>`${x.id}:${x.recipeKey||""}:${x.recipeMappingId||""}:${normalized(x.sourceOperation)}`).join("|")}`,
  [compatibilityCandidates,compatibilityOperation]
 );

 const requestCompatibilityLock=useCallback(async(args:{
  key:string;anchorId:number;batchId:number;identity:string;selectedConditionColumns?:string[]
 })=>{
  const seq=++compatibilitySeq.current;
  setCompatibilityLock(prev=>({
   key:args.key,loading:true,error:"",profile:prev?.profile||null,
   compatibleIds:prev?.compatibleIds||[],reasons:prev?.reasons||{},
   total:compatibilityCandidates.length,compatible:0,locked:0
  }));
  try{
   const r=await fetch("/api/planning/batch-compatibility",{
    method:"POST",
    headers:{"content-type":"application/json"},
    cache:"no-store",
    body:JSON.stringify({
     anchorId:args.anchorId||null,
     batchId:args.batchId||null,
     candidates:compatibilityCandidates,
     selectedConditionColumns:args.selectedConditionColumns
    })
   });
   const d=await safeJson(r);
   if(!r.ok)throw new Error(d?.error||(erpMode?"Không kiểm tra được điều kiện gom Batch.":"Không kiểm tra được Batch Compatibility."));
   if(seq!==compatibilitySeq.current)return;
   const compatibleIds=Array.isArray(d.compatibleIds)?d.compatibleIds.map(Number).filter(Number.isFinite):[];
   const next:BatchCompatibilityLock={
    key:args.key,loading:false,error:String(d.invalidSelection||""),profile:d.profile||null,
    compatibleIds,reasons:(d.reasons&&typeof d.reasons==="object")?d.reasons:{},
    total:Number(d.total)||compatibilityCandidates.length,
    compatible:Number(d.compatible)||compatibleIds.length,
    locked:Number(d.locked)||Math.max(0,compatibilityCandidates.length-compatibleIds.length)
   };
   setCompatibilityLock(next);
   if(d.profile&&Array.isArray(d.profile.selectedConditionColumns)){
    const cols=d.profile.selectedConditionColumns.map((x:unknown)=>String(x||"").trim()).filter(Boolean);
    setCompatibilityConditionChoice(prev=>{
     const same=prev?.identity===args.identity &&
      prev.columns.length===cols.length && prev.columns.every((x,i)=>x===cols[i]);
     return same?prev:{identity:args.identity,columns:cols};
    });
   }
   const allowed=new Set(compatibleIds);
   setSelected(prev=>prev.filter(id=>allowed.has(Number(id))));
  }catch(e){
   if(seq!==compatibilitySeq.current)return;
   const error=e instanceof Error?e.message:String(e);
   // Fail closed: khi chưa xác định được Recipe/condition, không cho thêm Job
   // khác vào lô. Job chuẩn vẫn giữ selected để planner thấy nguyên nhân.
   setCompatibilityLock(prev=>({
    key:args.key,loading:false,error,profile:prev?.profile||null,
    compatibleIds:args.anchorId>0?[args.anchorId]:[],reasons:{},
    total:compatibilityCandidates.length,
    compatible:args.anchorId>0?1:0,locked:Math.max(0,compatibilityCandidates.length-(args.anchorId>0?1:0))
   }));
  }
 },[compatibilityCandidates]);

 useEffect(()=>{
  const batchId=Number(targetBatchId||0);
  let anchorId=0;
  let baseKey="";
  let identity="";
  if(batchId>0){
   anchorId=Number(selected[0]||0);
   compatibilityAnchorId.current=null;
   identity=`B:${batchId}`;
   baseKey=`${identity}${anchorId?`|A:${anchorId}`:""}`;
  }else if(selected.length){
   if(!compatibilityAnchorId.current)compatibilityAnchorId.current=Number(selected[0]);
   anchorId=Number(compatibilityAnchorId.current||0);
   identity=`J:${anchorId}`;
   baseKey=identity;
  }else{
   compatibilityAnchorId.current=null;
   compatibilitySeq.current+=1;
   setCompatibilityLock(null);
   setCompatibilityConditionChoice(null);
   return;
  }
  const selectedConditionColumns=compatibilityConditionChoice?.identity===identity
   ?compatibilityConditionChoice.columns
   :undefined;
  const choiceKey=selectedConditionColumns===undefined
   ?"DEFAULT"
   :selectedConditionColumns.map(normalized).sort().join(",");
  const key=`${baseKey}|C:${choiceKey}|S:${compatibilityScopeKey}`;
  if(compatibilityLock?.key===key)return;
  void requestCompatibilityLock({key,anchorId,batchId,identity,selectedConditionColumns});
 },[targetBatchId,selected,compatibilityScopeKey,compatibilityLock?.key,compatibilityConditionChoice,requestCompatibilityLock]);

 const toggleCompatibilityCondition=useCallback((column:string,checked:boolean)=>{
  if(!compatibilityLock?.profile)return;
  const identity=compatibilityLock.profile.source==="BATCH"
   ?`B:${Number(targetBatchId||0)}`
   :`J:${Number(compatibilityAnchorId.current||compatibilityLock.profile.anchorId||0)}`;
  const current=compatibilityConditionChoice?.identity===identity
   ?compatibilityConditionChoice.columns
   :(compatibilityLock.profile.selectedConditionColumns||[]);
  const key=normalized(column);
  const next=checked
   ?[...current.filter(x=>normalized(x)!==key),column]
   :current.filter(x=>normalized(x)!==key);
  setCompatibilityConditionChoice({identity,columns:next});
 },[compatibilityLock,compatibilityConditionChoice,targetBatchId]);

 const compatibilityAllowedSet=useMemo(
  ()=>new Set((compatibilityLock?.compatibleIds||[]).map(Number)),
  [compatibilityLock?.compatibleIds]
 );
 const compatibilityLockedId=(id:number,operation?:string)=>{
  if(!compatibilityLock)return false;
  const lockOperation=String(compatibilityLock.profile?.standardOperation||compatibilityOperation||"");
  // v339: other Main Operations must remain visually/interaction independent.
  // Same-operation enforcement is handled separately by operationSelectionLocked().
  if(operation&&lockOperation&&normalized(operation)!==normalized(lockOperation))return false;
  if(selected.includes(Number(id)))return false;
  if(compatibilityLock.loading)return true;
  return !compatibilityAllowedSet.has(Number(id));
 };
 const compatibilityReasonForId=(id:number,operation?:string)=>{
  if(!compatibilityLock)return "";
  const lockOperation=String(compatibilityLock.profile?.standardOperation||compatibilityOperation||"");
  if(operation&&lockOperation&&normalized(operation)!==normalized(lockOperation))return "";
  if(compatibilityLock.loading)return "Đang kiểm tra Recipe và điều kiện Batch…";
  if(compatibilityLock.error)return compatibilityLock.error;
  const raw=compatibilityLock.reasons[String(id)];
  return Array.isArray(raw)?raw.join(" · "):String(raw||"");
 };
 const compatibilityLockedForTarget=(row:Candidate)=>{
  const target=selectableTargetFor(row);
  return target?compatibilityLockedId(Number(target.id),target.standardOperation):false;
 };

 // v340: once a Job (or an existing Target Batch) establishes the Batch Main
 // Operation, keep that Main fully visible and temporarily dim every other
 // Main Planning column. This is presentation + interaction scope only; Job
 // identity/source columns remain unchanged.
 const batchSelectionOperation=String(
  compatibilityLock?.profile?.standardOperation || compatibilityOperation || ""
 );
 const batchSelectionModeActive=Boolean(
  batchSelectionOperation && (selected.length>0 || Number(targetBatchId||0)>0)
 );
 const mainOperationSelectionDimmed=(operation:string)=>
  Boolean(
   batchSelectionModeActive &&
   normalized(operation)!==normalized(batchSelectionOperation)
  );
 const mainOperationSelectionReason=(operation:string)=>
  mainOperationSelectionDimmed(operation)
   ?`Đang tạo lô cho ${batchSelectionOperation}; ${operation} tạm thời bị khóa.`
   :"";

 const clearWorkloadDrill=()=>{
  if(!workloadDrill)return;
  const opKey=normalized(workloadDrill.main);
  setFilterRouteMain(prev=>{
   const next={...prev};
   delete next[opKey];
   return next;
  });
  setWorkloadDrill(null);
 };
 const drillWorkload=async(row:WorkloadSummaryRow,bucket:WorkloadBucket)=>{
  const metric=
   bucket==="READY_PREV_SCHEDULED"?row.readyPrevScheduled:
   bucket==="READY_PREV_UNSCHEDULED"?row.readyPrevUnscheduled:
   bucket==="WAIT"?row.wait:row.hold;
  if(!metric.jobs)return;
  if(batchSelectionModeActive){
   setMessage("Bỏ chọn các Job đang gom Batch trước khi lọc Workload Summary.");
   return;
  }
  const main=String(row.standardOperation||"");
  const opKey=normalized(main);
  const filterValue=bucket==="WAIT"?"WAITING":bucket.startsWith("READY_PREV_")?"READY":bucket;
  const loadingKey=`${opKey}|${bucket}`;
  setWorkloadDrillLoading(loadingKey);
  setMessage("");
  try{
   // Route Matrix is lazy-loaded. A Workload drill-down may target rows that
   // have not entered the DOM yet, so hydrate all currently loaded Candidate
   // route states once before applying the exact Main/status filter.
   if(onVisibleCandidateIds){
    const ids=candidates.map(x=>Number(x.id)).filter(Number.isFinite);
    await Promise.resolve(onVisibleCandidateIds(ids));
   }
   setStatusFilter("");
   setFilterRouteMain({[opKey]:filterValue});
   setWorkloadDrill({main,bucket});
  }finally{setWorkloadDrillLoading("");}
 };

 // ERP focus mode: once a Batch Main Operation is established, hide rows whose
 // current selectable READY belongs to another Main Operation. Rows in the same
 // Main remain visible; Recipe/condition incompatibility is still shown by the
 // existing dim/lock presentation so the planner can see why they cannot join.
 const batchScopedDisplayCandidates=useMemo(()=>{
  if(!erpMode||!batchSelectionModeActive||!batchSelectionOperation)return displayCandidates;
  const operationKey=normalized(batchSelectionOperation);
  return displayCandidates.filter(row=>{
   const target=selectableTargetForOperation(row,batchSelectionOperation);
   if(target&&normalized(target.standardOperation)===operationKey)return true;
   return selectedTargets.some(targetRow=>
    Number(targetRow.candidate.id)===Number(row.id) &&
    normalized(targetRow.standardOperation)===operationKey
   );
  });
 },[erpMode,batchSelectionModeActive,batchSelectionOperation,displayCandidates,selectableTargetForOperation,selectedTargets]);

 // v382: while batching one READY Main, Previous Main is one virtual context
 // column instead of one physical matrix column per upstream Main. Each Job
 // resolves its own immediate Previous Main occurrence, so mixed handoff paths
 // (for example BSASLD and BSAUNSLD feeding PRIMER) remain compact in one column.
 const previousMainContextForCandidate=(row:Candidate)=>{
  if(!erpMode)return null;

  const route=(row.route_status||[])
   .filter(r=>r.standard_operation&&normalized(r.standard_operation)!=="PIONBL")
   .sort((a,b)=>Number(a.source_seq||0)-Number(b.source_seq||0));

  let currentMain="";
  let targetSeq=Number.NaN;

  if(batchSelectionModeActive&&batchSelectionOperation){
   currentMain=normalized(batchSelectionOperation);
   const target=selectableTargetForOperation(row,batchSelectionOperation);
   const targetSeqRaw=target?.routeItem?.source_seq ?? (
    normalized(row.standard_operation)===currentMain ? row.source_seq : null
   );
   targetSeq=Number(targetSeqRaw);
  }else if(areaMode&&selectedAreaId){
   // v386 Area focus: Candidate rows are already scoped by the Area at the
   // server. Therefore Previous Main is anchored to THIS Candidate occurrence
   // (row.standard_operation + row.source_seq), not to a global/first READY
   // occurrence in the Area. This remains correct when the same Job has several
   // Painting/Plating/etc. Main Operations or repeated Main occurrences.
   const rowMain=normalized(row.standard_operation);
   const rowMainInArea=selectedAreaMainOperationSet.has(rowMain);
   const anchor=rowMainInArea
    ? route.find(r=>normalized(r.standard_operation)===rowMain&&Number(r.source_seq)===Number(row.source_seq)) ||
      route.find(r=>normalized(r.standard_operation)===rowMain)
    : null;

   currentMain=normalized(anchor?.standard_operation)||(rowMainInArea?rowMain:"");
   targetSeq=Number(anchor?.source_seq ?? (rowMainInArea?row.source_seq:null));
  }else{
   return null;
  }

  let previousItem:RouteStatusItem|null=null;
  if(Number.isFinite(targetSeq)){
   for(const item of route){
    const seq=Number(item.source_seq||0);
    if(!Number.isFinite(seq)||seq>=targetSeq)break;
    const main=normalized(item.standard_operation);
    if(main&&main!==currentMain)previousItem=item;
   }
  }

  const fallbackMain=normalized(
   row.previous_standard_operation ||
   row.previous_batch_operation ||
   ""
  );
  const mainOperation=normalized(previousItem?.standard_operation)||fallbackMain;
  if(!mainOperation||mainOperation==="START"||mainOperation===currentMain)return null;

  return {
   mainOperation,
   batchNo:String(previousItem?.batch_no||row.previous_batch_no||"").trim(),
   resourceCode:String(previousItem?.resource_code||"").trim(),
   plannedStart:String(previousItem?.planned_start||"").trim(),
   plannedEnd:String(previousItem?.planned_end||"").trim(),
   status:String(previousItem?.route_status||row.previous_planning_status||"").trim()
  };
 };

 const nextMainPlanningContextForCandidate=(row:Candidate)=>{
  if(!erpMode||!batchSelectionModeActive||!batchSelectionOperation)return null;
  const currentMain=normalized(batchSelectionOperation);
  const target=selectableTargetForOperation(row,batchSelectionOperation);
  const targetSeqRaw=target?.routeItem?.source_seq ?? (
   normalized(row.standard_operation)===currentMain ? row.source_seq : null
  );
  const targetSeq=Number(targetSeqRaw);
  const route=(row.route_status||[])
   .filter(r=>r.standard_operation&&normalized(r.standard_operation)!=="PIONBL")
   .sort((a,b)=>Number(a.source_seq||0)-Number(b.source_seq||0));

  let nextItem:RouteStatusItem|null=null;
  if(Number.isFinite(targetSeq)){
   for(const item of route){
    const seq=Number(item.source_seq||0);
    if(!Number.isFinite(seq)||seq<=targetSeq)continue;
    const main=normalized(item.standard_operation);
    if(main&&main!==currentMain){nextItem=item;break;}
   }
  }

  const fallbackMain=normalized(row.next_standard_operation||row.intermediate_next_main||"");
  const mainOperation=normalized(nextItem?.standard_operation)||fallbackMain;
  if(!mainOperation||mainOperation===currentMain)return null;

  const recipeNo=String(nextItem?.effective_recipe_no||nextItem?.recipe_no||"").trim();
  const recipeName=String(nextItem?.effective_recipe_name||nextItem?.recipe_name||"").trim();
  return {
   mainOperation,
   status:String(nextItem?.route_status||"").trim(),
   recipeNo,
   recipeName
  };
 };

 const batchScopedRenderedCandidates=useMemo(
  ()=>batchScopedDisplayCandidates.slice(0,candidateDomLimit),
  [batchScopedDisplayCandidates,candidateDomLimit]
 );

 // v379: progressive DOM rendering must follow the ACTUAL rendered scope.
 // During ERP Batch Selection Mode the table temporarily narrows to one Main
 // Operation. Previously the observer watched displayCandidates.length instead
 // of batchScopedDisplayCandidates.length. When the selected READY cell was
 // cleared, the sentinel re-appeared but the observer effect did not re-run, so
 // the table stopped after the current DOM chunk (typically 100 rows).
 const batchRenderScopeKey=erpMode&&batchSelectionModeActive
  ?`MAIN:${normalized(batchSelectionOperation)}`
  :"ALL";
 useEffect(()=>{
  const node=candidateDomSentinelRef.current;
  const total=batchScopedDisplayCandidates.length;
  if(!node||candidateDomLimit>=total)return;
  const observer=new IntersectionObserver(entries=>{
   if(entries.some(x=>x.isIntersecting)){
    setCandidateDomLimit(v=>Math.min(total,v+CANDIDATE_DOM_ROW_STEP));
   }
  },{
   // The Candidate table scrolls inside .table-wrap, not the window.
   // Using that scroll container as the observer root makes progressive loading
   // deterministic in normal and Full View modes.
   root:candidateTableWrapRef.current,
   rootMargin:"600px 0px"
  });
  observer.observe(node);
  return ()=>observer.disconnect();
 },[candidateDomLimit,batchScopedDisplayCandidates.length,batchRenderScopeKey]);

 // Route Matrix lazy-load must follow rows that are really painted. When Batch
 // Selection is cleared this immediately requests statuses for the restored
 // rows instead of keeping the old narrowed scope.
 const visibleCandidateIdsKey=useMemo(
  ()=>batchScopedRenderedCandidates.map(x=>String(x.id)).join(","),
  [batchScopedRenderedCandidates]
 );
 useEffect(()=>{
  if(!onVisibleCandidateIds||!visibleCandidateIdsKey)return;
  onVisibleCandidateIds(visibleCandidateIdsKey.split(",").map(Number).filter(Number.isFinite));
 },[visibleCandidateIdsKey,onVisibleCandidateIds]);

 // v385 ERP focus columns:
 // identity/source columns + ONE virtual Previous Main context + the selected
 // current Main (for READY/status only) + ONE virtual Next Main Planning
 // context. Recipe belongs to Next Main Planning, never to the selected Main.
 const batchScopedActiveColumns=useMemo(()=>{
  if(!erpMode)return activeColumns;

  if(batchSelectionModeActive&&batchSelectionOperation){
   const operationKey=normalized(batchSelectionOperation);
   const currentKey=`route-main:${operationKey}`;
   const out:string[]=[];
   let matrixInserted=false;
   for(const key of activeColumns){
    if(key.startsWith("route-main:")){
     if(!matrixInserted){
      out.push(ERP_BATCH_PREVIOUS_CONTEXT_KEY,currentKey,ERP_BATCH_NEXT_CONTEXT_KEY);
      matrixInserted=true;
     }
     continue;
    }
    out.push(key);
   }
   if(!matrixInserted)out.push(ERP_BATCH_PREVIOUS_CONTEXT_KEY,currentKey,ERP_BATCH_NEXT_CONTEXT_KEY);
   return out;
  }

  // v388 Area focus: every Area uses the same Candidate context baseline.
  // A legacy/sparse AREA view must not make Chemical Line lose the source
  // context that other Areas show. Keep the planner's existing extra columns,
  // but guarantee these operational fields before Previous Main:
  // PartDescription, CurrentGoodWIPQty, TotalSurface, LastLaborOp,
  // NextOperation, Priority and OpenDMR. Route columns remain Area-specific.
  if(areaMode&&selectedAreaId){
   const areaRouteKeys=activeColumns.filter(key=>
    key.startsWith("route-main:") &&
    selectedAreaMainOperationSet.has(normalized(key.slice("route-main:".length)))
   );
   // routeColumns is already canonical Main Planning Order for the selected
   // Area. Use it as a fallback if an old saved layout contains no route keys.
   const effectiveAreaRouteKeys=areaRouteKeys.length
    ?areaRouteKeys
    :routeColumns.map(col=>col.key).filter(key=>
      selectedAreaMainOperationSet.has(normalized(key.slice("route-main:".length)))
     );

   const openDmrContextKey=areaContextSourceKeys.find(key=>
    key.toUpperCase().replace(/[^A-Z0-9]+/g,"").endsWith("OPENDMR")
   );
   const requiredContext=[
    "job",
    ...areaContextSourceKeys.filter(key=>key!==openDmrContextKey),
    "priority",
    ...(openDmrContextKey?[openDmrContextKey]:[])
   ];
   const validContext=requiredContext.filter(key=>
    key==="job" || key==="priority" || configurableKeySet.has(key)
   );
   const requiredSet=new Set(validContext);
   const remainder=activeColumns.filter(key=>
    !key.startsWith("route-main:") &&
    !requiredSet.has(key) &&
    key!==ERP_BATCH_PREVIOUS_CONTEXT_KEY &&
    key!==ERP_BATCH_NEXT_CONTEXT_KEY
   );

   return [
    ...validContext,
    ERP_BATCH_PREVIOUS_CONTEXT_KEY,
    ...effectiveAreaRouteKeys,
    ...remainder
   ];
  }

  return activeColumns;
 },[erpMode,batchSelectionModeActive,batchSelectionOperation,activeColumns,areaMode,selectedAreaId,selectedAreaMainOperationSet,routeColumns,areaContextSourceKeys,configurableKeySet]);

 const totalQty=selectedTargets.reduce((a,x)=>a+Number(x.candidate.plan_qty||0),0);
 const totalSurface=selectedTargets.reduce((a,x)=>a+Number(x.candidate.plan_surface||0),0);
 const estimatedMinutes=estimateMinutes(timeRules,totalQty,totalSurface);

 const saveSortRules=(next:SortRule[])=>{
   setSortRules(next);
   try{window.localStorage.setItem(SORT_STORAGE_KEY,JSON.stringify(next))}catch{}
 };

 const updateSortRule=(index:number,patch:Partial<SortRule>)=>{
   const next=sortRules.map((r,i)=>i===index?{...r,...patch}:r);
   saveSortRules(next);
 };

 const addSortRule=()=>{
   if(sortRules.length>=10)return;
   const used=new Set(sortRules.map(x=>x.field));
   const field=candidateSortFields.find(x=>!used.has(x.key))?.key||"job";
   saveSortRules([...sortRules,{field,direction:"asc"}]);
 };

 const removeSortRule=(index:number)=>{
   const next=sortRules.filter((_,i)=>i!==index);
   saveSortRules(next.length?next:[{field:"job",direction:"asc"}]);
 };

 const moveSortRule=(from:number,to:number)=>{
   if(from===to || from<0 || to<0 || from>=sortRules.length || to>=sortRules.length)return;
   const next=[...sortRules];
   const [item]=next.splice(from,1);
   next.splice(to,0,item);
   saveSortRules(next);
 };

 const addCandidateToSelection=(rowId:number)=>{
   const row=candidates.find(x=>x.id===rowId);
   if(!row)return;

   const target=selectableTargetFor(row);
   if(!target)return;

   const existingOperation=selectedTargets[0]?.standardOperation||"";
   if(existingOperation && normalized(existingOperation)!==normalized(target.standardOperation))return;
   if(compatibilityLockedForTarget(row)){
    setMessage(compatibilityReasonForId(Number(target.id),target.standardOperation)||"Job không cùng Recipe / điều kiện với Batch đang chọn.");
    return;
   }

   setSelected(prev=>prev.includes(target.id)?prev:[...prev,target.id]);
 };

 const resetDisplayRules=()=>{
   setFilterNextMain("");
   setFilterNextOperation("");
   setFilterPrimer1("");
   setFilterPrimer2("");
   setFilterPrimer3("");
   setFilterRouteMain({});
   setColFilters({});
   saveSortRules([
    {field:"next_operation",direction:"asc"},
    {field:"priority",direction:"desc"},
    {field:"job",direction:"asc"}
   ]);
 };

 const selectedOperation=selectedTargets.length?selectedTargets[0].standardOperation:(standardOperation||"");

 const compatibleTargetBatches=useMemo(()=>{
   const op=normalized(selectedOperation||standardOperation);
   if(!op)return [];

   return availableBatches
    .filter(b=>
      normalized(b.standard_operation)===op &&
      !["CANCELLED","COMPLETED"].includes(normalized(b.status))
    )
    .sort((a,b)=>{
      const as=a.schedule_id?1:0;
      const bs=b.schedule_id?1:0;
      if(as!==bs)return as-bs; // unscheduled first
      return String(b.batch_no||"").localeCompare(String(a.batch_no||""),undefined,{numeric:true});
    });
 },[availableBatches,selectedOperation,standardOperation]);

 useEffect(()=>{
   if(!targetBatchId)return;
   if(!compatibleTargetBatches.some(b=>String(b.id)===targetBatchId)){
     setTargetBatchId("");
   }
 },[targetBatchId,compatibleTargetBatches]);

 function operationSelectionLocked(row:Candidate){
   const target=selectableTargetFor(row);
   if(!target)return true;
   return Boolean(
    selectedOperation &&
    normalized(target.standardOperation)!==normalized(selectedOperation)
   );
 }

 function toggle(rowId:number){
   const row=candidates.find(x=>x.id===rowId);
   if(!row)return;

   const target=selectableTargetFor(row);
   if(!target)return;

   if(selected.includes(target.id)){
     setSelected(x=>x.filter(y=>y!==target.id));
     return;
   }

   if(operationSelectionLocked(row))return;
   if(compatibilityLockedForTarget(row)){
    setMessage(compatibilityReasonForId(Number(target.id),target.standardOperation)||"Job không cùng Recipe / điều kiện với Batch đang chọn.");
    return;
   }
   setMessage("");
   setSelected(x=>[...new Set([...x,target.id])]);
 }

 function toggleAll(){
   const selectableRows=batchScopedDisplayCandidates
    .map(row=>({row,target:selectableTargetFor(row)}))
    .filter(x=>x.target)
    .filter(x=>!operationSelectionLocked(x.row)&&!compatibilityLockedForTarget(x.row));

   const ids=selectableRows.map(x=>Number(x.target!.id));
   const all=ids.length>0 && ids.every(id=>selected.includes(id));

   if(all)setSelected(x=>x.filter(id=>!ids.includes(id)));
   else setSelected(x=>[...new Set([...x,...ids])]);
 }

 async function createBatch(){
   if(!selected.length)return pushAppToast(erpMode?"Chọn ít nhất một Job READY.":"Chọn ít nhất 1 Candidate Job.");
   if(compatibilityLock?.loading)return pushAppToast("Đang kiểm tra Recipe và điều kiện Batch. Vui lòng chờ một chút.");
   if(compatibilityLock?.error)return pushAppToast(erpMode?`Điều kiện gom Batch: ${compatibilityLock.error}`:`Batch Compatibility: ${compatibilityLock.error}`);
   const effectiveOperation=selectedTargets[0]?.standardOperation||standardOperation||"";
   if(!effectiveOperation)return pushAppToast(erpMode?"Không xác định được Main Operation.":"Không xác định được Standard Operation.");
   if(selectedTargets.some(x=>x.standardOperation!==effectiveOperation))
     return pushAppToast(erpMode?"Một Batch chỉ được chứa Job của cùng Main Operation.":"Một Batch chỉ được chứa Job của cùng Standard Operation.");

   setBusy(true);
   setMessage("");

   try{
     const r=await fetch("/api/planning/batch",{
       method:"POST",
       headers:{"content-type":"application/json"},
       body:JSON.stringify({
         planning_job_operation_ids:selected,
         standard_operation:effectiveOperation,
         // v290: toolbar Recipe belongs to the loaded Standard Operation filter.
         // If Route Matrix selection has advanced to another Main, ignore that
         // filter Recipe and use the exact target Operation suggestion instead.
         recipe_key:(standardOperation&&normalized(standardOperation)===normalized(effectiveOperation)?recipeKey:"")
           ||suggestionSummary?.unanimousRecipe||null,
         recipe_mapping_id:compatibilityLock?.profile?.recipeMappingId
           ||suggestionSummary?.unanimousRecipeMappingId
           ||null,
         target_batch_id:targetBatchId?Number(targetBatchId):null,
         compatibility_condition_columns:compatibilityLock?.profile
          ?compatibilityLock.profile.selectedConditionColumns
          :undefined
       })
     });

     const d=await safeJson(r);
     if(!r.ok)throw new Error(d?.error||(erpMode?"Không lưu được Batch.":"Không tạo/cập nhật được Batch."));

     const createdNos=Array.isArray(d.batchNos)?d.batchNos.filter(Boolean):[];
     const batchLabel=createdNos.length>1?`${createdNos.length} lô: ${createdNos.join(", ")}`:d.batchNo;
     setMessage(erpMode
      ?`${batchLabel} · ${d.addedToExisting?"đã cập nhật":"đã tạo"} · ${d.totalJobs} Job · Qty ${formatNumber(d.totalQty)} · Diện tích ${formatNumber(d.totalSurface)} dm²${d.processMinutes!=null?` · Thời gian ${minutesToHHMM(d.processMinutes)}`:""}${d.batchKey?` · Batch Key ${d.batchKey}`:""}${d.ruleName?` · Quy tắc ${d.ruleName}`:""}`
      :`${batchLabel} ${d.addedToExisting?"updated":"created"} · ${d.totalJobs} Jobs · Qty ${formatNumber(d.totalQty)} · Surface ${formatNumber(d.totalSurface)} dm²${d.processMinutes!=null?` · Process ${minutesToHHMM(d.processMinutes)}`:""}${d.batchKey?` · Batch Key ${d.batchKey}`:""}${d.ruleName?` · Rule: ${d.ruleName}`:""}`
     );

     // v335: Batch mutation is a DELTA update. Keep the current board mounted
     // (scroll/filter/sort/freeze stay exactly where they are) and refresh only
     // the Jobs touched by this Batch.
     const fallbackAffectedJobNums=[...new Set(
      selectedTargets.map(x=>String(x.candidate.job_num||"").trim()).filter(Boolean)
     )];
     setSelected([]);
     setTargetBatchId("");
     try{
      await onCandidateMutation?.({
       affectedJobNums:Array.isArray(d.affectedJobNums)?d.affectedJobNums:fallbackAffectedJobNums,
       batchTarget:d.batchTarget||null
      });
     }catch(deltaError){
      console.error("[planning] batch delta refresh failed",deltaError);
      setMessage(prev=>`${prev} · ${erpMode?"Dữ liệu hiển thị chưa đồng bộ hết; bấm Áp dụng để nạp lại.":"Danh sách chưa cập nhật hết; bấm Áp dụng & nạp Candidate nếu cần."}`);
     }
     void refreshWorkloadSummary();
   }catch(e){
     setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`);
   }finally{
     setBusy(false);
   }
 }

 async function rebuild(){
   setBusy(true);
   setMessage(erpMode?"Đang dựng lại chuỗi kế hoạch…":"Đang dựng lại Planning Chain...");

   try{
     const r=await fetch("/api/planning/rebuild",{method:"POST"});
     const d=await safeJson(r);
     if(!r.ok)throw new Error(d?.error||(erpMode?"Không dựng lại được chuỗi kế hoạch.":"Không dựng lại được Planning Chain."));

     setMessage(erpMode?`Đã dựng lại chuỗi: ${d.jobs||0} Job · ${d.operations||0} công đoạn.`:`Đã dựng lại Planning Chain: ${d.jobs||0} Job · ${d.operations||0} công đoạn.`);
     void refreshWorkloadSummary();
     setTimeout(()=>onAfterMutation?.(),800);
   }catch(e){
     setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`);
   }finally{
     setBusy(false);
   }
 }

 const renderCandidateHeader=(key:string)=>{
   const col=allColumns.find(c=>c.key===key);
   if(!col)return null;

   if(key===ERP_BATCH_PREVIOUS_CONTEXT_KEY){
    return <th key={key} className="route-status-header route-context-previous-header">
     <span className="candidate-th-label">Previous Main</span>
    </th>;
   }
   if(key===ERP_BATCH_NEXT_CONTEXT_KEY){
    return <th key={key} className="route-status-header route-context-next-planning-header">
     <span className="candidate-th-label">Next Main Planning</span>
    </th>;
   }

   let cls=
    ["qty","surface"].includes(key)
     ?"num"
     :col.group==="allopen"
      ?"all-open-source-col"
      :col.group==="route"
       ?"route-status-header"
       :"";
   const headerMain=key.startsWith("route-main:")
    ?normalized(key.slice("route-main:".length))
    :"";
   const currentMainFocus=Boolean(
    erpMode &&
    batchSelectionModeActive &&
    headerMain &&
    headerMain===normalized(batchSelectionOperation)
   );
   if(currentMainFocus)cls=`${cls} route-context-current-header`.trim();
   if(headerMain&&mainOperationSelectionDimmed(headerMain)){
    cls=`${cls} batch-selection-main-dimmed`.trim();
   }
   const active=Boolean((colFilters[key]||[]).length);
   return <th key={key} className={cls||undefined}>
    <span className="candidate-th-label">{planningColumnLabel(col)}</span>
    <button type="button" className={`col-filter-btn ${active?"is-active":""}`}
     onClick={e=>openColFilter(key,e)} title={erpMode?"Lọc theo cột":"Lọc cột (Excel style)"}>▼</button>
   </th>;
 };

 const planningStateLabel=(status:unknown)=>{
   const raw=String(status||"");
   if(!erpMode)return raw;
   switch(normalized(status)){
    case "PLANNED": return "P";
    case "ELIGIBLE": return "R";
    case "LOCKED": return "W";
    case "HOLD": return "H";
    case "NO BATCH": return "NB";
    default:return raw;
   }
 };

 // ERP matrix uses 1–2 character status codes to keep Main Planning columns compact.
 // Full status meaning remains available in the legend/tooltips and business logic is unchanged.
 const routeStatusLabel=(status:unknown)=>{
   const raw=String(status||"");
   if(!erpMode)return raw;
   switch(normalized(status)){
    case "READY": return "R";
    case "WAITING": return "W";
    case "SCHEDULED": return "S";
    case "PLANNED-UNSCHEDULED": return "U";
    case "PLANNED": return "P";
    case "DONE":
    case "COMPLETED": return "D";
    case "RUNNING": return "RN";
    case "HOLD": return "H";
    default: return raw;
   }
 };

 const routeStatusLongLabel=(status:unknown)=>{
   const raw=String(status||"");
   switch(normalized(status)){
    case "PLANNED-UNSCHEDULED": return "UNSCHEDULED";
    case "COMPLETED": return "DONE";
    case "WAITING": return "WAIT";
    default:return raw;
   }
 };

 const routeStatusClass=(status:unknown)=>{
   switch(normalized(status)){
     case "DONE":
     case "COMPLETED":
       return "route-status-done";
     case "READY":
       return "route-status-ready";
     case "PLANNED-UNSCHEDULED":
       return "route-status-unscheduled";
     case "PLANNED":
       return "route-status-planned";
     case "SCHEDULED":
       return "route-status-scheduled";
     case "RUNNING":
       return "route-status-running";
     case "HOLD":
       return "route-status-hold";
     case "WAITING":
     default:
       return "route-status-waiting";
   }
 };

 const routeDateTime=(v:string|null|undefined)=>{
   if(!v)return "";
   const d=new Date(v);
   if(Number.isNaN(d.getTime()))return "";
   return d.toLocaleString("vi-VN",{
    timeZone:"Asia/Ho_Chi_Minh",
    day:"2-digit",
    month:"2-digit",
    hour:"2-digit",
    minute:"2-digit"
   });
 };

 const routeEndCompact=(v:string|null|undefined)=>{
   if(!v)return "";
   const d=new Date(v);
   if(Number.isNaN(d.getTime()))return "";
   const parts=new Intl.DateTimeFormat("en-GB",{
    timeZone:"Asia/Ho_Chi_Minh",
    hour:"2-digit",
    minute:"2-digit",
    day:"2-digit",
    month:"short",
    hour12:false
   }).formatToParts(d);
   const val=(t:string)=>parts.find(x=>x.type===t)?.value||"";
   const hh=val("hour");
   const mm=val("minute");
   const dd=val("day");
   const mon=val("month").toUpperCase();
   return hh&&mm&&dd&&mon?`${hh}:${mm} ${dd}-${mon}`:"";
 };

 const routeCellSelected=(item:RouteStatusItem)=>{
   const id=Number(item.planning_job_operation_id);
   return Number.isFinite(id)&&selected.includes(id);
 };

 const resolveJobHoldTarget=(candidate:Candidate,item:RouteStatusItem):JobHoldDialogTarget|null=>{
   const rawId=Number(item.planning_job_operation_id);
   const fallbackId=Number(candidate.id);
   const sameAsCandidate=normalized(item.standard_operation||candidate.standard_operation)===normalized(candidate.standard_operation);
   const id=Number.isFinite(rawId)?rawId:(sameAsCandidate&&Number.isFinite(fallbackId)?fallbackId:NaN);
   if(!Number.isFinite(id))return null;
   return {
    id,
    jobNum:candidate.job_num,
    standardOperation:String(item.standard_operation||candidate.standard_operation||""),
    sourceOperation:String(item.source_operation||candidate.source_operation_code||""),
    isHold:Boolean(item.is_hold??candidate.is_hold),
    holdReason:item.hold_reason??candidate.hold_reason??null,
    holdNote:item.hold_note??candidate.hold_note??null,
    heldAt:item.held_at??candidate.held_at??null,
    heldBy:item.held_by??candidate.held_by??null
   };
 };

 const openJobHoldDialog=(candidate:Candidate,item:RouteStatusItem)=>{
   const target=resolveJobHoldTarget(candidate,item);
   if(!target){setMessage(`${candidate.job_num}: không xác định được Planning Operation để Hold.`);return;}
   setHoldContextMenu(null);
   setHoldDialog(target);
   setHoldReason(String(target.holdReason||"DMR").toUpperCase());
   setHoldNote(String(target.holdNote||""));
 };

 const openJobHoldContextMenu=(event:ReactMouseEvent,candidate:Candidate,item:RouteStatusItem,status:string)=>{
   const target=resolveJobHoldTarget(candidate,item);
   const isHold=Boolean(target?.isHold);
   const canPlaceHold=Boolean(target)&&!item.batch_id&&["READY","WAITING"].includes(normalized(status));
   if(!target||(!isHold&&!canPlaceHold))return;
   event.preventDefault();
   event.stopPropagation();
   const menuWidth=178;
   const menuHeight=isHold?74:74;
   const x=Math.max(8,Math.min(event.clientX,window.innerWidth-menuWidth-8));
   const y=Math.max(8,Math.min(event.clientY,window.innerHeight-menuHeight-8));
   setHoldContextMenu({x,y,target});
 };

 const saveJobHold=async()=>{
   if(!holdDialog||holdDialog.isHold)return;
   setHoldBusy(true);setMessage("");
   try{
    const r=await fetch("/api/planning/job-hold",{
     method:"POST",headers:{"content-type":"application/json"},
     body:JSON.stringify({planning_job_operation_id:holdDialog.id,reason:holdReason,note:holdNote})
    });
    const data=await safeJson(r);
    if(!r.ok)throw new Error(data?.error||"Không Hold được Job.");
    setSelected(prev=>prev.filter(x=>x!==holdDialog.id));
    const savedTarget=holdDialog;
    setHoldDialog(null);
    pushAppToast(`${savedTarget.jobNum} · ${savedTarget.standardOperation}: HOLD`);
    try{
     await onCandidateMutation?.({
      affectedJobNums:[String(data?.state?.job_num||savedTarget.jobNum)],
      operationState:data?.state||null
     });
    }catch(refreshError){
     console.error("[planning] hold delta refresh failed",refreshError);
     setMessage("HOLD đã lưu. Dữ liệu nền chưa đồng bộ hết; bấm Áp dụng nếu cần tải lại.");
    }
    void refreshWorkloadSummary();
   }catch(e){setMessage(e instanceof Error?e.message:String(e));}
   finally{setHoldBusy(false);}
 };

 const releaseJobHoldTarget=async(target:JobHoldDialogTarget)=>{
   if(!target.isHold)return;
   setHoldBusy(true);setMessage("");setHoldContextMenu(null);
   try{
    const r=await fetch("/api/planning/job-hold",{
     method:"DELETE",headers:{"content-type":"application/json"},
     body:JSON.stringify({planning_job_operation_id:target.id})
    });
    const data=await safeJson(r);
    if(!r.ok)throw new Error(data?.error||"Không bỏ Hold được Job.");
    setHoldDialog(null);
    pushAppToast(`${target.jobNum} · ${target.standardOperation}: đã bỏ HOLD`);
    try{
     await onCandidateMutation?.({
      affectedJobNums:[String(data?.state?.job_num||data?.job_num||target.jobNum)],
      operationState:data?.state||null
     });
    }catch(refreshError){
     console.error("[planning] release hold delta refresh failed",refreshError);
     setMessage("Bỏ HOLD đã lưu. Dữ liệu nền chưa đồng bộ hết; bấm Áp dụng nếu cần tải lại.");
    }
    void refreshWorkloadSummary();
   }catch(e){setMessage(e instanceof Error?e.message:String(e));}
   finally{setHoldBusy(false);}
 };

 const releaseJobHold=async()=>{
   if(!holdDialog||!holdDialog.isHold)return;
   await releaseJobHoldTarget(holdDialog);
 };

 const toggleRouteCell=(candidate:Candidate,item:RouteStatusItem)=>{
   const op=String(item.standard_operation||candidate.standard_operation||"");
   const status=normalized(item.route_status);

   // The displayed READY cell is authoritative. Some computed Route Matrix
   // occurrences do not carry planning_job_operation_id; when the READY Main
   // matches the Candidate Main, candidate.id is the Planning Operation ID.
   const itemId=Number(item.planning_job_operation_id);
   const candidateId=Number(candidate.id);
   const id=Number.isFinite(itemId)
    ?itemId
    :(
      normalized(op)===normalized(candidate.standard_operation) &&
      Number.isFinite(candidateId)
       ?candidateId
       :NaN
     );

   if(!op){
    setMessage("Công đoạn này chưa xác định được Main Operation.");
    return;
   }

   if(mainOperationSelectionDimmed(op)){
    setMessage(mainOperationSelectionReason(op));
    return;
   }

   if(status==="WAITING"){
    const waiting=waitingDisplayFor(candidate,item);
    setMessage(
     `${candidate.job_num} · ${op}: ${waiting.label}. ${waiting.reason}`
    );
    return;
   }

   if(status!=="READY"){
    setMessage(`${candidate.job_num} · ${op}: ${status} không thể thêm vào Batch mới.`);
    return;
   }

   if(!Number.isFinite(id)){
    setMessage(`${candidate.job_num} · ${op}: READY nhưng chưa resolve được Planning Operation ID.`);
    return;
   }

   if(selected.includes(id)){
    setSelected(prev=>prev.filter(x=>x!==id));
    return;
   }

   if(compatibilityLockedId(id,op)){
    setMessage(compatibilityReasonForId(id,op)||"Job không cùng Recipe / điều kiện với Batch đang chọn.");
    return;
   }

   const existingOperation=selectedTargets[0]?.standardOperation||"";
   if(existingOperation && normalized(existingOperation)!==normalized(op)){
    setMessage(`Đang chọn ${existingOperation}. Một Batch chỉ chứa cùng Main Operation.`);
    return;
   }



   setMessage("");
   setSelected(prev=>[...new Set([...prev,id])]);
 };

 function waitingDisplayFor(candidate:Candidate,item:RouteStatusItem){
   if(normalized(item.route_status)!=="WAITING")
    return {label:String(item.route_status||""),reason:"",kind:""};

   const route=(candidate.route_status||[])
    .filter(r=>r.standard_operation&&normalized(r.standard_operation)!=="PIONBL")
    .sort((a,b)=>Number(a.source_seq||0)-Number(b.source_seq||0));

   const waitingFuture=route.filter(r=>normalized(r.route_status)==="WAITING");
   const immediate=waitingFuture.length
    ?Math.min(...waitingFuture.map(r=>Number(r.source_seq||Number.POSITIVE_INFINITY)))
    :Number.POSITIVE_INFINITY;

   if(Number(item.source_seq)===immediate){
    return {
     label:erpMode?"W":"WAIT",
     reason:erpMode?"Main Operation trước chưa hoàn tất hoặc chưa được lập lịch.":"Previous Main Planning chưa DONE / SCHEDULED / UNSCHEDULED.",
     kind:"route-status-wait-prev"
    };
   }

   return {
    label:erpMode?"W":"WAIT",
    reason:erpMode?"Chưa tới lượt Main Operation này. Chỉ công đoạn kế tiếp trong chuỗi mới được READY.":"Next Main Planning chưa tới lượt. Chỉ Main ngay sau handoff mới được READY.",
    kind:"route-status-wait-future"
   };
 }

 const renderPreviousMainContextCell=(x:Candidate)=>{
   if(x.route_status_loaded===false){
    return <td key={ERP_BATCH_PREVIOUS_CONTEXT_KEY} className="route-status-cell route-context-previous-cell route-status-loading">…</td>;
   }
   const ctx=previousMainContextForCandidate(x);
   if(!ctx){
    return <td key={ERP_BATCH_PREVIOUS_CONTEXT_KEY} className="route-status-cell route-context-previous-cell route-status-na">—</td>;
   }
   const statusCode=ctx.status?routeStatusLabel(ctx.status):"";
   const startText=routeEndCompact(ctx.plannedStart);
   const endText=routeEndCompact(ctx.plannedEnd);
   const scheduleText=startText&&endText?`${startText} → ${endText}`:(startText||endText);
   const title=[
    `Previous Main: ${ctx.mainOperation}`,
    ctx.batchNo?`Batch: ${ctx.batchNo}`:"",
    ctx.resourceCode?`Resource: ${ctx.resourceCode}`:"",
    ctx.plannedStart?`Start: ${routeDateTime(ctx.plannedStart)}`:"",
    ctx.plannedEnd?`End: ${routeDateTime(ctx.plannedEnd)}`:"",
    ctx.status?`Status: ${routeStatusLongLabel(ctx.status)}`:""
   ].filter(Boolean).join(" · ");
   const statusClass=ctx.status?routeStatusClass(ctx.status):"route-status-na";
  return <td
    key={ERP_BATCH_PREVIOUS_CONTEXT_KEY}
    className={`route-status-cell route-context-previous-cell ${statusClass}`}
    title={title}
   >
    <div className="route-context-prev-line">
     <span className="route-context-prev-operation">{ctx.mainOperation}</span>
     {statusCode&&<b className="route-context-prev-status">{statusCode}</b>}
    </div>
    <span className="route-context-prev-meta">
     {[ctx.batchNo,scheduleText,ctx.resourceCode].filter(Boolean).join(" · ")||"—"}
    </span>
   </td>;
 };

 const renderNextMainPlanningContextCell=(x:Candidate)=>{
   if(x.route_status_loaded===false){
    return <td key={ERP_BATCH_NEXT_CONTEXT_KEY} className="route-status-cell route-context-next-planning-cell route-status-loading">…</td>;
   }
   const ctx=nextMainPlanningContextForCandidate(x);
   if(!ctx){
    return <td key={ERP_BATCH_NEXT_CONTEXT_KEY} className="route-status-cell route-context-next-planning-cell route-status-na">—</td>;
   }
   const recipe=[ctx.recipeNo,ctx.recipeName].filter(Boolean).join(" · ");
   const title=[
    `Next Main Planning: ${ctx.mainOperation}`,
    ctx.status?`Status: ${routeStatusLongLabel(ctx.status)}`:"",
    recipe?`Recipe: ${recipe}`:""
   ].filter(Boolean).join(" · ");
   return <td
    key={ERP_BATCH_NEXT_CONTEXT_KEY}
    className="route-status-cell route-context-next-planning-cell"
    title={title}
   >
    <span className="route-context-next-operation">{ctx.mainOperation}</span>
    {recipe&&<span className="route-context-next-recipe">{recipe}</span>}
   </td>;
 };

 const renderRouteStatusCell=(x:Candidate,key:string)=>{
   const mainOperation=normalized(key.slice("route-main:".length));
   const currentMainFocus=Boolean(
    erpMode &&
    batchSelectionModeActive &&
    mainOperation===normalized(batchSelectionOperation)
   );
   const mainDimmed=mainOperationSelectionDimmed(mainOperation);
   const mainDimClass=mainDimmed?"batch-selection-main-dimmed":"";
   const mainDimReason=mainDimmed?mainOperationSelectionReason(mainOperation):"";

   if(x.route_status_loaded===false){
    return <td key={key} className={`route-status-cell route-status-loading ${mainDimClass}`.trim()} title={`${mainOperation} · ${erpMode?"đang tải trạng thái":"đang tải Route Matrix"}${mainDimReason?` · ${mainDimReason}`:""}`}>…</td>;
   }

   const items=(x.route_status||[])
    .filter(r=>
     normalized(
      r.standard_operation ||
      (normalized(r.source_operation)==="PIONBL"?"PIONBL":"")
     )===mainOperation
    )
    .sort((a,b)=>Number(a.source_seq||0)-Number(b.source_seq||0));

   if(!items.length){
    if(mainOperation===normalized(x.standard_operation)){
     const status=x.batch_no
      ? "PLANNED-UNSCHEDULED"
      :x.planning_status==="ELIGIBLE"
       ? "READY"
       :String(x.planning_status||"WAITING");

     const fallbackItem:RouteStatusItem={
      route_key:`fallback-${x.id}`,
      source_operation:x.source_operation_code,
      source_seq:0,
      occurrence:1,
      standard_operation:x.standard_operation,
      planning_job_operation_id:x.id,
      planning_job_status:x.planning_status,
      is_hold:Boolean(x.is_hold),
      hold_reason:x.hold_reason||null,
      hold_note:x.hold_note||null,
      held_at:x.held_at||null,
      held_by:x.held_by||null,
      ready_source_seq:Number(x.source_seq||0)||null,
      route_status:status,
      batch_id:x.batch_id,
      batch_no:x.batch_no,
      batch_status:x.batch_status,
      schedule_id:null,
      schedule_status:null,
      resource_code:null,
      planned_start:null,
      planned_end:null,
      recipe_no:x.recipe_no,
      recipe_name:x.recipe_name
     };

     const fallbackWaiting=waitingDisplayFor(x,fallbackItem);
     const fallbackDisplay=normalized(status)==="HOLD"?"HOLD":normalized(status)==="WAITING"?fallbackWaiting.label:routeStatusLabel(status);
     const fallbackCompatLocked=
      normalized(status)==="READY" &&
      compatibilityLockedId(Number(x.id),mainOperation);
     const fallbackRecipeNo=String(x.recipe_no||"").trim();
     const fallbackRecipeName=String(x.recipe_name||"").trim();
     const fallbackRecipe=[fallbackRecipeNo,fallbackRecipeName]
      .filter(Boolean).join(" · ");
     return <td
      key={key}
      className={`route-status-cell ${routeStatusClass(status)} ${normalized(status)==="WAITING"?fallbackWaiting.kind:""} route-status-current ${currentMainFocus?"route-context-current-cell":""} ${routeCellSelected(fallbackItem)?"route-status-selected":""} ${status==="READY"&&!mainDimmed&&!fallbackCompatLocked?"route-status-clickable":""} ${fallbackCompatLocked?"batch-compatibility-cell-locked":""} ${mainDimClass}`}
      title={`${mainOperation} · ${erpMode?(normalized(status)==="WAITING"?"WAIT":routeStatusLongLabel(status)):fallbackDisplay}${fallbackRecipe?` · Recipe: ${fallbackRecipe}`:""}${x.batch_no?` · ${x.batch_no}`:""}${fallbackCompatLocked?` · ${compatibilityReasonForId(Number(x.id),mainOperation)||"Khác Recipe / điều kiện Batch"}`:""}${mainDimReason?` · ${mainDimReason}`:""}`}
      onClick={()=>{
       if(mainDimmed){setMessage(mainDimReason);return;}
       toggleRouteCell(x,fallbackItem);
      }}
      onContextMenu={e=>openJobHoldContextMenu(e,x,fallbackItem,status)}
     >
      <b>{fallbackDisplay}</b>
      {normalized(status)==="READY"&&fallbackRecipeNo&&
       <span className="route-status-ready-recipe-no" title={fallbackRecipe||fallbackRecipeNo}>{fallbackRecipeNo}</span>}
      {!currentMainFocus&&x.batch_no&&<span className="route-status-batch">{x.batch_no}</span>}
     </td>;
    }
    return <td key={key} className={`route-status-cell route-status-na ${mainDimClass}`.trim()} title={mainDimReason||undefined}>—</td>;
   }

   // v153 - occurrence-first route renderer
   // Each route occurrence owns its own route_status + ready_source_seq.
   // Do not derive CURRENT from another occurrence in the same Main column.
   //
   // Required invariant:
   //   route_status=READY AND source_seq=ready_source_seq
   //   => CURRENT + READY + selectable
   //
   // This fixes cases where duplicate/mapped Main operations carried different
   // ready_source_seq values and a READY occurrence was incorrectly marked NOT-CURRENT.
   const normalizedItems=items.map(item=>{
    const sourceSeq=Number(item.source_seq);
    const readySeq=Number(item.ready_source_seq);
    const rawStatus=normalized(item.route_status);
    const current=
     Number.isFinite(sourceSeq) &&
     Number.isFinite(readySeq) &&
     sourceSeq===readySeq;

    return {
     item,
     sourceSeq,
     readySeq,
     rawStatus,
     current
    };
   });

   // First priority: an explicit READY occurrence at its own ready_source_seq.
   const explicitCurrentReady=normalizedItems.find(x=>
    x.rawStatus==="READY" && x.current
   );

   // Second: any authoritative current occurrence.
   const explicitCurrentAuthoritative=normalizedItems.find(x=>
    x.current &&
    ["RUNNING","SCHEDULED","PLANNED-UNSCHEDULED","HOLD","COMPLETED"].includes(x.rawStatus)
   );

   // Third: any current occurrence at all.
   const explicitCurrent=normalizedItems.find(x=>x.current);

   // Historical/actual states remain authoritative even when not current.
   const authoritative=normalizedItems.find(x=>
    ["RUNNING","SCHEDULED","PLANNED-UNSCHEDULED","HOLD","COMPLETED"].includes(x.rawStatus)
   );

   // DONE occurrence before its own ready pivot.
   const doneItem=normalizedItems
    .filter(x=>x.rawStatus==="DONE")
    .sort((a,b)=>b.sourceSeq-a.sourceSeq)[0];

   // Future WAITING occurrence.
   const waitingItem=normalizedItems
    .filter(x=>x.rawStatus==="WAITING")
    .sort((a,b)=>a.sourceSeq-b.sourceSeq)[0];

   const chosen=
    explicitCurrentReady ||
    explicitCurrentAuthoritative ||
    explicitCurrent ||
    authoritative ||
    doneItem ||
    waitingItem ||
    normalizedItems[0];

   const displayItem=chosen.item;
   let status=String(displayItem.route_status||"WAITING");

   // Enforce READY/current invariant directly.
   if(chosen.rawStatus==="READY" && chosen.current){
    status="READY";
   }

   const isCurrent=chosen.current;

   const waitingDisplay=waitingDisplayFor(x,displayItem);
   const displayStatus=normalized(status)==="HOLD"
    ?"HOLD"
    :normalized(status)==="WAITING"
     ?waitingDisplay.label
     :routeStatusLabel(status);
   const waitingClass=normalized(status)==="WAITING"
    ?waitingDisplay.kind
    :"";

   const batchNos=[
    ...new Set(
     items.flatMap(r=>{
      const many=Array.isArray(r.batch_nos)?r.batch_nos:[];
      return (many.length?many:[r.batch_no])
       .map(v=>String(v||"").trim())
       .filter(Boolean);
     })
    )
   ];

   const resources=[
    ...new Set(items.map(r=>String(r.resource_code||"").trim()).filter(Boolean))
   ];

   const scheduledEnds=[
    ...new Set(
     items
      .map(r=>routeEndCompact(r.planned_end))
      .filter(Boolean)
    )
   ];

   const tooltip=items.map((item,index)=>[
    items.length>1?(erpMode?`${mainOperation} · lần ${index+1}`:`${mainOperation} occurrence ${index+1}`):mainOperation,
    `${erpMode?"Operation Code":"Source"}: ${item.source_operation}`,
    `${erpMode?"Trạng thái":"Status"}: ${erpMode?(normalized(item.route_status)==="WAITING"?"WAIT":routeStatusLongLabel(item.route_status)):(normalized(item.route_status)==="WAITING"?waitingDisplayFor(x,item).label:routeStatusLabel(item.route_status))}`,
    normalized(item.route_status)==="WAITING"?waitingDisplayFor(x,item).reason:"",
    item.batch_no?`Batch: ${item.batch_no}`:"",
    item.resource_code?`${erpMode?"Resource":"Resource"}: ${item.resource_code}`:"",
    item.planned_start?`${erpMode?"Bắt đầu":"Start"}: ${routeDateTime(item.planned_start)}`:"",
    item.planned_end?`${erpMode?"Kết thúc":"End"}: ${routeDateTime(item.planned_end)}`:"",
    item.recipe_name?`Recipe: ${item.recipe_name}`:"",
    item.is_hold?`Hold: ${item.hold_reason||"—"}${item.hold_note?` · ${item.hold_note}`:""}`:"",
    item.is_hold&&item.held_by?`Held by: ${item.held_by}`:"",
    item.is_hold&&item.held_at?`Held at: ${routeDateTime(item.held_at)}`:""
   ].filter(Boolean).join(" · ")).join("\n");

   // v159: one source of truth for interaction.
   // What the cell displays is exactly what the user clicks/selects.
   const selectableItem=displayItem;
   const rawSelectableId=Number(selectableItem.planning_job_operation_id);
   const selectableOperationId=Number.isFinite(rawSelectableId)
    ?rawSelectableId
    :(
      normalized(selectableItem.standard_operation)===normalized(x.standard_operation) && Number.isFinite(Number(x.id))
       ?Number(x.id)
       :NaN
     );
   const compatLocked=
    normalized(status)==="READY" &&
    Number.isFinite(selectableOperationId) &&
    compatibilityLockedId(selectableOperationId,mainOperation);
   const clickable=
    !mainDimmed &&
    !compatLocked && (
     normalized(status)==="READY" ||
     normalized(status)==="WAITING"
    );

   const readyRecipeNo=String(displayItem.effective_recipe_no||displayItem.recipe_no||"").trim();
   const readyRecipeName=String(displayItem.effective_recipe_name||displayItem.recipe_name||"").trim();
   const readyRecipeTitle=[readyRecipeNo,readyRecipeName].filter(Boolean).join(" · ");

   return <td
    key={key}
    className={`route-status-cell ${routeStatusClass(status)} ${waitingClass} ${currentMainFocus?"route-context-current-cell":""} ${isCurrent?"route-status-current":""} ${(
     routeCellSelected(selectableItem) ||
     (
      normalized(status)==="READY" &&
      !Number.isFinite(Number(selectableItem.planning_job_operation_id)) &&
      normalized(selectableItem.standard_operation)===normalized(x.standard_operation) &&
      selected.includes(Number(x.id))
     )
    )?"route-status-selected":""} ${clickable?"route-status-clickable":""} ${compatLocked?"batch-compatibility-cell-locked":""} ${mainDimClass}`}
    title={`${tooltip}${compatLocked?`\n${compatibilityReasonForId(selectableOperationId,mainOperation)||"Khác Recipe / điều kiện Batch"}`:""}${mainDimReason?`\n${mainDimReason}`:""}`}
    onClick={()=>{
     if(mainDimmed){setMessage(mainDimReason);return;}
     if(clickable)toggleRouteCell(x,selectableItem);
    }}
    onContextMenu={e=>openJobHoldContextMenu(e,x,selectableItem,status)}
   >
    <b>{displayStatus}</b>
    {normalized(status)==="READY"&&readyRecipeNo&&
     <span className="route-status-ready-recipe-no" title={readyRecipeTitle||readyRecipeNo}>{readyRecipeNo}</span>}

    {!currentMainFocus&&<>
     {(scheduledEnds.length>0||batchNos.length>0)&&
      <span className="route-status-batch">
       {batchNos.length>0 ? batchNos.join(" & ") : scheduledEnds.join(" / ")}
      </span>}
     {resources.length>0&&<small>{resources.join(" / ")}</small>}
    </>}

    {!currentMainFocus&&items.length>1&&
     <small>{erpMode?`${items.length} lần trong routing`:`${items.length} route occurrences`}</small>}
   </td>;
 };
 const renderCandidateCell=(x:Candidate,key:string)=>{
   if(key===ERP_BATCH_PREVIOUS_CONTEXT_KEY){
     return renderPreviousMainContextCell(x);
   }
   if(key===ERP_BATCH_NEXT_CONTEXT_KEY){
     return renderNextMainPlanningContextCell(x);
   }
   if(key.startsWith("route-main:")){
     return renderRouteStatusCell(x,key);
   }

   if(key.startsWith("source:")){
     const sourceKey=key.slice("source:".length);
     // v252: cột AllOperation cho hiển thị ĐẦY ĐỦ (xuống dòng, không cắt chữ).
     // Excel có thể đặt tên "AllOperation" (không gạch dưới) hoặc "all_operation" — nhận cả 2.
     const isAllOperation=["ALL_OPERATION","ALLOPERATION"].includes(normalized(sourceKey));
     return <td key={key} className={`all-open-source-col ${isAllOperation?"col-all-operation":""}`}>
      {displaySourceValue((x.source_data||{})[sourceKey])}
     </td>;
   }

   switch(key){
     case "standard_operation":
      return <td key={key}><b>{x.standard_operation||"—"}</b><small className="planning-sub">{x.area_name||"—"}</small></td>;
     case "job":
       return <td key={key}><b>{x.job_num}</b></td>;

     case "part_rev":
       return <td key={key}>
        {x.part_num||"—"}
        <small className="planning-sub">Rev {x.revision_num||"—"}</small>
       </td>;

     case "qty":
       return <td key={key} className="num mono">{formatNumber(x.plan_qty)}</td>;

     case "surface":
       return <td key={key} className="num mono">{formatNumber(x.plan_surface)}</td>;

     case "source_op":
       return <td key={key}>{x.source_operation_code}</td>;

     case "previous_op":
       return <td key={key}>{x.previous_standard_operation||"START"}</td>;

     case "next_op":
       return <td key={key}><b>{x.next_standard_operation||"END"}</b></td>;

     case "recipe":
       return <td key={key}>
        {x.recipe_no
         ? <><b>{x.recipe_no}</b><small className="planning-sub">{x.recipe_name||"CHƯA KHAI BÁO"}</small></>
         : x.recipe_required
          ? <span className="job-state state-changed">{erpMode?"CHƯA CÓ RECIPE":"RECIPE REQUIRED"}</span>
          : <span>—</span>}
       </td>;

     case "primer1":
       return <td key={key}>{x.part_master_primer1||"—"}</td>;

     case "primer2":
       return <td key={key}>{x.part_master_primer2||"—"}</td>;

     case "primer3":
       return <td key={key}>{x.part_master_primer3||"—"}</td>;

     case "priority":
       return <td key={key} className={`candidate-priority-cell ${priorityClass(x.priority_type)}`}>
        {x.priority_type||"—"}
       </td>;

     case "status":
       return <td key={key}>
        {x.planning_status==="PLANNED"
         ? <span className="job-state state-planned">{erpMode?"P":"PLANNED"}</span>
         : <span className="job-state state-eligible">{erpMode?"R":"ELIGIBLE"}</span>}
       </td>;

     case "batch_no":
       return <td key={key}>
        {x.batch_no
         ? <><b>{x.batch_no}</b><small className="planning-sub">{x.batch_status||"PLANNED"}</small></>
         : "—"}
       </td>;

     case "previous_status":
       return <td key={key}>
        {x.previous_planning_operation
         ? <>
            <b>{x.previous_planning_operation}</b>
            <small className="planning-sub">
             {x.previous_batch_no
              ? `${planningStateLabel(x.previous_planning_status||"PLANNED")} · ${x.previous_batch_no}`
              : planningStateLabel(x.previous_planning_status||"NO BATCH")}
            </small>
           </>
         : <><b>START</b><small className="planning-sub">{erpMode?"CÔNG ĐOẠN ĐẦU":"FIRST PLAN OP"}</small></>}
       </td>;

     case "previous_batch_no":
       return <td key={key}>
        {x.previous_batch_no
         ? <>
            <b>{x.previous_batch_no}</b>
            <small className="planning-sub">
             {x.previous_batch_operation||x.previous_batch_source_operation||"—"} · {planningStateLabel(x.previous_batch_status||"PLANNED")}
            </small>
           </>
         : "—"}
       </td>;

     case "actual_progress":
       return <td key={key}>
        <b>{x.last_operation||"START"}</b>
        <small className="planning-sub">→ {x.next_operation||"END"}</small>
       </td>;

     default:
       return <td key={key}>—</td>;
   }
 };


 /* ===== v260 Freeze Pane ===== */
 // v268: khởi tạo MẶC ĐỊNH (không đọc localStorage lúc render) — đọc lại sau khi
 // mount để SSR khớp client khi khôi phục cấu hình Freeze Pane.
 const [freeze,setFreeze]=useState<FreezeCfg>({mode:"off"});
 const [freezePick,setFreezePick]=useState(false);
 const [freezeDraft,setFreezeDraft]=useState<FreezeCfg|null>(null);
 const [freezeMenuOpen,setFreezeMenuOpen]=useState(false);
 const freezeTableRef=useRef<HTMLTableElement|null>(null);
 useEffect(()=>{setFreeze(loadFreeze());},[]);

 const freezeColumnLabels=useMemo(()=>{
   const labels:string[]=["Chọn"];
   for(const key of batchScopedActiveColumns){
    const col=allColumns.find(c=>c.key===key);
    labels.push(col?planningColumnLabel(col):key);
   }
   return labels;
 },[batchScopedActiveColumns,allColumns]);

 const freezeActive=freeze.mode!=="off";
 const effectiveFreeze=freezeDraft??freeze;
 const freezeCol=effectiveFreeze.mode==="col"
  ?Math.max(1,Math.min(effectiveFreeze.col??1,FREEZE_MAX_COLS))
  :0;
 const freezeLabel=freeze.mode==="col"
  ?(freezeColumnLabels[Math.min(freeze.col??1,FREEZE_MAX_COLS)-1]??`Cột ${freeze.col}`)
  :(freeze.mode==="header"?"Dòng tiêu đề":"");
 const persistFreeze=(cfg:FreezeCfg)=>{
  setFreeze(cfg);setFreezeMenuOpen(false);setFreezePick(false);setFreezeDraft(null);
  try{localStorage.setItem(FREEZE_STORAGE_KEY,JSON.stringify(cfg));}catch{}
 };

 useEffect(()=>{
  if(!freezePick)return;
  const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape"){setFreezePick(false);setFreezeDraft(null);}};
  window.addEventListener("keydown",onKey);
  return ()=>window.removeEventListener("keydown",onKey);
 },[freezePick]);

 useLayoutEffect(()=>{
  const t=freezeTableRef.current;
  if(!t||freezeCol<=0)return;
  let ro:ResizeObserver|null=null;
  const apply=()=>{
   const row=t.querySelector("thead tr");
   if(!row)return;
   const cells=Array.from(row.children) as HTMLElement[];
   let acc=0;
   t.style.setProperty("--fcws-0","0px");
   for(let i=0;i<cells.length&&i<FREEZE_MAX_COLS;i++){
    const zoomFactor=erpMode?Math.max(0.01,matrixZoom/100):1;
    acc+=cells[i].getBoundingClientRect().width/zoomFactor;
    t.style.setProperty(`--fcws-${i+1}`,`${acc}px`);
   }
  };
  apply();
  ro=new ResizeObserver(apply);
  ro.observe(t);
  return ()=>{if(ro)ro.disconnect();};
 },[freezeCol,batchScopedActiveColumns,candidateDensity,routeFocus,batchScopedDisplayCandidates.length,fullView,matrixZoom,erpMode]);

 
 return <div className={`planning-board-grid ${erpMode?"planning-board-grid-erp":""}`}>
   <section className={`erp-table-panel planning-candidates ${erpMode?"erpkit-live-matrix-panel ":""}${fullView?"candidate-full-view":""} candidate-density-${candidateDensity} ${routeFocus?"candidate-route-focus":""}`}>
    {erpMode?
     <div className="erpkit-live-matrix-head candidate-sticky-toolbar">
      <div className="erpkit-live-matrix-title">
       <div><b>Ma trận kế hoạch</b><small>Job × Main Operation · chọn READY để gom Job vào Batch</small></div>
       <div className="erpkit-live-matrix-kpis">
        <button type="button" className={`erpkit-live-kpi is-ready ${statusFilter==="ELIGIBLE"?"is-active":""}`} onClick={()=>setStatusFilter(statusFilter==="ELIGIBLE"?"":"ELIGIBLE")}><b>{eligibleCandidates.length}</b><span>READY</span></button>
        <button type="button" className={`erpkit-live-kpi is-batch ${statusFilter==="PLANNED"?"is-active":""}`} onClick={()=>setStatusFilter(statusFilter==="PLANNED"?"":"PLANNED")}><b>{plannedCandidates.length}</b><span>BATCH</span></button>
        <button type="button" className={`erpkit-live-kpi is-wait ${statusFilter==="WAIT"?"is-active":""}`} onClick={()=>setStatusFilter(statusFilter==="WAIT"?"":"WAIT")}><b>{waitingCandidates.length}</b><span>WAIT</span></button>
        {holdCandidates.length>0&&<button type="button" className={`erpkit-live-kpi is-hold ${statusFilter==="HOLD"?"is-active":""}`} onClick={()=>setStatusFilter(statusFilter==="HOLD"?"":"HOLD")}><b>{holdCandidates.length}</b><span>HOLD</span></button>}
        {noChainCandidates.length>0&&<button type="button" className={`erpkit-live-kpi is-muted ${statusFilter==="NO_CHAIN"?"is-active":""}`} onClick={()=>setStatusFilter(statusFilter==="NO_CHAIN"?"":"NO_CHAIN")}><b>{noChainCandidates.length}</b><span>NO CHAIN</span></button>}
       </div>
      </div>
      <div className="erpkit-live-matrix-actions">
       <button type="button" className={`erpkit-btn ${statusFilter===""?"is-active":""}`} onClick={()=>setStatusFilter("")}>Tất cả {pagination.totalCandidates}</button>
       <div className="erpkit-segmented">
        <button type="button" className={candidateDensity==="compact"?"is-active":""} onClick={()=>setCandidateDensity("compact")}>Gọn</button>
        <button type="button" className={candidateDensity==="normal"?"is-active":""} onClick={()=>setCandidateDensity("normal")}>Chi tiết</button>
       </div>
       <div className="erpkit-matrix-zoom" title="Zoom riêng Ma trận kế hoạch">
        <button type="button" onClick={()=>changeMatrixZoom(matrixZoom-10)} disabled={matrixZoom<=70} aria-label="Zoom out">−</button>
        <button type="button" className="erpkit-matrix-zoom-value" onClick={()=>changeMatrixZoom(100)} title="Đặt lại 100%">{matrixZoom}%</button>
        <button type="button" onClick={()=>changeMatrixZoom(matrixZoom+10)} disabled={matrixZoom>=130} aria-label="Zoom in">+</button>
       </div>
       <button className="erpkit-btn" type="button" onClick={()=>setDisplayRulesOpen(x=>!x)}>Bộ lọc</button>
       <button className="erpkit-btn" type="button" onClick={()=>setColumnPickerOpen(x=>!x)}>Cột</button>
       <button className="erpkit-btn" type="button" onClick={()=>setOperationPickerOpen(x=>!x)}>Công đoạn</button>
       <button className="erpkit-btn" type="button" onClick={()=>setFullView(x=>!x)}>{fullView?"Thu gọn":"Toàn màn hình"}</button>
       <button className="erpkit-btn" type="button" onClick={runRecipeCompare} disabled={recipeCompareLoading}>{recipeCompareLoading?"Đang kiểm tra…":"Kiểm tra Recipe"}</button>
       <button className="erpkit-btn" type="button" title="Ghim dòng tiêu đề và các cột bên trái." onClick={()=>{if(freezeMenuOpen){setFreezeMenuOpen(false);return;}if(freezePick){setFreezePick(false);setFreezeDraft(null);return;}if(freeze.mode==="off"){setFreezePick(true);return;}setFreezeMenuOpen(true);}}>{freeze.mode==="off"?"Ghim cột":freezeLabel}</button>
       <button className="erpkit-btn" disabled={busy} onClick={rebuild}>Dựng lại chuỗi</button>
      </div>
     </div>
    :
     <div className="erp-panel-head candidate-sticky-toolbar">
      <b>Candidate Jobs</b>
      <div className="row">
       <button type="button" className={`btn small status-chip ${statusFilter==="ELIGIBLE"?"status-chip-active":""}`} onClick={()=>setStatusFilter(statusFilter==="ELIGIBLE"?"":"ELIGIBLE")} title="Lọc: chỉ hiện Candidate READY (chưa vào Batch)">{eligibleCandidates.length} ELIGIBLE</button>
       <span>·</span>
       <button type="button" className={`btn small status-chip ${statusFilter==="PLANNED"?"status-chip-active":""}`} onClick={()=>setStatusFilter(statusFilter==="PLANNED"?"":"PLANNED")} title="Lọc: chỉ hiện Candidate đã vào Batch">{plannedCandidates.length} PLANNED</button>
       <span>·</span>
       <button type="button" className={`btn small status-chip ${statusFilter==="WAIT"?"status-chip-active":""}`} onClick={()=>setStatusFilter(statusFilter==="WAIT"?"":"WAIT")} title="Lọc: chỉ hiện Candidate đang chờ (LOCKED, có chain)">{waitingCandidates.length} WAIT</button>
       {holdCandidates.length>0&&<><span>·</span><button type="button" className={`btn small status-chip ${statusFilter==="HOLD"?"status-chip-active":""}`} onClick={()=>setStatusFilter(statusFilter==="HOLD"?"":"HOLD")} title="Lọc: Job/Main đang HOLD">{holdCandidates.length} HOLD</button></>}
       {noChainCandidates.length>0&&<><span>·</span><button type="button" className={`btn small status-chip ${statusFilter==="NO_CHAIN"?"status-chip-active":""}`} onClick={()=>setStatusFilter(statusFilter==="NO_CHAIN"?"":"NO_CHAIN")} title="Lọc: chỉ hiện Job KHÔNG có Planning Chain (NO CHAIN)">{noChainCandidates.length} NO CHAIN</button></>}
       <span>·</span>
       <button type="button" className="btn small" onClick={()=>setStatusFilter("")} title="Bỏ lọc trạng thái — hiện tất cả">Tất cả {pagination.totalCandidates} job</button>
       <button className="btn small" type="button" onClick={()=>setDisplayRulesOpen(x=>!x)}>Sắp xếp / Lọc</button>
       <button className="btn small" type="button" onClick={()=>setColumnPickerOpen(x=>!x)}>Cột ({configurableActiveColumns.length}/{configurableColumns.length})</button>
       <button className="btn small" type="button" onClick={()=>setOperationPickerOpen(x=>!x)} title="Chọn NextOperation được hiển thị">Công đoạn ({effectiveStView.size}/{allNextOps.length})</button>
       <button className="btn small" type="button" onClick={()=>setFullView(x=>!x)} title="ESC để thoát Full View">{fullView?"Thoát toàn màn hình":"Toàn màn hình"}</button>
       <button className="btn small" type="button" onClick={runRecipeCompare} disabled={recipeCompareLoading} title="So sánh cấu hình Recipe (Công thức & Rule) với nhu cầu thực tế trên board — tìm mapping thiếu / mapping không được dùng">{recipeCompareLoading?"Đang so sánh…":"⇄ So sánh Recipe"}</button>
       <button className="btn small" type="button" title="Ghim dòng tiêu đề và các cột bên trái." onClick={()=>{if(freezeMenuOpen){setFreezeMenuOpen(false);return;}if(freezePick){setFreezePick(false);setFreezeDraft(null);return;}if(freeze.mode==="off"){setFreezePick(true);return;}setFreezeMenuOpen(true);}}>{freezePick?"Chọn cột…":freeze.mode==="off"?"Ghim cột":freezeLabel}</button>
       <button className="btn small" disabled={busy} onClick={rebuild}>Rebuild Chain</button>
      </div>
     </div>}

    {erpMode&&<div className="erpkit-workload-summary">
     <div className="erpkit-workload-summary-head">
      <div>
       <b>Workload Summary</b>
       <small>{selectedAreaId?selectedAreaName:"Tất cả khu vực"}{standardOperation?` · ${standardOperation}`:""} · Candidate ST View → READY / WAIT / HOLD theo Route Matrix / Planning Chain đang active</small>
      </div>
      <div className="erpkit-workload-summary-kpis">
       <div className="erpkit-workload-summary-kpi is-ready"><b>{formatNumber(workloadTotals.READY.surface)} dm²</b><span>{formatNumber(workloadTotals.READY.qty)} pcs · {formatNumber(workloadTotals.READY.jobs,0)} Job</span><small>READY · Prev S {formatNumber(workloadTotals.READY_PREV_SCHEDULED.jobs,0)} · Prev U/Start {formatNumber(workloadTotals.READY_PREV_UNSCHEDULED.jobs,0)}</small></div>
       <div className="erpkit-workload-summary-kpi is-wait"><b>{formatNumber(workloadTotals.WAIT.surface)} dm²</b><span>{formatNumber(workloadTotals.WAIT.qty)} pcs · {formatNumber(workloadTotals.WAIT.jobs,0)} Job</span><small>WAIT</small></div>
       <div className="erpkit-workload-summary-kpi is-hold"><b>{formatNumber(workloadTotals.HOLD.surface)} dm²</b><span>{formatNumber(workloadTotals.HOLD.qty)} pcs · {formatNumber(workloadTotals.HOLD.jobs,0)} Job</span><small>HOLD</small></div>
       <div className="erpkit-workload-summary-kpi is-total"><b>{formatNumber(workloadGrandTotal.surface)} dm²</b><span>{formatNumber(workloadGrandTotal.qty)} pcs · {formatNumber(workloadGrandTotal.jobs,0)} Job</span><small>TỔNG R+W+H</small></div>
      </div>
      <div className="erpkit-workload-summary-actions">
       {workloadDrill&&<button type="button" className="erpkit-btn" onClick={clearWorkloadDrill}>Xóa lọc {workloadDrill.main} · {workloadDrill.bucket}</button>}
       <button type="button" className="erpkit-btn" onClick={()=>void refreshWorkloadSummary()} disabled={workloadLoading}>{workloadLoading?"Đang đọc…":"Làm mới"}</button>
       <button type="button" className="erpkit-btn" onClick={()=>setWorkloadOpen(x=>!x)}>{workloadOpen?"Thu gọn":"Mở bảng"}</button>
      </div>
     </div>
     {workloadError&&<div className="erpkit-workload-summary-error">Không đọc được Workload Summary: {workloadError}</div>}
     {workloadOpen&&!workloadError&&<div className="erpkit-workload-summary-table-wrap">
      <table className="erpkit-workload-summary-table">
       <thead><tr><th>Khu vực</th><th>Main Operation</th><th>READY · Previous Main Scheduled</th><th>READY · Previous Main Unscheduled / START</th><th>WAIT</th><th>HOLD</th><th>Tổng tải</th></tr></thead>
       <tbody>
        {workloadRows.map(row=>{
         const key=`${row.areaId}|${row.standardOperation}`;
         const metricButton=(bucket:WorkloadBucket,metric:WorkloadMetric)=>{
          const active=Boolean(workloadDrill&&normalized(workloadDrill.main)===normalized(row.standardOperation)&&workloadDrill.bucket===bucket);
          const busyKey=`${normalized(row.standardOperation)}|${bucket}`;
          const tone=bucket.startsWith("READY_PREV_")?"ready":bucket.toLowerCase();
          const label=bucket==="READY_PREV_SCHEDULED"?"READY · Previous Main Scheduled":bucket==="READY_PREV_UNSCHEDULED"?"READY · Previous Main Unscheduled / START":bucket;
          return <button
           type="button"
           className={`erpkit-workload-metric is-${tone} ${active?"is-active":""}`}
           disabled={!metric.jobs||Boolean(workloadDrillLoading)}
           onClick={()=>void drillWorkload(row,bucket)}
           title={metric.jobs?`Lọc Candidate: ${row.standardOperation} · ${label}`:"Không có Job"}
          >
           <b>{workloadDrillLoading===busyKey?"…":`${formatNumber(metric.surface)} dm²`}</b>
           <span>{formatNumber(metric.qty)} pcs · {formatNumber(metric.jobs,0)} Job</span>
          </button>;
         };
         return <tr key={key}>
          <td><b>{row.areaName}</b></td>
          <td><b className="mono">{row.standardOperation}</b></td>
          <td>{metricButton("READY_PREV_SCHEDULED",row.readyPrevScheduled)}</td>
          <td>{metricButton("READY_PREV_UNSCHEDULED",row.readyPrevUnscheduled)}</td>
          <td>{metricButton("WAIT",row.wait)}</td>
          <td>{metricButton("HOLD",row.hold)}</td>
          <td><div className="erpkit-workload-total"><b>{formatNumber(row.total.surface)} dm²</b><span>{formatNumber(row.total.qty)} pcs · {formatNumber(row.total.jobs,0)} Job</span></div></td>
         </tr>;
        })}
        {!workloadRows.length&&!workloadLoading&&<tr><td colSpan={7} className="muted">Không có READY / WAIT / HOLD trong phạm vi này.</td></tr>}
       </tbody>
      </table>
     </div>}
    </div>}

    {freezePick&&!freezeDraft&&
     <div className="freeze-hint-bar">{erpMode?<><b>Chọn cột cần ghim.</b> Các cột bên trái và hàng tiêu đề sẽ được cố định. Nhấn Esc để hủy.</>:<><b>Chọn vị trí freeze:</b> click vào <b>tiêu đề cột</b> trong bảng — các cột bên trái và dòng tiêu đề sẽ được ghìm (ESC để hủy).</>}</div>}
    {freezeDraft&&
     <div className="freeze-confirm-bar">
      {erpMode?"Ghim đến":"Ghim đến cột"} <b>{freezeDraft.col}</b>: <b className="freeze-confirm-col">{freezeColumnLabels[Math.min(freezeDraft.col??1,FREEZE_MAX_COLS)-1]??`Cột ${freezeDraft.col}`}</b>
      <button className="btn small" type="button" onClick={()=>persistFreeze(freezeDraft)}>{erpMode?"Xác nhận":"✓ Chốt"}</button>
      <button className="btn small" type="button" onClick={()=>setFreezeDraft(null)}>Hủy</button>
     </div>}
    {freezeMenuOpen&&freeze.mode!=="off"&&
     <div className="freeze-menu">
      <div className="freeze-menu-title">{erpMode?"Đang ghim:":"Đang ghim:"} <b>{freezeLabel}</b></div>
      <div className="row">
       <button type="button" className="btn small" onClick={()=>{setFreezeMenuOpen(false);setFreezePick(true);}}>Đổi vị trí…</button>
       <button type="button" className="btn small" onClick={()=>persistFreeze({mode:"header"})}>Chỉ dòng tiêu đề</button>
       <button type="button" className="btn small" onClick={()=>persistFreeze({mode:"off"})}>Bỏ ghim</button>
      </div>
     </div>}



    {/* v282: Modal So sánh Cấu hình Recipe ↔ Board */}
    {recipeCompareOpen&&recipeCompare&&
     <div className="recipe-compare-panel">
      <div className="recipe-diagnosis-head">
       <b>{erpMode?"Đối chiếu cấu hình Recipe":"⇄ So sánh Cấu hình Recipe ↔ Board"}</b>
       <button className="btn small" type="button" onClick={()=>setRecipeCompareOpen(false)}>×</button>
      </div>
      {recipeCompare.error?(
       <div className="notice">Lỗi: {recipeCompare.error}</div>
      ):(
       <>
        <div className="recipe-compare-section">
         <div className="recipe-compare-title">
          <b>{erpMode?"Thiếu cấu hình cho Job đang chờ":"① Board CẦN nhưng CẤU HÌNH THIẾU"}</b>
          <small>{erpMode?"Các Operation Code đang có Job READY nhưng chưa tìm thấy Recipe phù hợp.":'Operation Code của các Job ELIGIBLE đang chờ trên board — nếu chưa có mapping thì Job báo "Chưa có Recipe".'}</small>
         </div>
         {recipeCompare.boardNeeds?.length?(
          <div className="table-wrap">
           <table className="erp-table recipe-compare-table">
            <thead>
             <tr><th>Operation Code</th><th>{erpMode?"Main Operation":"Công đoạn chính"}</th><th className="num">Job chờ</th><th>{erpMode?"Job tham chiếu":"Job mẫu"}</th><th>Cấu hình</th><th className="action"></th></tr>
            </thead>
            <tbody>
             {recipeCompare.boardNeeds.map((x:any,i:number)=>
              <tr key={i} className={x.config_found?"":"row-warn"}>
               <td><b>{x.source_operation_code}</b></td>
               <td>{x.standard_operation||"—"}</td>
               <td className="num">{x.waiting_jobs}</td>
               <td><small>{(x.sample_jobs||[]).join(", ")}</small></td>
               <td>{x.config_found?<span className="job-state state-eligible">✓ Đã có</span>:<span className="job-state state-changed">✕ Thiếu</span>}</td>
               <td>
                {!x.config_found&&
                 <a className="btn small" href={`/recipe-operation-map?op=${encodeURIComponent(x.source_operation_code)}`}>Cấu hình →</a>}
               </td>
              </tr>
             )}
            </tbody>
           </table>
          </div>
         ):<div className="notice">{erpMode?"Không có Job READY nào đang chờ trong phạm vi hiện tại.":"Không có Job ELIGIBLE nào đang chờ trên board."}</div>}
        </div>

        <div className="recipe-compare-section">
         <div className="recipe-compare-title">
          <b>{erpMode?"Cấu hình hiện chưa được sử dụng":"② CẤU HÌNH CÓ nhưng BOARD KHÔNG dùng"}</b>
          <small>{erpMode?"Các cấu hình đang bật nhưng chưa khớp Job READY nào trong phạm vi hiện tại.":"Mapping đã tạo nhưng hiện không khớp Job ELIGIBLE nào trên board."}</small>
         </div>
         {recipeCompare.configUnused?.length?(
          <div className="table-wrap">
           <table className="erp-table recipe-compare-table">
            <thead>
             <tr><th>Operation Code</th><th>Recipe</th><th>{erpMode?"Ghi chú":"Vấn đề"}</th></tr>
            </thead>
            <tbody>
             {recipeCompare.configUnused.map((x:any,i:number)=>
              <tr key={i}>
               <td><b>{x.operation_code}</b></td>
               <td><b>{x.recipe_no||x.recipe_key}</b><small>{x.recipe_name||""}</small></td>
               <td><small>{x.issue}</small></td>
              </tr>
             )}
            </tbody>
           </table>
          </div>
         ):<div className="notice">{erpMode?"Mọi cấu hình đang bật đều khớp ít nhất một Job trong phạm vi hiện tại.":"Mọi mapping đang hoạt động đều khớp ít nhất 1 Job trên board."}</div>}
        </div>
       </>
      )}
     </div>}

    {displayRulesOpen&&
     <div className="candidate-display-rules">
      <div className="candidate-display-rules-head">
       <div>
        <b>{erpMode?"Thiết lập hiển thị":"Hiển thị & lọc Candidate"}</b>
        <small>
         {`${exactViewLabel}${viewLoadedFor===exactViewKey?" · đã lưu mặc định":""}`}
        </small>
       </div>
       <div className="row">
        <button className="btn small" type="button" onClick={saveCurrentDefault}>
         Lưu mặc định
        </button>
        <button className="btn small" type="button" onClick={resetToCurrentDefault}>
         Tải mặc định
        </button>
        <button className="btn small" type="button" onClick={deleteCurrentDefault} disabled={viewLoadedFor!==exactViewKey}>
         Xóa mặc định
        </button>
        <button className="btn small" type="button" onClick={resetDisplayRules}>Đặt lại</button>
       </div>
      </div>

      {viewMessage&&<div className="candidate-view-message">{viewMessage}</div>}

      <div className="candidate-filter-grid">
       <label>{erpMode?"Main Operation tiếp theo":"Next Main Plan Op"}
        <select className="input" value={filterNextMain} onChange={e=>setFilterNextMain(e.target.value)}>
         <option value="">Tất cả</option>
         {nextMainOptions.map(v=><option key={v} value={v}>{v}</option>)}
        </select>
       </label>

       <label>{erpMode?"Next Operation":"NextOperation"}
        <select className="input" value={filterNextOperation} onChange={e=>setFilterNextOperation(e.target.value)}>
         <option value="">Tất cả</option>
         {nextOperationOptions.map(v=><option key={v} value={v}>{v}</option>)}
        </select>
       </label>

       <label>{erpMode?"Primer 1":"Part Master PRIMER1"}
        <select className="input" value={filterPrimer1} onChange={e=>setFilterPrimer1(e.target.value)}>
         <option value="">Tất cả</option>
         {primer1Options.map(v=><option key={v} value={v}>{v}</option>)}
        </select>
       </label>

       <label>{erpMode?"Primer 2":"Part Master PRIMER2"}
        <select className="input" value={filterPrimer2} onChange={e=>setFilterPrimer2(e.target.value)}>
         <option value="">Tất cả</option>
         {primer2Options.map(v=><option key={v} value={v}>{v}</option>)}
        </select>
       </label>

       <label>{erpMode?"Primer 3":"Part Master PRIMER3"}
        <select className="input" value={filterPrimer3} onChange={e=>setFilterPrimer3(e.target.value)}>
         <option value="">Tất cả</option>
         {primer3Options.map(v=><option key={v} value={v}>{v}</option>)}
        </select>
       </label>
      </div>

      {/* v338: lọc theo trạng thái từng cột Main Planning (Route Matrix) */}
      <div className="candidate-route-filter">
       <div className="candidate-sort-title">
        <b>{erpMode?"Lọc trạng thái theo Main Operation":"Main Planning (Route Matrix) — lọc theo trạng thái từng cột"}</b>
        {Object.keys(filterRouteMain).length>0&&(
         <button className="btn small" type="button" onClick={()=>setFilterRouteMain({})}>Xóa hết ({Object.keys(filterRouteMain).length})</button>
        )}
       </div>
       <div className="candidate-filter-grid candidate-route-filter-grid">
        {routeColumns.map(col=>{
         const op=normalized(col.label);
         const val=filterRouteMain[op]||"";
         return <label key={col.key} title={`${planningColumnLabel(col)} — lọc theo trạng thái cột này`}>{planningColumnLabel(col)}
          <select className="input" value={val} onChange={e=>{
           const v=e.target.value;
           setFilterRouteMain(prev=>{
            const next={...prev};
            if(v)next[op]=v;else delete next[op];
            return next;
           });
          }}>
           <option value="">Tất cả</option>
           <option value="__ANY__">{erpMode?"Có công đoạn":"Có occurrence"}</option>
           <option value="__NONE__">{erpMode?"Không có công đoạn":"Không occurrence"}</option>
           {ROUTE_STATUS_FILTER_OPTIONS.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
         </label>;
        })}
       </div>
      </div>

      <div className="candidate-sort-rules">
       <div className="candidate-sort-title">
        <b>{erpMode?"Thứ tự sắp xếp":"Sort Priority"}</b>
        <button className="btn small" type="button" onClick={addSortRule} disabled={sortRules.length>=10}>
         {erpMode?"+ Thêm mức":"+ Sort Level"}
        </button>
       </div>

       {sortRules.map((rule,index)=>
        <div
         className={`candidate-sort-row ${dragSortIndex===index?"is-dragging":""}`}
         key={`${index}-${rule.field}`}
         draggable
         onDragStart={e=>{
          setDragSortIndex(index);
          e.dataTransfer.effectAllowed="move";
          e.dataTransfer.setData("text/plain",String(index));
         }}
         onDragOver={e=>{
          if(dragSortIndex===null || dragSortIndex===index)return;
          e.preventDefault();
          e.dataTransfer.dropEffect="move";
         }}
         onDrop={e=>{
          e.preventDefault();
          if(dragSortIndex!==null)moveSortRule(dragSortIndex,index);
          setDragSortIndex(null);
         }}
         onDragEnd={()=>setDragSortIndex(null)}
        >
         <span className="candidate-sort-level">{index+1}</span>
         <select
          className="input"
          value={rule.field}
          onChange={e=>updateSortRule(index,{field:e.target.value})}
         >
          {candidateSortFields.map(f=>
           <option key={f.key} value={f.key}>{f.label}</option>
          )}
         </select>
         <select
          className="input"
          value={rule.direction}
          onChange={e=>updateSortRule(index,{direction:e.target.value as SortDirection})}
         >
          <option value="asc">{erpMode?"Tăng dần":"ASC"}</option>
          <option value="desc">{erpMode?"Giảm dần":"DESC"}</option>
         </select>
         <button className="btn small" type="button" onClick={()=>removeSortRule(index)}>×</button>
        </div>
       )}
      </div>
     </div>}

    {columnPickerOpen&&
     <div className="candidate-column-picker candidate-column-package-picker">
      <div className="candidate-column-picker-head">
       <b>{erpMode?"Cấu hình cột":"Chọn cột hiển thị"}</b>
       <small>
        {erpMode?<><b>Chọn và sắp xếp cột.</b> Các trường nguồn Open Job có thể giữ trong nhóm hoặc đưa ra vị trí riêng.</>:<><b>Các cột All Open Job mặc định nằm trong nhóm All Open Job.</b> Cột được kéo ra trước/sau nhóm sẽ hiển thị riêng.</>}
       </small>
       <input
        className="input"
        value={columnSearch}
        onChange={e=>setColumnSearch(e.target.value)}
        placeholder={erpMode?"Tìm cột...":"Tìm cột để đưa ra trước / sau Nhóm All Open Job..."}
       />
       <div className="row">
        <button className="btn small" type="button" onClick={()=>{
         const keys=configurableColumns.map(x=>x.key);
         saveColumns(keys,collapsedColumnLayoutFromVisible(keys));
        }}>{erpMode?"Chọn tất cả":"Select All"}</button>
        <button className="btn small" type="button" onClick={()=>{
         const keys=PLANNING_COLUMNS.map(x=>x.key);
         saveColumns(keys,[...keys,ALL_OPEN_JOB_GROUP_KEY]);
        }}>{erpMode?"Chỉ cột kế hoạch":"Planning Only"}</button>
        <button className="btn small" type="button" onClick={collapseAllOpenJobColumns}>{erpMode?"Gom trường Open Job":"Gom All Open Job"}</button>
        <button className="btn small" type="button" onClick={()=>saveColumns([],[ALL_OPEN_JOB_GROUP_KEY])}>{erpMode?"Ẩn tất cả":"Clear"}</button>
       </div>
      </div>

      <div className="candidate-column-package-summary">
       <b>{erpMode?"Bố cục cột":"Thứ tự bố cục"}</b>
       <span>
        {erpMode?`${configurableActiveColumns.filter(x=>x.startsWith("source:")).length}/${sourceColumns.length} trường Open Job đang hiển thị · ${groupedSourceColumns.length} trường trong nhóm · ${visibleGroupedSourceColumns.length} trường đang bật`:<>{configurableActiveColumns.filter(x=>x.startsWith("source:")).length}/{sourceColumns.length} cột All Open Job đang hiển thị · {groupedSourceColumns.length} cột thuộc nhóm · {visibleGroupedSourceColumns.length} cột trong nhóm đang hiển thị</>}
       </span>
      </div>

      <div className="candidate-column-picker-grid candidate-column-order-grid candidate-column-layout-grid">
       {effectiveColumnLayout.map((item,index)=>{
        const isGroup=item===ALL_OPEN_JOB_GROUP_KEY;
        const c=isGroup?null:configurableColumns.find(x=>x.key===item);
        if(!isGroup&&!c)return null;
        const label=isGroup?(erpMode?"Nhóm trường Open Job":"📦 Nhóm cột All Open Job"):planningColumnLabel(c!);
        const groupLabel=isGroup
         ?`${groupedSourceColumns.length} ${erpMode?"trường":"cột"} nằm trong nhóm`
         :(c!.group==="planning"?(erpMode?"Kế hoạch":"Planning"):(erpMode?"Open Job · ngoài nhóm":"All Open Job · đã đưa ra khỏi nhóm"));
        return <div
         key={item}
         className={`candidate-column-choice candidate-column-order-item candidate-column-layout-item ${isGroup?"is-column-package":"is-visible"} ${dragColumnKey===item?"is-dragging":""}`}
         draggable
         onDragStart={e=>{
          setDragColumnKey(item);
          e.dataTransfer.effectAllowed="move";
          e.dataTransfer.setData("text/plain",item);
         }}
         onDragOver={e=>{
          if(!dragColumnKey||dragColumnKey===item)return;
          e.preventDefault();e.dataTransfer.dropEffect="move";
         }}
         onDrop={e=>{
          e.preventDefault();
          if(!dragColumnKey||dragColumnKey===item)return;
          moveLayoutItemTo(dragColumnKey,index);
          setDragColumnKey("");
         }}
         onDragEnd={()=>setDragColumnKey("")}
        >
         <div className="candidate-column-toggle candidate-column-package-label">
          {!isGroup&&<input type="checkbox" checked onChange={()=>toggleColumn(item)}/>} 
          <span>{label}</span>
          <small>{groupLabel}</small>
         </div>
         <div className="candidate-column-order-actions">
          <span className="candidate-column-order-number">{index+1}</span>
          <button className="btn small" type="button" title="Đưa lên trước" disabled={index<=0} onClick={()=>moveLayoutItem(item,-1)}>↑</button>
          <button className="btn small" type="button" title="Đưa xuống sau" disabled={index>=effectiveColumnLayout.length-1} onClick={()=>moveLayoutItem(item,1)}>↓</button>
          <button className="btn small" type="button" title="Đưa lên đầu" disabled={index<=0} onClick={()=>moveLayoutItemTo(item,0)}>⇤</button>
          <button className="btn small" type="button" title="Đưa xuống cuối" disabled={index>=effectiveColumnLayout.length-1} onClick={()=>moveLayoutItemTo(item,effectiveColumnLayout.length-1)}>⇥</button>
          {!isGroup&&c!.group==="allopen"&&
           <button className="btn small" type="button" title="Đưa cột này trở lại Nhóm cột All Open Job" onClick={()=>putSourceInGroup(item)}>Vào nhóm</button>}
         </div>
        </div>;
       })}
      </div>

      {columnSearch.trim()&&<>
       <div className="candidate-column-search-title">
        <b>{erpMode?"Kết quả tìm kiếm":"Kết quả tìm cột"}</b>
        <small>{erpMode?"Chọn vị trí hiển thị hoặc giữ trường trong nhóm Open Job.":"Tất cả cột All Open Job mặc định ở trong nhóm. Đưa Trước/Sau nhóm để tách cột ra; checkbox chỉ điều khiển ẩn/hiện."}</small>
       </div>
       <div className="candidate-column-picker-grid candidate-column-search-grid">
        {filteredColumnChoices.map(c=>{
         const visible=isColumnVisible(c.key);
         const isSource=c.key.startsWith("source:");
         const explicit=isSource&&effectiveColumnLayout.includes(c.key);
         const groupIndex=effectiveColumnLayout.indexOf(ALL_OPEN_JOB_GROUP_KEY);
         const itemIndex=effectiveColumnLayout.indexOf(c.key);
         const location=isSource&&!explicit
          ?`${erpMode?"Trong nhóm Open Job":"Trong Nhóm All Open Job"} · ${visible?"đang hiển thị":"đang ẩn"}`
          :!visible
           ?"Đang ẩn"
           :isSource
            ?(itemIndex>=0&&groupIndex>=0&&itemIndex<groupIndex?"Trước nhóm":"Sau nhóm")
            :(erpMode?"Kế hoạch":"Planning");
         return <div key={c.key} className={`candidate-column-choice candidate-column-search-item ${visible?"is-visible":""}`}>
          <label className="candidate-column-toggle">
           <input type="checkbox" checked={visible} onChange={()=>toggleColumn(c.key)}/>
           <span>{planningColumnLabel(c)}</span>
           <small>{location}</small>
          </label>
          {isSource&&<div className="candidate-column-search-actions">
           <button className="btn small" type="button" onClick={()=>placeSourceRelativeToGroup(c.key,"before")}>{erpMode?"Trước nhóm":"← Trước nhóm"}</button>
           <button className="btn small" type="button" onClick={()=>putSourceInGroup(c.key)}>Trong nhóm</button>
           <button className="btn small" type="button" onClick={()=>placeSourceRelativeToGroup(c.key,"after")}>{erpMode?"Sau nhóm":"Sau nhóm →"}</button>
          </div>}
         </div>;
        })}
        {!filteredColumnChoices.length&&<div className="candidate-column-empty">Không có cột nào khớp tìm kiếm.</div>}
       </div>
      </>}
     </div>}

    {operationPickerOpen&&
     <div className="candidate-column-picker candidate-operation-picker">
      <div className="candidate-column-picker-head">
       <b>{erpMode?"Phạm vi công đoạn":"Chọn công đoạn hiển thị"}</b>
       <small>{erpMode?"Chọn Operation Code cần hiển thị trên ma trận kế hoạch.":"Lọc Job theo NextOperation. Tick/bỏ tick để đổi ngay các công đoạn đang xem; nếu cần nạp thêm dữ liệu, bấm “Áp dụng & nạp Candidate”."}</small>
       <input
        className="input"
        value={opSearch}
        onChange={e=>setOpSearch(e.target.value)}
        placeholder={erpMode?"Tìm Operation Code...":"Tìm công đoạn..."}
       />
       <div className="row">
        <button className="btn small" type="button" onClick={()=>changeStView(allNextOps.map(o=>o.code))}>{erpMode?`Chọn tất cả (${allNextOps.length})`:`Chọn hết (${allNextOps.length})`}</button>
        <button className="btn small" type="button" onClick={()=>changeStView([])}>{erpMode?"Bỏ chọn":"Bỏ hết"}</button>
        <button className="btn small primary" type="button" title={erpMode?"Lưu phạm vi công đoạn và nạp lại dữ liệu":"Lưu lựa chọn và nạp lại Candidate"} onClick={async()=>{
         const views=readOperationViews();
         const existing=views[exactViewKey];
         const payload:CandidateViewPreset={
          columns:[...configurableActiveColumns],
          columnLayout:[...effectiveColumnLayout],
          stView:[...effectiveStView],
          filters:existing?.filters ?? {nextMain:filterNextMain,nextOperation:filterNextOperation,primer1:filterPrimer1,primer2:filterPrimer2,primer3:filterPrimer3,routeMain:filterRouteMain,colFilters},
          sortRules:existing?.sortRules ?? [...sortRules],
          density:existing?.density ?? candidateDensity,
          routeFocus:existing?.routeFocus ?? routeFocus
         };
         const nextViews={...views,[exactViewKey]:payload};
         setServerViews(nextViews);
         try{window.localStorage.setItem(VIEW_STORAGE_KEY,JSON.stringify(nextViews));}catch{}
         try{
          const r=await fetch("/api/planning/board-view",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"save",view_key:exactViewKey,payload})});
          const d=await safeJson(r);
          if(!r.ok)throw new Error(d?.error||(erpMode?"Không lưu được phạm vi công đoạn.":"Không lưu được VIEW CÔNG ĐOẠN ST."));
          setOperationPickerOpen(false);
          // v390: never reload the browser page from Planning Board. The shell
          // refresh preserves scroll/filter/zoom/selection state.
          onReloadCandidates?.();
         }catch(e){
          setViewMessage(erpMode?`Không lưu được phạm vi công đoạn: ${e instanceof Error?e.message:String(e)}`:`Không lưu được VIEW CÔNG ĐOẠN ST: ${e instanceof Error?e.message:String(e)}`);
          setTimeout(()=>setViewMessage(""),2600);
         }
        }}>{erpMode?"Áp dụng và nạp lại":"Áp dụng & nạp Candidate"}</button>
        <button className="btn small" type="button" onClick={()=>setOperationPickerOpen(false)}>Đóng</button>
       </div>
      </div>
      <div className="candidate-column-picker-grid candidate-operation-grid">
       {filteredAllOps.map(o=>{
        const on=effectiveStView.has(o.code);
        return <div key={o.code} className={`candidate-column-choice candidate-operation-item ${on?"is-visible":""}`}>
         <label className="candidate-column-toggle">
          <input type="checkbox" checked={on} onChange={()=>{
           const next=new Set(effectiveStView);
           if(next.has(o.code))next.delete(o.code);else next.add(o.code);
           changeStView([...next]);
          }}/>
          <span>{o.code}</span>
          <small>{o.inPanel?"Đã cấu hình ST":erpMode?"Job nguồn":"Chỉ trong All Open Jobs"}{Number(o.jobs||0)>0?` · ${o.jobs} ${erpMode?"Job":"job"}`:""}{loadedByOp.get(o.code)?(erpMode?` · ${loadedByOp.get(o.code)}/${o.jobs} đã tải`:` · hiện ${loadedByOp.get(o.code)}/${o.jobs}`):""}</small>
         </label>
        </div>;
       })}
       {!filteredAllOps.length&&<div className="candidate-column-empty">Không có công đoạn nào khớp tìm kiếm.</div>}
       {!effectiveStView.size&&
        <div className="candidate-column-empty candidate-column-empty-info">{erpMode?"Chưa chọn công đoạn. Chọn ít nhất một Operation Code để hiển thị Job.":"Đã bỏ hết — Candidate Jobs TRỐNG (không hiện job nào). Tick lại các ô bên trên để hiện."}</div>}
      </div>
     </div>}

    {erpMode&&<div className="erpkit-live-matrix-legend">
     <span className="is-done"><i/><b>D</b> Done</span><span className="is-ready"><i/><b>R</b> Ready</span><span className="is-wait"><i/><b>W</b> Wait</span><span className="is-batch"><i/><b>U</b> Unscheduled</span><span className="is-scheduled"><i/><b>S</b> Scheduled</span><span className="is-muted"><b>P</b> Planned · <b>RN</b> Running · <b>H</b> Hold · — N/A</span>
     <small>Chọn R để thêm Job vào Batch · thứ tự cột theo Main Planning Order</small>
    </div>}

    <div ref={candidateTableWrapRef} className="table-wrap">
     <table
      ref={freezeTableRef}
      className={`erp-table planning-candidate-table${erpMode?" planning-erp-matrix-table":""}${freezeActive||freezeDraft?" candidate-freeze-on":""}`}
      style={erpMode?({"--planning-matrix-zoom":String(matrixZoom/100)} as CSSProperties):undefined}
      data-fc={freezeCol>0?String(freezeCol):"0"}
      onClickCapture={e=>{
       if(!freezePick)return;
       const th=(e.target as HTMLElement).closest("th");
       if(!th)return;
       e.preventDefault();e.stopPropagation();
       const col=Math.max(1,Math.min((th as HTMLTableCellElement).cellIndex+1,FREEZE_MAX_COLS));
       setFreezeDraft({mode:"col",col});
      }}
     >
      <thead>
       <tr>
        <th>
         <input
          type="checkbox"
          checked={(()=>{
           const rows=batchScopedDisplayCandidates
            .map(row=>({row,target:selectableTargetFor(row)}))
            .filter(x=>x.target)
            .filter(x=>!operationSelectionLocked(x.row)&&!compatibilityLockedForTarget(x.row));
           return rows.length>0 && rows.every(x=>selected.includes(Number(x.target!.id)));
          })()}
          onChange={toggleAll}
         />
        </th>
        {batchScopedActiveColumns.map(key=>renderCandidateHeader(key))}
       </tr>
      </thead>
      <tbody>
       {batchScopedRenderedCandidates.map((x)=>
        <tr
         key={String(x.job_num)}
         className={`${selectableTargetFor(x)&&selected.includes(selectableTargetFor(x)!.id)?"planning-row-selected ":""}${dragCandidateId===x.id?"planning-row-dragging ":""}${priorityClass(x.priority_type)}`.trim()}
         draggable={Boolean(selectableTargetFor(x))&&!operationSelectionLocked(x)&&!compatibilityLockedForTarget(x)}
         onDragStart={e=>{
          const target=selectableTargetFor(x);
          if(!target||operationSelectionLocked(x)||compatibilityLockedForTarget(x))return;
          setDragCandidateId(x.id);
          e.dataTransfer.effectAllowed="copy";
          e.dataTransfer.setData("application/x-st-candidate",String(x.id));
         }}
         onDragEnd={()=>setDragCandidateId(null)}
        >
         <td>
          <input
           type="checkbox"
           checked={Boolean(selectableTargetFor(x)&&selected.includes(selectableTargetFor(x)!.id))}
           disabled={!selectableTargetFor(x)||operationSelectionLocked(x)||compatibilityLockedForTarget(x)}
           title={!selectableTargetFor(x)
              ?"Job chưa có Main READY để thêm Batch"
              :operationSelectionLocked(x)
               ?erpMode?"Khác Main Operation với Job đã chọn":"Khác Standard Operation với Job đã chọn"
               :compatibilityLockedForTarget(x)
                ?(compatibilityReasonForId(Number(selectableTargetFor(x)!.id),selectableTargetFor(x)!.standardOperation)||"Khác Recipe / điều kiện của Batch")
                :`Chọn ${selectableTargetFor(x)!.standardOperation} READY`}
           onChange={()=>toggle(x.id)}
          />
         </td>
         {batchScopedActiveColumns.map(key=>renderCandidateCell(x,key))}
        </tr>
       )}
       {batchScopedRenderedCandidates.length<batchScopedDisplayCandidates.length&&
        <tr ref={candidateDomSentinelRef} className="candidate-dom-sentinel"><td colSpan={1+batchScopedActiveColumns.length}>
         {erpMode?<>Đang hiển thị {batchScopedRenderedCandidates.length}/{batchScopedDisplayCandidates.length} dòng · cuộn xuống để tải thêm.</>:<>Đang hiển thị {batchScopedRenderedCandidates.length}/{batchScopedDisplayCandidates.length} dòng — cuộn xuống để tải thêm.</>}
        </td></tr>}
       {!batchScopedDisplayCandidates.length&&
        <tr><td colSpan={1+batchScopedActiveColumns.length} className="muted">
         {erpMode?"Không có Job phù hợp với bộ lọc hiện tại.":"Không có Candidate phù hợp với filter hiện tại."}
        </td></tr>}
      </tbody>
     </table>
    </div>
   </section>

   <aside
    className={`erp-table-panel planning-batch-panel ${erpMode?"erpkit-live-batch-panel ":""}${dragCandidateId!==null?"planning-batch-drop-ready":""}`}
    onDragOver={e=>{
     if(dragCandidateId===null)return;
     e.preventDefault();
     e.dataTransfer.dropEffect="copy";
    }}
    onDrop={e=>{
     e.preventDefault();
     const raw=e.dataTransfer.getData("application/x-st-candidate");
     const id=Number(raw||dragCandidateId);
     if(Number.isFinite(id))addCandidateToSelection(id);
     setDragCandidateId(null);
    }}
   >
    <div className="erp-panel-head planning-batch-head">
     <b>{erpMode?"Lập Batch":"Batch Builder"}</b>
    </div>

    <div className="planning-batch-body planning-batch-body-compact">
     {erpMode&&selectedRows.length===0&&<div className="erpkit-batch-selection-hint"><b>Chưa chọn Job</b><span>Chọn một cell READY trong ma trận để bắt đầu tạo Batch.</span></div>}
     <div className="planning-summary-grid planning-summary-grid-compact">
      <div><span>{erpMode?"Main Operation":"Operation"}</span><b>{selectedOperation||standardOperation||(areaMode?"Chọn Job để xác định":"—")}</b></div>
      <div><span>{erpMode?"Số Job":"Jobs"}</span><b>{selectedRows.length}</b></div>
      <div><span>{erpMode?"Tổng Qty":"Total Qty"}</span><b>{formatNumber(totalQty)}</b></div>
      <div><span>{erpMode?"Tổng diện tích":"Total Surface"}</span><b>{formatNumber(totalSurface)} dm²</b></div>
      <div className="planning-process-time"><span>{erpMode?"Thời gian xử lý":"Process Time"}</span><b>{minutesToHHMM(estimatedMinutes)}</b></div>
     </div>

     {compatibilityLock&&
      <div className={`planning-compatibility-lock ${compatibilityLock.error?"is-error":compatibilityLock.loading?"is-loading":"is-active"}`}>
       <div className="planning-compatibility-lock-head">
        <b>{erpMode?"Điều kiện gom Batch":"🔒 Batch Compatibility"}</b>
        <span>{compatibilityLock.loading?"Đang kiểm tra…":`${compatibilityLock.compatible} cho phép · ${compatibilityLock.locked} khóa`}</span>
       </div>
       {compatibilityLock.profile&&<>
        <div><span>Main Operation</span><b>{compatibilityLock.profile.standardOperation||"—"}</b></div>
        <div><span>Recipe</span><b>{compatibilityLock.profile.recipeNo||compatibilityLock.profile.recipeKey||"Không dùng Recipe"}{compatibilityLock.profile.recipeName?` · ${compatibilityLock.profile.recipeName}`:""}</b></div>
        {compatibilityLock.profile.recipeMappingId&&<div><span>{erpMode?"Quy tắc Recipe":"Recipe Rule"}</span><b className="mono">#{compatibilityLock.profile.recipeMappingId}</b></div>}
        {compatibilityLock.profile.conditions.length>0?
         <div className="planning-compatibility-condition-picker">
          <span>{erpMode?"Điều kiện áp dụng":"Điều kiện Recipe dùng để gom lô"}</span>
          <div>
           {compatibilityLock.profile.conditions.map(cond=>{
            const checked=(compatibilityLock.profile?.selectedConditionColumns||[])
             .some(x=>normalized(x)===normalized(cond.source_column));
            return <label key={`${cond.source_column}|${cond.source_value}`} className={checked?"is-checked":""}>
             <input
              type="checkbox"
              checked={checked}
              disabled={compatibilityLock.loading}
              onChange={e=>toggleCompatibilityCondition(cond.source_column,e.target.checked)}
             />
             <b>{cond.source_column}</b>
             <span>{cond.operator==="not_empty"?"không rỗng":cond.operator==="is_empty"?"rỗng":cond.operator==="contains"?`chứa ${cond.source_value||"—"}`:cond.operator==="starts_with"?`bắt đầu ${cond.source_value||"—"}`:cond.operator==="ends_with"?`kết thúc ${cond.source_value||"—"}`:`= ${cond.source_value||"—"}`}</span>
            </label>;
           })}
          </div>
          <small>{compatibilityLock.profile.selectedConditionColumns.length
           ?`Đang khóa theo: ${compatibilityLock.profile.conditionText}`
           :erpMode?"Không chọn điều kiện: chỉ kiểm tra cùng Recipe.":"Không chọn condition: chỉ khóa theo cùng Recipe."}</small>
         </div>:
         <div><span>Điều kiện</span><b>{erpMode?"Cấu hình Recipe không có điều kiện Open Job":"Recipe mapping không có điều kiện Open Job"}</b></div>}
        <small>{compatibilityLock.profile.source==="BATCH"?(erpMode?"Điều kiện đang kế thừa từ Batch đích":"Điều kiện được lưu theo Target Batch hiện tại"):(erpMode?"Mặc định dùng toàn bộ điều kiện; có thể bỏ chọn để mở rộng Job cùng Recipe":"Mặc định tích tất cả; bỏ tích condition để mở thêm Job cùng Recipe")}</small>
       </>}
       {compatibilityLock.error&&<small className="planning-compatibility-error">{compatibilityLock.error}</small>}
      </div>}

     {suggestionSummary&&selectedRows.length>0&&
      <div className={`planning-rule-suggestion ${suggestionSummary.allSameRecipe?"ok":suggestionSummary.mixedRecipes?"warn":""}`}>
       {suggestionSummary.unanimousRecipe?(
        <>
         <b>{erpMode?"Recipe đề xuất":"✓ Recipe đề xuất cho lô:"}</b>
         <span className="mono">{suggestionSummary.unanimousRecipeLabel||suggestionSummary.unanimousRecipe}</span>
         <span>{erpMode?"Theo cấu hình Main Operation đang chọn":"theo cấu hình Recipe của công đoạn đang tạo lô"}</span>
         {suggestionSummary.unanimousKey&&<span className="mono">Batch Key: {suggestionSummary.unanimousKey}</span>}
         {suggestionSummary.unanimousPrefix&&<span className="mono">Prefix: {suggestionSummary.unanimousPrefix}</span>}
        </>
       ):(
        <>
         <b>{suggestionSummary.mixedRecipes
           ?erpMode?"Recipe không đồng nhất":"⚠ Các Job chọn có Recipe khác nhau"
           :erpMode?"Chưa có Recipe theo cấu hình":"✕ Chưa có Recipe theo cấu hình"}</b>
         <span>
          {suggestionSummary.mixedRecipes
           ? "Kiểm tra lại 'Cấu hình → Công thức & Rule' hoặc chọn Job cùng Recipe."
           : <>{suggestionSummary.unmatchedCount} Job chưa có Recipe — cấu hình tại{" "}
               <a href="/recipe-operation-map">Công thức & Rule</a>.</>}
         </span>
         {!suggestionSummary.mixedRecipes&&firstUnmatchedTarget&&
          <button
           className="btn small"
           type="button"
           onClick={runRecipeDiagnosis}
           disabled={recipeDiagLoading}
          >
           {recipeDiagLoading?"Đang phân tích…":erpMode?"Xem lý do":"🔍 Xem lý do"}
          </button>}
        </>
       )}
      </div>}

     {/* v282: Panel Chẩn đoán Recipe — vì sao Job chưa có Recipe */}
     {recipeDiag&&
      <div className="recipe-diagnosis-panel">
       <div className="recipe-diagnosis-head">
        <b>{erpMode?"Chẩn đoán Recipe":"🔍 Chẩn đoán Recipe"}</b>
        <button className="btn small" type="button" onClick={()=>setRecipeDiag(null)}>×</button>
       </div>
       {recipeDiag.error?(
        <div className="notice">Lỗi: {recipeDiag.error}</div>
       ):(
        <>
         <div className="recipe-diagnosis-job">
          <small>Job</small>
          <b>{firstUnmatchedTarget?.target.candidate.job_num}</b>
          <span className="mono">{recipeDiag.jobSummary}</span>
         </div>
         <div className="recipe-diagnosis-steps">
          {(recipeDiag.steps||[]).map((s:any,i:number)=>
           <div key={i} className={`recipe-step recipe-step-${s.result}`}>
            <span className="recipe-step-icon">
             {s.result==="ok"?"✓":s.result==="fail"?"✕":s.result==="skip"?"—":"ℹ"}
            </span>
            <div>
             <b>{s.step}. {s.title}</b>
             <small>{s.detail}</small>
            </div>
           </div>
          )}
         </div>
         {recipeDiag.matchedRecipe&&
          <div className="recipe-diagnosis-matched">
           <b>{erpMode?"Quy tắc đã khớp":"✓ Rule đã match:"}</b>
           <span className="mono">{recipeDiag.matchedRecipe.recipe_mapping_id?`#${recipeDiag.matchedRecipe.recipe_mapping_id}`:"Mặc định"}</span>
           <span className="mono">{recipeDiag.matchedRecipe.recipe_no||recipeDiag.matchedRecipe.recipe_key}{recipeDiag.matchedRecipe.recipe_name?` · ${recipeDiag.matchedRecipe.recipe_name}`:""}</span>
           {recipeDiag.matchedRecipe.selection_rule&&<small>{recipeDiag.matchedRecipe.selection_rule}</small>}
          </div>}
         {recipeDiag.candidates&&recipeDiag.candidates.length>0&&
          <div className="recipe-diagnosis-candidates">
           <b>{erpMode?"Các cấu hình Recipe hiện có cho":"Các mapping hiện có cho"} “{firstUnmatchedTarget?.target.sourceOperation}”:</b>
           <div className="table-wrap">
            <table className="erp-table recipe-candidate-table">
             <thead>
              <tr><th>{erpMode?"Quy tắc":"Rule"}</th><th>Recipe</th><th>Ưu tiên</th><th>Mặc định</th><th>Điều kiện</th><th>Khớp Job?</th></tr>
             </thead>
             <tbody>
              {recipeDiag.candidates.map((x:any,i:number)=>
               <tr key={i} className={x.matches?"":"row-muted"}>
                <td className="mono">{x.recipe_mapping_id?`#${x.recipe_mapping_id}`:"—"}</td>
                <td><b>{x.recipe_no||"—"}</b><small>{x.recipe_name||""}</small></td>
                <td className="num">{x.priority??"—"}</td>
                <td>{x.is_default?"✓":""}</td>
                <td><small>{x.selection_rule?x.selection_rule:"Không lọc"}</small></td>
                <td>
                 {x.matches
                  ?<span className="job-state state-eligible">Khớp</span>
                  :<span className="job-state state-changed" title={(x.mismatchedConditions||[]).join("\n")}>Không khớp</span>}
                </td>
               </tr>
              )}
             </tbody>
            </table>
           </div>
          </div>}
         <div className="recipe-diagnosis-conclusion">
          <b>Kết luận:</b> {recipeDiag.conclusion}
         </div>
         <div className="recipe-diagnosis-action">
          <b>Cách xử lý:</b> {recipeDiag.action}{" "}
          <a href={recipeDiag.actionHref} className="btn small primary">Mở Công thức & Rule →</a>
         </div>
        </>
       )}
      </div>}

     <label className="planning-target-batch">
      <span>{erpMode?"Batch đích":"Target Batch"}</span>
      <select
       className="input"
       value={targetBatchId}
       onChange={e=>setTargetBatchId(e.target.value)}
       disabled={busy||!selectedOperation}
      >
       <option value="">{erpMode?"Tạo Batch mới":"Create New Batch"}</option>
       {compatibleTargetBatches.map(b=>{
        const scheduleDateTime=b.schedule_id&&b.schedule_start
         ?new Date(b.schedule_start).toLocaleString("vi-VN",{
           timeZone:"Asia/Ho_Chi_Minh",
           day:"2-digit",month:"2-digit",year:"numeric",
           hour:"2-digit",minute:"2-digit",
           hour12:false
          })
         :"";
        const scheduleEndTime=b.schedule_id&&b.schedule_end
         ?new Date(b.schedule_end).toLocaleTimeString("vi-VN",{
           timeZone:"Asia/Ho_Chi_Minh",
           hour:"2-digit",minute:"2-digit",
           hour12:false
          })
         :"";
        const scheduleText=b.schedule_id
         ?[
           erpMode?"ĐÃ ĐIỀU ĐỘ":"SCHEDULED",
           b.resource_code||"",
           scheduleDateTime
            ?`${scheduleDateTime}${scheduleEndTime?`–${scheduleEndTime}`:""}`
            :""
          ].filter(Boolean).join(" · ")
         :(erpMode?"CHƯA ĐIỀU ĐỘ":"UNSCHEDULED");
        return <option key={b.id} value={b.id}>
         {b.batch_no} · {scheduleText} · {b.total_jobs||0} {erpMode?"Job":"jobs"}
        </option>;
       })}
      </select>
      {targetBatchId&&(()=>{
       const b=compatibleTargetBatches.find(x=>String(x.id)===targetBatchId);
       if(!b)return null;
       return <small className="planning-target-batch-info">
        {b.recipe_no?`Recipe ${b.recipe_no} · `:""}
        Qty {formatNumber(b.total_qty)} · {erpMode?"Diện tích":"Surface"} {formatNumber(b.total_surface_dm2)} dm²
        {b.schedule_id&&b.schedule_start
         ? ` · ${b.resource_code||""} ${new Date(b.schedule_start).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}`
         : ""}
       </small>;
      })()}
     </label>

     <button
      className="btn primary planning-create-batch"
      disabled={busy||!selected.length||Boolean(compatibilityLock?.loading)||Boolean(compatibilityLock?.error)}
      onClick={createBatch}>
      {busy
       ?erpMode?"Đang xử lý…":"Đang xử lý..."
       :targetBatchId
        ?erpMode?"Thêm Job vào Batch đã chọn":"Add Selected to Existing Batch"
        :erpMode?"Tạo Batch mới":"Create New Batch"}
     </button>

    </div>
   </aside>

   {holdContextMenu&&<div
    className="job-hold-context-menu"
    style={{left:holdContextMenu.x,top:holdContextMenu.y}}
    onClick={e=>e.stopPropagation()}
    onContextMenu={e=>e.preventDefault()}
   >
    <div className="job-hold-context-title">
     <b>{holdContextMenu.target.jobNum}</b>
     <span>{holdContextMenu.target.standardOperation}</span>
    </div>
    {holdContextMenu.target.isHold
     ?<button type="button" disabled={holdBusy} onClick={()=>releaseJobHoldTarget(holdContextMenu.target)}>Unhold</button>
     :<button type="button" disabled={holdBusy} onClick={()=>{
       const target=holdContextMenu.target;
       setHoldContextMenu(null);
       setHoldDialog(target);
       setHoldReason(String(target.holdReason||"DMR").toUpperCase());
       setHoldNote(String(target.holdNote||""));
      }}>Hold</button>}
   </div>}

   {holdDialog&&<div className="job-hold-modal-backdrop" onMouseDown={()=>!holdBusy&&setHoldDialog(null)}>
    <div className="job-hold-modal" onMouseDown={e=>e.stopPropagation()}>
     <div className="job-hold-modal-head">
      <div><b>{holdDialog.isHold?"Bỏ Hold Job":"Hold Job"}</b><small>{holdDialog.jobNum} · {holdDialog.standardOperation}</small></div>
      <button type="button" className="btn small" disabled={holdBusy} onClick={()=>setHoldDialog(null)}>×</button>
     </div>
     {holdDialog.isHold?(
      <div className="job-hold-current">
       <div><span>Reason</span><b>{holdDialog.holdReason||"—"}</b></div>
       <div><span>Note</span><b>{holdDialog.holdNote||"—"}</b></div>
       <div><span>Held by</span><b>{holdDialog.heldBy||"—"}</b></div>
       <div><span>Held at</span><b>{holdDialog.heldAt?routeDateTime(holdDialog.heldAt):"—"}</b></div>
      </div>
     ):(
      <>
       <label className="job-hold-field"><span>Hold Reason</span><select className="input" value={holdReason} onChange={e=>setHoldReason(e.target.value)} disabled={holdBusy}>
        <option value="DMR">DMR</option><option value="QUALITY">Quality</option><option value="MATERIAL">Material</option><option value="CUSTOMER">Customer</option><option value="OTHER">Other</option>
       </select></label>
       <label className="job-hold-field"><span>Note</span><textarea className="input" rows={3} value={holdNote} onChange={e=>setHoldNote(e.target.value)} placeholder="Ghi chú lý do Hold..." disabled={holdBusy}/></label>
      </>
     )}
     <div className="job-hold-modal-actions">
      <button type="button" className="btn small" disabled={holdBusy} onClick={()=>setHoldDialog(null)}>Đóng</button>
      {holdDialog.isHold
       ?<button type="button" className="btn primary" disabled={holdBusy} onClick={releaseJobHold}>{holdBusy?"Đang xử lý…":"Bỏ Hold"}</button>
       :<button type="button" className="btn primary" disabled={holdBusy||!holdReason} onClick={saveJobHold}>{holdBusy?"Đang xử lý…":"Hold Job"}</button>}
     </div>
    </div>
   </div>}

   {/* v339: Excel-style column filter popup (fixed overlay, không bị cắt bởi scroll container) */}
   {colFilterMenu&&(()=>{
    const sel=colFilters[colFilterMenu.key]||[];
    const left=Math.max(8,Math.min(colFilterMenu.rect.left,window.innerWidth-260));
    const top=Math.min(colFilterMenu.rect.top+4,window.innerHeight-360);
    return <div className="col-filter-popup" style={{left,top,width:Math.max(230,Math.min(colFilterMenu.rect.width,260))}}
      onClick={e=>e.stopPropagation()}>
     <div className="col-filter-popup-head">
      <b>{colFilterMenuLabel}</b>
      <button type="button" className="col-filter-popup-close" onClick={()=>setColFilterMenu(null)}>×</button>
     </div>
     <div className="col-filter-popup-actions">
      <button type="button" className="btn small" onClick={()=>setAllColFilter(colFilterMenu.key,colFilterOptions)}>{erpMode?"Chọn tất cả":"Chọn hết"}</button>
      <button type="button" className="btn small" onClick={()=>setAllColFilter(colFilterMenu.key,[])}>{erpMode?"Bỏ chọn":"Bỏ hết"}</button>
      <span className="muted">{sel.length}/{colFilterOptions.length}</span>
     </div>
     <input className="input col-filter-search" placeholder={erpMode?"Tìm giá trị…":"Tìm giá trị..."} value={colFilterSearch}
      onChange={e=>setColFilterSearch(e.target.value)} autoFocus/>
     <div className="col-filter-list">
      {colFilterOptions.map(v=>{
       const checked=sel.includes(v);
       return <label key={v} className={`col-filter-item ${checked?"is-checked":""}`}>
        <input type="checkbox" checked={checked} onChange={()=>toggleColFilterValue(colFilterMenu.key,v)}/>
        <span>{v}</span>
       </label>;
      })}
      {!colFilterOptions.length&&<div className="muted col-filter-empty">Không có giá trị khớp</div>}
     </div>
    </div>;
   })()}
 </div>
}
