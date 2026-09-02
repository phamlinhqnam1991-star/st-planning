"use client";

import {pushAppToast} from "@/components/app-toast-provider";

import {safeJson} from "@/lib/fetch-json";
import {useEffect,useMemo,useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";
import {useErpConfirm} from "@/components/app-dialog-provider";

const VIEW_STORAGE_KEY="st-planning:candidate-view-by-operation:v1";
const COLUMN_STORAGE_KEY="st-planning:candidate-columns:v3";

const formatNumber=(value:unknown,maxDecimals=2)=>{
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
 plan_qty:number;
 plan_surface:number;
 source_operation_code:string;
 standard_operation:string;
 st_group:string|null;
 next_standard_operation:string|null;
 previous_standard_operation:string|null;
 previous_planning_operation:string|null;
 previous_planning_status:string|null;
 previous_batch_no:string|null;
 previous_batch_status:string|null;
 previous_batch_operation:string|null;
 previous_batch_source_operation:string|null;

 recipe_no:string|null;
 recipe_name:string|null;
 recipe_required:boolean|null;
 recipe_key:string|null;
 effective_recipe_key:string|null;

 priority_type:string|null;
 planning_status:string|null;
 batch_no:string|null;
 batch_status:string|null;

 part_master_primer1:string|null;
 part_master_primer2:string|null;
 part_master_primer3:string|null;
 part_master_topcoat1:string|null;
 part_master_topcoat2:string|null;
 part_master_antiabration:string|null;
 part_master_varnish:string|null;

 program:string|null;
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

type CandidateColumn={
 key:string;
 label:string;
 group:"planning"|"allopen";
};

type SortDirection="asc"|"desc";
type SortRule={field:string;direction:SortDirection};

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

const normalized=(v:unknown)=>String(v??"").trim().toUpperCase();

function displaySourceValue(v:unknown){
 if(v===null||v===undefined||v==="")return "—";
 if(typeof v==="number")return formatNumber(v);
 if(typeof v==="object"){
   try{return JSON.stringify(v)}catch{return String(v)}
 }
 return String(v);
}

function sourceSortValue(value:unknown):string|number{
 if(value===null||value===undefined||value==="")return "";
 if(typeof value==="number"&&Number.isFinite(value))return value;
 if(typeof value==="boolean")return value?1:0;

 const raw=String(value).trim();
 if(!raw)return "";

 const compact=raw.replace(/\s/g,"");
 if(/^[-+]?\d+(?:\.\d+)?$/.test(compact)){
   const n=Number(compact);
   if(Number.isFinite(n))return n;
 }
 if(/^[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(compact)){
   const n=Number(compact.replace(/,/g,""));
   if(Number.isFinite(n))return n;
 }

 return normalized(raw);
}

export function BatchDetailManager({
 batchId,
 standardOperation,
 planningDate,
 jobs,
 candidates,
 initialNextFilter,
 presentation="legacy"
}:{
 batchId:number;
 standardOperation:string;
 planningDate:string;
 jobs:any[];
 candidates:Candidate[];
 initialNextFilter:string;
 presentation?:"legacy"|"erp";
}){
 const confirmErp=useErpConfirm();
 const erpMode=presentation==="erp";
 const planningStateLabel=(value:unknown)=>{
  const raw=String(value||"").trim();
  if(!erpMode)return raw;
  switch(normalized(raw)){
   case "PLANNED": return "BATCH";
   case "ELIGIBLE": return "READY";
   case "LOCKED": return "WAIT";
   case "NO BATCH": return "CHƯA CÓ BATCH";
   default:return raw;
  }
 };
 const [busy,setBusy]=useState(false);
 const [selected,setSelected]=useState<number[]>([]);
 const [q,setQ]=useState("");
 const [message,setMessage]=useState("");
 usePopupMessage(message);
 const [viewLoaded,setViewLoaded]=useState(false);
 const [activeColumns,setActiveColumns]=useState<string[]|null>(null);
 const [filterNextMain,setFilterNextMain]=useState(initialNextFilter||"");
 const [filterNextOperation,setFilterNextOperation]=useState("");
 const [filterPrimer1,setFilterPrimer1]=useState("");
 const [filterPrimer2,setFilterPrimer2]=useState("");
 const [filterPrimer3,setFilterPrimer3]=useState("");
 const [sortRules,setSortRules]=useState<SortRule[]>([]);

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

 useEffect(()=>{
   if(!allColumns.length)return;

   const valid=new Set(allColumns.map(x=>x.key));
   let columns=allColumns.map(x=>x.key);
   let preset:CandidateViewPreset|null=null;

   try{
     const raw=window.localStorage.getItem(VIEW_STORAGE_KEY);
     const views=raw?JSON.parse(raw):{};
     preset=views?.[standardOperation]||null;
   }catch{}

   if(preset){
     const savedColumns=Array.isArray(preset.columns)
      ? preset.columns.filter(x=>valid.has(x))
      : [];

     if(savedColumns.length)columns=savedColumns;

     setFilterNextMain(
       initialNextFilter ||
       preset.filters?.nextMain ||
       ""
     );
     setFilterNextOperation(preset.filters?.nextOperation||"");
     setFilterPrimer1(preset.filters?.primer1||"");
     setFilterPrimer2(preset.filters?.primer2||"");
     setFilterPrimer3(preset.filters?.primer3||"");
     setSortRules(Array.isArray(preset.sortRules)?preset.sortRules.slice(0,10):[]);
     setViewLoaded(true);
   }else{
     try{
       const raw=window.localStorage.getItem(COLUMN_STORAGE_KEY);
       const saved=raw?JSON.parse(raw):null;
       if(Array.isArray(saved)){
         const validSaved=saved.filter((x:unknown)=>typeof x==="string"&&valid.has(x)) as string[];
         if(validSaved.length)columns=validSaved;
       }
     }catch{}
     setViewLoaded(false);
   }

   setActiveColumns(columns);
 },[allColumns,standardOperation,initialNextFilter]);

 const columns=activeColumns??allColumns.map(x=>x.key);


 const selectedRecipeSuggestion=useMemo(()=>{
   if(!selected.length)return null;
   const rows=candidates.filter(x=>selected.includes(x.id));
   const keys=[...new Set(rows.map(x=>x.effective_recipe_key||x.recipe_key||"").filter(Boolean))];
   if(!keys.length)return {kind:"none" as const};
   if(keys.length===1){
     const row=rows.find(x=>(x.effective_recipe_key||x.recipe_key)===keys[0]);
     return {
       kind:"ok" as const,
       label:`${row?.recipe_no||keys[0]}${row?.recipe_name?` · ${row.recipe_name}`:""}`
     };
   }
   return {kind:"mixed" as const, keys};
 },[candidates,selected]);

 const currentPriorityMonth=useMemo(()=>{
   const raw=String(planningDate||"").slice(0,10);
   const m=raw.match(/^(\d{4})-(\d{2})-\d{2}$/);
   if(!m)return "";
   const names=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
   return `${names[Number(m[2])-1]||""}-${m[1].slice(-2)}`;
 },[planningDate]);

 const priorityClass=(value:unknown)=>{
   const p=normalized(value).replace(/\s+/g," ").replace(/_/g,"-");
   if(p==="CAT3"||p.startsWith("CAT3 "))return "priority-cat3";
   if(p==="CAT5"||p.startsWith("CAT5 "))return "priority-cat5";
   if(p==="SALE"||p==="SALES"||p.startsWith("SALE ")||p.startsWith("SALES "))return "priority-sales";

   if(currentPriorityMonth){
     const monthCompact=currentPriorityMonth.replace("-","");
     const pCompact=p.replace(/[-\/\s]/g,"");
     if(
       p===currentPriorityMonth ||
       p.startsWith(`${currentPriorityMonth} `) ||
       pCompact===monthCompact ||
       pCompact.startsWith(monthCompact)
     )return "priority-current-month";
   }
   return "";
 };

 const getColumnSortValue=(x:Candidate,key:string):string|number=>{
   switch(key){
     case "job": return normalized(x.job_num);
     case "part_rev": return `${normalized(x.part_num)}\u0001${normalized(x.revision_num)}`;
     case "qty": return Number(x.plan_qty||0);
     case "surface": return Number(x.plan_surface||0);
     case "source_op": return normalized(x.source_operation_code);
     case "previous_op": return normalized(x.previous_standard_operation||"START");
     case "next_op": return normalized(x.next_standard_operation||"END");
     case "recipe": return `${normalized(x.recipe_no)}\u0001${normalized(x.recipe_name)}`;
     case "primer1": return sourceSortValue(x.part_master_primer1);
     case "primer2": return sourceSortValue(x.part_master_primer2);
     case "primer3": return sourceSortValue(x.part_master_primer3);
     case "priority": return normalized(x.priority_type);
     case "status": return normalized(x.planning_status);
     case "batch_no": return normalized(x.batch_no);
     case "previous_status":
       return `${normalized(x.previous_planning_operation||"START")}\u0001${normalized(x.previous_planning_status)}`;
     case "previous_batch_no": return normalized(x.previous_batch_no);
     case "actual_progress":
       return `${normalized(x.last_operation||"START")}\u0001${normalized(x.next_operation||"END")}`;
     default:
       if(key.startsWith("source:"))
         return sourceSortValue(x.source_data?.[key.slice("source:".length)]);
       return "";
   }
 };

 const getSortValue=(x:Candidate,field:string):string|number=>{
   if(field.startsWith("column:"))
     return getColumnSortValue(x,field.slice("column:".length));

   switch(field){
     case "next_main": return normalized(x.next_standard_operation||"END");
     case "next_operation": return normalized(x.next_operation);
     case "primer1": return sourceSortValue(x.part_master_primer1);
     case "primer2": return sourceSortValue(x.part_master_primer2);
     case "primer3": return sourceSortValue(x.part_master_primer3);
     case "recipe": return `${normalized(x.recipe_no)}\u0001${normalized(x.recipe_name)}`;
     case "previous_batch": return normalized(x.previous_batch_no);
     case "priority": return normalized(x.priority_type);
     case "part": return normalized(x.part_num);
     case "program": return normalized(x.program);
     case "qty": return Number(x.plan_qty||0);
     case "surface": return Number(x.plan_surface||0);
     case "job":
     default: return normalized(x.job_num);
   }
 };

 const visible=useMemo(()=>{
   const search=q.trim().toUpperCase();

   const filtered=candidates.filter(x=>{
     if(filterNextMain && normalized(x.next_standard_operation||"END")!==normalized(filterNextMain))
       return false;
     if(filterNextOperation && normalized(x.next_operation)!==normalized(filterNextOperation))
       return false;
     if(filterPrimer1 && normalized(x.part_master_primer1)!==normalized(filterPrimer1))
       return false;
     if(filterPrimer2 && normalized(x.part_master_primer2)!==normalized(filterPrimer2))
       return false;
     if(filterPrimer3 && normalized(x.part_master_primer3)!==normalized(filterPrimer3))
       return false;

     if(!search)return true;

     return x.job_num.toUpperCase().includes(search)
       || (x.part_num||"").toUpperCase().includes(search)
       || (x.source_operation_code||"").toUpperCase().includes(search)
       || Object.entries(x.source_data||{}).some(([k,v])=>
            k.toUpperCase().includes(search) ||
            String(v??"").toUpperCase().includes(search)
          );
   });

   return [...filtered].sort((a,b)=>{
     for(const rule of sortRules){
       const av=getSortValue(a,rule.field);
       const bv=getSortValue(b,rule.field);
       let cmp=0;

       if(typeof av==="number"&&typeof bv==="number")
         cmp=av-bv;
       else
         cmp=String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:"base"});

       if(cmp!==0)return rule.direction==="desc"?-cmp:cmp;
     }

     return normalized(a.job_num).localeCompare(normalized(b.job_num),undefined,{numeric:true});
   });
 },[
   candidates,q,
   filterNextMain,filterNextOperation,
   filterPrimer1,filterPrimer2,filterPrimer3,
   sortRules
 ]);

 const visibleBatchJobs=useMemo(()=>{
   return [...jobs].sort((a:any,b:any)=>{
     for(const rule of sortRules){
       const av=getSortValue(a as Candidate,rule.field);
       const bv=getSortValue(b as Candidate,rule.field);
       let cmp=0;

       if(typeof av==="number"&&typeof bv==="number")
         cmp=av-bv;
       else
         cmp=String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:"base"});

       if(cmp!==0)return rule.direction==="desc"?-cmp:cmp;
     }

     return normalized(a.job_num).localeCompare(normalized(b.job_num),undefined,{numeric:true});
   });
 },[jobs,sortRules]);

 function toggle(id:number){
   const row=candidates.find(x=>x.id===id);
   if(!row)return;

   if(selected.includes(id)){
     setSelected(x=>x.filter(y=>y!==id));
     return;
   }

   setSelected(x=>[...x,id]);
 }

 function toggleAll(){
   const ids=visible.map(x=>x.id);
   const all=ids.length>0&&ids.every(id=>selected.includes(id));
   if(all)setSelected(x=>x.filter(id=>!ids.includes(id)));
   else setSelected(x=>[...new Set([...x,...ids])]);
 }

 async function add(){
   if(!selected.length)return pushAppToast(erpMode?"Chọn ít nhất một Job để thêm vào Batch.":"Chọn ít nhất 1 Job để thêm.");
   setBusy(true);
   setMessage("");

   try{
     const r=await fetch(`/api/planning/batch/${batchId}/jobs`,{
       method:"POST",
       headers:{"content-type":"application/json"},
       body:JSON.stringify({planning_job_operation_ids:selected})
     });
     const d=await safeJson(r);

     if(!r.ok)throw new Error(d.error||(erpMode?"Không thêm được Job vào Batch.":"Add Job failed"));

     setMessage(erpMode?`Đã thêm Job · Batch hiện có ${d.totalJobs} Job.`:`Đã thêm Job · Batch hiện có ${d.totalJobs} Jobs.`);
     setTimeout(()=>location.reload(),800);
   }catch(e){
     setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`);
   }finally{
     setBusy(false);
   }
 }

 async function remove(row:any){
   if(!await confirmErp(erpMode?`Bỏ Job ${row.job_num} khỏi Batch?`:`Bỏ Job ${row.job_num} khỏi lô?`))return;

   setBusy(true);
   setMessage("");

   try{
     const r=await fetch(`/api/planning/batch/${batchId}/jobs`,{
       method:"DELETE",
       headers:{"content-type":"application/json"},
       body:JSON.stringify({batch_job_id:row.batch_job_id})
     });
     const d=await safeJson(r);

     if(!r.ok)throw new Error(d.error||(erpMode?"Không bỏ được Job khỏi Batch.":"Remove Job failed"));

     setMessage(erpMode?`Đã bỏ Job ${row.job_num} khỏi Batch.`:`Đã bỏ Job ${row.job_num} khỏi lô.`);
     setTimeout(()=>location.reload(),800);
   }catch(e){
     setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`);
   }finally{
     setBusy(false);
   }
 }

 const erpColumnLabels:Record<string,string>={
   job:"Job",part_rev:"Part / Rev",qty:"Qty",surface:"Diện tích",source_op:"Operation Code",
   previous_op:"Công đoạn trước",next_op:"Main Operation tiếp theo",recipe:"Recipe",
   primer1:"Primer 1",primer2:"Primer 2",primer3:"Primer 3",priority:"Ưu tiên",status:"Trạng thái",
   batch_no:"Batch",previous_status:"Trạng thái kế hoạch trước",previous_batch_no:"Batch trước",actual_progress:"Tiến độ thực tế"
 };

 const renderHeader=(key:string)=>{
   const col=allColumns.find(x=>x.key===key);
   if(!col)return null;
   return <th
    key={key}
    className={["qty","surface"].includes(key)?"num":col.group==="allopen"?"all-open-source-col":undefined}
   >{erpMode?(erpColumnLabels[key]||col.label):col.label}</th>;
 };

 const renderCell=(x:Candidate,key:string)=>{
   if(key.startsWith("source:")){
     const sourceKey=key.slice("source:".length);
     return <td key={key} className="all-open-source-col">
      {displaySourceValue(x.source_data?.[sourceKey])}
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
         ? <><b>{x.recipe_no}</b><small className="planning-sub">{x.recipe_name||"—"}</small></>
         : x.recipe_required
          ? <span className="job-state state-changed">{erpMode?"CHƯA CÓ RECIPE":"RECIPE REQUIRED"}</span>
          : "—"}
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
        <span className="job-state state-eligible">{planningStateLabel(x.planning_status||"ELIGIBLE")}</span>
       </td>;

     case "batch_no":
       return <td key={key}>{x.batch_no||"—"}</td>;

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

 return <div className={erpMode?"erpkit-batch-detail-manager":"section"}>

   <div className={erpMode?"erp-table-panel section erpkit-batch-detail-table":"erp-table-panel section"}>
    <div className="erp-panel-head">
     <div className="batch-add-title">
      <b>{erpMode?"Job trong Batch":"Jobs in Batch"}</b>
      <small>{erpMode?`Main Operation: ${standardOperation}`:<>Candidate View: {standardOperation}{viewLoaded?" · DEFAULT SAVED":" · GLOBAL/DEFAULT"}</>}</small>
     </div>
     <span>{jobs.length} {erpMode?"Job":"Jobs"}</span>
    </div>

    <div className="table-wrap">
     <table className="erp-table planning-candidate-table planning-batch-jobs-table">
      <thead>
       <tr>
        {columns.map(renderHeader)}
        <th className="batch-job-remove-col">{erpMode?"Thao tác":"Action"}</th>
       </tr>
      </thead>
      <tbody>
       {visibleBatchJobs.map((x:any)=>
        <tr key={x.batch_job_id} className={priorityClass(x.priority_type)}>
         {columns.map(key=>renderCell(x as Candidate,key))}
         <td className="action batch-job-remove-col">
          <button
           className="btn danger-btn small"
           disabled={busy}
           onClick={()=>remove(x)}
          >
           {erpMode?"Bỏ Job":"Remove"}
          </button>
         </td>
        </tr>
       )}

       {!visibleBatchJobs.length&&
        <tr>
         <td colSpan={columns.length+1} className="muted">{erpMode?"Batch chưa có Job.":"Lô chưa có Job."}</td>
        </tr>}
      </tbody>
     </table>
    </div>
   </div>

   <div className={erpMode?"erp-table-panel section erpkit-batch-detail-table":"erp-table-panel section"}>
    <div className="erp-panel-head">
     <div className="batch-add-title">
      <b>{erpMode?"Thêm Job vào Batch":"Add Jobs to Batch"}</b>
      <small>{erpMode?"Chọn các Job phù hợp với Main Operation và Recipe của Batch.":<>Candidate View: {standardOperation}{viewLoaded?" · DEFAULT SAVED":" · GLOBAL/DEFAULT"}</>}</small>
     </div>
     <span>{visible.length} {erpMode?"Job khả dụng":"candidates"}</span>
    </div>



    {selectedRecipeSuggestion&&selected.length>0&&
     <div className={`recipe-suggestion-banner ${selectedRecipeSuggestion.kind==="ok"?"is-ok":selectedRecipeSuggestion.kind==="mixed"?"is-warn":"is-muted"}`}>
      {selectedRecipeSuggestion.kind==="ok"&&(
       <>
        <b>{erpMode?"Recipe đề xuất":"✓ Recipe đề xuất:"}</b>
        <span>{selectedRecipeSuggestion.label}</span>
       </>
      )}
      {selectedRecipeSuggestion.kind==="mixed"&&(
       <>
        <b>{erpMode?"Recipe không đồng nhất":"⚠ Các Job chọn có Recipe khác nhau:"}</b>
        <span>{selectedRecipeSuggestion.keys.join(" · ")} — {erpMode?"nên chọn Job cùng Recipe để gom Batch.":"nên chọn Job cùng Recipe để gom lô."}</span>
       </>
      )}
      {selectedRecipeSuggestion.kind==="none"&&(
       <>
        <b>{erpMode?"Chưa có Recipe":"✕ Job chưa có Recipe theo cấu hình:"}</b>
        <span>{erpMode?<>Mở <a href="/recipe-operation-map">Công thức & Rule</a> để bổ sung cấu hình.</>:<>Cấu hình <a href="/recipe-operation-map">Công thức & Rule</a>.</>}</span>
       </>
      )}
     </div>}

    <div className="batch-add-filter batch-add-filter-same-view">
     <label>
      {erpMode?"Tìm Job / Part":"Search Job / Part"}
      <input
       className="input"
       value={q}
       onChange={e=>setQ(e.target.value)}
       placeholder={erpMode?"Job / Part / Operation Code...":"Job / Part / Source Op..."}
      />
     </label>

     <div className="batch-add-view-info">
      <span>{columns.length} {erpMode?"cột":"columns"}</span>
      <span>{sortRules.length} {erpMode?"mức sắp xếp":"sort levels"}</span>
     </div>

     <button className="btn primary" disabled={busy||!selected.length} onClick={add}>
      {erpMode?`Thêm ${selected.length} Job`:`Add Selected (${selected.length})`}
     </button>
    </div>

    <div className="table-wrap">
     <table className="erp-table planning-candidate-table">
      <thead>
       <tr>
        <th>
         <input
          type="checkbox"
          checked={
           visible.length>0 &&
           visible.every(x=>selected.includes(x.id))
          }
          onChange={toggleAll}
         />
        </th>
        {columns.map(renderHeader)}
       </tr>
      </thead>

      <tbody>
       {visible.map(x=>
        <tr
         key={x.id}
         className={`${selected.includes(x.id)?"planning-row-selected ":""}${priorityClass(x.priority_type)}`.trim()}
        >
         <td>
          <input
           type="checkbox"
           checked={selected.includes(x.id)}
           onChange={()=>toggle(x.id)}
          />
         </td>
         {columns.map(key=>renderCell(x,key))}
        </tr>
       )}

       {!visible.length&&
        <tr>
         <td colSpan={1+columns.length} className="muted">
          {erpMode?`Không có Job phù hợp với Main Operation ${standardOperation}.`:`Không có Job phù hợp với Candidate View của ${standardOperation}.`}
         </td>
        </tr>}
      </tbody>
     </table>
    </div>
   </div>
 </div>
}
