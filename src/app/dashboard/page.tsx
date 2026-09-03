import Link from "next/link";
import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {getPool} from "@/lib/db";
import {loadStDashboardData,type StDashboardAreaRow,type StDashboardMetric,type StDashboardPriorityJob,type StDashboardStatus} from "@/lib/dashboard-st-workload";

export const dynamic="force-dynamic";

const STATUS_ORDER:StDashboardStatus[]=["WAIT","READY","PLANNED_UNSCHEDULED","SCHEDULED","HOLD"];
const STATUS_LABEL:Record<StDashboardStatus,string>={
 WAIT:"WAIT",READY:"READY",PLANNED_UNSCHEDULED:"PLANNED-UNSCHEDULED",SCHEDULED:"SCHEDULED",HOLD:"HOLD"
};
const STATUS_CLASS:Record<StDashboardStatus,string>={
 WAIT:"wait",READY:"ready",PLANNED_UNSCHEDULED:"unscheduled",SCHEDULED:"scheduled",HOLD:"hold"
};

function fmt(v:number,max=1){return new Intl.NumberFormat("en-US",{maximumFractionDigits:max}).format(Number(v||0));}
function metricLines(m:StDashboardMetric){return <><b>{fmt(m.jobs,0)} Job</b><span>{fmt(m.qty,0)} pcs</span><span>{fmt(m.surface)} dm²</span></>;}
function tm(v:string|null){
 if(!v)return "—";
 const d=new Date(v);if(Number.isNaN(d.getTime()))return "—";
 const month=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hour12:false,day:"2-digit",month:"2-digit"}).formatToParts(d);
 const get=(type:string)=>parts.find(x=>x.type===type)?.value||"";
 return `${get("hour")}:${get("minute")} ${get("day")}-${month[Math.max(0,Number(get("month"))-1)]}`;
}
function generated(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(d);}


function AreaWorkloadTable({area}:{area:StDashboardAreaRow}){
 return <section className="erp-table-panel st-dashboard-panel st-dashboard-area-panel">
  <div className="erp-panel-head st-dashboard-area-head"><div><b>{area.areaName}</b><small>Main Planning + Recipe workload in this Area.</small></div><span>{fmt(area.mainRows.length,0)} Main Operations</span></div>
  <section className="st-dashboard-kpis st-dashboard-area-kpis">
   <article className="st-dashboard-kpi total"><small>{area.areaName.toUpperCase()} · UNIQUE JOBS</small>{metricLines(area.total)}</article>
   {STATUS_ORDER.map(status=><article key={status} className={`st-dashboard-kpi ${STATUS_CLASS[status]}`}><small>{STATUS_LABEL[status]}</small>{metricLines(area.statuses[status])}</article>)}
  </section>
  <div className="table-wrap st-dashboard-main-wrap"><table className="erp-table st-dashboard-main-table st-dashboard-area-main-table">
   <thead><tr><th>Main Planning</th><th>Recipe No</th><th>Recipe Name</th>{STATUS_ORDER.map(s=><th key={s}>{STATUS_LABEL[s]}</th>)}<th>Total</th></tr></thead>
   <tbody>{area.mainRows.flatMap(row=>{
    const key=`${row.areaId}-${row.standardOperation}`;
    const main=<tr key={`${key}-total`} className="st-dashboard-main-total-row">
     <td><b>{row.standardOperation}</b></td><td>—</td><td><b>MAIN TOTAL</b><small>{fmt(row.recipes.length,0)} Recipe groups</small></td>
     {STATUS_ORDER.map(s=><td key={s}><div className={`st-dashboard-metric-cell ${STATUS_CLASS[s]}`}>{metricLines(row[s])}</div></td>)}
     <td><div className="st-dashboard-metric-cell total">{metricLines(row.total)}</div></td>
    </tr>;
    const recipes=row.recipes.map((recipe,index)=><tr key={`${key}-${recipe.recipeKey}-${index}`} className="st-dashboard-recipe-row">
     <td><span className="st-dashboard-recipe-indent">↳</span></td>
     <td><b className="mono">{recipe.recipeNo||"—"}</b></td>
     <td>{recipe.recipeName||"No Recipe"}</td>
     {STATUS_ORDER.map(s=><td key={s}><div className={`st-dashboard-metric-cell ${STATUS_CLASS[s]}`}>{metricLines(recipe[s])}</div></td>)}
     <td><div className="st-dashboard-metric-cell total">{metricLines(recipe.total)}</div></td>
    </tr>);
    return [main,...recipes];
   })}</tbody>
  </table></div>
 </section>;
}

