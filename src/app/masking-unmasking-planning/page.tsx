import Link from "next/link";
import {AppTabs} from "@/components/app-tabs";
import {getPool} from "@/lib/db";
import {loadMaskingUnmaskingPlan,type MainSupportPlan,type SupportPlanJob} from "@/lib/masking-unmasking-plan";

export const dynamic="force-dynamic";

const nfmt=(v:unknown,max=2)=>{if(v==null||v==="")return "—";const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat("vi-VN",{maximumFractionDigits:max}).format(n):"—";};
const dt=(v:unknown)=>{if(!v)return "—";const d=new Date(String(v));return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(d);};

function Status({row}:{row:SupportPlanJob}){
 if(row.scheduleId)return <span className="badge b-ready">{row.scheduleStatus||"SCHEDULED"}</span>;
 return <span className="badge b-wait">UNSCHEDULED</span>;
}

function JobTable({rows,type}:{rows:SupportPlanJob[];type:"Masking"|"Unmasking"}){
 if(!rows.length)return <div className="support-empty">Không có Job {type} cho Main Planning này.</div>;
 return <div className="table-wrap support-table-wrap"><table className="erp-table support-table">
  <thead><tr>
   <th>Job</th><th>Part / Rev</th><th>PartDescription</th><th>Qty</th><th>Surface</th><th>LastLaborOp</th><th>NextOperation</th><th>Priority</th><th>{type} Operation</th><th>Batch No.</th><th>Start Time</th><th>End / Resource</th>
  </tr></thead>
  <tbody>{rows.map((row)=><tr key={`${row.supportType}-${row.planningJobOperationId}-${row.batchId}-${row.jobNum}`}>
   <td><Link className="erp-link" href={`/job-tracker?q=${encodeURIComponent(row.jobNum)}`}><b>{row.jobNum}</b></Link></td>
   <td><b>{row.partNum||"—"}</b><div className="muted">Rev {row.revisionNum||"—"}</div></td>
   <td>{row.partDescription||"—"}</td>
   <td className="mono">{nfmt(row.qty)}</td>
   <td className="mono">{nfmt(row.surface)}</td>
   <td>{row.lastOperation||"—"}</td>
   <td><b>{row.nextOperation||"—"}</b></td>
   <td>{row.priority||"—"}</td>
   <td>{row.supportOperations.map((op)=><div key={`${op.seq}-${op.code}`}><b>{op.code}</b>{op.name&&op.name!==op.code?<div className="muted">{op.name}</div>:null}</div>)}</td>
   <td><Link className="erp-link" href={`/planning/batches/${row.batchId}`}><b>{row.batchNo||`Batch #${row.batchId}`}</b></Link><div className="muted"><Status row={row}/></div></td>
   <td>{row.plannedStart?<b>{dt(row.plannedStart)}</b>:<span className="muted">Chưa điều độ</span>}</td>
   <td>{row.plannedEnd?<>{dt(row.plannedEnd)}<div className="muted">{row.resourceCode||"—"}</div></>:<span className="muted">—</span>}</td>
  </tr>)}</tbody>
 </table></div>;
}

function MainSection({group}:{group:MainSupportPlan}){
 const total=group.masking.length+group.unmasking.length;
 return <details className={`support-main ${total?"has-jobs":""}`} open={total>0}>
  <summary>
   <span className="support-order">{group.planningOrder??"—"}</span>
   <span className="support-main-name">{group.displayName}</span>
   <span className="support-count masking">Masking {group.masking.length}</span>
   <span className="support-count unmasking">Unmasking {group.unmasking.length}</span>
  </summary>
  <div className="support-main-body">
   <div className="support-type-head"><b>Masking</b><span>{group.masking.length} Job</span></div>
   <JobTable rows={group.masking} type="Masking"/>
   <div className="support-type-head unmask"><b>Unmasking</b><span>{group.unmasking.length} Job</span></div>
   <JobTable rows={group.unmasking} type="Unmasking"/>
  </div>
 </details>;
}

export default async function Page({searchParams}:{searchParams:Promise<{q?:string}>}){
 const sp=await searchParams;const q=String(sp.q??"").trim();
 let groups:MainSupportPlan[]=[];let error="";
 const c=await getPool().connect();
 try{groups=await loadMaskingUnmaskingPlan(c,q);}catch(e){error=e instanceof Error?e.message:String(e);}finally{c.release();}
 const masking=groups.reduce((n,g)=>n+g.masking.length,0);
 const unmasking=groups.reduce((n,g)=>n+g.unmasking.length,0);
 const activeMain=groups.filter(g=>g.masking.length||g.unmasking.length).length;
 return <main className="erp-shell">
  <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><span className="erp-env">MASKING / UNMASKING</span></header>
  <AppTabs active="masking"/>
  <section className="erp-content erp-content-full support-planning-page">
   <div className="erp-page-head"><div><h2>Masking / Unmasking Planning</h2><p>Main Planning Order → Main Operation → Masking / Unmasking → Job · Batch · Schedule Start</p></div></div>
   <div className="notice support-rule"><b>Logic:</b> với từng Job đã nằm trong Batch của một Main Planning, hệ thống đọc <b>Routing Detail.operation_detail_code</b> nằm giữa Previous Main và Main đó. Các code Masking/Unmasking trong đoạn này được gắn vào Main phía sau. <b>Start Time = thời gian bắt đầu điều độ của Batch Main đó.</b> Nếu Batch chưa điều độ thì hiển thị “Chưa điều độ”.</div>
   <form className="support-filter" method="get"><input className="input" name="q" defaultValue={q} placeholder="Tìm Job / Part / Description / Main Operation / Batch No..."/><button className="btn btn-primary" type="submit">Tìm</button>{q?<Link className="btn" href="/masking-unmasking-planning">Xóa lọc</Link>:null}</form>
   <div className="support-summary">
    <div><span>Main Planning</span><b>{groups.length}</b></div><div><span>Main có Job support</span><b>{activeMain}</b></div><div><span>Masking Jobs</span><b>{masking}</b></div><div><span>Unmasking Jobs</span><b>{unmasking}</b></div>
   </div>
   {error?<div className="notice error"><b>Lỗi tải dữ liệu:</b> {error}</div>:null}
   <div className="support-main-list">{groups.map(g=><MainSection key={g.standardOperation} group={g}/>)}</div>
  </section>
 </main>;
}
