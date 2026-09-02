import Link from "next/link";
import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {DashboardAiPanel} from "@/components/dashboard-ai-panel";
import {getPool} from "@/lib/db";
import {dashboardAiScope,loadDashboardData} from "@/lib/dashboard-data";
import {getProductionDay} from "@/lib/schedule-time";

export const dynamic="force-dynamic";

function safeDate(v:unknown,fallback:string){const x=String(v??"").trim();return /^\d{4}-\d{2}-\d{2}$/.test(x)?x:fallback;}
function shiftDate(value:string,days:number){const d=new Date(`${value}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function displayDate(value:string){const d=new Date(`${value}T00:00:00Z`);return new Intl.DateTimeFormat("en-GB",{timeZone:"UTC",day:"2-digit",month:"2-digit",year:"numeric"}).format(d);}
function fmt(v:number,max=1){return new Intl.NumberFormat("en-US",{maximumFractionDigits:max}).format(Number(v||0));}
function tm(v:string|null){if(!v)return "—";const d=new Date(v);if(Number.isNaN(d.getTime()))return "—";return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hour12:false}).format(d);}
function tone(value:number,warning=1){return value>=warning?"risk":"good";}

export default async function DashboardPage({searchParams}:{searchParams:Promise<{date?:string}>}){
 const sp=await searchParams;
 const current=getProductionDay(new Date()).toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"});
 const date=safeDate(sp.date,current);
 const prev=shiftDate(date,-1),next=shiftDate(date,1);
 const c=await getPool().connect();
 let data:Awaited<ReturnType<typeof loadDashboardData>>|null=null;
 let error="";
 try{data=await loadDashboardData(c,{scheduleDate:date});}catch(e){error=e instanceof Error?e.message:String(e);}finally{c.release();}

 const maxAreaWork=data?Math.max(1,...data.areas.map(x=>x.workItems)):1;
 const maxTrend=data?Math.max(1,...data.trend.map(x=>x.scheduledBatches)):1;
 const attention=data?
  (data.kpis.scheduleConflicts>0||data.kpis.delayed>0?"RISK":data.kpis.unscheduledBatches>0||data.kpis.waiting>0?"WATCH":"GOOD")
  :"WATCH";

 return <main className="erp-shell erpkit-migrated-page">
  <ErpAppHeader module="OPERATIONS DASHBOARD"/>
  <AppTabs active="dashboard"/>
  <section className="erp-content erp-content-full dashboard-page">
   <div className="erp-page-head dashboard-page-head">
    <div>
     <div className="erp-object-eyebrow">OPERATIONS · CONTROL TOWER</div>
     <h2>ST Planning Dashboard</h2>
     <p>Planning, Scheduling and Production Execution overview with a read-only AI database analysis agent (Groq primary, OpenRouter fallback).</p>
    </div>
    <div className="dashboard-date-nav">
     <Link className="btn" href={`/dashboard?date=${prev}`}>‹ Previous</Link>
     <span>{displayDate(date)}</span>
     <Link className="btn" href={`/dashboard?date=${next}`}>Next ›</Link>
     {date!==current?<Link className="btn primary" href={`/dashboard?date=${current}`}>Today</Link>:null}
    </div>
   </div>

   {error||!data?<div className="notice error"><b>Unable to load Dashboard:</b> {error||"Unknown dashboard error"}</div>:<>
    <section className="dashboard-status-strip">
     <div className={`dashboard-health ${attention.toLowerCase()}`}><span>OPERATIONS HEALTH</span><b>{attention}</b></div>
     <div><span>Selected production day</span><b>{displayDate(date)}</b></div>
     <div><span>AI Provider</span><b>Groq → OpenRouter</b></div>
     <div><span>AI mode</span><b>Read DB / Analyze / Recommend</b></div>
    </section>

    <section className="dashboard-kpi-grid">
     <article className="dashboard-kpi"><span>Open Jobs</span><b>{fmt(data.kpis.openJobs,0)}</b><small>{fmt(data.kpis.openWipQty,0)} current good WIP qty</small></article>
     <article className="dashboard-kpi"><span>READY Jobs</span><b>{fmt(data.kpis.readyJobs,0)}</b><small>Eligible for the next planning action</small></article>
     <article className={`dashboard-kpi ${data.kpis.unscheduledBatches?"watch":""}`}><span>Unscheduled Backlog</span><b>{fmt(data.kpis.unscheduledBatches,0)}</b><small>PLANNED / RELEASED batches without schedule</small></article>
     <article className="dashboard-kpi"><span>Scheduled Today</span><b>{fmt(data.kpis.scheduledBatches,0)}</b><small>{fmt(data.kpis.scheduledHours)} planned resource hours</small></article>
     <article className={`dashboard-kpi ${data.kpis.waiting?"watch":""}`}><span>Execution Waiting</span><b>{fmt(data.kpis.waiting,0)}</b><small>{fmt(data.kpis.executionWorkItems,0)} work items in Production Execution</small></article>
     <article className="dashboard-kpi ongoing"><span>On-going</span><b>{fmt(data.kpis.ongoing,0)}</b><small>Currently reported as in progress</small></article>
     <article className="dashboard-kpi good"><span>Done</span><b>{fmt(data.kpis.done,0)}</b><small>{fmt(data.kpis.completionPct)}% execution work-item completion</small></article>
     <article className={`dashboard-kpi ${tone(data.kpis.delayed)}`}><span>Delayed Risk</span><b>{fmt(data.kpis.delayed,0)}</b><small>Not DONE after planned target / end</small></article>
     <article className={`dashboard-kpi ${tone(data.kpis.scheduleConflicts)}`}><span>Schedule Conflicts</span><b>{fmt(data.kpis.scheduleConflicts,0)}</b><small>Resource concurrency exceeds configured capacity</small></article>
     <article className="dashboard-kpi"><span>Open Surface</span><b>{fmt(data.kpis.openSurface)}</b><small>dm² in current open-job snapshot</small></article>
    </section>

    <div className="dashboard-main-grid">
     <section className="erp-table-panel dashboard-panel dashboard-area-panel">
      <div className="erp-panel-head"><div><b>Area Execution & Bottleneck View</b><small>Areas are ranked by delayed / waiting / on-going workload.</small></div></div>
      <div className="table-wrap"><table className="erp-table dashboard-area-table">
       <thead><tr><th>Area</th><th>Work Items</th><th>Waiting</th><th>On-going</th><th>Done</th><th>Delayed</th><th>Jobs</th><th>Qty</th><th>dm²</th><th>Load</th></tr></thead>
       <tbody>{data.areas.length?data.areas.map(row=><tr key={row.area}>
        <td><b>{row.area}</b></td><td className="num">{row.workItems}</td><td className="num">{row.waiting}</td><td className="num">{row.ongoing}</td><td className="num">{row.done}</td><td className={`num ${row.delayed?"dashboard-risk-text":""}`}>{row.delayed}</td><td className="num">{fmt(row.jobs,0)}</td><td className="num">{fmt(row.qty,0)}</td><td className="num">{fmt(row.surface)}</td>
        <td><div className="dashboard-meter"><span style={{width:`${Math.max(4,row.workItems/maxAreaWork*100)}%`}}></span></div></td>
       </tr>):<tr><td colSpan={10}>No execution work for this date.</td></tr>}</tbody>
      </table></div>
     </section>

     <DashboardAiPanel scheduleDate={date} scope={dashboardAiScope(data)}/>
    </div>

    <div className="dashboard-two-column">
     <section className="erp-table-panel dashboard-panel">
      <div className="erp-panel-head"><div><b>Resource Workload</b><small>Scheduled load by resource for the selected production day.</small></div></div>
      <div className="table-wrap"><table className="erp-table dashboard-resource-table">
       <thead><tr><th>Resource</th><th>Area</th><th>Batches</th><th>Jobs</th><th>Qty</th><th>dm²</th><th>Hours</th><th>Window</th></tr></thead>
       <tbody>{data.resources.length?data.resources.map(row=><tr key={row.resource}>
        <td><b className="mono">{row.resource}</b></td><td>{row.area}</td><td className="num">{row.batches}</td><td className="num">{fmt(row.jobs,0)}</td><td className="num">{fmt(row.qty,0)}</td><td className="num">{fmt(row.surface)}</td><td className="num"><b>{fmt(row.plannedHours)}</b></td><td className="mono">{tm(row.firstStart)} → {tm(row.lastEnd)}</td>
       </tr>):<tr><td colSpan={8}>No scheduled resource load.</td></tr>}</tbody>
      </table></div>
     </section>

     <section className="erp-table-panel dashboard-panel dashboard-trend-panel">
      <div className="erp-panel-head"><div><b>7-Day Schedule / Completion Trend</b><small>Batch schedule count and reported DONE batches.</small></div></div>
      <div className="dashboard-trend">{data.trend.map(day=><div className="dashboard-trend-day" key={day.date}>
       <div className="dashboard-trend-bars">
        <span className="scheduled" style={{height:`${Math.max(3,day.scheduledBatches/maxTrend*100)}%`}} title={`${day.scheduledBatches} scheduled`}></span>
        <span className="done" style={{height:`${day.scheduledBatches?Math.max(3,day.doneBatches/maxTrend*100):0}%`}} title={`${day.doneBatches} done`}></span>
       </div>
       <b>{day.date.slice(5)}</b><small>{day.scheduledBatches} / {day.doneBatches}</small><small>{fmt(day.plannedHours)}h</small>
      </div>)}</div>
      <div className="dashboard-trend-legend"><span><i className="scheduled"></i>Scheduled</span><span><i className="done"></i>Done</span></div>
     </section>
    </div>

    <div className="dashboard-two-column">
     <section className="erp-table-panel dashboard-panel">
      <div className="erp-panel-head"><div><b>Delayed / At-Risk Work</b><small>Execution item is not DONE after its planned end or target time.</small></div><span>{data.risks.length} shown</span></div>
      <div className="table-wrap"><table className="erp-table dashboard-risk-table">
       <thead><tr><th>Area</th><th>Resource</th><th>Batch</th><th>Operation</th><th>Status</th><th>Plan</th><th>Jobs</th><th>Priority Jobs</th></tr></thead>
       <tbody>{data.risks.length?data.risks.map((row,i)=><tr key={`${row.batchNo}-${row.area}-${i}`}>
        <td>{row.area}</td><td className="mono">{row.resource||"—"}</td><td><b className="mono">{row.batchNo||"—"}</b></td><td>{row.operation}</td><td><span className="dashboard-risk-pill">{row.status}</span></td><td className="mono">{tm(row.plannedStart)} → {tm(row.plannedEnd)}</td><td className="num">{row.jobs}</td><td>{row.priorityJobs.join(" / ")||"—"}</td>
       </tr>):<tr><td colSpan={8}><b>No delayed execution work detected.</b></td></tr>}</tbody>
      </table></div>
     </section>

     <section className="erp-table-panel dashboard-panel">
      <div className="erp-panel-head"><div><b>READY Work Queue</b><small>First 20 ELIGIBLE Planning Chain rows; priority is shown when available.</small></div><span>{data.kpis.readyJobs} total</span></div>
      <div className="table-wrap"><table className="erp-table dashboard-ready-table">
       <thead><tr><th>Job</th><th>Main Operation</th><th>NextOperation</th><th>Priority</th><th>Qty</th><th>dm²</th></tr></thead>
       <tbody>{data.readyJobs.length?data.readyJobs.map(row=><tr key={`${row.jobNum}-${row.operation}`}>
        <td><b className="mono">{row.jobNum}</b></td><td>{row.operation}</td><td>{row.nextOperation||"—"}</td><td>{row.priority||"—"}</td><td className="num">{fmt(row.qty,0)}</td><td className="num">{fmt(row.surface)}</td>
       </tr>):<tr><td colSpan={6}>No READY jobs.</td></tr>}</tbody>
      </table></div>
     </section>
    </div>
   </>}
  </section>
 </main>;
}
