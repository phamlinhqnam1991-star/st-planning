import Link from "next/link";
import {AppTabs} from "@/components/app-tabs";
import {BatchRowActions} from "@/components/batch-row-actions";
import {PlanningViewTabs} from "@/components/planning-view-tabs";
import {ResetAllBatchesButton} from "@/components/reset-all-batches-button";
import {getPool} from "@/lib/db";
import {getRecentPlanningBatches} from "@/lib/planning/recent-batches";

export const dynamic="force-dynamic";

const formatNumber=(value:unknown,maxDecimals=2)=>{
 const n=Number(value??0);
 if(!Number.isFinite(n))return "0";
 const fixed=n.toFixed(maxDecimals);
 let [whole,decimal]=fixed.split(".");
 whole=whole.replace(/\B(?=(\d{3})+(?!\d))/g,".");
 decimal=(decimal||"").replace(/0+$/g,"");
 return decimal?`${whole},${decimal}`:whole;
};

const hhmm=(minutes:number|null)=>{
 if(minutes==null)return "—";
 const h=Math.floor(minutes/60);
 const m=minutes%60;
 return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
};

export default async function Page(){
 const c=await getPool().connect();

 try{
  const batchesQ=await getRecentPlanningBatches(c,100);

  return <main className="erp-shell">
   <header className="erp-header">
    <div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div>
    <div className="erp-env">PLANNING BATCHES</div>
   </header>

   <AppTabs active="planning"/>

   <section className="erp-content erp-content-full planning-page planning-batches-page">
    <div className="erp-page-head">
     <div>
      <h2>Planning Board</h2>
      <p>Quản lý các Planning Batch gần nhất và mở chi tiết Job trong từng lô</p>
     </div>
    </div>

    <PlanningViewTabs active="batches"/>

    <div className="erp-table-panel section planning-batches-list">
     <div className="erp-panel-head">
      <b>Recent Planning Batches</b>
      <div className="batch-panel-tools">
       <span>{batchesQ.rows.length} latest batches</span>
       <ResetAllBatchesButton/>
      </div>
     </div>

     <div className="table-wrap">
      <table className="erp-table planning-batch-table">
       <thead>
        <tr>
         <th>Batch</th><th>Date</th><th>Area</th><th>Operation</th>
         <th>Recipe</th><th className="num">Jobs</th><th className="num">Qty</th>
         <th className="num">Surface</th><th>Process</th>
         <th>Start</th><th>End</th><th>Status</th><th></th>
        </tr>
       </thead>
       <tbody>
        {batchesQ.rows.map((b:any)=><tr key={b.id}>
         <td><b>{b.batch_no||"—"}</b></td>
         <td>{String(b.planning_date).slice(0,10)}</td>
         <td>{b.area_name||"—"}</td>
         <td>{b.standard_operation}</td>
         <td>{b.recipe_no?<><b>{b.recipe_no}</b><small className="planning-sub">{b.recipe_name||"—"}</small></>:"—"}</td>
         <td className="num">{b.total_jobs}</td>
         <td className="num">{formatNumber(b.total_qty)}</td>
         <td className="num">{formatNumber(b.total_surface_dm2)}</td>
         <td className="mono">{hhmm(b.process_minutes)}</td>
         <td>{b.planned_start?new Date(b.planned_start).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"}):"—"}</td>
         <td>{b.planned_end?new Date(b.planned_end).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"}):"—"}</td>
         <td><span className="job-state state-new">{b.status}</span></td>
         <td>
          <div className="batch-list-actions">
           <Link className="erp-link" href={`/planning/batches/${b.id}`}>View →</Link>
           <BatchRowActions
            batchId={Number(b.id)}
            batchNo={b.batch_no||"—"}
            currentRecipeKey={b.recipe_key||null}
           />
          </div>
         </td>
        </tr>)}
        {!batchesQ.rows.length&&<tr>
         <td colSpan={13} className="muted">Chưa có Planning Batch.</td>
        </tr>}
       </tbody>
      </table>
     </div>
    </div>
   </section>
  </main>;
 }finally{
  c.release();
 }
}
