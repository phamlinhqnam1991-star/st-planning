"use client";

import {useMemo,useState} from "react";

const formatNumber=(value:unknown, maxDecimals=2)=>{
 const n=Number(value??0);
 if(!Number.isFinite(n))return "0";
 const fixed=n.toFixed(maxDecimals);
 let [whole,decimal]=fixed.split(".");
 whole=whole.replace(/\B(?=(\d{3})+(?!\d))/g,".");
 decimal=(decimal||"").replace(/0+$/,"");
 return decimal?`${whole},${decimal}`:whole;
};

type JobRow={
 batch_job_id:number;
 planning_job_operation_id:number;
 job_num:string;
 part_num:string|null;
 revision_num:string|null;
 qty:number|null;
 surface_dm2:number|null;
 source_operation_code:string;
 standard_operation:string;
 next_standard_operation:string|null;
 priority_type:string|null;
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
 next_standard_operation:string|null;
 recipe_no:string|null;
 recipe_name:string|null;
 priority_type:string|null;

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

export function BatchDetailManager({
 batchId,
 jobs,
 candidates,
 initialNextFilter
}:{
 batchId:number;
 jobs:JobRow[];
 candidates:Candidate[];
 initialNextFilter:string;
}){
 const [busy,setBusy]=useState(false);
 const [selected,setSelected]=useState<number[]>([]);
 const [nextFilter,setNextFilter]=useState(initialNextFilter||"");
 const [q,setQ]=useState("");
 const [message,setMessage]=useState("");

 // Full original All Open Job row is preserved in source_data JSONB.
 // Build columns dynamically so new source columns appear without code changes.
 const sourceColumns=useMemo(()=>{
   const out:string[]=[];
   const seen=new Set<string>();
   for(const row of candidates){
     const data=row.source_data||{};
     for(const key of Object.keys(data)){
       if(!seen.has(key)){
         seen.add(key);
         out.push(key);
       }
     }
   }
   return out;
 },[candidates]);

 const displaySourceValue=(v:unknown)=>{
   if(v===null||v===undefined||v==="")return "—";
   if(typeof v==="object"){
     try{return JSON.stringify(v)}catch{return String(v)}
   }
   return String(v);
 };

 const nextOptions=useMemo(
   ()=>[...new Set(candidates.map(x=>x.next_standard_operation||"END"))].sort(),
   [candidates]
 );

 const visible=useMemo(()=>{
   const key=q.trim().toUpperCase();
   return candidates.filter(x=>{
     if(nextFilter){
       const next=x.next_standard_operation||"END";
       if(next!==nextFilter)return false;
     }
     if(!key)return true;
     return x.job_num.toUpperCase().includes(key)
       || (x.part_num||"").toUpperCase().includes(key)
       || (x.source_operation_code||"").toUpperCase().includes(key)
       || Object.entries(x.source_data||{}).some(([k,v])=>
            k.toUpperCase().includes(key) ||
            String(v??"").toUpperCase().includes(key)
          );
   });
 },[candidates,nextFilter,q]);

 function toggle(id:number){
   setSelected(x=>x.includes(id)?x.filter(y=>y!==id):[...x,id]);
 }

 function toggleAll(){
   const ids=visible.map(x=>x.id);
   const all=ids.length>0&&ids.every(id=>selected.includes(id));
   if(all)setSelected(x=>x.filter(id=>!ids.includes(id)));
   else setSelected(x=>[...new Set([...x,...ids])]);
 }

 async function add(){
   if(!selected.length)return alert("Chọn ít nhất 1 Job để thêm.");
   setBusy(true);setMessage("");
   try{
     const r=await fetch(`/api/planning/batch/${batchId}/jobs`,{
       method:"POST",
       headers:{"content-type":"application/json"},
       body:JSON.stringify({planning_job_operation_ids:selected})
     });
     const d=await r.json();
     if(!r.ok)throw new Error(d.error||"Add Job failed");
     setMessage(`Đã thêm Job · Batch hiện có ${d.totalJobs} Jobs.`);
     setTimeout(()=>location.reload(),800);
   }catch(e){
     setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`);
   }finally{setBusy(false)}
 }

 async function remove(row:JobRow){
   if(!confirm(`Bỏ Job ${row.job_num} khỏi lô?`))return;
   setBusy(true);setMessage("");
   try{
     const r=await fetch(`/api/planning/batch/${batchId}/jobs`,{
       method:"DELETE",
       headers:{"content-type":"application/json"},
       body:JSON.stringify({batch_job_id:row.batch_job_id})
     });
     const d=await r.json();
     if(!r.ok)throw new Error(d.error||"Remove Job failed");
     setMessage(`Đã bỏ Job ${row.job_num} khỏi lô.`);
     setTimeout(()=>location.reload(),800);
   }catch(e){
     setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`);
   }finally{setBusy(false)}
 }

 return <div className="section">
   {message&&<div className={`planning-message ${message.startsWith("Lỗi")?"danger":""}`}>{message}</div>}

   <div className="erp-table-panel section">
    <div className="erp-panel-head">
     <b>Jobs in Batch</b>
     <span>{jobs.length} Jobs</span>
    </div>
    <div className="table-wrap">
     <table className="erp-table planning-batch-jobs-table">
      <thead>
       <tr>
        <th>Job</th><th>Part / Rev</th><th className="num">Qty</th>
        <th className="num">Surface</th><th>Source Op</th>
        <th>Next Main Plan Op</th><th>Priority</th><th></th>
       </tr>
      </thead>
      <tbody>
       {jobs.map(x=><tr key={x.batch_job_id}>
        <td><b>{x.job_num}</b></td>
        <td>{x.part_num||"—"}<small className="planning-sub">Rev {x.revision_num||"—"}</small></td>
        <td className="num mono">{formatNumber(x.qty)}</td>
        <td className="num mono">{formatNumber(x.surface_dm2)}</td>
        <td>{x.source_operation_code}</td>
        <td><b>{x.next_standard_operation||"END"}</b></td>
        <td>{x.priority_type||"—"}</td>
        <td className="action">
         <button className="btn danger-btn small" disabled={busy} onClick={()=>remove(x)}>Remove</button>
        </td>
       </tr>)}
       {!jobs.length&&<tr><td colSpan={8} className="muted">Lô chưa có Job.</td></tr>}
      </tbody>
     </table>
    </div>
   </div>

   <div className="erp-table-panel section">
    <div className="erp-panel-head">
     <b>Add Jobs to Batch</b>
     <span>{visible.length} candidates</span>
    </div>

    <div className="batch-add-filter">
     <label>
      Next Main Plan Operation
      <select className="input" value={nextFilter} onChange={e=>setNextFilter(e.target.value)}>
       <option value="">All next operations</option>
       {nextOptions.map(x=><option key={x} value={x}>{x}</option>)}
      </select>
     </label>
     <label>
      Search Job / Part
      <input className="input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Job / Part / Source Op..."/>
     </label>
     <button className="btn primary" disabled={busy||!selected.length} onClick={add}>
      Add Selected ({selected.length})
     </button>
    </div>

    <div className="table-wrap">
     <table className="erp-table planning-candidate-table">
      <thead>
       <tr>
        <th className="planning-sticky-select"><input type="checkbox" onChange={toggleAll}/></th>
        <th className="planning-sticky-job">Job</th>
        <th>Part / Rev</th>
        <th className="num">Qty</th>
        <th className="num">Surface</th>
        <th>Source Op</th>
        <th>Next Main Plan Op</th>
        <th>Recipe</th>
        <th>Priority</th>
        {sourceColumns.map(col=><th key={col} className="all-open-source-col">{col}</th>)}
       </tr>
      </thead>
      <tbody>
       {visible.map(x=><tr key={x.id} className={selected.includes(x.id)?"planning-row-selected":""}>
        <td className="planning-sticky-select"><input type="checkbox" checked={selected.includes(x.id)} onChange={()=>toggle(x.id)}/></td>
        <td className="planning-sticky-job"><b>{x.job_num}</b></td>
        <td>{x.part_num||"—"}<small className="planning-sub">Rev {x.revision_num||"—"}</small></td>
        <td className="num mono">{formatNumber(x.plan_qty)}</td>
        <td className="num mono">{formatNumber(x.plan_surface)}</td>
        <td>{x.source_operation_code}</td>
        <td><b>{x.next_standard_operation||"END"}</b></td>
        <td>{x.recipe_no?<><b>{x.recipe_no}</b><small className="planning-sub">{x.recipe_name||"—"}</small></>:"—"}</td>
        <td>{x.priority_type||"—"}</td>
        {sourceColumns.map(col=><td key={col} className="all-open-source-col">{displaySourceValue((x.source_data||{})[col])}</td>)}
       </tr>)}
       {!visible.length&&<tr><td colSpan={9+sourceColumns.length} className="muted">Không có Job phù hợp.</td></tr>}
      </tbody>
     </table>
    </div>
   </div>
 </div>
}
