"use client";

import {useMemo,useState} from "react";
import {useUiLanguage} from "@/components/i18n/ui-language-provider";
import {safeJson} from "@/lib/fetch-json";
import {pushAppToast} from "@/components/app-toast-provider";
import type {ProductionExecutionStatus,ProductionWorkItem} from "@/lib/production-execution";

const statusOrder:ProductionExecutionStatus[]=["WAITING","ON-GOING","DONE"];
const statusClass=(status:ProductionExecutionStatus)=>status==="DONE"?"done":status==="ON-GOING"?"ongoing":"waiting";

export function ProductionExecutionClient({initialItems}:{initialItems:ProductionWorkItem[]}){
 const {locale,text}=useUiLanguage();
 const [items,setItems]=useState(initialItems);
 const [search,setSearch]=useState("");
 const [status,setStatus]=useState<"ALL"|ProductionExecutionStatus>("ALL");
 const [area,setArea]=useState("ALL");
 const [busy,setBusy]=useState("");

 const fmt=(v:number,max=2)=>new Intl.NumberFormat(locale==="vi"?"vi-VN":"en-US",{maximumFractionDigits:max}).format(Number(v||0));
 const dt=(v:string|null)=>{
  if(!v)return "—";
  const d=new Date(v);if(Number.isNaN(d.getTime()))return "—";
  return new Intl.DateTimeFormat(locale==="vi"?"vi-VN":"en-GB",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(d);
 };
 const tm=(v:string|null)=>{
  if(!v)return "—";
  const d=new Date(v);if(Number.isNaN(d.getTime()))return "—";
  return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hour12:false}).format(d);
 };
 const statusLabel=(s:ProductionExecutionStatus)=>s==="WAITING"?text("Waiting","Chờ thực hiện"):s==="ON-GOING"?text("On-going","Đang thực hiện"):text("Done","Hoàn thành");
 const sourceLabel=(s:ProductionWorkItem["sourceType"])=>s==="BATCH"?text("Production","Sản xuất"):s==="MASKING"?"Masking":"Unmasking";

 const areas=useMemo(()=>[...new Set(items.map(x=>x.area).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[items]);
 const filtered=useMemo(()=>{
  const q=search.trim().toLowerCase();
  return items.filter(x=>{
   if(status!=="ALL"&&x.status!==status)return false;
   if(area!=="ALL"&&x.area!==area)return false;
   if(!q)return true;
   return [x.batchNo,x.operation,x.linkedMainOperation,x.resource,x.area,x.recipeNo,x.recipeName,...x.jobNumbers,...x.supportOperations].join(" ").toLowerCase().includes(q);
  });
 },[items,search,status,area]);

 const counts=useMemo(()=>({
  waiting:items.filter(x=>x.status==="WAITING").length,
  ongoing:items.filter(x=>x.status==="ON-GOING").length,
  done:items.filter(x=>x.status==="DONE").length,
  jobs:items.reduce((n,x)=>n+x.jobs,0),
  qty:items.reduce((n,x)=>n+x.qty,0),
  surface:items.reduce((n,x)=>n+x.surface,0),
 }),[items]);

 async function setExecution(item:ProductionWorkItem,next:ProductionExecutionStatus){
  const k=`${item.sourceType}|${item.sourceKey}`;setBusy(k);
  try{
   const r=await fetch("/api/production-execution",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({
    sourceType:item.sourceType,sourceKey:item.sourceKey,batchId:item.batchId,scheduleId:item.scheduleId,status:next
   })});
   const d=await safeJson(r);if(!r.ok)throw new Error(d?.error||text("Unable to update production status.","Không cập nhật được trạng thái sản xuất."));
   const ex=d.execution;
   setItems(prev=>prev.map(x=>x.sourceType===item.sourceType&&x.sourceKey===item.sourceKey?{
    ...x,status:ex.execution_status,actualStart:ex.actual_start||null,actualEnd:ex.actual_end||null,remark:ex.remark||""
   }:x));
  }catch(e){pushAppToast(e instanceof Error?e.message:String(e));}
  finally{setBusy("");}
 }

 function WorkTable({rows}:{rows:ProductionWorkItem[]}){
  if(!rows.length)return <div className="production-empty"><b>{text("No production work matches the current filter.","Không có công việc sản xuất phù hợp bộ lọc hiện tại.")}</b></div>;
  return <div className="table-wrap production-table-wrap"><table className="erp-table production-table">
   <thead><tr>
    <th>{text("Status","Trạng thái")}</th><th>{text("Target","Mốc kế hoạch")}</th><th>{text("Type","Loại việc")}</th><th>{text("Area","Khu vực")}</th><th>{text("Resource","Resource")}</th><th>{text("Operation","Công đoạn")}</th><th>Batch No.</th><th>Recipe</th><th>{text("Jobs","Số Job")}</th><th>Qty</th><th>dm²</th><th>{text("Actual Start","Bắt đầu thực tế")}</th><th>{text("Actual End","Kết thúc thực tế")}</th><th>{text("Report","Báo cáo")}</th>
   </tr></thead>
   <tbody>{rows.map(item=>{
    const k=`${item.sourceType}|${item.sourceKey}`;const isBusy=busy===k;
    const recipe=[item.recipeNo,item.recipeName].filter(Boolean).join(" · ")||item.recipeKey||"—";
    return <tr key={k} className={`production-row production-row-${statusClass(item.status)}`}>
     <td><span className={`production-status ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></td>
     <td><b className="mono">{tm(item.targetTime)}</b>{item.sourceType==="BATCH"&&item.plannedEnd?<small className="planning-sub">→ {tm(item.plannedEnd)}</small>:null}</td>
     <td><span className={`production-source source-${item.sourceType.toLowerCase()}`}>{sourceLabel(item.sourceType)}</span>{item.sourceType!=="BATCH"?<small className="planning-sub">{item.linkedMainOperation}</small>:null}</td>
     <td>{item.area||"—"}</td><td className="mono">{item.resource||"—"}</td>
     <td><b>{item.operation||"—"}</b>{item.supportOperations.length?<small className="planning-sub" title={item.supportOperations.join(" / ")}>{item.supportOperations.join(" / ")}</small>:null}</td>
     <td><b className="mono">{item.batchNo||`#${item.batchId}`}</b></td>
     <td><span title={recipe}>{recipe}</span></td>
     <td className="num"><b>{item.jobs}</b>{item.jobNumbers.length?<small className="planning-sub" title={item.jobNumbers.join(" / ")}>{item.jobNumbers.slice(0,2).join(" / ")}{item.jobNumbers.length>2?` +${item.jobNumbers.length-2}`:""}</small>:null}</td>
     <td className="num">{fmt(item.qty,0)}</td><td className="num">{fmt(item.surface)}</td>
     <td className="mono">{dt(item.actualStart)}</td><td className="mono">{dt(item.actualEnd)}</td>
     <td className="production-report-cell"><select className={`input production-status-select ${statusClass(item.status)}`} disabled={isBusy} value={item.status} onChange={e=>setExecution(item,e.target.value as ProductionExecutionStatus)} aria-label={text("Production status","Trạng thái sản xuất")}>
      {statusOrder.map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}
     </select>{isBusy?<small>{text("Saving...","Đang lưu...")}</small>:null}</td>
    </tr>;
   })}</tbody>
  </table></div>;
 }

 const grouped=useMemo(()=>{
  const sourceAreas=area==="ALL"?areas:[area];
  return sourceAreas.map(name=>{
   const rows=filtered.filter(item=>item.area===name);
   const summary={
    waiting:rows.filter(x=>x.status==="WAITING").length,
    ongoing:rows.filter(x=>x.status==="ON-GOING").length,
    done:rows.filter(x=>x.status==="DONE").length,
    jobs:rows.reduce((n,x)=>n+x.jobs,0),
    qty:rows.reduce((n,x)=>n+x.qty,0),
    surface:rows.reduce((n,x)=>n+x.surface,0),
   };
   return {name,rows,summary};
  });
 },[area,areas,filtered]);

 return <div className="production-execution-workspace">
  <div className="production-kpis">
   <button type="button" className={`production-kpi waiting ${status==="WAITING"?"active":""}`} onClick={()=>setStatus(status==="WAITING"?"ALL":"WAITING")}><span>{text("Waiting","Chờ thực hiện")}</span><b>{counts.waiting}</b></button>
   <button type="button" className={`production-kpi ongoing ${status==="ON-GOING"?"active":""}`} onClick={()=>setStatus(status==="ON-GOING"?"ALL":"ON-GOING")}><span>{text("On-going","Đang thực hiện")}</span><b>{counts.ongoing}</b></button>
   <button type="button" className={`production-kpi done ${status==="DONE"?"active":""}`} onClick={()=>setStatus(status==="DONE"?"ALL":"DONE")}><span>{text("Done","Hoàn thành")}</span><b>{counts.done}</b></button>
   <div className="production-kpi neutral"><span>{text("Work Items","Công việc")}</span><b>{items.length}</b></div>
   <div className="production-kpi neutral"><span>Qty</span><b>{fmt(counts.qty,0)}</b></div>
   <div className="production-kpi neutral"><span>dm²</span><b>{fmt(counts.surface,0)}</b></div>
  </div>

  <div className="production-command-bar">
   <div className="production-filter-group">
    <input className="input production-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={text("Search Batch / Operation / Recipe / Job...","Tìm Batch / Công đoạn / Recipe / Job...")}/>
    <select className="input" value={area} onChange={e=>setArea(e.target.value)}><option value="ALL">{text("All Areas","Tất cả khu vực")}</option>{areas.map(x=><option key={x} value={x}>{x}</option>)}</select>
    <select className="input" value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="ALL">{text("All Statuses","Tất cả trạng thái")}</option>{statusOrder.map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}</select>
   </div>
  </div>

  <div className="production-result-meta"><b>{filtered.length}</b> {text("work items","công việc")}<span>·</span><span>{text("Execution status is independent from Scheduling status.","Trạng thái thực hiện độc lập với trạng thái Điều độ.")}</span><span>·</span><span>{text("Displayed separately by area.","Hiển thị tách riêng theo từng khu vực.")}</span></div>

  <div className="production-area-stack">{grouped.map(group=><section className="erp-table-panel production-area-panel" key={group.name}>
   <div className="erp-panel-head">
    <div><b>{group.name||"—"}</b><small>{group.rows.length} {text("work items","công việc")}</small></div>
    <div className="production-area-summary">
     <span><b>{group.summary.waiting}</b> {text("Waiting","Chờ thực hiện")}</span>
     <span><b>{group.summary.ongoing}</b> {text("On-going","Đang thực hiện")}</span>
     <span><b>{group.summary.done}</b> {text("Done","Hoàn thành")}</span>
     <span><b>{fmt(group.summary.qty,0)}</b> Qty</span>
     <span><b>{fmt(group.summary.surface,0)}</b> dm²</span>
    </div>
   </div>
   <WorkTable rows={group.rows}/>
  </section>)}</div>
 </div>;
}
