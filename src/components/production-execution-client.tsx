"use client";

import {useMemo,useState} from "react";
import {useUiLanguage} from "@/components/i18n/ui-language-provider";
import {safeJson} from "@/lib/fetch-json";
import {pushAppToast} from "@/components/app-toast-provider";
import type {ProductionExecutionStatus,ProductionWorkItem,ProductionJobDetail} from "@/lib/production-execution";

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
 const shiftFor=(v:string|null)=>{
  if(!v)return {label:"—",title:""};
  const d=new Date(v);if(Number.isNaN(d.getTime()))return {label:"—",title:""};
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(d);
  const hh=Number(parts.find(x=>x.type==="hour")?.value||0);
  const mm=Number(parts.find(x=>x.type==="minute")?.value||0);
  const minutes=hh*60+mm;
  if(minutes>=360&&minutes<840)return {label:text("Shift 1","Ca 1"),title:"06:00–14:00"};
  if(minutes>=840&&minutes<1320)return {label:text("Shift 2","Ca 2"),title:"14:00–22:00"};
  return {label:text("Shift 3","Ca 3"),title:"22:00–05:59"};
 };
 const statusLabel=(s:ProductionExecutionStatus)=>s==="WAITING"?text("Waiting","Chờ thực hiện"):s==="ON-GOING"?text("On-going","Đang thực hiện"):text("Done","Hoàn thành");
 const sourceLabel=(s:ProductionWorkItem["sourceType"])=>s==="BATCH"?text("Production","Sản xuất"):s==="MASKING"?"Masking":"Unmasking";

 const areas=useMemo(()=>[...new Set(items.map(x=>x.area).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[items]);
 const filtered=useMemo(()=>{
  const q=search.trim().toLowerCase();
  return items.filter(x=>{
   if(status!=="ALL"&&!x.jobDetails.some(d=>d.status===status))return false;
   if(area!=="ALL"&&x.area!==area)return false;
   if(!q)return true;
   return [
    x.batchNo,x.operation,x.linkedMainOperation,x.resource,x.area,x.recipeNo,x.recipeName,
    ...x.jobNumbers,...x.supportOperations,
    ...x.jobDetails.flatMap(d=>[d.jobNum,d.partDescription,d.lastLaborOp,d.nextOperation,d.priority,statusLabel(d.status)])
   ].join(" ").toLowerCase().includes(q);
  });
 },[items,search,status,area]);

 const counts=useMemo(()=>{
  const jobs=items.flatMap(x=>x.jobDetails);
  return {
   waiting:jobs.filter(x=>x.status==="WAITING").length,
   ongoing:jobs.filter(x=>x.status==="ON-GOING").length,
   done:jobs.filter(x=>x.status==="DONE").length,
   jobs:jobs.length,
   qty:items.reduce((n,x)=>n+x.qty,0),
   surface:items.reduce((n,x)=>n+x.surface,0),
  };
 },[items]);

 async function setJobExecution(item:ProductionWorkItem,detail:ProductionJobDetail,next:ProductionExecutionStatus){
  const k=`${item.sourceType}|${item.sourceKey}|${detail.planningJobOperationId}`;setBusy(k);
  try{
   const r=await fetch("/api/production-execution",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({
    sourceType:item.sourceType,sourceKey:item.sourceKey,batchId:item.batchId,scheduleId:item.scheduleId,
    planningJobOperationId:detail.planningJobOperationId,jobNum:detail.jobNum,status:next,expectedJobs:item.jobDetails.length
   })});
   const d=await safeJson(r);if(!r.ok)throw new Error(d?.error||text("Unable to update Job production status.","Không cập nhật được trạng thái sản xuất của Job."));
   const jobEx=d.jobExecution;const summary=d.execution;
   setItems(prev=>prev.map(x=>x.sourceType===item.sourceType&&x.sourceKey===item.sourceKey?{
    ...x,
    status:summary.execution_status,
    actualStart:summary.actual_start||null,
    actualEnd:summary.actual_end||null,
    remark:summary.remark||"",
    jobDetails:x.jobDetails.map(j=>j.planningJobOperationId===detail.planningJobOperationId?{
     ...j,status:jobEx.execution_status,actualStart:jobEx.actual_start||null,actualEnd:jobEx.actual_end||null,remark:jobEx.remark||""
    }:j)
   }:x));
  }catch(e){pushAppToast(e instanceof Error?e.message:String(e));}
  finally{setBusy("");}
 }

 function DetailTable({item}:{item:ProductionWorkItem}){
  const rows=item.jobDetails;
  if(!rows.length)return null;
  const shift=shiftFor(item.targetTime);
  return <div className="production-job-detail-wrap"><table className="production-job-detail-table">
   <thead><tr>
    <th>{text("Job","Job")}</th>
    <th>{text("Part Description","Mô tả Part")}</th>
    <th>{text("Current Good WIP Qty","SL WIP tốt hiện tại")}</th>
    <th>{text("Total Surface","Tổng diện tích")}</th>
    <th>{text("Last Labor Op","Công đoạn trước")}</th>
    <th>{text("Next Operation","Công đoạn kế tiếp")}</th>
    <th>{text("Priority","Ưu tiên")}</th>
    <th>{text("Shift","Ca")}</th>
    <th>{text("Target","Mốc kế hoạch")}</th>
    <th>{text("Actual Start","Bắt đầu thực tế")}</th>
    <th>{text("Actual End","Kết thúc thực tế")}</th>
    <th>{text("Report","Báo cáo")}</th>
   </tr></thead>
   <tbody>{rows.map((detail,index)=>{
    const k=`${item.sourceType}|${item.sourceKey}|${detail.planningJobOperationId}`;const isBusy=busy===k;
    return <tr key={`${detail.planningJobOperationId}-${detail.jobNum}-${index}`} className={`production-job-row production-job-row-${statusClass(detail.status)}`}>
     <td className="mono"><b>{detail.jobNum||"—"}</b></td>
     <td>{detail.partDescription||"—"}</td>
     <td className="num">{detail.currentGoodWipQty==null?"—":fmt(detail.currentGoodWipQty,0)}</td>
     <td className="num">{detail.totalSurface==null?"—":fmt(detail.totalSurface)}</td>
     <td>{detail.lastLaborOp||"—"}</td>
     <td>{detail.nextOperation||"—"}</td>
     <td>{detail.priority||"—"}</td>
     <td><span className="production-shift" title={shift.title}>{shift.label}</span></td>
     <td className="mono"><b>{tm(item.targetTime)}</b>{item.sourceType==="BATCH"&&item.plannedEnd?<small className="planning-sub">→ {tm(item.plannedEnd)}</small>:null}</td>
     <td className="mono">{dt(detail.actualStart)}</td>
     <td className="mono">{dt(detail.actualEnd)}</td>
     <td className="production-report-cell"><select className={`input production-status-select ${statusClass(detail.status)}`} disabled={isBusy} value={detail.status} onChange={e=>setJobExecution(item,detail,e.target.value as ProductionExecutionStatus)} aria-label={text(`Production status for Job ${detail.jobNum}`,`Trạng thái sản xuất Job ${detail.jobNum}`)}>
      {statusOrder.map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}
     </select>{isBusy?<small>{text("Saving...","Đang lưu...")}</small>:null}</td>
    </tr>;
   })}</tbody>
  </table></div>;
 }

 function WorkTable({rows}:{rows:ProductionWorkItem[]}){
  if(!rows.length)return <div className="production-empty"><b>{text("No production work matches the current filter.","Không có công việc sản xuất phù hợp bộ lọc hiện tại.")}</b></div>;
  return <div className="table-wrap production-table-wrap"><table className="erp-table production-table">
   <thead><tr>
    <th>{text("Type","Loại việc")}</th><th>{text("Area","Khu vực")}</th><th>{text("Resource","Resource")}</th><th>{text("Operation","Công đoạn")}</th><th>Batch No.</th><th>Recipe</th><th>{text("Jobs","Số Job")}</th><th>Qty</th><th>dm²</th><th>{text("Target","Mốc kế hoạch")}</th><th>{text("Actual Start","Bắt đầu thực tế")}</th><th>{text("Actual End","Kết thúc thực tế")}</th>
   </tr></thead>
   <tbody>{rows.flatMap(item=>{
    const k=`${item.sourceType}|${item.sourceKey}`;
    const recipe=[item.recipeNo,item.recipeName].filter(Boolean).join(" · ")||item.recipeKey||"—";
    const mainRow=<tr key={k} className={`production-row production-row-${statusClass(item.status)}`}>
     <td><span className={`production-source source-${item.sourceType.toLowerCase()}`}>{sourceLabel(item.sourceType)}</span>{item.sourceType!=="BATCH"?<small className="planning-sub">{item.linkedMainOperation}</small>:null}</td>
     <td>{item.area||"—"}</td><td className="mono">{item.resource||"—"}</td>
     <td><b>{item.operation||"—"}</b>{item.supportOperations.length?<small className="planning-sub" title={item.supportOperations.join(" / ")}>{item.supportOperations.join(" / ")}</small>:null}</td>
     <td><b className="mono">{item.batchNo||`#${item.batchId}`}</b></td>
     <td><span title={recipe}>{recipe}</span></td>
     <td className="num"><b>{item.jobs}</b></td>
     <td className="num">{fmt(item.qty,0)}</td><td className="num">{fmt(item.surface)}</td>
     <td><b className="mono">{tm(item.targetTime)}</b>{item.sourceType==="BATCH"&&item.plannedEnd?<small className="planning-sub">→ {tm(item.plannedEnd)}</small>:null}</td>
     <td className="mono">{dt(item.actualStart)}</td><td className="mono">{dt(item.actualEnd)}</td>
    </tr>;
    if(!item.jobDetails.length)return [mainRow];
    const detailRow=<tr key={`${k}__detail`} className="production-detail-row"><td colSpan={12}><DetailTable item={item}/></td></tr>;
    return [mainRow,detailRow];
   })}</tbody>
  </table></div>;
 }

 const grouped=useMemo(()=>{
  const sourceAreas=area==="ALL"?areas:[area];
  return sourceAreas.map(name=>({name,rows:filtered.filter(item=>item.area===name)}));
 },[area,areas,filtered]);

 return <div className="production-execution-workspace">
  <div className="production-kpis">
   <button type="button" className={`production-kpi waiting ${status==="WAITING"?"active":""}`} onClick={()=>setStatus(status==="WAITING"?"ALL":"WAITING")}><span>{text("Waiting Jobs","Job chờ thực hiện")}</span><b>{counts.waiting}</b></button>
   <button type="button" className={`production-kpi ongoing ${status==="ON-GOING"?"active":""}`} onClick={()=>setStatus(status==="ON-GOING"?"ALL":"ON-GOING")}><span>{text("On-going Jobs","Job đang thực hiện")}</span><b>{counts.ongoing}</b></button>
   <button type="button" className={`production-kpi done ${status==="DONE"?"active":""}`} onClick={()=>setStatus(status==="DONE"?"ALL":"DONE")}><span>{text("Done Jobs","Job hoàn thành")}</span><b>{counts.done}</b></button>
   <div className="production-kpi neutral"><span>{text("Jobs","Job")}</span><b>{counts.jobs}</b></div>
   <div className="production-kpi neutral"><span>Qty</span><b>{fmt(counts.qty,0)}</b></div>
   <div className="production-kpi neutral"><span>dm²</span><b>{fmt(counts.surface,0)}</b></div>
  </div>

  <div className="production-command-bar">
   <div className="production-filter-group">
    <input className="input production-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={text("Search Batch / Operation / Recipe / Job...","Tìm Batch / Công đoạn / Recipe / Job...")}/>
    <select className="input" value={area} onChange={e=>setArea(e.target.value)}><option value="ALL">{text("All Areas","Tất cả khu vực")}</option>{areas.map(x=><option key={x} value={x}>{x}</option>)}</select>
    <select className="input" value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="ALL">{text("All Job Statuses","Tất cả trạng thái Job")}</option>{statusOrder.map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}</select>
   </div>
  </div>

  <div className="production-result-meta"><b>{filtered.length}</b> {text("work items","công việc")}<span>·</span><span>{text("Each Job is reported independently; the Batch row is only a summary.","Mỗi Job báo cáo trạng thái độc lập; dòng Batch chỉ là tổng hợp.")}</span><span>·</span><span>{text("Production day: 06:00 → 05:59 next day.","Ngày sản xuất: 06:00 → 05:59 ngày hôm sau.")}</span></div>

  <div className="production-area-stack">{grouped.map(group=><section className="erp-table-panel production-area-panel" key={group.name}>
   <div className="erp-panel-head"><div><b>{group.name||"—"}</b><small>{group.rows.length} {text("work items","công việc")}</small></div></div>
   <WorkTable rows={group.rows}/>
  </section>)}</div>
 </div>;
}
