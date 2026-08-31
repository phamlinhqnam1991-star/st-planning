"use client";

import {Fragment,useEffect,useLayoutEffect,useMemo,useRef,useState} from "react";
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
 recipe_no:string|null;
 recipe_name:string|null;
 previous_standard_operation:string|null;
 next_standard_operation:string|null;
 priority_type:string|null;
 recipe_required:boolean;
 planning_status:"LOCKED"|"ELIGIBLE"|"PLANNED";
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
 };
 sortRules:SortRule[];
 density?:"normal"|"compact"|"ultra";
 routeFocus?:boolean;
};
const LEGACY_COLUMN_STORAGE_KEY="st-planning:candidate-columns:v5";
// v298: pagination is gone — ALL Candidates render progressively instead.
// 100 rows paint immediately; each scroll approach appends 100 more.
const CANDIDATE_INITIAL_DOM_ROWS=100;
const CANDIDATE_DOM_ROW_STEP=100;

// Client fetch dùng safeJson chung từ @/lib/fetch-json để mọi màn hình báo lỗi HTTP/HTML nhất quán.

export function PlanningBoardClient({
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
 onReloadCandidates
}:{
 candidates:Candidate[];
 availableBatches:BatchTargetOption[];
 standardOperation:string;
 areaMode:boolean;
 selectedAreaId:string;
 mainOperations:MainOperationMaster[];
 stOperations:{operation_code:string;standard_operation:string|null;config_status?:string|null}[];
 nextOperations:{operation_code:string;jobs:number}[];
 sourceColumnNames:string[];
 operationMappings:OperationMappingMaster[];
 recipeKey:string;
 timeRules:TimeRule[];
 today:string;
 initialView?:CandidateViewPreset|null;
 initialServerViews?:Record<string,unknown>|null;
 pagination:{page:number;pageSize:number;totalCandidates:number;totalPages:number};
 onVisibleCandidateIds?:(ids:number[])=>void;
 onReloadCandidates?:()=>void;
}){
 const [selected,setSelected]=useState<number[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [targetBatchId,setTargetBatchId]=useState("");
 usePopupMessage(message);
 // v298: pagination removed — clear row selection whenever a fresh Candidate
 // set (new total) arrives.
 const paginationKey=`${pagination.page}|${pagination.pageSize}|${pagination.totalCandidates}`;
 useEffect(()=>{
  setSelected([]);
  setTargetBatchId("");
 },[paginationKey]);
 const [columnPickerOpen,setColumnPickerOpen]=useState(false);
 const [columnSearch,setColumnSearch]=useState("");
 const [operationPickerOpen,setOperationPickerOpen]=useState(false);
 const [opSearch,setOpSearch]=useState("");
 // v261: khởi tạo NGAY từ Default View máy chủ (SSR) → không hiện "hình 1" (169 cột).
const [stViewOverride,setStViewOverride]=useState<string[]|null>(initialView?.stView??null);
 const [visibleColumns,setVisibleColumns]=useState<string[]|null>(
  initialView&&Array.isArray(initialView.columns)&&initialView.columns.length
   ?initialView.columns
   :null
 );
 const [columnLayout,setColumnLayout]=useState<string[]|null>(
  initialView&&Array.isArray(initialView.columnLayout)&&initialView.columnLayout.length
   ?initialView.columnLayout
   :null
 );
 const [displayRulesOpen,setDisplayRulesOpen]=useState(false);
 const [filterNextMain,setFilterNextMain]=useState(initialView?.filters?.nextMain||"");
 const [filterNextOperation,setFilterNextOperation]=useState(initialView?.filters?.nextOperation||"");
 const [filterPrimer1,setFilterPrimer1]=useState(initialView?.filters?.primer1||"");
 const [filterPrimer2,setFilterPrimer2]=useState(initialView?.filters?.primer2||"");
 const [filterPrimer3,setFilterPrimer3]=useState(initialView?.filters?.primer3||"");
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
 const [candidateDensity,setCandidateDensity]=useState<"normal"|"compact"|"ultra">(initialView?.density??"compact");
 const [routeFocus,setRouteFocus]=useState(Boolean(initialView?.routeFocus));
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
   const out=Object.keys(candidates[0]?.source_data||{});
   const seen=new Set(out);
   for(const key of sourceColumnNames){
    if(!seen.has(key)){seen.add(key);out.push(key);}
   }
   return out;
 },[sourceColumnNames,candidates.length?candidates[0]?.source_data:null]);

 // v291: VIEW CÔNG ĐOẠN ST has one job-filter responsibility only:
 // Candidate Jobs are included when RAW NextOperation belongs to this set.
 const defaultStView=useMemo(()=>{
   const set=new Set<string>();
   for(const x of (stOperations||[])){
    if(String(x.config_status)==="ST_SCOPE_ONLY")continue;
    const c=normalized(x.operation_code);
    if(c)set.add(c);
   }
   return set;
  },[stOperations]);

 const effectiveStView=useMemo(
   ()=>new Set(stViewOverride??[...defaultStView]),
   [stViewOverride,defaultStView]
  );

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
 },[mainOperations,operationMappings,candidates,effectiveStView]);

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
   ...routeColumns,
   ...sourceColumns.map(col=>({
     key:`source:${col}`,
     label:col,
     group:"allopen" as const
   }))
 ],[sourceColumns,routeColumns]);

 const candidateSortFields=useMemo(()=>{
   const seen=new Set<string>();
   const result:{key:string;label:string}[]=[];

   const add=(key:string,label:string)=>{
     if(seen.has(key))return;
     seen.add(key);
     result.push({key,label});
   };

   CANDIDATE_SORT_SPECIAL_FIELDS.forEach(x=>add(x.key,x.label));

   // Every selectable/displayable Candidate column, including all raw
   // All Open Job source_data columns, is also available in Sort Priority.
   allColumns.forEach(col=>{
     add(`column:${col.key}`,col.label);
   });

   return result;
 },[allColumns]);

 // v291: user column preferences control only planning/info + All Open Job
 // fields. Route/Main columns are automatic from the displayed Jobs' AllOperation
 // and cannot be hidden by an old Columns preset.
 useEffect(()=>{
   if(initialView&&Array.isArray(initialView.columns)&&initialView.columns.length)return;
   try{
     const raw=
       window.localStorage.getItem(COLUMN_STORAGE_KEY) ||
       window.localStorage.getItem(LEGACY_COLUMN_STORAGE_KEY);

     const valid=new Set(configurableColumns.map(x=>x.key));
     if(!raw){
       setVisibleColumns(configurableColumns.map(x=>x.key));
       return;
     }

     const saved=JSON.parse(raw);
     if(Array.isArray(saved)){
       let next=saved.filter((x:unknown)=>typeof x==="string"&&valid.has(x)) as string[];
       if(!window.localStorage.getItem(COLUMN_STORAGE_KEY)){
         for(const key of ["status","batch_no","previous_status","previous_batch_no","actual_progress"]){
           if(valid.has(key)&&!next.includes(key))next.push(key);
         }
         window.localStorage.setItem(COLUMN_STORAGE_KEY,JSON.stringify(next));
       }
       setVisibleColumns(next);
     }else{
       setVisibleColumns(configurableColumns.map(x=>x.key));
     }
   }catch{
     setVisibleColumns(configurableColumns.map(x=>x.key));
   }
 },[configurableColumns]);

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
    const raw=window.localStorage.getItem(COLUMN_LAYOUT_STORAGE_KEY);
    const parsed=raw?JSON.parse(raw):null;
    if(Array.isArray(parsed)&&parsed.length)next=parsed.map((x:unknown)=>String(x));
   }catch{}
   if(!next)next=collapsedColumnLayoutFromVisible(configurableActiveColumns);
  }
  setColumnLayout(next);
 },[columnLayout,configurableActiveColumns,initialView]);

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
    ?`Operation ${standardOperation}`
    :selectedAreaId
     ?`Area ${selectedAreaName}`
     :"System";

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
   if(Array.isArray(preset.stView))setStViewOverride(preset.stView);
   setFilterNextMain(preset.filters?.nextMain||"");
   setFilterNextOperation(preset.filters?.nextOperation||"");
   setFilterPrimer1(preset.filters?.primer1||"");
   setFilterPrimer2(preset.filters?.primer2||"");
   setFilterPrimer3(preset.filters?.primer3||"");

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
     setViewMessage(`${exactViewLabel}: chưa có Default View.`);
     setTimeout(()=>setViewMessage(""),1800);
     return false;
   }

   applyViewPreset(found.preset);
   setViewLoadedFor(found.key);

   const label=
    found.key.startsWith("OP:")
     ?`Operation ${found.key.slice(3)}`
     :found.key.startsWith("AREA:")
      ?`Area Default`
      :found.key==="SYSTEM"
       ?"System Default"
       :`Operation ${found.key}`;

   setViewMessage(`Đã load ${label}.`);
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
      primer3:filterPrimer3
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

     setViewLoadedFor(exactViewKey);
     setViewMessage(`Đã lưu Default View cho ${exactViewLabel} (đã lưu trên máy chủ — dùng chung mọi môi trường).`);
   }catch(e){
     setViewMessage(`Không lưu được Default View: ${e instanceof Error?e.message:String(e)}`);
   }
   setTimeout(()=>setViewMessage(""),2600);
 };

 const deleteCurrentDefault=async()=>{
   const views=readOperationViews();

   if(!views[exactViewKey]){
     setViewMessage(`${exactViewLabel}: không có Default View riêng để xóa.`);
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
     setViewMessage(`Xóa Default View thất bại: ${e instanceof Error?e.message:String(e)}`);
     setTimeout(()=>setViewMessage(""),2600);
     return;
   }

   setViewLoadedFor("");
   setViewMessage(`Đã xóa Default View của ${exactViewLabel} trên máy chủ.`);
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
     filters:existing?.filters ?? {nextMain:filterNextMain,nextOperation:filterNextOperation,primer1:filterPrimer1,primer2:filterPrimer2,primer3:filterPrimer3},
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
    window.localStorage.setItem(COLUMN_STORAGE_KEY,JSON.stringify(sanitized));
    window.localStorage.setItem(COLUMN_LAYOUT_STORAGE_KEY,JSON.stringify(layout));
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

 function getActualOperationSequence(x:Candidate,operation:unknown){
   const target=normalized(operation);
   if(!target)return 999999;

   // all_operation is the real production routing of this Job.
   // Example: CPBILP | PIONBL | BSAUNSLD | PPRSLVT
   const route=String(x.all_operation||"")
    .replace(/^\s*\[|\]\s*$/g,"")
    .split(/\s*\|\s*/)
    .map(v=>normalized(v))
    .filter(Boolean);

   const index=route.findIndex(v=>v===target);
   return index>=0?index:999999;
 }


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

 const getSortValue=(x:Candidate,field:string):string|number=>{
   // Every visible/selectable Candidate column.
   if(field.startsWith("column:")){
     return getColumnSortValue(x,field.slice("column:".length));
   }

   // Convenience/special fields kept for existing saved views.
   switch(field){
     case "next_main":
       return normalized(x.next_standard_operation||"END");

     case "next_operation": {
       // Global production priority is configured by RAW Operation Code,
       // exactly matching All Open Job.next_operation.
       // This is intentionally independent from Job routing and Standard Operation.
       const raw=x.next_operation_planning_sort_order;
       const configured=raw==null?NaN:Number(raw);
       return Number.isFinite(configured)?configured:999999;
     }

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

     case "priority":
       return normalized(x.priority_type);

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
 // v241 — VIEW CÔNG ĐOẠN ST (TÁCH RIÊNG): Candidate Jobs nhìn vào VIEW này.
 // VIEW = danh sách các NEXT OPERATION được chọn hiển thị (tick trong bảng
 // "Công đoạn"). Mặc định = các công đoạn ST đã cấu hình (panel, trừ ST_SCOPE_ONLY);
 // user có thể tick thêm công đoạn khác (vd trung gian) hoặc bỏ bớt — bỏ hết → trống.
 // Panel "Các công đoạn được hiển thị" (VIEW CÔNG ĐOẠN CHÍNH) giữ nguyên vai trò cấu hình.
 const allNextOps=useMemo(()=>{
   const seen=new Set<string>();
   const panel=new Set<string>();
   const out:{code:string;jobs:number;inPanel:boolean}[]=[];
   for(const x of (stOperations||[])){const c=normalized(x.operation_code);if(c)panel.add(c);}
   const add=(code:string,jobs:number)=>{if(!code||seen.has(code))return;seen.add(code);out.push({code,jobs,inPanel:panel.has(code)});};
   for(const n of (nextOperations||[]))add(normalized(n.operation_code),Number(n.jobs||0));
   for(const x of (stOperations||[]))add(normalized(x.operation_code),0);
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

 const displayCandidates=useMemo(()=>{
   const filtered=candidates.filter(x=>
     (!filterNextMain || normalized(x.next_standard_operation||"END")===normalized(filterNextMain)) &&
     (!filterNextOperation || normalized(x.next_operation)===normalized(filterNextOperation)) &&
     (!filterPrimer1 || normalized(x.part_master_primer1)===normalized(filterPrimer1)) &&
     (!filterPrimer2 || normalized(x.part_master_primer2)===normalized(filterPrimer2)) &&
     (!filterPrimer3 || normalized(x.part_master_primer3)===normalized(filterPrimer3)) &&
     routeOpMatch(x)
   );

   return [...filtered].sort((a,b)=>{
     // v163 - Candidate production order comes ONLY from Operation Code Order
     // of the RAW NextOperation. Main Operation is membership/scope only.
     const ao=Number(a.next_operation_planning_sort_order);
     const bo=Number(b.next_operation_planning_sort_order);
     const aOrder=Number.isFinite(ao)?ao:999999;
     const bOrder=Number.isFinite(bo)?bo:999999;
     if(aOrder!==bOrder)return aOrder-bOrder;

     const nextOpCmp=normalized(a.next_operation).localeCompare(
      normalized(b.next_operation),
      undefined,
      {numeric:true,sensitivity:"base"}
     );
     if(nextOpCmp!==0)return nextOpCmp;

     const priorityCmp=priorityRank(b.priority_type)-priorityRank(a.priority_type);
     if(priorityCmp!==0)return priorityCmp;

     for(const rule of sortRules){
       if(rule.field==="next_operation" || rule.field==="priority")continue;
       const av=getSortValue(a,rule.field);
       const bv=getSortValue(b,rule.field);
       let cmp=0;
       if(typeof av==="number" && typeof bv==="number")cmp=av-bv;
       else cmp=String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:"base"});
       if(cmp!==0)return rule.direction==="desc"?-cmp:cmp;
     }

     return normalized(a.job_num).localeCompare(
      normalized(b.job_num),
      undefined,
      {numeric:true}
     );
   });
 },[
   candidates,filterNextMain,filterNextOperation,
   filterPrimer1,filterPrimer2,filterPrimer3,sortRules,stOperations,effectiveStView
 ]);

 const candidateIdentityKey=useMemo(
  ()=>candidates.map(x=>String(x.id)).join(","),
  [candidates]
 );
 const displayRuleKey=useMemo(()=>JSON.stringify({
  filterNextMain,filterNextOperation,filterPrimer1,filterPrimer2,filterPrimer3,sortRules
 }),[filterNextMain,filterNextOperation,filterPrimer1,filterPrimer2,filterPrimer3,sortRules]);
 useEffect(()=>{
  setCandidateDomLimit(CANDIDATE_INITIAL_DOM_ROWS);
 },[candidateIdentityKey,displayRuleKey]);
 useEffect(()=>{
  const node=candidateDomSentinelRef.current;
  if(!node||candidateDomLimit>=displayCandidates.length)return;
  const observer=new IntersectionObserver(entries=>{
   if(entries.some(x=>x.isIntersecting)){
    setCandidateDomLimit(v=>Math.min(displayCandidates.length,v+CANDIDATE_DOM_ROW_STEP));
   }
  },{rootMargin:"600px 0px"});
  observer.observe(node);
  return ()=>observer.disconnect();
 },[candidateDomLimit,displayCandidates.length]);
 const renderedCandidates=useMemo(
  ()=>displayCandidates.slice(0,candidateDomLimit),
  [displayCandidates,candidateDomLimit]
 );
 const visibleCandidateIdsKey=useMemo(
  ()=>renderedCandidates.map(x=>String(x.id)).join(","),
  [renderedCandidates]
 );
 useEffect(()=>{
  if(!onVisibleCandidateIds||!visibleCandidateIdsKey)return;
  onVisibleCandidateIds(visibleCandidateIdsKey.split(",").map(Number).filter(Number.isFinite));
 },[visibleCandidateIdsKey,onVisibleCandidateIds]);

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

 const noChainCandidates=useMemo(
   ()=>displayCandidates.filter(x=>x.has_planning_chain===false),
   [displayCandidates]
 );

 const paintSelectionField=(operation:string)=>{
   switch(normalized(operation)){
     case "PRIMER": return "PRIMER1";
     case "PRIMER2": return "PRIMER2";
     case "PRIMER3": return "PRIMER3";
     case "TOPCOAT1": return "TOPCOAT1";
     case "TOPCOAT2": return "TOPCOAT2";
     case "ANTI-ABRASION": return "ANTI-ABRASION";
     case "VARNISH": return "VARNISH";
     default:return "";
   }
 };

 const paintSelectionKey=(x:Candidate,operation=standardOperation)=>{
   switch(normalized(operation)){
     case "PRIMER": return normalized(x.part_master_primer1||x.recipe_no);
     case "PRIMER2": return normalized(x.part_master_primer2||x.recipe_no);
     case "PRIMER3": return normalized(x.part_master_primer3||x.recipe_no);
     case "TOPCOAT1": return normalized(x.part_master_topcoat1||x.recipe_no);
     case "TOPCOAT2": return normalized(x.part_master_topcoat2||x.recipe_no);
     case "ANTI-ABRASION": return normalized(x.part_master_antiabration||x.recipe_no);
     case "VARNISH": return normalized(x.part_master_varnish||x.recipe_no);
     default:return "";
   }
 };

 const isPaintSelectionOperation=Boolean(paintSelectionField(standardOperation));

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

 // v290: Tổng hợp Recipe theo CHÍNH Planning Operation target đang được chọn.
 // Candidate row chỉ là dòng đại diện để hiển thị; với plan-ahead v312, checkbox/cell
 // có thể trỏ tới bất kỳ Current/Next Planning Job Operation đang READY (vd row CPBILP nhưng target TSAUNSLD).
 // Không được dùng candidate.effective_recipe_key trong trường hợp đó.
 const selectedRecipeTargets=useMemo(()=>selectedTargets.map(target=>{
   const routeItem=target.routeItem;
   const exactCandidateTarget=
     normalized(target.standardOperation)===normalized(target.candidate.standard_operation) &&
     normalized(target.sourceOperation)===normalized(target.candidate.source_operation_code);

   if(routeItem){
     return {
       target,
       recipeKey:routeItem.effective_recipe_key||null,
       recipeNo:routeItem.effective_recipe_no||null,
       recipeName:routeItem.effective_recipe_name||null,
       batchKey:routeItem.batch_key_suggest||null,
       batchPrefix:routeItem.batch_prefix_suggest||null
     };
   }

   return {
     target,
     recipeKey:exactCandidateTarget?target.candidate.effective_recipe_key:null,
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
   const labels=[...new Set(withRecipe.map(x=>
     `${x.recipeNo||"—"}${x.recipeName?` · ${x.recipeName}`:""}`
   ))];
   const batchKeys=[...new Set(withRecipe.map(x=>x.batchKey).filter(Boolean))];
   const prefixes=[...new Set(withRecipe.map(x=>x.batchPrefix).filter(Boolean))];

   return {
     count:selectedRecipeTargets.length,
     unmatchedCount:selectedRecipeTargets.length-withRecipe.length,
     unanimousRecipe:keys.length===1?keys[0]:null,
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


 const selectedPaintKey=useMemo(()=>{
   const firstTarget=selectedTargets[0];
   if(!firstTarget)return "";
   const op=firstTarget.standardOperation;
   if(!paintSelectionField(op))return "";
   const first=selectedTargets.find(x=>paintSelectionKey(x.candidate,op));
   return first?paintSelectionKey(first.candidate,op):"";
 },[selectedTargets,standardOperation]);

 const paintSelectionLocked=(x:Candidate)=>{
   if(!isPaintSelectionOperation)return false;
   const key=paintSelectionKey(x);
   if(!key)return true;
   return Boolean(selectedPaintKey && key!==selectedPaintKey);
 };

 // Single source for row/checkbox/drag selection:
 // a Candidate row may be PLANNED at Current Main while any later Main remains
 // READY for plan-ahead. Route-cell selection must therefore target the exact occurrence.
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

 const paintSelectionLockedForTarget=(row:Candidate)=>{
   const target=selectableTargetFor(row);
   if(!target)return false;
   const op=target.standardOperation;
   if(!paintSelectionField(op))return false;

   const key=paintSelectionKey(row,op);
   if(!key)return true;

   const selectedPaint=selectedTargets.length
    ?paintSelectionKey(selectedTargets[0].candidate,op)
    :"";

   return Boolean(selectedPaint && selectedPaint!==key);
 };




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
   if(paintSelectionLockedForTarget(row))return;

   setSelected(prev=>prev.includes(target.id)?prev:[...prev,target.id]);
 };

 const resetDisplayRules=()=>{
   setFilterNextMain("");
   setFilterNextOperation("");
   setFilterPrimer1("");
   setFilterPrimer2("");
   setFilterPrimer3("");
   saveSortRules([
    {field:"next_main",direction:"asc"},
    {field:"next_operation",direction:"asc"},
    {field:"primer1",direction:"asc"}
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

   if(operationSelectionLocked(row)||paintSelectionLockedForTarget(row))return;
   setSelected(x=>[...new Set([...x,target.id])]);
 }

 function toggleAll(){
   const selectableRows=displayCandidates
    .map(row=>({row,target:selectableTargetFor(row)}))
    .filter(x=>x.target)
    .filter(x=>!operationSelectionLocked(x.row)&&!paintSelectionLockedForTarget(x.row));

   const ids=selectableRows.map(x=>Number(x.target!.id));
   const all=ids.length>0 && ids.every(id=>selected.includes(id));

   if(all)setSelected(x=>x.filter(id=>!ids.includes(id)));
   else setSelected(x=>[...new Set([...x,...ids])]);
 }

 async function createBatch(){
   if(!selected.length)return alert("Chọn ít nhất 1 Candidate Job.");
   const effectiveOperation=selectedTargets[0]?.standardOperation||standardOperation||"";
   if(!effectiveOperation)return alert("Không xác định được Standard Operation.");
   if(selectedTargets.some(x=>x.standardOperation!==effectiveOperation))
     return alert("Một Batch chỉ được chứa Job của cùng Standard Operation.");

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
         target_batch_id:targetBatchId?Number(targetBatchId):null
       })
     });

     const d=await safeJson(r);

     setMessage(
       `${d.batchNo} ${d.addedToExisting?"updated":"created"} · ${d.totalJobs} Jobs · `+
       `Qty ${formatNumber(d.totalQty)} · `+
       `Surface ${formatNumber(d.totalSurface)} dm² · `+
       `Process ${minutesToHHMM(d.processMinutes)}`+
       (d.batchKey?` · Batch Key ${d.batchKey}`:"")+
       (d.ruleName?` · Rule: ${d.ruleName}`:"")
     );

     setTimeout(()=>location.reload(),1200);
   }catch(e){
     setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`);
   }finally{
     setBusy(false);
   }
 }

 async function rebuild(){
   setBusy(true);
   setMessage("Đang rebuild Planning Chain (AllOperation theo từng Job)...");

   try{
     const r=await fetch("/api/planning/rebuild",{method:"POST"});
     const d=await safeJson(r);

     setMessage(
       `Rebuild xong: ${d.jobs} Jobs · ${d.operations} operations · `+
       `${d.eligible} eligible · ${d.locked} locked · `+
       `Bridge Pair ${d.bridgePairAnchored||0} · `+
       `AllOperation fallback ${d.allOperationFallbackAnchored??d.rawPairAnchored??0} · `+
       `NextOp=Current Main ${d.directNextMainAnchored||0} · `+
       `NO CHAIN ${d.noChain??d.sequenceCheck??0} · `+
       `AllOperation ${d.allOperationJobs||0}`
     );
     setTimeout(()=>location.reload(),1200);
   }catch(e){
     setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`);
   }finally{
     setBusy(false);
   }
 }

 const columnLabel=(key:string)=>{
   return allColumns.find(c=>c.key===key)?.label||key;
 };

 const currentMainView=(x:Candidate)=>{
   if(x.has_planning_chain===false){
    return {
     operation:"—",
     status:"NO CHAIN",
     item:null as RouteStatusItem|null
    };
   }

   // v308: Current Main is the FIRST live Planning occurrence created from the
   // exact All Open Job LastLaborOp + NextOperation pair. Do not replace it
   // with another READY/PLANNED route target. Next Main(s) remain selectable in
   // the dynamic route cells / Batch Builder.
   const currentItem=(x.route_status||[]).find(
    r=>Number(r.planning_job_operation_id)===Number(x.id)
   )||null;
   const status=currentItem?.route_status||(
    x.planning_status==="PLANNED"
     ? (x.batch_no?"PLANNED-UNSCHEDULED":"PLANNED")
     : x.planning_status==="LOCKED"
      ? "WAIT PREV"
      : x.planning_status==="ELIGIBLE"
       ? "READY"
       : String(x.planning_status||"—")
   );

   return {
    operation:x.standard_operation||"—",
    status:String(status||"—"),
    item:currentItem
   };
 };

 const renderCurrentMainCell=(x:Candidate)=>{
   const view=currentMainView(x);
   const status=normalized(view.status);
   const canSelect=Boolean(selectableTargetFor(x));
   const display=
    status==="PLANNED-UNSCHEDULED"?"PLANNED":
    status==="WAITING"?"WAIT PREV":
    view.status;

   return <td
    key="__current_main"
    className={`candidate-current-main ${routeStatusClass(status)} ${canSelect?"candidate-current-main-selectable":""}`}
    title={`${view.operation} · ${display}${canSelect?" · Click để chọn Job":""}`}
    onClick={()=>{
     if(!canSelect)return;
     toggle(x.id);
    }}
   >
    <b>{view.operation}</b>
    <small className="planning-sub">{display}</small>
   </td>;
 };

 const renderCandidateHeader=(key:string)=>{
   const col=allColumns.find(c=>c.key===key);
   if(!col)return null;

   let cls=
    ["qty","surface"].includes(key)
     ?"num"
     :col.group==="allopen"
      ?"all-open-source-col"
      :col.group==="route"
       ?"route-status-header"
       :"";
   return <th key={key} className={cls||undefined}>{col.label}</th>;
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

 const routeCellSelected=(item:RouteStatusItem)=>{
   const id=Number(item.planning_job_operation_id);
   return Number.isFinite(id)&&selected.includes(id);
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

   const existingOperation=selectedTargets[0]?.standardOperation||"";
   if(existingOperation && normalized(existingOperation)!==normalized(op)){
    setMessage(`Đang chọn ${existingOperation}. Một Batch chỉ chứa cùng Main Operation.`);
    return;
   }

   if(paintSelectionField(op)){
    const keyValue=paintSelectionKey(candidate,op);
    if(!keyValue){
     setMessage(`${candidate.job_num} chưa có ${paintSelectionField(op)}.`);
     return;
    }

    const selectedPaint=selectedTargets.length
     ? paintSelectionKey(selectedTargets[0].candidate,op)
     :"";

    if(selectedPaint && selectedPaint!==keyValue){
     setMessage(`Không thể trộn loại sơn khác nhau trong cùng Batch ${op}.`);
     return;
    }
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
     label:"WAIT",
     reason:"Chain chưa được chuẩn hóa theo plan-ahead v312; hãy Rebuild Chain hoặc kiểm tra route.",
     kind:"route-status-wait-prev"
    };
   }

   return {
    label:"WAIT",
    reason:"Future Main Operation",
    kind:"route-status-wait-future"
   };
 }

 const renderRouteStatusCell=(x:Candidate,key:string)=>{
   const mainOperation=normalized(key.slice("route-main:".length));

   if(x.route_status_loaded===false){
    return <td key={key} className="route-status-cell route-status-loading" title={`${mainOperation} · đang tải Route Matrix`}>…</td>;
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
     const fallbackDisplay=normalized(status)==="WAITING"?fallbackWaiting.label:status;
     return <td
      key={key}
      className={`route-status-cell ${routeStatusClass(status)} ${normalized(status)==="WAITING"?fallbackWaiting.kind:""} route-status-current ${routeCellSelected(fallbackItem)?"route-status-selected":""} ${status==="READY"?"route-status-clickable":""}`}
      title={`${mainOperation} · ${fallbackDisplay}${fallbackWaiting.reason?` · ${fallbackWaiting.reason}`:""}${x.batch_no?` · ${x.batch_no}`:""}`}
      onClick={()=>toggleRouteCell(x,fallbackItem)}
     >
      <b>{fallbackDisplay}</b>
      {x.batch_no&&<span className="route-status-batch">{x.batch_no}</span>}
     </td>;
    }
    return <td key={key} className="route-status-cell route-status-na">—</td>;
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

   const readySourceSeq=chosen.readySeq;
   const currentSeq=Number.isFinite(readySourceSeq)
    ?readySourceSeq
    :Number.POSITIVE_INFINITY;

   const isCurrent=chosen.current;

   const waitingDisplay=waitingDisplayFor(x,displayItem);
   const displayStatus=normalized(status)==="WAITING"
    ?waitingDisplay.label
    :status;
   const waitingClass=normalized(status)==="WAITING"
    ?waitingDisplay.kind
    :"";

   const batchNos=[
    ...new Set(items.map(r=>String(r.batch_no||"").trim()).filter(Boolean))
   ];

   const resources=[
    ...new Set(items.map(r=>String(r.resource_code||"").trim()).filter(Boolean))
   ];

   const scheduledEnds=items
    .map(r=>r.planned_end)
    .filter(Boolean)
    .map(v=>routeDateTime(v))
    .filter(Boolean);

   const tooltip=items.map((item,index)=>[
    items.length>1?`${mainOperation} occurrence ${index+1}`:mainOperation,
    `Source: ${item.source_operation}`,
    `Status: ${normalized(item.route_status)==="WAITING"?waitingDisplayFor(x,item).label:item.route_status}`,
    normalized(item.route_status)==="WAITING"?waitingDisplayFor(x,item).reason:"",
    item.batch_no?`Batch: ${item.batch_no}`:"",
    item.resource_code?`Resource: ${item.resource_code}`:"",
    item.planned_end?`End: ${routeDateTime(item.planned_end)}`:"",
    item.recipe_name?`Recipe: ${item.recipe_name}`:""
   ].filter(Boolean).join(" · ")).join("\n");

   // v159: one source of truth for interaction.
   // What the cell displays is exactly what the user clicks/selects.
   const selectableItem=displayItem;
   const clickable=
    normalized(status)==="READY" ||
    normalized(status)==="WAITING";

   return <td
    key={key}
    className={`route-status-cell ${routeStatusClass(status)} ${waitingClass} ${isCurrent?"route-status-current":""} ${(
     routeCellSelected(selectableItem) ||
     (
      normalized(status)==="READY" &&
      !Number.isFinite(Number(selectableItem.planning_job_operation_id)) &&
      normalized(selectableItem.standard_operation)===normalized(x.standard_operation) &&
      selected.includes(Number(x.id))
     )
    )?"route-status-selected":""} ${clickable?"route-status-clickable":""}`}
    title={tooltip}
    onClick={()=>clickable&&toggleRouteCell(x,selectableItem)}
   >
    <b>{displayStatus}</b>

    {batchNos.length>0&&
     <span className="route-status-batch">
      {batchNos.join(" / ")}
     </span>}

    {resources.length>0&&
     <small>{resources.join(" / ")}</small>}

    {scheduledEnds.length>0&&
     <small>End {scheduledEnds.join(" / ")}</small>}

    {items.length>1&&
     <small>{items.length} route occurrences</small>}
   </td>;
 };
 const renderCandidateCell=(x:Candidate,key:string)=>{
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
          ? <span className="job-state state-changed">RECIPE REQUIRED</span>
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
         ? <span className="job-state state-planned">PLANNED</span>
         : <span className="job-state state-eligible">ELIGIBLE</span>}
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
              ? `${x.previous_planning_status||"PLANNED"} · ${x.previous_batch_no}`
              : x.previous_planning_status||"NO BATCH"}
            </small>
           </>
         : <><b>START</b><small className="planning-sub">FIRST PLAN OP</small></>}
       </td>;

     case "previous_batch_no":
       return <td key={key}>
        {x.previous_batch_no
         ? <>
            <b>{x.previous_batch_no}</b>
            <small className="planning-sub">
             {x.previous_batch_operation||x.previous_batch_source_operation||"—"} · {x.previous_batch_status||"PLANNED"}
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
 // mount để SSR khớp client (hết lỗi Hydration "Freeze Pane" vs "Current Main").
 const [freeze,setFreeze]=useState<FreezeCfg>({mode:"off"});
 const [freezePick,setFreezePick]=useState(false);
 const [freezeDraft,setFreezeDraft]=useState<FreezeCfg|null>(null);
 const [freezeMenuOpen,setFreezeMenuOpen]=useState(false);
 const freezeTableRef=useRef<HTMLTableElement|null>(null);
 useEffect(()=>{setFreeze(loadFreeze());},[]);

 const freezeColumnLabels=useMemo(()=>{
   const labels:string[]=["Chọn"];
   for(const key of activeColumns){
    if(key==="priority"){labels.push("Priority","Current Main");continue;}
    const col=allColumns.find(c=>c.key===key);
    labels.push(col?col.label:key);
   }
   if(!activeColumns.includes("priority"))labels.push("Current Main");
   return labels;
 },[activeColumns,allColumns]);

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
    acc+=cells[i].getBoundingClientRect().width;
    t.style.setProperty(`--fcws-${i+1}`,`${acc}px`);
   }
  };
  apply();
  ro=new ResizeObserver(apply);
  ro.observe(t);
  return ()=>{if(ro)ro.disconnect();};
 },[freezeCol,activeColumns,candidateDensity,routeFocus,displayCandidates.length,fullView]);

 
 return <div className="planning-board-grid">
   <section className={`erp-table-panel planning-candidates ${fullView?"candidate-full-view":""} candidate-density-${candidateDensity} ${routeFocus?"candidate-route-focus":""}`}>
    <div className="erp-panel-head candidate-sticky-toolbar">
     <b>Candidate Jobs</b>
     <div className="row">
      <span>
       {eligibleCandidates.length} ELIGIBLE · {plannedCandidates.length} PLANNED · {waitingCandidates.length} WAIT
       {noChainCandidates.length>0?` · ${noChainCandidates.length} NO CHAIN`:""}
       {` · Tất cả ${pagination.totalCandidates} job (không phân trang)`}
      </span>
      <button className="btn small" type="button" onClick={()=>setDisplayRulesOpen(x=>!x)}>
       Sort / Filter
      </button>
      <button className="btn small" type="button" onClick={()=>setColumnPickerOpen(x=>!x)}>
       Columns ({configurableActiveColumns.length}/{configurableColumns.length}) · AOJ Group ({groupedSourceColumns.length}) · Main ({routeColumns.length})
      </button>
      <button className="btn small" type="button" onClick={()=>setOperationPickerOpen(x=>!x)} title="VIEW CÔNG ĐOẠN ST — chọn các NEXT OPERATION được hiển thị trên Candidate Jobs">
       Công đoạn ({effectiveStView.size}/{allNextOps.length})
      </button>
      <button className="btn small" type="button" onClick={()=>setFullView(x=>!x)} title="ESC để thoát Full View">
       {fullView?"Exit Full View":"Full View"}
      </button>
      <button
       className="btn small"
       type="button"
       onClick={runRecipeCompare}
       disabled={recipeCompareLoading}
       title="So sánh cấu hình Recipe (Công thức & Rule) với nhu cầu thực tế trên board — tìm mapping thiếu / mapping không được dùng"
      >
       {recipeCompareLoading?"Đang so sánh…":"⇄ So sánh Recipe"}
      </button>
      <button
       className="btn small"
       type="button"
       title="Freeze Pane kiểu Excel — bật, click tiêu đề cột để chọn vị trí, rồi Chốt. Ghìm dòng tiêu đề + các cột bên trái."
       onClick={()=>{
        if(freezeMenuOpen){setFreezeMenuOpen(false);return;}
        if(freezePick){setFreezePick(false);setFreezeDraft(null);return;}
        if(freeze.mode==="off"){setFreezePick(true);return;}
        setFreezeMenuOpen(true);
       }}
      >
       {freezePick?"📌 Chọn cột… (hủy)":freeze.mode==="off"?"📌 Freeze Pane":`📌 ${freezeLabel}`}
      </button>
      <button className="btn small" disabled={busy} onClick={rebuild}>
       Rebuild Chain
      </button>
     </div>
    </div>

    {freezePick&&!freezeDraft&&
     <div className="freeze-hint-bar">📌 <b>Chọn vị trí freeze:</b> click vào <b>tiêu đề cột</b> trong bảng — các cột bên trái và dòng tiêu đề sẽ được ghìm (ESC để hủy).</div>}
    {freezeDraft&&
     <div className="freeze-confirm-bar">
      📌 Ghim đến cột <b>{freezeDraft.col}</b>: <b className="freeze-confirm-col">{freezeColumnLabels[Math.min(freezeDraft.col??1,FREEZE_MAX_COLS)-1]??`Cột ${freezeDraft.col}`}</b>
      <span className="muted">· dòng tiêu đề luôn ghìm ·</span>
      <button className="btn small" type="button" onClick={()=>persistFreeze(freezeDraft)}>✓ Chốt</button>
      <button className="btn small" type="button" onClick={()=>setFreezeDraft(null)}>Hủy</button>
     </div>}
    {freezeMenuOpen&&freeze.mode!=="off"&&
     <div className="freeze-menu">
      <div className="freeze-menu-title">📌 Freeze Pane đang ghìm: <b>{freezeLabel}</b></div>
      <div className="row">
       <button type="button" className="btn small" onClick={()=>{setFreezeMenuOpen(false);setFreezePick(true);}}>Đổi vị trí…</button>
       <button type="button" className="btn small" onClick={()=>persistFreeze({mode:"header"})}>Chỉ dòng tiêu đề</button>
       <button type="button" className="btn small" onClick={()=>persistFreeze({mode:"off"})}>Không freeze</button>
      </div>
     </div>}

    {isPaintSelectionOperation&&
     <div className={`paint-selection-lock-banner ${selectedPaintKey?"is-locked":""}`}>
      <b>Paint Selection Lock</b>
      <span>
       {selectedPaintKey
        ? `${paintSelectionField(standardOperation)} = ${selectedPaintKey} · Các Job khác loại sơn đã bị khóa.`
        : `Chọn Job đầu tiên để khóa theo ${paintSelectionField(standardOperation)}. Job thiếu loại sơn cũng không được chọn.`}
      </span>
     </div>}

    {/* v282: Modal So sánh Cấu hình Recipe ↔ Board */}
    {recipeCompareOpen&&recipeCompare&&
     <div className="recipe-compare-panel">
      <div className="recipe-diagnosis-head">
       <b>⇄ So sánh Cấu hình Recipe ↔ Board</b>
       <button className="btn small" type="button" onClick={()=>setRecipeCompareOpen(false)}>×</button>
      </div>
      {recipeCompare.error?(
       <div className="notice">Lỗi: {recipeCompare.error}</div>
      ):(
       <>
        <div className="recipe-compare-section">
         <div className="recipe-compare-title">
          <b>① Board CẦN nhưng CẤU HÌNH THIẾU</b>
          <small>Operation Code của các Job ELIGIBLE đang chờ trên board — nếu chưa có mapping thì Job báo "Chưa có Recipe".</small>
         </div>
         {recipeCompare.boardNeeds?.length?(
          <div className="table-wrap">
           <table className="erp-table recipe-compare-table">
            <thead>
             <tr><th>Operation Code</th><th>Công đoạn chính</th><th className="num">Job chờ</th><th>Job mẫu</th><th>Cấu hình</th><th></th></tr>
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
         ):<div className="notice">Không có Job ELIGIBLE nào đang chờ trên board.</div>}
        </div>

        <div className="recipe-compare-section">
         <div className="recipe-compare-title">
          <b>② CẤU HÌNH CÓ nhưng BOARD KHÔNG dùng</b>
          <small>Mapping đã tạo nhưng không khớp Job nào trên board — có thể gõ sai mã, hoặc nằm ở bảng reference cũ không còn điều khiển đề xuất.</small>
         </div>
         {recipeCompare.configUnused?.length?(
          <div className="table-wrap">
           <table className="erp-table recipe-compare-table">
            <thead>
             <tr><th>Operation Code</th><th>Recipe</th><th>Vấn đề</th></tr>
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
         ):<div className="notice">Mọi mapping đang hoạt động đều khớp ít nhất 1 Job trên board.</div>}
        </div>
       </>
      )}
     </div>}

    {displayRulesOpen&&
     <div className="candidate-display-rules">
      <div className="candidate-display-rules-head">
       <div>
        <b>Candidate Display Rules</b>
        <small>
         {`${exactViewLabel}${viewLoadedFor===exactViewKey?" · DEFAULT SAVED":""} · Thứ tự ưu tiên Load: Operation → Area → System.`}
        </small>
       </div>
       <div className="row">
        <button className="btn small" type="button" onClick={saveCurrentDefault}>
         Set Default
        </button>
        <button className="btn small" type="button" onClick={resetToCurrentDefault}>
         Load Default
        </button>
        <button className="btn small" type="button" onClick={deleteCurrentDefault} disabled={viewLoadedFor!==exactViewKey}>
         Delete Default
        </button>
        <button className="btn small" type="button" onClick={resetDisplayRules}>Reset</button>
       </div>
      </div>

      {viewMessage&&<div className="candidate-view-message">{viewMessage}</div>}

      <div className="candidate-filter-grid">
       <label>Next Main Plan Op
        <select className="input" value={filterNextMain} onChange={e=>setFilterNextMain(e.target.value)}>
         <option value="">All</option>
         {nextMainOptions.map(v=><option key={v} value={v}>{v}</option>)}
        </select>
       </label>

       <label>NextOperation
        <select className="input" value={filterNextOperation} onChange={e=>setFilterNextOperation(e.target.value)}>
         <option value="">All</option>
         {nextOperationOptions.map(v=><option key={v} value={v}>{v}</option>)}
        </select>
       </label>

       <label>Part Master PRIMER1
        <select className="input" value={filterPrimer1} onChange={e=>setFilterPrimer1(e.target.value)}>
         <option value="">All</option>
         {primer1Options.map(v=><option key={v} value={v}>{v}</option>)}
        </select>
       </label>

       <label>Part Master PRIMER2
        <select className="input" value={filterPrimer2} onChange={e=>setFilterPrimer2(e.target.value)}>
         <option value="">All</option>
         {primer2Options.map(v=><option key={v} value={v}>{v}</option>)}
        </select>
       </label>

       <label>Part Master PRIMER3
        <select className="input" value={filterPrimer3} onChange={e=>setFilterPrimer3(e.target.value)}>
         <option value="">All</option>
         {primer3Options.map(v=><option key={v} value={v}>{v}</option>)}
        </select>
       </label>
      </div>

      <div className="candidate-sort-rules">
       <div className="candidate-sort-title">
        <b>Sort Priority</b>
        <button className="btn small" type="button" onClick={addSortRule} disabled={sortRules.length>=10}>
         + Sort Level
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
          <option value="asc">ASC</option>
          <option value="desc">DESC</option>
         </select>
         <button className="btn small" type="button" onClick={()=>removeSortRule(index)}>×</button>
        </div>
       )}
      </div>
     </div>}

    {columnPickerOpen&&
     <div className="candidate-column-picker candidate-column-package-picker">
      <div className="candidate-column-picker-head">
       <b>Chọn cột hiển thị</b>
       <small>
        v293: <b>toàn bộ cột trong catalog All Open Job mặc định thuộc Nhóm cột All Open Job</b>. Cột nào bạn đưa ra Trước/Sau nhóm mới được tách khỏi gói. Nhóm không tự bật hiển thị toàn bộ cột, nên Planning Board vẫn nhẹ.
       </small>
       <input
        className="input"
        value={columnSearch}
        onChange={e=>setColumnSearch(e.target.value)}
        placeholder="Tìm cột để đưa ra trước / sau Nhóm All Open Job..."
       />
       <div className="row">
        <button className="btn small" type="button" onClick={()=>{
         const keys=configurableColumns.map(x=>x.key);
         saveColumns(keys,collapsedColumnLayoutFromVisible(keys));
        }}>Select All</button>
        <button className="btn small" type="button" onClick={()=>{
         const keys=PLANNING_COLUMNS.map(x=>x.key);
         saveColumns(keys,[...keys,ALL_OPEN_JOB_GROUP_KEY]);
        }}>Planning Only</button>
        <button className="btn small" type="button" onClick={collapseAllOpenJobColumns}>Gom All Open Job</button>
        <button className="btn small" type="button" onClick={()=>saveColumns([],[ALL_OPEN_JOB_GROUP_KEY])}>Clear</button>
       </div>
      </div>

      <div className="candidate-column-package-summary">
       <b>Thứ tự bố cục</b>
       <span>
        {configurableActiveColumns.filter(x=>x.startsWith("source:")).length}/{sourceColumns.length} cột All Open Job đang hiển thị · {groupedSourceColumns.length} cột thuộc nhóm · {visibleGroupedSourceColumns.length} cột trong nhóm đang hiển thị
       </span>
      </div>

      <div className="candidate-column-picker-grid candidate-column-order-grid candidate-column-layout-grid">
       {effectiveColumnLayout.map((item,index)=>{
        const isGroup=item===ALL_OPEN_JOB_GROUP_KEY;
        const c=isGroup?null:configurableColumns.find(x=>x.key===item);
        if(!isGroup&&!c)return null;
        const label=isGroup?"📦 Nhóm cột All Open Job":c!.label;
        const groupLabel=isGroup
         ?`${groupedSourceColumns.length} cột nằm trong nhóm`
         :(c!.group==="planning"?"Planning":"All Open Job · đã đưa ra khỏi nhóm");
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
        <b>Kết quả tìm cột</b>
        <small>Tất cả cột All Open Job mặc định ở trong nhóm. Đưa Trước/Sau nhóm để tách cột ra; checkbox chỉ điều khiển ẩn/hiện.</small>
       </div>
       <div className="candidate-column-picker-grid candidate-column-search-grid">
        {filteredColumnChoices.map(c=>{
         const visible=isColumnVisible(c.key);
         const isSource=c.key.startsWith("source:");
         const explicit=isSource&&effectiveColumnLayout.includes(c.key);
         const groupIndex=effectiveColumnLayout.indexOf(ALL_OPEN_JOB_GROUP_KEY);
         const itemIndex=effectiveColumnLayout.indexOf(c.key);
         const location=isSource&&!explicit
          ?`Trong Nhóm All Open Job · ${visible?"đang hiển thị":"đang ẩn"}`
          :!visible
           ?"Đang ẩn"
           :isSource
            ?(itemIndex>=0&&groupIndex>=0&&itemIndex<groupIndex?"Trước nhóm":"Sau nhóm")
            :"Planning";
         return <div key={c.key} className={`candidate-column-choice candidate-column-search-item ${visible?"is-visible":""}`}>
          <label className="candidate-column-toggle">
           <input type="checkbox" checked={visible} onChange={()=>toggleColumn(c.key)}/>
           <span>{c.label}</span>
           <small>{location}</small>
          </label>
          {isSource&&<div className="candidate-column-search-actions">
           <button className="btn small" type="button" onClick={()=>placeSourceRelativeToGroup(c.key,"before")}>← Trước nhóm</button>
           <button className="btn small" type="button" onClick={()=>putSourceInGroup(c.key)}>Trong nhóm</button>
           <button className="btn small" type="button" onClick={()=>placeSourceRelativeToGroup(c.key,"after")}>Sau nhóm →</button>
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
       <b>VIEW CÔNG ĐOẠN ST — chọn công đoạn hiển thị trên Candidate Jobs</b>
       <small>VIEW này chỉ lọc Job theo RAW NextOperation. Main Operation columns bên dưới được tự động sinh từ AllOperation của các Job đang hiển thị. "· hiện X/Y job": Y = tổng job trong All Open Jobs; X = số job đã tải trên Candidate Jobs. Tick/bỏ tick lọc ngay; chọn công đoạn mới chưa có trong trang thì bấm "Áp dụng & nạp Candidate".</small>
       <input
        className="input"
        value={opSearch}
        onChange={e=>setOpSearch(e.target.value)}
        placeholder="Tìm công đoạn..."
       />
       <div className="row">
        <button className="btn small" type="button" onClick={()=>changeStView(allNextOps.map(o=>o.code))}>Chọn hết ({allNextOps.length})</button>
        <button className="btn small" type="button" onClick={()=>changeStView([])}>Bỏ hết</button>
        <button className="btn small primary" type="button" title="Lưu view rồi nạp lại Candidate bằng API — không reload toàn trang" onClick={async()=>{
         const views=readOperationViews();
         const existing=views[exactViewKey];
         const payload:CandidateViewPreset={
          columns:[...configurableActiveColumns],
          columnLayout:[...effectiveColumnLayout],
          stView:[...effectiveStView],
          filters:existing?.filters ?? {nextMain:filterNextMain,nextOperation:filterNextOperation,primer1:filterPrimer1,primer2:filterPrimer2,primer3:filterPrimer3},
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
          if(!r.ok)throw new Error(d?.error||"Không lưu được VIEW CÔNG ĐOẠN ST.");
          setOperationPickerOpen(false);
          if(onReloadCandidates)onReloadCandidates();
          else location.reload();
         }catch(e){
          setViewMessage(`Không lưu được VIEW CÔNG ĐOẠN ST: ${e instanceof Error?e.message:String(e)}`);
          setTimeout(()=>setViewMessage(""),2600);
         }
        }}>Áp dụng & nạp Candidate</button>
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
          <small>{o.inPanel?"Đã cấu hình ST":"Chỉ trong All Open Jobs"}{Number(o.jobs||0)>0?` · ${o.jobs} job`:""}{loadedByOp.get(o.code)?` · hiện ${loadedByOp.get(o.code)}/${o.jobs}`:""}</small>
         </label>
        </div>;
       })}
       {!filteredAllOps.length&&<div className="candidate-column-empty">Không có công đoạn nào khớp tìm kiếm.</div>}
       {!effectiveStView.size&&
        <div className="candidate-column-empty candidate-column-empty-info">Đã bỏ hết — Candidate Jobs TRỐNG (không hiện job nào). Tick lại các ô bên trên để hiện.</div>}
      </div>
     </div>}

    <div className="table-wrap">
     <table
      ref={freezeTableRef}
      className={`erp-table planning-candidate-table${freezeActive||freezeDraft?" candidate-freeze-on":""}`}
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
           const rows=displayCandidates
            .map(row=>({row,target:selectableTargetFor(row)}))
            .filter(x=>x.target)
            .filter(x=>!operationSelectionLocked(x.row)&&!paintSelectionLockedForTarget(x.row));
           return rows.length>0 && rows.every(x=>selected.includes(Number(x.target!.id)));
          })()}
          onChange={toggleAll}
         />
        </th>
        {activeColumns.map(key=>
          key==="priority"
           ? <Fragment key={`candidate-header-${key}`}>
              {renderCandidateHeader(key)}
              <th key="__current_main" className="candidate-current-main-head">Current Main</th>
             </Fragment>
           : renderCandidateHeader(key)
        )}
        {!activeColumns.includes("priority")&&<th className="candidate-current-main-head">Current Main</th>}
       </tr>
      </thead>
      <tbody>
       {renderedCandidates.map((x,rowIndex)=>
        <tr
         key={`${x.id}-${x.job_num}-${x.standard_operation}-${x.source_operation_code}-${rowIndex}`}
         className={`${selectableTargetFor(x)&&selected.includes(selectableTargetFor(x)!.id)?"planning-row-selected ":""}${dragCandidateId===x.id?"planning-row-dragging ":""}${priorityClass(x.priority_type)}`.trim()}
         draggable={Boolean(selectableTargetFor(x))&&!operationSelectionLocked(x)&&!paintSelectionLockedForTarget(x)}
         onDragStart={e=>{
          const target=selectableTargetFor(x);
          if(!target||operationSelectionLocked(x)||paintSelectionLockedForTarget(x))return;
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
           disabled={!selectableTargetFor(x)||operationSelectionLocked(x)||paintSelectionLockedForTarget(x)}
           title={!selectableTargetFor(x)
              ?"Job chưa có Main READY để thêm Batch"
              :operationSelectionLocked(x)
               ?"Khác Standard Operation với Job đã chọn"
               :paintSelectionLockedForTarget(x)
                ?"Khác loại sơn với Job đã chọn hoặc chưa có loại sơn"
                :`Chọn ${selectableTargetFor(x)!.standardOperation} READY`}
           onChange={()=>toggle(x.id)}
          />
         </td>
         {activeColumns.map(key=>
           key==="priority"
            ? <Fragment key={`candidate-cell-${key}`}>
               {renderCandidateCell(x,key)}
               {renderCurrentMainCell(x)}
              </Fragment>
            : renderCandidateCell(x,key)
         )}
         {!activeColumns.includes("priority")&&renderCurrentMainCell(x)}
        </tr>
       )}
       {renderedCandidates.length<displayCandidates.length&&
        <tr ref={candidateDomSentinelRef} className="candidate-dom-sentinel"><td colSpan={2+activeColumns.length}>
         Đang hiển thị {renderedCandidates.length}/{displayCandidates.length} dòng — cuộn xuống để tải thêm.
        </td></tr>}
       {!displayCandidates.length&&
        <tr><td colSpan={2+activeColumns.length} className="muted">
         Không có Candidate phù hợp với filter hiện tại.
        </td></tr>}
      </tbody>
     </table>
    </div>
   </section>

   <aside
    className={`erp-table-panel planning-batch-panel ${dragCandidateId!==null?"planning-batch-drop-ready":""}`}
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
     <b>Batch Builder</b>
    </div>

    <div className="planning-batch-body planning-batch-body-compact">
     <div className="planning-summary-grid planning-summary-grid-compact">
      <div><span>Operation</span><b>{selectedOperation||standardOperation||(areaMode?"Chọn Job để xác định":"—")}</b></div>
      <div><span>Jobs</span><b>{selectedRows.length}</b></div>
      <div><span>Total Qty</span><b>{formatNumber(totalQty)}</b></div>
      <div><span>Total Surface</span><b>{formatNumber(totalSurface)} dm²</b></div>
      <div className="planning-process-time"><span>Process Time</span><b>{minutesToHHMM(estimatedMinutes)}</b></div>
     </div>

     {suggestionSummary&&selectedRows.length>0&&
      <div className={`planning-rule-suggestion ${suggestionSummary.allSameRecipe?"ok":suggestionSummary.mixedRecipes?"warn":""}`}>
       {suggestionSummary.unanimousRecipe?(
        <>
         <b>✓ Recipe đề xuất cho lô:</b>
         <span className="mono">{suggestionSummary.unanimousRecipeLabel||suggestionSummary.unanimousRecipe}</span>
         <span>theo công đoạn đang Build Batch (Operation target → Recipe / Part)</span>
         {suggestionSummary.unanimousKey&&<span className="mono">Batch Key: {suggestionSummary.unanimousKey}</span>}
         {suggestionSummary.unanimousPrefix&&<span className="mono">Prefix: {suggestionSummary.unanimousPrefix}</span>}
        </>
       ):(
        <>
         <b>{suggestionSummary.mixedRecipes
           ?"⚠ Các Job chọn có Recipe khác nhau"
           :"✕ Chưa có Recipe theo cấu hình"}</b>
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
           {recipeDiagLoading?"Đang phân tích…":"🔍 Xem lý do"}
          </button>}
        </>
       )}
      </div>}

     {/* v282: Panel Chẩn đoán Recipe — vì sao Job chưa có Recipe */}
     {recipeDiag&&
      <div className="recipe-diagnosis-panel">
       <div className="recipe-diagnosis-head">
        <b>🔍 Chẩn đoán Recipe</b>
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
         {recipeDiag.candidates&&recipeDiag.candidates.length>0&&
          <div className="recipe-diagnosis-candidates">
           <b>Các mapping hiện có cho “{firstUnmatchedTarget?.target.sourceOperation}”:</b>
           <div className="table-wrap">
            <table className="erp-table recipe-candidate-table">
             <thead>
              <tr><th>Recipe</th><th>Ưu tiên</th><th>Mặc định</th><th>Điều kiện</th><th>Khớp Job?</th></tr>
             </thead>
             <tbody>
              {recipeDiag.candidates.map((x:any,i:number)=>
               <tr key={i} className={x.matches?"":"row-muted"}>
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
      <span>Target Batch</span>
      <select
       className="input"
       value={targetBatchId}
       onChange={e=>setTargetBatchId(e.target.value)}
       disabled={busy||!selectedOperation}
      >
       <option value="">Create New Batch</option>
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
           "SCHEDULED",
           b.resource_code||"",
           scheduleDateTime
            ?`${scheduleDateTime}${scheduleEndTime?`–${scheduleEndTime}`:""}`
            :""
          ].filter(Boolean).join(" · ")
         :"UNSCHEDULED";
        return <option key={b.id} value={b.id}>
         {b.batch_no} · {scheduleText} · {b.total_jobs||0} jobs
        </option>;
       })}
      </select>
      {targetBatchId&&(()=>{
       const b=compatibleTargetBatches.find(x=>String(x.id)===targetBatchId);
       if(!b)return null;
       return <small className="planning-target-batch-info">
        {b.recipe_no?`Recipe ${b.recipe_no} · `:""}
        Qty {formatNumber(b.total_qty)} · Surface {formatNumber(b.total_surface_dm2)} dm²
        {b.schedule_id&&b.schedule_start
         ? ` · ${b.resource_code||""} ${new Date(b.schedule_start).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}`
         : ""}
       </small>;
      })()}
     </label>

     <button
      className="btn primary planning-create-batch"
      disabled={busy||!selected.length}
      onClick={createBatch}>
      {busy
       ?"Đang xử lý..."
       :targetBatchId
        ?"Add Selected to Existing Batch"
        :"Create New Batch"}
     </button>

    </div>
   </aside>
 </div>
}
