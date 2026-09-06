"use client";
import {useMemo,useState} from "react";
import type {ProductionChangeAlert} from "@/lib/production-change-alerts";

const dt=(v:string|null)=>v?new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(v)):"—";
const num=(v:number)=>new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(v||0);
const statusLabel=(x:ProductionChangeAlert)=>x.changeType==="REMOVE_JOB"?(x.nextMainStatus==="ATTENTION_NEW"?"Chờ Shift Accept & Remove":x.nextMainStatus==="ACKNOWLEDGED"?"Đã Remove khỏi Main sau":x.nextMainStatus==="NO_NEXT_MAIN"?"Không có downstream Batch cần Remove":"Đang theo dõi Remove"):x.nextMainStatus==="ATTENTION_NEW"?"Đang chờ Main sau":x.nextMainStatus==="WAITING_BATCH"?"Chưa có lô Main sau":x.nextMainStatus==="ACKNOWLEDGED"?"Main sau đã nhận":x.nextMainStatus==="NO_NEXT_MAIN"?"Main cuối":"Đang theo dõi";

export function ProductionChangeAlertsClient({items}:{items:ProductionChangeAlert[]}){
 const [q,setQ]=useState("");const [kind,setKind]=useState("ALL");const [status,setStatus]=useState("ALL");
 const rows=useMemo(()=>items.filter(x=>{
  const hay=[x.jobNum,x.batchNo,x.standardOperation,x.partNum,x.partDescription,x.nextStandardOperation,x.affectedBatchNo,x.resourceCode,x.affectedResourceCode].join(" ").toLowerCase();
  return (!q||hay.includes(q.toLowerCase()))&&(kind==="ALL"||x.sourceKind===kind)&&(status==="ALL"||x.nextMainStatus===status);
 }),[items,q,kind,status]);
 const direct=items.filter(x=>x.sourceKind==="DIRECT"&&x.changeType==="ADD_JOB").length;const removed=items.filter(x=>x.changeType==="REMOVE_JOB").length;const pending=items.filter(x=>x.nextMainStatus==="ATTENTION_NEW"||x.nextMainStatus==="WAITING_BATCH").length;
 return <div className="production-alert-workspace">
  <div className="production-alert-summary">
   <div><b>{items.length}</b><span>thay đổi từ Production</span></div><div><b>{direct}</b><span>Job thêm ngoài lô</span></div><div><b>{removed}</b><span>Job Remove Before Start</span></div><div><b>{pending}</b><span>cần Main sau chú ý</span></div>
  </div>
  <div className="production-alert-toolbar">
   <input className="input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Tìm Job / Batch / Part / Main / Resource..."/>
   <select className="select" value={kind} onChange={e=>setKind(e.target.value)}><option value="ALL">Tất cả nguồn</option><option value="DIRECT">Production thêm trực tiếp</option><option value="PROPAGATED">Thêm từ Main trước</option></select>
   <select className="select" value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">Tất cả trạng thái</option><option value="ATTENTION_NEW">Đang chờ Main sau</option><option value="WAITING_BATCH">Chưa có lô Main sau</option><option value="ACKNOWLEDGED">Main sau đã nhận</option><option value="NO_NEXT_MAIN">Main cuối</option></select>
  </div>
  {rows.length===0?<div className="notice">Không có thay đổi Production phù hợp bộ lọc.</div>:<div className="production-alert-list">{rows.map(x=><article key={x.id} className={`production-alert-card impact-${(x.impactLevel||"INFO").toLowerCase()}`}>
   <header><div><span className={`production-alert-kind ${x.sourceKind.toLowerCase()}`}>{x.changeType==="REMOVE_JOB"?"REMOVE BEFORE START":x.sourceKind==="DIRECT"?"PRODUCTION ADD":"FROM PREVIOUS MAIN"}</span><b>Job {x.jobNum}</b><span>{x.changeType==="REMOVE_JOB"?"bị loại khỏi":"được thêm vào"} <b>{x.batchNo}</b> · {x.standardOperation}</span></div><span className="production-alert-time">{dt(x.approvedAt||x.createdAt)}</span></header>
   <div className="production-alert-main-grid">
    <section><h4>Job được thay đổi</h4><dl><dt>Part / Rev</dt><dd>{x.partNum||"—"}{x.revisionNum?` / ${x.revisionNum}`:""}</dd><dt>Description</dt><dd>{x.partDescription||"—"}</dd><dt>Qty / Surface</dt><dd>{num(x.qty)} pcs / {num(x.surface)} dm²</dd><dt>Program / Priority</dt><dd>{x.program||"—"} / {x.priority||"—"}</dd></dl></section>
    <section><h4>Lô Production đã thay đổi</h4><dl><dt>Batch</dt><dd><b>{x.batchNo}</b></dd><dt>Main</dt><dd>{x.standardOperation}</dd><dt>Recipe</dt><dd>{[x.recipeNo,x.recipeName].filter(Boolean).join(" · ")||"—"}</dd><dt>Resource</dt><dd>{x.resourceCode||"—"}</dd><dt>Schedule</dt><dd>{dt(x.plannedStart)} → {dt(x.plannedEnd)}</dd>{x.sourceBatchQtyBefore!=null?<><dt>Batch Qty</dt><dd>{num(x.sourceBatchQtyBefore)} → <b>{num(x.sourceBatchQtyAfter||0)}</b></dd></>:null}</dl></section>
    <section><h4>Ảnh hưởng Main kế tiếp</h4><dl><dt>Next Main</dt><dd>{x.nextStandardOperation||"Không còn Main kế tiếp"}</dd><dt>Planner</dt><dd>{x.affectedPlanner?`Planner ${x.affectedPlanner}`:"—"}</dd><dt>Batch đích</dt><dd>{x.affectedBatchNo||"Chưa xác định / chưa tạo"}</dd><dt>Resource đích</dt><dd>{x.affectedResourceCode||"—"}</dd><dt>Planned Start</dt><dd>{dt(x.affectedPlannedStart)}</dd></dl></section>
   </div>
   <div className="production-alert-result"><b>{statusLabel(x)}</b><span>{x.changeType==="REMOVE_JOB"?(x.nextMainStatus==="ATTENTION_NEW"?`Job ${x.jobNum} chưa được process ở Main trước. Shift cần Accept & Remove khỏi ${x.affectedBatchNo||"lô Main sau"}.`:x.nextMainStatus==="ACKNOWLEDGED"?`Job đã được Remove khỏi lô Main sau${x.handoverAcknowledgedAt?` lúc ${dt(x.handoverAcknowledgedAt)}`:""}.`:x.nextMainStatus==="NO_NEXT_MAIN"?"Không có downstream Batch đã plan chứa Job này cần Remove; Job vẫn quay lại Main chưa process để plan lại.":"Theo dõi Remove Before Start trong chuỗi sản xuất."):(x.nextMainStatus==="ATTENTION_NEW"?`Production Main sau cần bổ sung Job ${x.jobNum} vào ${x.affectedBatchNo||"lô phù hợp"}.`:x.nextMainStatus==="WAITING_BATCH"?`Chưa tìm thấy Batch ${x.nextStandardOperation||"Main kế tiếp"}; planner cần chú ý khi tạo/điều độ lô.`:x.nextMainStatus==="ACKNOWLEDGED"?`Job đã được Production Main sau tiếp nhận${x.handoverAcknowledgedAt?` lúc ${dt(x.handoverAcknowledgedAt)}`:""}.`:x.nextMainStatus==="NO_NEXT_MAIN"?"Job được thêm tại Main cuối của route; không cần truyền tiếp.":"Theo dõi thay đổi này trong chuỗi sản xuất.")}</span></div>
   <details><summary>Chi tiết audit / lý do</summary><div className="production-alert-audit"><p><b>Reason:</b> {x.reason||"—"}</p><p><b>Validation:</b> {x.validationMessage||"—"}</p><p><b>Impact:</b> {x.impactLevel||"INFO"} · Handover {x.handoverStatus||"—"}</p>{x.handoverNote?<pre>{x.handoverNote}</pre>:null}</div></details>
  </article>)}</div>}
 </div>;
}