function PriorityTable({title,rows,tone}:{title:string;rows:StDashboardPriorityJob[];tone:"cat3"|"cat5"}){
 return <section className={`erp-table-panel st-dashboard-panel st-dashboard-priority ${tone}`}>
  <div className="erp-panel-head"><div><b>{title}</b><small>All open priority Jobs with current planning and latest Batch / Schedule information.</small></div><span>{fmt(rows.length,0)} Jobs</span></div>
  <div className="table-wrap st-dashboard-priority-wrap"><table className="erp-table st-dashboard-priority-table">
   <thead><tr><th>Job</th><th>Part / Rev</th><th>Part Description</th><th>Qty</th><th>dm²</th><th>Next Operation</th><th>Planning</th><th>Latest Batch</th><th>Schedule</th></tr></thead>
   <tbody>{rows.length?rows.map(row=><tr key={row.jobNum}>
    <td><b className="mono">{row.jobNum}</b></td>
    <td><b>{row.partNum||"—"}</b><small>{row.revisionNum?`Rev ${row.revisionNum}`:""}</small></td>
    <td>{row.partDescription||"—"}</td>
    <td className="num">{fmt(row.qty,0)}</td>
    <td className="num">{fmt(row.surface)}</td>
    <td className="mono">{row.nextOperation||"—"}</td>
    <td><b>{row.planningMain||"—"}</b><small className={`st-dashboard-status-text ${String(row.planningStatus||"").toLowerCase().replace(/[^a-z]+/g,"-")}`}>{row.planningStatus||"—"}</small></td>
    <td><b>{row.batchNo||"—"}</b><small>{row.batchMain?`${row.batchMain}${row.batchStatus?` · ${row.batchStatus}`:""}`:""}</small></td>
    <td><b>{row.resourceCode||"—"}</b><small>{row.plannedStart?`${tm(row.plannedStart)} → ${tm(row.plannedEnd)}`:(row.scheduleStatus||"—")}</small></td>
   </tr>):<tr><td colSpan={9}>No {title} Job.</td></tr>}</tbody>
  </table></div>
 </section>;
}

export default async function DashboardPage(){
 const c=await getPool().connect();
 let data:Awaited<ReturnType<typeof loadStDashboardData>>|null=null;
 let error="";
 try{data=await loadStDashboardData(c);}catch(e){error=e instanceof Error?e.message:String(e);}finally{c.release();}
 const maxSurface=data?Math.max(1,...data.mainRows.map(x=>x.total.surface)):1;
 return <main className="erp-shell erpkit-migrated-page">
  <ErpAppHeader module="ST WORKLOAD DASHBOARD"/>
  <AppTabs active="dashboard"/>
  <section className="erp-content erp-content-full st-dashboard-page">
   <div className="erp-page-head st-dashboard-head">
    <div><div className="erp-object-eyebrow">ST · PLANNING WORKLOAD</div><h2>ST Planning Dashboard</h2><p>RAW All Open Job NextOperation thuộc ST → Planning workload by status and Main Planning Operation.</p></div>
    <div className="st-dashboard-head-actions"><span>{data?`Updated ${generated(data.generatedAt)}`:""}</span><Link className="btn" href="/dashboard">Refresh</Link></div>
   </div>

   {error||!data?<div className="notice error"><b>Unable to load Dashboard:</b> {error||"Unknown dashboard error"}</div>:<>
    <section className="st-dashboard-kpis">
     <article className="st-dashboard-kpi total"><small>ST TOTAL · UNIQUE OPEN JOBS</small>{metricLines(data.total)}</article>
     {STATUS_ORDER.map(status=><article key={status} className={`st-dashboard-kpi ${STATUS_CLASS[status]}`}><small>{STATUS_LABEL[status]}</small>{metricLines(data.statuses[status])}</article>)}
    </section>
    <div className="st-dashboard-note">ST TOTAL chỉ lấy Open Job có RAW NextOperation hiện tại thuộc ST Planning view. Sau bước lọc RAW này, các status mới tổng hợp theo Job × Main Planning trong Planning Chain; Job có RAW NextOperation ngoài ST không được kéo vào Dashboard chỉ vì có future Planning Operation.</div>

    <section className="st-dashboard-area-workloads">
     <div className="erp-panel-head st-dashboard-area-summary-head"><div><b>Main Planning Workload Summary · By Area</b><small>Each Area has its own KPI cards and its own Main Planning → Recipe workload table. All table rows stay visible without vertical scrolling.</small></div><span>{fmt(data.areas.length,0)} Areas · {fmt(data.mainRows.length,0)} Main Operations</span></div>
     {data.areas.map(area=><AreaWorkloadTable key={`${area.areaId}-${area.areaName}`} area={area}/>)}
    </section>

    <section className="erp-table-panel st-dashboard-panel st-dashboard-chart-panel">
     <div className="erp-panel-head"><div><b>Surface Workload by Main Planning</b><small>Stacked column chart · X = Main Planning · Y = dm².</small></div></div>
     <div className="st-dashboard-chart-legend">{STATUS_ORDER.map(s=><span key={s}><i className={STATUS_CLASS[s]}></i>{STATUS_LABEL[s]}</span>)}</div>
     <div className="st-dashboard-chart-scroll"><div className="st-dashboard-chart">
      {data.mainRows.map(row=>{
       const total=row.total.surface;
       return <div className="st-dashboard-bar-group" key={`${row.areaId}-${row.standardOperation}`} title={`${row.areaName} · ${row.standardOperation} · ${fmt(total)} dm²`}>
        <div className="st-dashboard-bar-value">{fmt(total,0)}</div>
        <div className="st-dashboard-bar-track">{STATUS_ORDER.map(s=>{
         const value=row[s].surface;
         const h=Math.max(0,value/maxSurface*100);
         return value>0?<span key={s} className={STATUS_CLASS[s]} style={{height:`${h}%`}} title={`${STATUS_LABEL[s]}: ${fmt(value)} dm²`}></span>:null;
        })}</div>
        <div className="st-dashboard-bar-label">{row.standardOperation}</div>
       </div>;
      })}
     </div></div>
    </section>

    <PriorityTable title="CAT3" rows={data.cat3} tone="cat3"/>
    <PriorityTable title="CAT5" rows={data.cat5} tone="cat5"/>
   </>}
  </section>
 </main>;
}
