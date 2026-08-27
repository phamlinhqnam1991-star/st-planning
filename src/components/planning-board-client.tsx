"use client";

import {Fragment,useEffect,useMemo,useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";

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

 // Batch Key / Recipe Rule suggestion (enriched server-side).
 rule_matched:boolean;
 rule_ambiguous:boolean;
 rule_name:string|null;
 suggested_recipe_key:string|null;
 suggested_recipe_no:string|null;
 suggested_recipe_name:string|null;
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

export function PlanningBoardClient({
 candidates,
 availableBatches,
 standardOperation,
 areaMode,
 selectedAreaId,
 mainOperations,
 recipeKey,
 timeRules,
 rules,
 today
}:{
 candidates:Candidate[];
 availableBatches:BatchTargetOption[];
 standardOperation:string;
 areaMode:boolean;
 selectedAreaId:string;
 mainOperations:MainOperationMaster[];
 recipeKey:string;
 timeRules:TimeRule[];
 rules:any[];
 today:string;
}){
 const [selected,setSelected]=useState<number[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [targetBatchId,setTargetBatchId]=useState("");
 usePopupMessage(message);
 const [columnPickerOpen,setColumnPickerOpen]=useState(false);
 const [columnSearch,setColumnSearch]=useState("");
 const [visibleColumns,setVisibleColumns]=useState<string[]|null>(null);
 const [displayRulesOpen,setDisplayRulesOpen]=useState(false);
 const [filterNextMain,setFilterNextMain]=useState("");
 const [filterNextOperation,setFilterNextOperation]=useState("");
 const [filterPrimer1,setFilterPrimer1]=useState("");
 const [filterPrimer2,setFilterPrimer2]=useState("");
 const [filterPrimer3,setFilterPrimer3]=useState("");
 const [sortRules,setSortRules]=useState<SortRule[]>([
  {field:"next_operation",direction:"asc"},
  {field:"priority",direction:"desc"},
  {field:"job",direction:"asc"}
 ]);
 const [viewLoadedFor,setViewLoadedFor]=useState("");
 const [viewMessage,setViewMessage]=useState("");
 const [dragColumnKey,setDragColumnKey]=useState("");
 const [dragSortIndex,setDragSortIndex]=useState<number|null>(null);
 const [dragCandidateId,setDragCandidateId]=useState<number|null>(null);
 const [fullView,setFullView]=useState(false);
 const [candidateDensity,setCandidateDensity]=useState<"normal"|"compact"|"ultra">("compact");
 const [routeFocus,setRouteFocus]=useState(false);

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

 // Append every original All Open Job column from source_data.
 // This stays dynamic when the imported Excel adds/removes source columns.
 const sourceColumns=useMemo(()=>{
   const out:string[]=[];
   const seen=new Set<string>();
   for(const row of candidates){
     for(const key of Object.keys(row.source_data||{})){
       if(!seen.has(key)){
         seen.add(key);
         out.push(key);
       }
     }
   }
   return out;
 },[candidates]);

 const routeColumns=useMemo<CandidateColumn[]>(()=>{
   // One Main / Standard Operation = one permanent physical Candidate column.
   // The selected Area controls which master columns are shown.
   const selectedArea=selectedAreaId?Number(selectedAreaId):null;
   const seen=new Set<string>();
   const columns:CandidateColumn[]=[];

   for(const op of mainOperations){
     if(selectedArea && Number(op.area_id)!==selectedArea)continue;

     const mainOperation=normalized(op.standard_operation);
     if(!mainOperation||seen.has(mainOperation))continue;
     seen.add(mainOperation);

     columns.push({
      key:`route-main:${mainOperation}`,
      label:mainOperation,
      group:"route"
     });
   }

   // PIONBL is progress-only and may not be in Planning Operation Scope.
   if(
    candidates.some(row=>
     (row.route_status||[]).some(item=>normalized(item.source_operation)==="PIONBL")
    ) &&
    !seen.has("PIONBL")
   ){
     columns.push({
      key:"route-main:PIONBL",
      label:"PIONBL",
      group:"route"
     });
   }

   return columns;
 },[mainOperations,selectedAreaId,candidates]);
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

 // SSR and first client render both show all columns.
 // Saved browser preference is applied only after hydration to avoid mismatch.
 useEffect(()=>{
   try{
     const raw=
       window.localStorage.getItem(COLUMN_STORAGE_KEY) ||
       window.localStorage.getItem(LEGACY_COLUMN_STORAGE_KEY);

     if(!raw){
       setVisibleColumns(allColumns.map(x=>x.key));
       return;
     }

     const saved=JSON.parse(raw);
     if(Array.isArray(saved)){
       const valid=new Set(allColumns.map(x=>x.key));
       let next=saved.filter((x:unknown)=>typeof x==="string"&&valid.has(x)) as string[];

       // On a new column-schema version, surface status fields and the Route Status Matrix once.
       // After it is saved, the user remains free to hide/reorder any matrix column.
       if(!window.localStorage.getItem(COLUMN_STORAGE_KEY)){
         for(const key of ["status","batch_no","previous_status","previous_batch_no","actual_progress"]){
           if(valid.has(key) && !next.includes(key))next.push(key);
         }

         for(const col of routeColumns){
           if(valid.has(col.key) && !next.includes(col.key))next.push(col.key);
         }

         window.localStorage.setItem(COLUMN_STORAGE_KEY,JSON.stringify(next));
       }

       setVisibleColumns(next);
     }else{
       setVisibleColumns(allColumns.map(x=>x.key));
     }
   }catch{
     setVisibleColumns(allColumns.map(x=>x.key));
   }
 },[allColumns]);

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

 const activeColumns=visibleColumns??allColumns.map(x=>x.key);
 const isColumnVisible=(key:string)=>activeColumns.includes(key);

 const readOperationViews=():Record<string,CandidateViewPreset>=>{
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
   const validColumns=new Set(allColumns.map(x=>x.key));
   const cols=Array.isArray(preset.columns)
    ? preset.columns.filter(x=>validColumns.has(x))
    : allColumns.map(x=>x.key);

   setVisibleColumns(cols);
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

 const saveCurrentDefault=()=>{
   const views=readOperationViews();

   views[exactViewKey]={
     columns:[...activeColumns],
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

   try{
     window.localStorage.setItem(VIEW_STORAGE_KEY,JSON.stringify(views));
     setViewLoadedFor(exactViewKey);
     setViewMessage(`Đã lưu Default View cho ${exactViewLabel}.`);
     setTimeout(()=>setViewMessage(""),1800);
   }catch{
     setViewMessage("Không lưu được Default View.");
   }
 };

 const deleteCurrentDefault=()=>{
   const views=readOperationViews();

   if(!views[exactViewKey]){
     setViewMessage(`${exactViewLabel}: không có Default View riêng để xóa.`);
     setTimeout(()=>setViewMessage(""),1800);
     return;
   }

   delete views[exactViewKey];

   try{
     window.localStorage.setItem(VIEW_STORAGE_KEY,JSON.stringify(views));
   }catch{}

   setViewLoadedFor("");
   setViewMessage(`Đã xóa Default View của ${exactViewLabel}.`);
   setTimeout(()=>setViewMessage(""),1800);
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
 },[standardOperation,selectedAreaId,allColumns]);
 const saveColumns=(next:string[])=>{
   setVisibleColumns(next);
   try{window.localStorage.setItem(COLUMN_STORAGE_KEY,JSON.stringify(next))}catch{}
 };

 const toggleColumn=(key:string)=>{
   const next=isColumnVisible(key)
     ? activeColumns.filter(x=>x!==key)
     : [...activeColumns,key];
   saveColumns(next);
 };

 const moveColumn=(key:string,direction:-1|1)=>{
   const current=[...activeColumns];
   const index=current.indexOf(key);
   if(index<0)return;

   const target=index+direction;
   if(target<0 || target>=current.length)return;

   [current[index],current[target]]=[current[target],current[index]];
   saveColumns(current);
 };

 const moveColumnTo=(key:string,targetIndex:number)=>{
   const current=[...activeColumns];
   const index=current.indexOf(key);
   if(index<0)return;

   const next=[...current];
   next.splice(index,1);
   const safe=Math.max(0,Math.min(targetIndex,next.length));
   next.splice(safe,0,key);
   saveColumns(next);
 };

 const orderedColumnChoices=useMemo(()=>{
   const byKey=new Map<string,CandidateColumn>(
    allColumns.map((c:CandidateColumn)=>[c.key,c] as [string,CandidateColumn])
   );
   const ordered:CandidateColumn[]=[];

   for(const key of activeColumns){
     const col=byKey.get(key);
     if(col)ordered.push(col);
   }

   for(const col of allColumns){
     if(!activeColumns.includes(col.key))ordered.push(col);
   }

   return ordered;
 },[allColumns,activeColumns]);

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

 const displayCandidates=useMemo(()=>{
   const filtered=candidates.filter(x=>
     (!filterNextMain || normalized(x.next_standard_operation||"END")===normalized(filterNextMain)) &&
     (!filterNextOperation || normalized(x.next_operation)===normalized(filterNextOperation)) &&
     (!filterPrimer1 || normalized(x.part_master_primer1)===normalized(filterPrimer1)) &&
     (!filterPrimer2 || normalized(x.part_master_primer2)===normalized(filterPrimer2)) &&
     (!filterPrimer3 || normalized(x.part_master_primer3)===normalized(filterPrimer3))
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
   filterPrimer1,filterPrimer2,filterPrimer3,sortRules
 ]);

 const eligibleCandidates=useMemo(
   ()=>displayCandidates.filter(x=>x.planning_status==="ELIGIBLE"),
   [displayCandidates]
 );

 const plannedCandidates=useMemo(
   ()=>displayCandidates.filter(x=>x.planning_status==="PLANNED"),
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

 // Tổng hợp đề xuất Batch Key / Recipe Rule cho các Job đang chọn.
 const suggestionSummary=useMemo(()=>{
   if(!selectedRows.length)return null;
   const matched=selectedRows.filter(x=>x.rule_matched&&!x.rule_ambiguous);
   const ambiguous=selectedRows.filter(x=>x.rule_ambiguous);
   const unmatched=selectedRows.filter(x=>!x.rule_matched);
   const recipes=[...new Set(matched.map(x=>x.suggested_recipe_key).filter(Boolean))];
   const keys=[...new Set(matched.map(x=>x.batch_key_suggest).filter(Boolean))];
   const prefixes=[...new Set(matched.map(x=>x.batch_prefix_suggest).filter(Boolean))];
   const names=[...new Set(matched.map(x=>x.suggested_recipe_name).filter(Boolean))];
   const ruleNames=[...new Set(matched.map(x=>x.rule_name).filter(Boolean))];
   return {
     matchedCount:matched.length,
     ambiguousCount:ambiguous.length,
     unmatchedCount:unmatched.length,
     unanimousRecipe:recipes.length===1?recipes[0]:null,
     unanimousRecipeName:names.length===1?names[0]:null,
     unanimousKey:keys.length===1?keys[0]:null,
     unanimousPrefix:prefixes.length===1?prefixes[0]:null,
     ruleNames
   };
 },[selectedRows]);

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
 // a Candidate row may be PLANNED at its previous/current Main while a later
 // immediate Main is already READY after Schedule Gate.
 const selectableTargetFor=(row:Candidate)=>{
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
         recipe_key:recipeKey||suggestionSummary?.unanimousRecipe||null,
         target_batch_id:targetBatchId?Number(targetBatchId):null
       })
     });

     const d=await r.json();
     if(!r.ok)throw new Error(d.error||"Create Batch failed");

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
   setMessage("Đang rebuild Planning Chain từ AllOperation...");

   try{
     const r=await fetch("/api/planning/rebuild",{method:"POST"});
     const d=await r.json();
     if(!r.ok)throw new Error(d.error||"Rebuild failed");

     setMessage(
       `Rebuild xong: ${d.jobs} Jobs · ${d.operations} operations · `+
       `${d.eligible} eligible · ${d.locked} locked · `+
       `NextOperation ${d.nextAnchored||0} · Fallback LastOp ${d.fallbackAnchored||0} · `+
       `Sequence Check ${d.sequenceCheck||0}`
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
   const target=selectableTargetFor(x);
   if(target){
    const item=target.routeItem;
    const status=item?.route_status||(
      x.planning_status==="ELIGIBLE" ? "READY" :
      x.planning_status==="PLANNED" ? "PLANNED-UNSCHEDULED" :
      "WAITING"
    );
    return {
     operation:target.standardOperation||x.standard_operation||"—",
     status:String(status||"—"),
     item
    };
   }

   // No selectable READY target: show the Candidate representative Main
   // instead of depending on whichever route column happens to be first.
   return {
    operation:x.standard_operation||x.next_standard_operation||"—",
    status:
      x.planning_status==="PLANNED"
       ? (x.batch_no?"PLANNED-UNSCHEDULED":"PLANNED")
       : x.planning_status==="LOCKED"
        ? "WAIT PREV"
        : x.planning_status==="ELIGIBLE"
         ? "READY"
         : String(x.planning_status||"—"),
    item:null as RouteStatusItem|null
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

   const cls=
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
    setMessage(
     `${candidate.job_num} · ${op}: WAITING. `+
     `Main trước phải được Schedule trước khi công đoạn này mở READY.`
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

 const waitingDisplayFor=(candidate:Candidate,item:RouteStatusItem)=>{
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
     label:"WAIT PREV",
     reason:"Waiting for Previous Main Schedule",
     kind:"route-status-wait-prev"
    };
   }

   return {
    label:"WAIT",
    reason:"Future Main Operation",
    kind:"route-status-wait-future"
   };
 };

 const renderRouteStatusCell=(x:Candidate,key:string)=>{
   const mainOperation=normalized(key.slice("route-main:".length));

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
     return <td key={key} className="all-open-source-col">
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

 return <div className="planning-board-grid">
   <section className={`erp-table-panel planning-candidates ${fullView?"candidate-full-view":""} candidate-density-${candidateDensity} ${routeFocus?"candidate-route-focus":""}`}>
    <div className="erp-panel-head candidate-sticky-toolbar">
     <b>Candidate Jobs</b>
     <div className="row">
      <span>{eligibleCandidates.length} ELIGIBLE · {plannedCandidates.length} PLANNED</span>
      <button className="btn small" type="button" onClick={()=>setDisplayRulesOpen(x=>!x)}>
       Sort / Filter
      </button>
      <button className="btn small" type="button" onClick={()=>setColumnPickerOpen(x=>!x)}>
       Columns ({activeColumns.length}/{allColumns.length})
      </button>
      <select className="input candidate-density-select" value={candidateDensity} onChange={e=>setCandidateDensity(e.target.value as "normal"|"compact"|"ultra")} title="Mật độ hiển thị">
       <option value="normal">Normal</option>
       <option value="compact">Compact</option>
       <option value="ultra">Ultra Compact</option>
      </select>
      <button className={`btn small ${routeFocus?"primary":""}`} type="button" onClick={()=>setRouteFocus(x=>!x)} title="Làm mờ các ô không thuộc route">Route Focus</button>
      <button className="btn small" type="button" onClick={()=>setFullView(x=>!x)} title="ESC để thoát Full View">
       {fullView?"Exit Full View":"Full View"}
      </button>
      <button className="btn small" disabled={busy} onClick={rebuild}>
       Rebuild Chain
      </button>
     </div>
    </div>

    {isPaintSelectionOperation&&
     <div className={`paint-selection-lock-banner ${selectedPaintKey?"is-locked":""}`}>
      <b>Paint Selection Lock</b>
      <span>
       {selectedPaintKey
        ? `${paintSelectionField(standardOperation)} = ${selectedPaintKey} · Các Job khác loại sơn đã bị khóa.`
        : `Chọn Job đầu tiên để khóa theo ${paintSelectionField(standardOperation)}. Job thiếu loại sơn cũng không được chọn.`}
      </span>
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
     <div className="candidate-column-picker">
      <div className="candidate-column-picker-head">
       <b>Chọn cột hiển thị</b>
       <input
        className="input"
        value={columnSearch}
        onChange={e=>setColumnSearch(e.target.value)}
        placeholder="Tìm tên cột..."
       />
       <div className="row">
        <button className="btn small" type="button" onClick={()=>saveColumns(allColumns.map(x=>x.key))}>Select All</button>
        <button className="btn small" type="button" onClick={()=>saveColumns(PLANNING_COLUMNS.map(x=>x.key))}>Planning Only</button>
        <button className="btn small" type="button" onClick={()=>saveColumns([])}>Clear</button>
       </div>
      </div>

      <div className="candidate-column-picker-grid candidate-column-order-grid">
       {filteredColumnChoices.map(c=>{
        const visible=isColumnVisible(c.key);
        const orderIndex=activeColumns.indexOf(c.key);

        return <div
         key={c.key}
         className={`candidate-column-choice candidate-column-order-item ${visible?"is-visible":""} ${dragColumnKey===c.key?"is-dragging":""}`}
         draggable={visible}
         onDragStart={e=>{
          if(!visible)return;
          setDragColumnKey(c.key);
          e.dataTransfer.effectAllowed="move";
          e.dataTransfer.setData("text/plain",c.key);
         }}
         onDragOver={e=>{
          if(!visible || !dragColumnKey || dragColumnKey===c.key)return;
          e.preventDefault();
          e.dataTransfer.dropEffect="move";
         }}
         onDrop={e=>{
          e.preventDefault();
          if(!dragColumnKey || dragColumnKey===c.key)return;
          const from=activeColumns.indexOf(dragColumnKey);
          const to=activeColumns.indexOf(c.key);
          if(from>=0 && to>=0)moveColumnTo(dragColumnKey,to);
          setDragColumnKey("");
         }}
         onDragEnd={()=>setDragColumnKey("")}
        >
         <label className="candidate-column-toggle">
          <input
           type="checkbox"
           checked={visible}
           onChange={()=>toggleColumn(c.key)}
          />
          <span>{c.label}</span>
          <small>{c.group==="planning"?"Planning":"All Open Job"}</small>
         </label>

         {visible&&
          <div className="candidate-column-order-actions">
           <span className="candidate-column-order-number">{orderIndex+1}</span>
           <button
            className="btn small"
            type="button"
            title="Đưa cột lên trước"
            disabled={orderIndex<=0}
            onClick={()=>moveColumn(c.key,-1)}
           >↑</button>
           <button
            className="btn small"
            type="button"
            title="Đưa cột xuống sau"
            disabled={orderIndex<0||orderIndex>=activeColumns.length-1}
            onClick={()=>moveColumn(c.key,1)}
           >↓</button>
           <button
            className="btn small"
            type="button"
            title="Đưa lên đầu"
            disabled={orderIndex<=0}
            onClick={()=>moveColumnTo(c.key,0)}
           >⇤</button>
           <button
            className="btn small"
            type="button"
            title="Đưa xuống cuối"
            disabled={orderIndex<0||orderIndex>=activeColumns.length-1}
            onClick={()=>moveColumnTo(c.key,activeColumns.length-1)}
           >⇥</button>
          </div>}
        </div>
       })}
      </div>
     </div>}

    <div className="table-wrap">
     <table className="erp-table planning-candidate-table">
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
       {displayCandidates.map((x,rowIndex)=>
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
     {rules.length>0&&<small className="muted">· {rules.length} rules</small>}
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
      <div className={`planning-rule-suggestion ${suggestionSummary.unanimousRecipe?"ok":suggestionSummary.ambiguousCount?"warn":""}`}>
       {suggestionSummary.unanimousRecipe?(
        <>
         <b>✓ Rule khớp:</b> {suggestionSummary.ruleNames.join(", ")}
         <span>Recipe: <b>{suggestionSummary.unanimousRecipeName||suggestionSummary.unanimousRecipe}</b></span>
         {suggestionSummary.unanimousKey&&<span className="mono">Batch Key: {suggestionSummary.unanimousKey}</span>}
         {suggestionSummary.unanimousPrefix&&<span className="mono">Prefix: {suggestionSummary.unanimousPrefix}</span>}
        </>
       ):(
        <>
         <b>{suggestionSummary.ambiguousCount?"⚠ Nhiều rule cùng ưu tiên khớp":"✕ Chưa có rule khớp"}</b>
         <span>
          {suggestionSummary.unmatchedCount} Job chưa khớp rule · chọn Recipe tay
          hoặc{" "}
          <a href={`/batch-key-recipe-rules?op=${encodeURIComponent(selectedOperation||"")}`}>
           tạo rule
          </a>
         </span>
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
