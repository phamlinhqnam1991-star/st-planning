import Link from "next/link";
import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {getPool} from "@/lib/db";
import {loadStDashboardData,type StDashboardAreaRow,type StDashboardAuditJob,type StDashboardImmediateRow,type StDashboardMetric,type StDashboardPriorityJob,type StDashboardStatus} from "@/lib/dashboard-st-workload";

export const dynamic="force-dynamic";

const STATUS_ORDER:StDashboardStatus[]=["WAIT","READY","PLANNED_UNSCHEDULED","SCHEDULED","HOLD"];
const STATUS_LABEL:Record<StDashboardStatus,string>={
 WAIT:"WAIT",READY:"READY",PLANNED_UNSCHEDULED:"PLANNED-UNSCHEDULED",SCHEDULED:"SCHEDULED",HOLD:"HOLD"
};
const STATUS_CLASS:Record<StDashboardStatus,string>={
 WAIT:"wait",READY:"ready",PLANNED_UNSCHEDULED:"unscheduled",SCHEDULED:"scheduled",HOLD:"hold"
};

function fmt(v:number,max=1){return new Intl.NumberFormat("en-US",{maximumFractionDigits:max}).format(Number(v||0));}
function metricLines(m:StDashboardMetric){return <><b>{fmt(m.surface)} dm²</b><span>{fmt(m.qty,0)} pcs</span><span>{fmt(m.jobs,0)} Job</span></>;}
function chartTypeTag(type:StDashboardImmediateRow["operationType"]){return type==="INTERMEDIATE"?"IMMEDIATE":type==="ST_SCOPE_ONLY"?"ST ONLY":"MAIN";}
function tm(v:string|null){
 if(!v)return "—";
 const d=new Date(v);if(Number.isNaN(d.getTime()))return "—";
 const month=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hour12:false,day:"2-digit",month:"2-digit"}).formatToParts(d);
 const get=(type:string)=>parts.find(x=>x.type===type)?.value||"";
 return `${get("hour")}:${get("minute")} ${get("day")}-${month[Math.max(0,Number(get("month"))-1)]}`;
}
function generated(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(d);}

