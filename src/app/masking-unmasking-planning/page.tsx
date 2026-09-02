import Link from "next/link";
import {AppTabs} from "@/components/app-tabs";
import {getPool} from "@/lib/db";
import {
  loadMaskingUnmaskingPlan,
  type MainSupportPlan,
  type SupportPlanJob,
  type SupportView
} from "@/lib/masking-unmasking-plan";

export const dynamic="force-dynamic";

const nfmt=(v:unknown,max=2)=>{if(v==null||v==="")return "—";const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat("vi-VN",{maximumFractionDigits:max}).format(n):"—";};
const dt=(v:unknown)=>{if(!v)return "—";const d=new Date(String(v));return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(d);};
const dOnly=(v:string)=>{const [y,m,d]=v.split("-");return y&&m&&d?`${d}/${m}/${y}`:v;};
const duration=(minutes:number|null)=>minutes==null?"—":`${String(Math.floor(minutes/60)).padStart(2,"0")}:${String(minutes%60).padStart(2,"0")}`;

function vnToday(){
 const p=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const get=(type:string)=>p.find(x=>x.type===type)?.value||"";
 return `${get("year")}-${get("month")}-${get("day")}`;
}
function safeDate(value:unknown){const x=String(value??"").trim();return /^\d{4}-\d{2}-\d{2}$/.test(x)?x:vnToday();}
function shiftDate(value:string,days:number){const d=new Date(`${value}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function hrefWith(input:{date:string;view:SupportView;q:string}){
 const p=new URLSearchParams();p.set("date",input.date);p.set("view",input.view);if(input.q)p.set("q",input.q);return `/masking-unmasking-planning?${p.toString()}`;
}

function Status({row}:{row:SupportPlanJob}){
 if(row.scheduleId)return <span className="badge b-ready">{row.scheduleStatus||"SCHEDULED"}</span>;
 return <span className="badge b-wait">UNSCHEDULED</span>;
}

function Recipe({row}:{row:SupportPlanJob}){
 if(!row.recipeKey)return <span className="muted">—</span>;
 const title=[row.recipeNo,row.recipeName].filter(Boolean).join(" · ")||row.recipeKey;
 return <><b>{title}</b>{title!==row.recipeKey?<div className="muted mono">{row.recipeKey}</div>:null}</>;
}

function JobTable({rows,type}:{rows:SupportPlanJob[];type:"Masking"|"Unmasking"}){
 if(!rows.length)return <div className="support-empty">Không có Job {type} cho Main Planning này trong phạm vi đang xem.</div>;
 return <div className="table-wrap support-table-wrap"><table className="erp-table support-table">
  <thead><tr>
   <th>Job</th><th>Part / Rev</th><th>PartDescription</th><th>Qty</th><th>Surface</th><th>LastLaborOp</th><th>NextOperation</th><th>Priority</th><th>{type} Operation Detail</th><th>Recipe</th><th>Batch No.</th><th>Start Time</th><th>End / Resource</th><th>Process</th>
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
   <td>{row.supportOperations.map((op)=><div key={`${op.seq}-${op.detailCode}`} className="support-operation-detail"><b>{op.detailCode}</b>{op.name&&op.name!==op.detailCode?<div className="muted">{op.name}</div>:null}</div>)}</td>
   <td><Recipe row={row}/></td>
   <td><Link className="erp-link" href={`/planning/batches/${row.batchId}`}><b>{row.batchNo||`Batch #${row.batchId}`}</b></Link><div className="muted"><Status row={row}/></div></td>
   <td>{row.plannedStart?<b>{dt(row.plannedStart)}</b>:<><span className="muted">Chưa điều độ</span>{row.planningDate?<div className="muted">Batch date: {dOnly(String(row.planningDate).slice(0,10))}</div>:null}</>}</td>
   <td>{row.plannedEnd?<>{dt(row.plannedEnd)}<div className="muted">{row.resourceCode||"—"}</div></>:<span className="muted">—</span>}</td>
   <td className="mono">{duration(row.processMinutes)}</td>
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

export default async function Page({searchParams}:{searchParams:Promise<{q?:string;date?:string;view?:string}>}){
 const sp=await searchParams;
 const q=String(sp.q??"").trim();
 const date=safeDate(sp.date);
 const view:SupportView=sp.view==="unscheduled"?"unscheduled":"scheduled";
 let groups:MainSupportPlan[]=[];let error="";
 const c=await getPool().connect();
 try{groups=await loadMaskingUnmaskingPlan(c,{search:q,view,scheduleDate:date});}catch(e){error=e instanceof Error?e.message:String(e);}finally{c.release();}
 const masking=groups.reduce((n,g)=>n+g.masking.length,0);
 const unmasking=groups.reduce((n,g)=>n+g.unmasking.length,0);
 const activeMain=groups.filter(g=>g.masking.length||g.unmasking.length).length;
 const prev=shiftDate(date,-1),next=shiftDate(date,1),today=vnToday();
 return <main className="erp-shell erpkit-migrated-page">
  <header className="erp-header"><div><h1>ST Planning</h1></div><span className="erp-env">MASKING / UNMASKING</span></header>
  <AppTabs active="masking"/>
  <section className="erp-content erp-content-full support-planning-page">
   <div className="erp-page-head"><div><h2>Masking / Unmasking Planning</h2><p>Ngày điều độ → Main Planning Order → Main Operation → Masking / Unmasking → Job · Batch · Time</p></div></div>


   <div className="support-date-bar">
    <div className="support-view-tabs">
     <Link className={`btn ${view==="scheduled"?"btn-primary":""}`} href={hrefWith({date,view:"scheduled",q})}>Theo ngày điều độ</Link>
     <Link className={`btn ${view==="unscheduled"?"btn-primary":""}`} href={hrefWith({date,view:"unscheduled",q})}>Chưa điều độ</Link>
    </div>
    {view==="scheduled"?<div className="support-date-nav">
     <Link className="btn" href={hrefWith({date:prev,view,q})}>‹ Ngày trước</Link>
     <span className="support-selected-date">{dOnly(date)}</span>
     <Link className="btn" href={hrefWith({date:next,view,q})}>Ngày sau ›</Link>
     {date!==today?<Link className="btn" href={hrefWith({date:today,view,q})}>Hôm nay</Link>:null}
    </div>:<div className="muted">Hiển thị Batch Main đã tạo nhưng chưa có planning_schedule.</div>}
   </div>

   <form className="support-filter" method="get">
    <input type="hidden" name="date" value={date}/><input type="hidden" name="view" value={view}/>
    <input className="input" name="q" defaultValue={q} placeholder="Tìm Job / Part / Description / Main Operation / Batch / Support Operation..."/>
    <button className="btn btn-primary" type="submit">Tìm</button>
    {q?<Link className="btn" href={hrefWith({date,view,q:""})}>Xóa lọc</Link>:null}
   </form>

   <div className="support-summary">
    <div><span>Main Planning</span><b>{groups.length}</b></div><div><span>Main có Job support</span><b>{activeMain}</b></div><div><span>Masking Jobs</span><b>{masking}</b></div><div><span>Unmasking Jobs</span><b>{unmasking}</b></div>
   </div>
   {error?<div className="notice error"><b>Lỗi tải dữ liệu:</b> {error}</div>:null}
   <div className="support-main-list">{groups.map(g=><MainSection key={g.standardOperation} group={g}/>)}</div>
  </section>
 </main>;
}
