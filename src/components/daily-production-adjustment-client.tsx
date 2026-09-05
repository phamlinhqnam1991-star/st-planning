"use client";

import {useMemo,useState} from "react";
import {safeJson} from "@/lib/fetch-json";
import {pushAppToast} from "@/components/app-toast-provider";

const dt=(v:any)=>{if(!v)return "—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleString("en-GB",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});};
const localInput=(v:any)=>{if(!v)return "";const d=new Date(v);if(Number.isNaN(d.getTime()))return "";const parts=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(d).replace(" ","T");return parts;};
const toIso=(v:string)=>v?new Date(`${v}:00+07:00`).toISOString():"";

type Props={productionDate:string;initialData:any};

export function DailyProductionAdjustmentClient({productionDate,initialData}:Props){
 const [data,setData]=useState(initialData||{set:null,items:[]});
 const [busy,setBusy]=useState<string>("");
 const [draftTimes,setDraftTimes]=useState<Record<number,{start:string;end:string}>>({});
 const [extraBatch,setExtraBatch]=useState("");
 const [extraJob,setExtraJob]=useState("");
 const [extraStart,setExtraStart]=useState("");
 const [extraEnd,setExtraEnd]=useState("");
 const items=data?.items||[];
 const counts=useMemo(()=>({
  carry:items.filter((x:any)=>x.item_type==="CARRY_OVER"&&x.status==="PENDING").length,
  remove:items.filter((x:any)=>x.item_type==="REMOVE_JOB"&&x.status==="PENDING").length,
  add:items.filter((x:any)=>x.item_type==="ADD_JOB"&&x.status==="PENDING").length,
  approved:items.filter((x:any)=>x.status==="APPROVED").length
 }),[items]);
 async function reload(){
  const r=await fetch(`/api/daily-production-adjustment?date=${productionDate}`,{cache:"no-store"});const d=await safeJson(r);if(r.ok)setData(d);
 }
 async function post(payload:any,key:string){
  setBusy(key);try{const r=await fetch("/api/daily-production-adjustment",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({production_date:productionDate,...payload})});const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Không cập nhật được.");await reload();return d;}catch(e){pushAppToast(e instanceof Error?e.message:String(e));return null;}finally{setBusy("");}
 }
 async function scan(){await post({action:"SCAN"},"SCAN");}
 async function preview(x:any){
  const draft=draftTimes[x.id]||{start:localInput(x.proposed_start),end:localInput(x.proposed_end)};
  const d=await post({action:"PREVIEW",item_id:x.id,proposed_start:toIso(draft.start),proposed_end:toIso(draft.end)},`P${x.id}`);
  if(d?.impacts)pushAppToast(`Đã tính ${d.impacts.length} lịch bị ảnh hưởng.`);
 }
 async function approve(x:any,force=false){if(!confirm(`Duyệt ${x.item_type} cho ${x.batch_no}${x.job_num?` / ${x.job_num}`:""}?`))return;await post({action:"APPROVE",item_id:x.id,approved_by:"Planner",force_exception:force},`A${x.id}`);}
 async function reject(x:any){if(!confirm("Từ chối đề xuất này?"))return;await post({action:"REJECT",item_id:x.id,approved_by:"Planner"},`R${x.id}`);}
 async function reportExtra(){
  if(!extraBatch.trim()||!extraJob.trim())return pushAppToast("Nhập Batch No. và Job Number.");
  const d=await post({action:"REPORT_EXTRA_JOB",batch_no:extraBatch.trim(),job_num:extraJob.trim(),actual_start:extraStart?toIso(extraStart):null,actual_end:extraEnd?toIso(extraEnd):null},"EXTRA");
  if(d){setExtraJob("");pushAppToast("Đã tạo đề xuất Add Job vào Batch.");}
 }
 function impactList(x:any){const impacts=x?.proposal_json?.impacts;return Array.isArray(impacts)?impacts:[];}
 return <div className="daily-adjustment-workspace">
  <div className="production-kpis">
   <div className="production-kpi ongoing"><span>Carry Over</span><b>{counts.carry}</b></div>
   <div className="production-kpi waiting"><span>Bớt Job</span><b>{counts.remove}</b></div>
   <div className="production-kpi neutral"><span>Thêm Job</span><b>{counts.add}</b></div>
   <div className="production-kpi done"><span>Đã duyệt</span><b>{counts.approved}</b></div>
  </div>

  <div className="erp-table-panel section">
   <div className="erp-panel-head"><div><b>Đối soát đầu ngày · Production → Planning/Scheduling</b><small>Production day 06:00 → 05:59. Hệ thống chỉ tạo đề xuất; lịch/Batch chỉ đổi sau khi planner duyệt.</small></div><button type="button" className="btn primary" disabled={busy==="SCAN"} onClick={scan}>{busy==="SCAN"?"Đang quét...":"Quét báo cáo trước 05:59"}</button></div>
   <div className="notice">Carry Over sẽ kiểm tra đồng thời <b>Cross-Main Dependency</b> và <b>Resource Conflict</b>. Main của planner khác vẫn được tính trong cùng change-set để tránh Start của Main sau nhỏ hơn End Main trước.</div>
  </div>

  <div className="erp-table-panel section">
   <div className="erp-panel-head"><div><b>Báo Job hoàn thành ngoài Batch</b><small>Production chỉ nhập Batch No. + Job Number; hệ thống tự lookup Part/Rev/Main/Recipe và tạo đề xuất để planner duyệt thêm vào lô.</small></div></div>
   <div className="batch-add-filter" style={{alignItems:"end"}}>
    <label>Batch No.<input className="input" value={extraBatch} onChange={e=>setExtraBatch(e.target.value)} placeholder="ASP_00001"/></label>
    <label>Job Number<input className="input" value={extraJob} onChange={e=>setExtraJob(e.target.value)} placeholder="J240123"/></label>
    <label>Actual Start<input className="input" type="datetime-local" value={extraStart} onChange={e=>setExtraStart(e.target.value)}/></label>
    <label>Actual End<input className="input" type="datetime-local" value={extraEnd} onChange={e=>setExtraEnd(e.target.value)}/></label>
    <button type="button" className="btn primary" disabled={busy==="EXTRA"} onClick={reportExtra}>{busy==="EXTRA"?"Đang lưu...":"Tạo đề xuất Add Job"}</button>
   </div>
  </div>

  <div className="erp-table-panel section">
   <div className="erp-panel-head"><div><b>Đề xuất chờ duyệt</b><small>{items.filter((x:any)=>x.status==="PENDING").length} mục đang chờ.</small></div></div>
   <div className="table-wrap"><table className="erp-table"><thead><tr><th>Loại</th><th>Batch / Job</th><th>Main / Planner</th><th>Production / Validation</th><th>Thời gian</th><th>Ảnh hưởng</th><th>Thao tác</th></tr></thead>
    <tbody>{items.map((x:any)=>{
     const draft=draftTimes[x.id]||{start:localInput(x.proposed_start),end:localInput(x.proposed_end)};const impacts=impactList(x);const isPending=x.status==="PENDING";
     return <tr key={x.id}>
      <td><b>{x.item_type}</b><small className="planning-sub">{x.status}</small></td>
      <td><b className="mono">{x.batch_no}</b>{x.job_num?<small className="planning-sub">Job {x.job_num} · {x.part_num||"—"} Rev {x.revision_num||"—"}</small>:null}</td>
      <td><b>{x.standard_operation}</b><small className="planning-sub">Planner {x.source_planner||"—"} · {x.resource_code||"—"}</small></td>
      <td>{x.reason||"—"}<small className="planning-sub">{x.validation_status}: {x.validation_message||"—"}</small></td>
      <td>{x.item_type==="CARRY_OVER"?<div style={{display:"grid",gap:6,minWidth:220}}><small>Old: {dt(x.old_start)} → {dt(x.old_end)}</small><input className="input" type="datetime-local" value={draft.start} disabled={!isPending} onChange={e=>setDraftTimes(v=>({...v,[x.id]:{...draft,start:e.target.value}}))}/><input className="input" type="datetime-local" value={draft.end} disabled={!isPending} onChange={e=>setDraftTimes(v=>({...v,[x.id]:{...draft,end:e.target.value}}))}/></div>:"—"}</td>
      <td>{impacts.length?<div style={{display:"grid",gap:3}}>{impacts.slice(0,8).map((i:any)=><small key={i.scheduleId}><b>{i.reason}</b> · {i.batchNo} / {i.standardOperation} · P{i.planner||"—"}<br/>{dt(i.oldStart)} → <b>{dt(i.newStart)}</b> · End {dt(i.newEnd)}</small>)}{impacts.length>8?<small>+{impacts.length-8} mục khác</small>:null}</div>:x.item_type==="CARRY_OVER"?<small>Nhấn Preview để tính dependency/resource cascade.</small>:"—"}</td>
      <td><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{isPending&&x.item_type==="CARRY_OVER"?<button type="button" className="btn" disabled={busy===`P${x.id}`} onClick={()=>preview(x)}>Preview</button>:null}{isPending?<button type="button" className="btn primary" disabled={busy===`A${x.id}`||(x.item_type==="CARRY_OVER"&&!impacts.length)} onClick={()=>approve(x,false)}>Duyệt</button>:null}{isPending&&x.validation_status==="BLOCKED"&&x.item_type==="ADD_JOB"?<button type="button" className="btn" disabled={busy===`A${x.id}`} onClick={()=>approve(x,true)}>Duyệt ngoại lệ</button>:null}{isPending?<button type="button" className="btn" disabled={busy===`R${x.id}`} onClick={()=>reject(x)}>Từ chối</button>:null}</div></td>
     </tr>;
    })}{!items.length?<tr><td colSpan={7} className="muted">Chưa có đề xuất. Nhấn “Quét báo cáo trước 05:59”.</td></tr>:null}</tbody>
   </table></div>
  </div>
 </div>;
}