function SurfaceQtyComboChart({rows,total}:{rows:StDashboardImmediateRow[];total:StDashboardMetric}){
 const width=1200,height=390;
 const left=66,right=70,top=40,bottom=120;
 const plotW=width-left-right,plotH=height-top-bottom;
 const surfaceMax=50000;
 const qtyMax=10000;
 const totalZoneW=92;
 const totalGap=34;
 const normalPlotW=Math.max(1,plotW-totalZoneW-totalGap);
 const normalStep=rows.length?normalPlotW/rows.length:normalPlotW;
 const barW=Math.max(3,Math.min(24,normalStep*.55));
 const totalX=left+normalPlotW+totalGap+totalZoneW/2;
 const dividerX=left+normalPlotW+totalGap/2;
 const ticks=[0,1,2,3,4,5];
 const points=rows.map((row,i)=>{
  const x=left+normalStep*(i+.5);
  const qtyPlot=Math.min(qtyMax,Math.max(0,row.total.qty));
  const y=top+plotH-(qtyPlot/qtyMax)*plotH;
  return {x,y,row};
 });
 const totalQtyPlot=Math.min(qtyMax,Math.max(0,total.qty));
 const totalPoint={x:totalX,y:top+plotH-(totalQtyPlot/qtyMax)*plotH};
 const path=points.map((p,i)=>`${i?"L":"M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
 return <div className="st-dashboard-combo-chart-wrap">
  <svg className="st-dashboard-combo-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Surface dm² columns and pcs line by Current Main Planning, RAW Immediate Operation, ST Only, with Total shown separately">
   <text x={12} y={20} className="st-dashboard-axis-title">dm² · max 50,000</text>
   <text x={width-12} y={20} textAnchor="end" className="st-dashboard-axis-title">pcs · max 10,000</text>
   {ticks.map(t=>{
    const y=top+plotH-(t/5)*plotH;
    const surface=surfaceMax*t/5,qty=qtyMax*t/5;
    return <g key={t}>
     <line x1={left} y1={y} x2={width-right} y2={y} className="st-dashboard-combo-grid"/>
     <text x={left-8} y={y+3} textAnchor="end" className="st-dashboard-axis-tick">{fmt(surface,0)}</text>
     <text x={width-right+8} y={y+3} textAnchor="start" className="st-dashboard-axis-tick">{fmt(qty,0)}</text>
    </g>;
   })}
   <line x1={dividerX} y1={top-4} x2={dividerX} y2={top+plotH+92} className="st-dashboard-combo-total-separator"/>
   <text x={totalX} y={top-9} textAnchor="middle" className="st-dashboard-combo-total-title">TOTAL</text>
   {points.map(({x,row},i)=>{
    const surfacePlot=Math.min(surfaceMax,Math.max(0,row.total.surface));
    const h=Math.max(0,(surfacePlot/surfaceMax)*plotH);
    const y=top+plotH-h;
    const barLabelY=Math.max(12,y-5);
    const tag=chartTypeTag(row.operationType);
    const label=row.operationType==="ST_SCOPE_ONLY"?`ST ONLY / ${row.immediateOperation}`:`${row.standardOperation} / ${row.immediateOperation} [${tag}]`;
    return <g key={`${row.operationType}-${row.areaId}-${row.standardOperation}-${row.immediateOperation}-${i}`}>
     <rect x={x-barW/2} y={y} width={barW} height={h} rx="1.5" className="st-dashboard-combo-bar">
      <title>{`${row.areaName} · ${label} · ${fmt(row.total.surface)} dm² · ${fmt(row.total.qty,0)} pcs`}</title>
     </rect>
     <text x={x} y={barLabelY} textAnchor="middle" className="st-dashboard-combo-value surface">{fmt(row.total.surface,0)} dm²</text>
     <text transform={`translate(${x+2} ${top+plotH+10}) rotate(58)`} className="st-dashboard-combo-x-label">
      <tspan>{row.operationType==="ST_SCOPE_ONLY"?"ST ONLY":row.standardOperation}</tspan><tspan> / {row.immediateOperation} [{tag}]</tspan>
     </text>
    </g>;
   })}
   {points.length>1?<path d={path} className="st-dashboard-combo-line"/>:null}
   {points.map(({x,y,row},i)=>{
    const qtyLabelY=y<=top+12?y+13:y-7;
    return <g key={`p-${i}`}>
     <circle cx={x} cy={y} r={2.7} className="st-dashboard-combo-point">
      <title>{`${row.operationType==="ST_SCOPE_ONLY"?`ST ONLY / ${row.immediateOperation}`:`${row.standardOperation} / ${row.immediateOperation} [${chartTypeTag(row.operationType)}]`} · ${fmt(row.total.qty,0)} pcs · ${fmt(row.total.surface)} dm²`}</title>
     </circle>
     <text x={x} y={qtyLabelY} textAnchor="middle" className="st-dashboard-combo-value qty">{fmt(row.total.qty,0)} pcs</text>
    </g>;
   })}
   {(()=>{
    const surfacePlot=Math.min(surfaceMax,Math.max(0,total.surface));
    const h=Math.max(0,(surfacePlot/surfaceMax)*plotH);
    const y=top+plotH-h;
    const barLabelY=Math.max(12,y-5);
    const qtyLabelY=totalPoint.y<=top+12?totalPoint.y+13:totalPoint.y-7;
    return <g className="st-dashboard-combo-total-group">
     <rect x={totalX-13} y={y} width={26} height={h} rx="2" className="st-dashboard-combo-bar total">
      <title>{`TOTAL / ALL ST · ${fmt(total.surface)} dm² · ${fmt(total.qty,0)} pcs · ${fmt(total.jobs,0)} Jobs`}</title>
     </rect>
     <text x={totalX} y={barLabelY} textAnchor="middle" className="st-dashboard-combo-value surface">{fmt(total.surface,0)} dm²</text>
     <circle cx={totalPoint.x} cy={totalPoint.y} r={3.4} className="st-dashboard-combo-point total">
      <title>{`TOTAL / ALL ST · ${fmt(total.qty,0)} pcs · ${fmt(total.surface)} dm² · ${fmt(total.jobs,0)} Jobs`}</title>
     </circle>
     <text x={totalX} y={qtyLabelY} textAnchor="middle" className="st-dashboard-combo-value qty">{fmt(total.qty,0)} pcs</text>
     <text x={totalX} y={top+plotH+24} textAnchor="middle" className="st-dashboard-combo-x-label total"><tspan>TOTAL</tspan><tspan x={totalX} dy="8">ALL ST</tspan></text>
    </g>;
   })()}
   <line x1={left} y1={top} x2={left} y2={top+plotH} className="st-dashboard-combo-axis"/>
   <line x1={width-right} y1={top} x2={width-right} y2={top+plotH} className="st-dashboard-combo-axis"/>
   <line x1={left} y1={top+plotH} x2={width-right} y2={top+plotH} className="st-dashboard-combo-axis"/>
  </svg>
 </div>;
}



function AuditJobTable({rows}:{rows:StDashboardAuditJob[]}){
 const totalSurface=rows.reduce((sum,row)=>sum+Number(row.surfaceUsed||0),0);
 const totalQty=rows.reduce((sum,row)=>sum+Number(row.qtyUsed||0),0);
 return <section className="erp-table-panel st-dashboard-panel st-dashboard-audit-panel">
  <div className="erp-panel-head"><div><b>Chart Calculation Audit · Job Detail</b><small>Exactly the Jobs used by chart 2 after two stages: resolve LastOperation → RAW NextOperation → Current Main first, then filter RAW NextOperation by active ST Scope (Planning / Immediate / ST Only). Qty and Surface are counted once from the current Open Job row.</small></div><span>{fmt(totalSurface)} dm² · {fmt(totalQty,0)} pcs · {fmt(rows.length,0)} Jobs</span></div>
  <div className="st-dashboard-audit-note">Chart pipeline: <b>1) Bridge resolver: LastOperation → RAW NextOperation → Current Main</b>; <b>2) ST Scope filter</b>: keep only RAW NextOperation tagged Planning Operation / Intermediate / ST_SCOPE_ONLY. Intermediate must also match the resolved active Bridge context. Generic non-ST route steps are therefore removed only after resolution.</div>
  <div className="table-wrap st-dashboard-audit-wrap"><table className="erp-table st-dashboard-audit-table">
   <thead><tr>
    <th>Job</th><th>ST Type</th><th>Part / Rev</th><th>Priority</th><th>Chart Group</th><th>Last Operation</th><th>RAW NextOperation<br/>Immediate</th>
    <th>Resolver Mode</th><th>Previous Main</th><th>Current Main</th><th>Current Main Source Op</th><th>Status</th><th>Current Seq</th>
    <th>Next Main</th><th>Next Main Source Op</th><th>Next Seq</th><th>WIP Qty</th><th>Prod Qty</th><th>Qty Used</th>
    <th>Surface / Part dm²</th><th>Source TotalSurface</th><th>Qty × Surface</th><th>Surface Used dm²</th><th>AllOperation</th>
   </tr></thead>
   <tbody>{rows.length?rows.map(row=><tr key={row.jobNum}>
    <td><b className="mono">{row.jobNum}</b></td>
    <td><b>{row.operationType==="INTERMEDIATE"?"IMMEDIATE":row.operationType==="ST_SCOPE_ONLY"?"ST ONLY":"MAIN"}</b><small className="mono">{row.operationType||"—"}</small></td>
    <td><b>{row.partNum||"—"}</b><small>{row.revisionNum?`Rev ${row.revisionNum}`:""}</small></td>
    <td><b>{row.priority||"—"}</b></td>
    <td><b>{row.operationType==="ST_SCOPE_ONLY"?"ST_SCOPE_ONLY":row.currentMain||"—"}</b><small className="mono">/ {row.rawNextOperation||"—"}</small></td>
    <td className="mono">{row.lastOperation||"—"}</td>
    <td className="mono"><b>{row.rawNextOperation||"—"}</b></td>
    <td><b>{row.resolverMode||"—"}</b></td>
    <td>{row.previousMain||"—"}</td>
    <td><b>{row.currentMain||"—"}</b></td>
    <td className="mono">{row.currentMainSourceOperation||"—"}</td>
    <td><b className={`st-dashboard-status-text ${String(row.currentStatus||"").toLowerCase().replace(/[^a-z]+/g,"-")}`}>{row.currentStatus||"—"}</b></td>
    <td className="num"><b>{fmt(row.currentPlanningSeq,0)}</b><small>src {fmt(row.currentSourceSeq,0)}</small></td>
    <td><b>{row.nextMain||"—"}</b></td>
    <td className="mono">{row.nextMainSourceOperation||"—"}</td>
    <td className="num">{row.nextPlanningSeq?fmt(row.nextPlanningSeq,0):"—"}</td>
    <td className="num">{fmt(row.wipQty,0)}</td>
    <td className="num">{fmt(row.prodQty,0)}</td>
    <td className="num"><b>{fmt(row.qtyUsed,0)}</b></td>
    <td className="num">{fmt(row.surfacePerPart,3)}</td>
    <td className="num">{row.sourceTotalSurface==null?"NULL":fmt(row.sourceTotalSurface,3)}</td>
    <td className="num">{fmt(row.calculatedSurface,3)}</td>
    <td className="num"><b>{fmt(row.surfaceUsed,3)}</b></td>
    <td className="mono st-dashboard-audit-allop" title={row.allOperation||""}>{row.allOperation||"—"}</td>
   </tr>):<tr><td colSpan={24}>No ST Job used by the chart.</td></tr>}</tbody>
  </table></div>
 </section>;
}

function AreaWorkloadTable({area}:{area:StDashboardAreaRow}){
 return <section className="erp-table-panel st-dashboard-panel st-dashboard-area-panel">
  <div className="erp-panel-head st-dashboard-area-head"><div><b>{area.areaName}</b><small>Main Planning + Recipe workload in this Area.</small></div><span>{fmt(area.mainRows.length,0)} Main Operations</span></div>
  <section className="st-dashboard-kpis st-dashboard-area-kpis">
   <article className="st-dashboard-kpi total"><small>{area.areaName.toUpperCase()} · SURFACE WORKLOAD</small>{metricLines(area.total)}</article>
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
 const prioritySurface=rows.reduce((sum,row)=>sum+Number(row.surface||0),0);
 const priorityQty=rows.reduce((sum,row)=>sum+Number(row.qty||0),0);
 return <section className={`erp-table-panel st-dashboard-panel st-dashboard-priority ${tone}`}>
  <div className="erp-panel-head"><div><b>{title}</b><small>All open priority Jobs with current planning and latest Batch / Schedule information.</small></div><span>{fmt(prioritySurface)} dm² · {fmt(priorityQty,0)} pcs · {fmt(rows.length,0)} Jobs</span></div>
  <div className="table-wrap st-dashboard-priority-wrap"><table className="erp-table st-dashboard-priority-table">
   <thead><tr><th>Job</th><th>Part / Rev</th><th>Part Description</th><th>dm²</th><th>Qty</th><th>Next Operation</th><th>Planning</th><th>Latest Batch</th><th>Schedule</th></tr></thead>
   <tbody>{rows.length?rows.map(row=><tr key={row.jobNum}>
    <td><b className="mono">{row.jobNum}</b></td>
    <td><b>{row.partNum||"—"}</b><small>{row.revisionNum?`Rev ${row.revisionNum}`:""}</small></td>
    <td>{row.partDescription||"—"}</td>
    <td className="num"><b>{fmt(row.surface)}</b></td>
    <td className="num">{fmt(row.qty,0)}</td>
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
    <div><div className="erp-object-eyebrow">ST · PLANNING WORKLOAD</div><h2>ST Planning Dashboard</h2><p>All RAW NextOperation → Planning Board Current Main resolver → ST workload/status/Main/Recipe context.</p></div>
    <div className="st-dashboard-head-actions"><span>{data?`Updated ${generated(data.generatedAt)}`:""}</span><Link className="btn" href="/dashboard">Refresh</Link></div>
   </div>

   {error||!data?<div className="notice error"><b>Unable to load Dashboard:</b> {error||"Unknown dashboard error"}</div>:<>
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

    <section className="erp-table-panel st-dashboard-panel st-dashboard-chart-panel st-dashboard-combo-panel">
     <div className="erp-panel-head"><div><b>Surface + Qty by Main Planning / Immediate Operation / ST Only</b><small>Current ST position from RAW NextOperation: Main Planning + ST-only Bridge Immediate + ST_SCOPE_ONLY. Column = dm² · Line = pcs.</small></div></div>
     <div className="st-dashboard-combo-legend"><span><i className="surface"></i>Surface dm² · left axis max 50,000</span><span><i className="qty"></i>Qty pcs · right axis max 10,000</span></div>
     <SurfaceQtyComboChart rows={data.immediateRows} total={data.chartTotal}/>
    </section>

    <AuditJobTable rows={data.auditJobs}/>

    <section className="st-dashboard-kpis">
     <article className="st-dashboard-kpi total"><small>ST TOTAL · SURFACE WORKLOAD</small>{metricLines(data.total)}</article>
     {STATUS_ORDER.map(status=><article key={status} className={`st-dashboard-kpi ${STATUS_CLASS[status]}`}><small>{STATUS_LABEL[status]}</small>{metricLines(data.statuses[status])}</article>)}
    </section>
    <div className="st-dashboard-note">V417 chart 2 chạy 2 lớp theo đúng thứ tự: <b>LastOperation → RAW NextOperation → Current Main</b> trước; sau đó mới lọc RAW NextOperation theo active ST Scope gồm <code>PLANNING_OPERATION</code> + <code>INTERMEDIATE</code> + <code>ST_SCOPE_ONLY</code>. INTERMEDIATE vẫn phải khớp Active Bridge đã resolve; ST_SCOPE_ONLY chỉ hiển thị chart/audit và không tham gia Planning Chain/Batch/Schedule.</div>

    <section className="st-dashboard-area-workloads">
     <div className="erp-panel-head st-dashboard-area-summary-head"><div><b>Main Planning Workload Summary · By Area</b><small>Each Area has its own KPI cards and its own Main Planning → Recipe workload table. All table rows stay visible without vertical scrolling.</small></div><span>{fmt(data.areas.length,0)} Areas · {fmt(data.mainRows.length,0)} Main Operations</span></div>
     {data.areas.map(area=><AreaWorkloadTable key={`${area.areaId}-${area.areaName}`} area={area}/>)}
    </section>

    <PriorityTable title="CAT3" rows={data.cat3} tone="cat3"/>
    <PriorityTable title="CAT5" rows={data.cat5} tone="cat5"/>
   </>}
  </section>
 </main>;
}
