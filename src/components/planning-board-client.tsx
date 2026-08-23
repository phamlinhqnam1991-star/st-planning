"use client";

import {useEffect,useMemo,useState} from "react";

const formatNumber=(value:unknown, maxDecimals=2)=>{
 const n=Number(value??0);
 if(!Number.isFinite(n))return "0";
 const fixed=n.toFixed(maxDecimals);
 let [whole,decimal]=fixed.split(".");
 whole=whole.replace(/\B(?=(\d{3})+(?!\d))/g,".");
 decimal=(decimal||"").replace(/0+$/,"");
 return decimal?`${whole},${decimal}`:whole;
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

 part_cluster:string|null;
 part_description:string|null;
 prod_qty:number|null;
 current_good_wip_qty:number|null;
 last_labor_qty:number|null;
 last_operation:string|null;
 next_operation:string|null;
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


type CandidateColumn={
 key:string;
 label:string;
 group:"planning"|"allopen";
};

const PLANNING_COLUMNS:CandidateColumn[]=[
 {key:"job",label:"Job",group:"planning"},
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
const COLUMN_STORAGE_KEY="st-planning:candidate-columns:v3";

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
};
const LEGACY_COLUMN_STORAGE_KEY="st-planning:candidate-columns:v2";

export function PlanningBoardClient({
 candidates,
 standardOperation,
 recipeKey,
 timeRules,
 today
}:{
 candidates:Candidate[];
 standardOperation:string;
 recipeKey:string;
 timeRules:TimeRule[];
 today:string;
}){
 const [selected,setSelected]=useState<number[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
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
  {field:"next_main",direction:"asc"},
  {field:"next_operation",direction:"asc"},
  {field:"primer1",direction:"asc"}
 ]);
 const [viewLoadedFor,setViewLoadedFor]=useState("");
 const [viewMessage,setViewMessage]=useState("");
 const [dragColumnKey,setDragColumnKey]=useState("");
 const [dragSortIndex,setDragSortIndex]=useState<number|null>(null);
 const [dragCandidateId,setDragCandidateId]=useState<number|null>(null);

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

 const allColumns=useMemo<CandidateColumn[]>(()=>[
   ...PLANNING_COLUMNS,
   ...sourceColumns.map(col=>({
     key:`source:${col}`,
     label:col,
     group:"allopen" as const
   }))
 ],[sourceColumns]);

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

       // When upgrading from v30, surface the new status columns once.
       // After saving v2, the user remains free to hide them.
       if(!window.localStorage.getItem(COLUMN_STORAGE_KEY)){
         for(const key of ["status","batch_no","previous_status","previous_batch_no","actual_progress"]){
           if(valid.has(key) && !next.includes(key))next.push(key);
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

 const loadOperationView=(operation:string)=>{
   if(!operation)return false;

   const views=readOperationViews();
   const preset=views[operation];
   if(!preset)return false;

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

   return true;
 };

 const saveCurrentOperationView=()=>{
   if(!standardOperation){
     setViewMessage("Chưa chọn Standard Operation.");
     return;
   }

   const views=readOperationViews();
   views[standardOperation]={
     columns:[...activeColumns],
     filters:{
      nextMain:filterNextMain,
      nextOperation:filterNextOperation,
      primer1:filterPrimer1,
      primer2:filterPrimer2,
      primer3:filterPrimer3
     },
     sortRules:[...sortRules]
   };

   try{
     window.localStorage.setItem(VIEW_STORAGE_KEY,JSON.stringify(views));
     setViewLoadedFor(standardOperation);
     setViewMessage(`Đã lưu view mặc định cho ${standardOperation}.`);
     setTimeout(()=>setViewMessage(""),1800);
   }catch{
     setViewMessage("Không lưu được view mặc định.");
   }
 };

 const deleteCurrentOperationView=()=>{
   if(!standardOperation)return;

   const views=readOperationViews();
   delete views[standardOperation];

   try{
     window.localStorage.setItem(VIEW_STORAGE_KEY,JSON.stringify(views));
   }catch{}

   setViewLoadedFor("");
   setViewMessage(`Đã xóa view riêng của ${standardOperation}.`);
   setTimeout(()=>setViewMessage(""),1800);
 };

 const resetToOperationDefault=()=>{
   if(standardOperation && loadOperationView(standardOperation)){
     setViewLoadedFor(standardOperation);
     setViewMessage(`Đã nạp lại view mặc định ${standardOperation}.`);
   }else{
     resetDisplayRules();
     setViewLoadedFor("");
     setViewMessage("Operation này chưa có view mặc định.");
   }
   setTimeout(()=>setViewMessage(""),1800);
 };

 useEffect(()=>{
   if(!standardOperation || !allColumns.length)return;

   const loaded=loadOperationView(standardOperation);
   setViewLoadedFor(loaded?standardOperation:"");
 },[standardOperation,allColumns]);

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
   const byKey=new Map(allColumns.map(c=>[c.key,c]));
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

 const normalized=(v:unknown)=>String(v??"").trim().toUpperCase();

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

     case "next_operation":
       return normalized(x.next_operation);

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
     // Fixed business rule: unbatched/ELIGIBLE is always above PLANNED.
     const sa=a.planning_status==="PLANNED"?1:0;
     const sb=b.planning_status==="PLANNED"?1:0;
     if(sa!==sb)return sa-sb;

     // Existing planned rows remain grouped by Batch after business priority.
     if(sa===1){
       const ba=normalized(a.batch_no);
       const bb=normalized(b.batch_no);
       const bc=ba.localeCompare(bb,undefined,{numeric:true,sensitivity:"base"});
       if(bc!==0)return bc;
     }

     for(const rule of sortRules){
       const av=getSortValue(a,rule.field);
       const bv=getSortValue(b,rule.field);
       let cmp=0;
       if(typeof av==="number" && typeof bv==="number")cmp=av-bv;
       else cmp=String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:"base"});
       if(cmp!==0)return rule.direction==="desc"?-cmp:cmp;
     }

     return normalized(a.job_num).localeCompare(normalized(b.job_num),undefined,{numeric:true});
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

 const paintSelectionKey=(x:Candidate)=>{
   switch(normalized(standardOperation)){
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

 const selectedRows=useMemo(
   ()=>candidates.filter(x=>selected.includes(x.id) && x.planning_status==="ELIGIBLE"),
   [candidates,selected]
 );

 const selectedPaintKey=useMemo(()=>{
   if(!isPaintSelectionOperation)return "";
   const first=selectedRows.find(x=>paintSelectionKey(x));
   return first?paintSelectionKey(first):"";
 },[selectedRows,isPaintSelectionOperation,standardOperation]);

 const paintSelectionLocked=(x:Candidate)=>{
   if(!isPaintSelectionOperation)return false;
   const key=paintSelectionKey(x);
   if(!key)return true;
   return Boolean(selectedPaintKey && key!==selectedPaintKey);
 };

 const totalQty=selectedRows.reduce((a,x)=>a+Number(x.plan_qty||0),0);
 const totalSurface=selectedRows.reduce((a,x)=>a+Number(x.plan_surface||0),0);
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

 const addCandidateToSelection=(id:number)=>{
   const row=candidates.find(x=>x.id===id);
   if(!row || row.planning_status!=="ELIGIBLE" || paintSelectionLocked(row))return;
   setSelected(prev=>prev.includes(id)?prev:[...prev,id]);
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

 function toggle(id:number){
   const row=candidates.find(x=>x.id===id);
   if(!row || row.planning_status!=="ELIGIBLE")return;

   if(selected.includes(id)){
     setSelected(x=>x.filter(y=>y!==id));
     return;
   }

   if(paintSelectionLocked(row))return;
   setSelected(x=>[...x,id]);
 }

 function toggleAll(){
   const compatible=eligibleCandidates.filter(x=>!paintSelectionLocked(x));
   const ids=compatible.map(x=>x.id);
   const all=ids.length>0 && ids.every(id=>selected.includes(id));
   if(all)setSelected(x=>x.filter(id=>!ids.includes(id)));
   else setSelected(x=>[...new Set([...x,...ids])]);
 }

 async function createBatch(){
   if(!standardOperation)return alert("Chọn Standard Operation.");
   if(!selected.length)return alert("Chọn ít nhất 1 Candidate Job.");

   setBusy(true);
   setMessage("");

   try{
     const r=await fetch("/api/planning/batch",{
       method:"POST",
       headers:{"content-type":"application/json"},
       body:JSON.stringify({
         planning_job_operation_ids:selected,
         standard_operation:standardOperation,
         recipe_key:recipeKey||null
       })
     });

     const d=await r.json();
     if(!r.ok)throw new Error(d.error||"Create Batch failed");

     setMessage(
       `${d.batchNo} created · ${d.totalJobs} Jobs · `+
       `Qty ${formatNumber(d.totalQty)} · `+
       `Surface ${formatNumber(d.totalSurface)} dm² · `+
       `Process ${minutesToHHMM(d.processMinutes)}`
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

 const renderCandidateHeader=(key:string)=>{
   const col=allColumns.find(c=>c.key===key);
   if(!col)return null;

   const cls=["qty","surface"].includes(key)?"num":col.group==="allopen"?"all-open-source-col":"";
   return <th key={key} className={cls||undefined}>{col.label}</th>;
 };

 const renderCandidateCell=(x:Candidate,key:string)=>{
   if(key.startsWith("source:")){
     const sourceKey=key.slice("source:".length);
     return <td key={key} className="all-open-source-col">
      {displaySourceValue((x.source_data||{})[sourceKey])}
     </td>;
   }

   switch(key){
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
   <section className="erp-table-panel planning-candidates">
    <div className="erp-panel-head">
     <b>Candidate Jobs</b>
     <div className="row">
      <span>{eligibleCandidates.length} ELIGIBLE · {plannedCandidates.length} PLANNED</span>
      <button className="btn small" type="button" onClick={()=>setDisplayRulesOpen(x=>!x)}>
       Sort / Filter
      </button>
      <button className="btn small" type="button" onClick={()=>setColumnPickerOpen(x=>!x)}>
       Columns ({activeColumns.length}/{allColumns.length})
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
         {standardOperation
          ? `View cho ${standardOperation}${viewLoadedFor===standardOperation?" · DEFAULT SAVED":""}`
          : "Chỉ thay đổi thứ tự/hiển thị, không thay đổi Planning logic."}
        </small>
       </div>
       <div className="row">
        <button className="btn small" type="button" onClick={saveCurrentOperationView} disabled={!standardOperation}>
         Set Default
        </button>
        <button className="btn small" type="button" onClick={resetToOperationDefault} disabled={!standardOperation}>
         Load Default
        </button>
        <button className="btn small" type="button" onClick={deleteCurrentOperationView} disabled={!standardOperation||viewLoadedFor!==standardOperation}>
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
          checked={
           eligibleCandidates.filter(x=>!paintSelectionLocked(x)).length>0 &&
           eligibleCandidates.filter(x=>!paintSelectionLocked(x)).every(x=>selected.includes(x.id))
          }
          onChange={toggleAll}
         />
        </th>
        {activeColumns.map(renderCandidateHeader)}
       </tr>
      </thead>
      <tbody>
       {displayCandidates.map(x=>
        <tr
         key={x.id}
         className={`${selected.includes(x.id)?"planning-row-selected ":""}${x.planning_status==="PLANNED"?"planning-row-planned ":""}${dragCandidateId===x.id?"planning-row-dragging ":""}${paintSelectionLocked(x)?"paint-selection-disabled ":""}${priorityClass(x.priority_type)}`.trim()}
         draggable={x.planning_status==="ELIGIBLE"&&!paintSelectionLocked(x)}
         onDragStart={e=>{
          if(x.planning_status!=="ELIGIBLE"||paintSelectionLocked(x))return;
          setDragCandidateId(x.id);
          e.dataTransfer.effectAllowed="copy";
          e.dataTransfer.setData("application/x-st-candidate",String(x.id));
         }}
         onDragEnd={()=>setDragCandidateId(null)}
        >
         <td>
          <input
           type="checkbox"
           checked={selected.includes(x.id)}
           disabled={x.planning_status!=="ELIGIBLE"||paintSelectionLocked(x)}
           title={paintSelectionLocked(x)?"Khác loại sơn với Job đã chọn hoặc chưa có loại sơn":undefined}
           onChange={()=>toggle(x.id)}
          />
         </td>
         {activeColumns.map(key=>renderCandidateCell(x,key))}
        </tr>
       )}
       {!displayCandidates.length&&
        <tr><td colSpan={1+activeColumns.length} className="muted">
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
      <div><span>Operation</span><b>{standardOperation||"—"}</b></div>
      <div><span>Jobs</span><b>{selectedRows.length}</b></div>
      <div><span>Total Qty</span><b>{formatNumber(totalQty)}</b></div>
      <div><span>Total Surface</span><b>{formatNumber(totalSurface)} dm²</b></div>
      <div className="planning-process-time"><span>Process Time</span><b>{minutesToHHMM(estimatedMinutes)}</b></div>
     </div>

     <button
      className="btn primary planning-create-batch"
      disabled={busy||!selected.length}
      onClick={createBatch}>
      {busy?"Đang xử lý...":"Add Selected to Batch"}
     </button>

     {message&&
      <div className={`planning-message ${message.startsWith("Lỗi")?"danger":""}`}>
       {message}
      </div>}
    </div>
   </aside>
 </div>
}
