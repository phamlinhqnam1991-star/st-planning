import {ErpAppHeader} from "@/components/erp/erp-app-header";
import Link from "next/link";
import {notFound} from "next/navigation";
import {AppTabs} from "@/components/app-tabs";
import {getPool} from "@/lib/db";

export const dynamic="force-dynamic";

const V=(v:unknown)=>{
 if(v==null||v==="")return "—";
 if(typeof v==="object")return JSON.stringify(v);
 return String(v);
};

export default async function Page({
 params
}:{params:Promise<{job:string}>}){
 const {job}=await params;
 const jobNum=decodeURIComponent(job);

 const c=await getPool().connect();
 try{
   const [currentQ,historyQ]=await Promise.all([
     c.query(`select * from open_job_current where job_num=$1`,[jobNum]),
     c.query(`
       select id,change_type,part_num,revision_num,prod_qty,current_good_wip_qty,
              last_labor_qty,last_operation,next_operation,total_surface,is_open,created_at
       from open_job_history
       where job_num=$1
       order by created_at desc
       limit 50
     `,[jobNum])
   ]);

   if(!currentQ.rowCount)notFound();

   const r=currentQ.rows[0];
   const source=(r.source_data||{}) as Record<string,unknown>;
   const sourceEntries=Object.entries(source);

   return <main className="erp-shell erpkit-migrated-page">
    <ErpAppHeader module="JOB DETAIL"/>

    <AppTabs active="jobs"/>

    <section className="erp-content erp-content-full">
     <div className="erp-page-head">
      <div>
       <h2>Job {r.job_num}</h2>
       <p>{r.part_num||"—"} · Rev {r.revision_num||"—"} · {r.program||"—"}</p>
      </div>
      <Link className="btn" href="/all-open-jobs">← All Open Jobs</Link>
     </div>

     <div className="erp-object-hero">
      <div className="erp-object-identity"><small>OPEN JOB</small><strong>{r.job_num}</strong><span>{r.part_num||"—"} · Rev {r.revision_num||"—"} · {r.program||"—"}</span></div>
      <div className="erp-object-facts"><div><small>Last Operation</small><b>{r.last_operation||"—"}</b></div><div><small>Next Operation</small><b>{r.next_operation||"—"}</b></div><div><small>Qty</small><b>{r.prod_qty??"—"}</b></div><div><small>Priority</small><b>{r.priority_type||"—"}</b></div></div>
     </div>

     <div className="erp-table-panel">
      <div className="erp-panel-head">
       <b>Thông tin Job</b>
       <span className={`job-state state-${String(r.last_import_status).toLowerCase()}`}>{r.last_import_status}</span>
      </div>
      <div className="job-detail-grid">
       <KV k="JobNum" v={r.job_num}/>
       <KV k="Part" v={r.part_num}/>
       <KV k="Revision" v={r.revision_num}/>
       <KV k="Program" v={r.program}/>
       <KV k="Part Cluster" v={r.part_cluster}/>
       <KV k="Prod Qty" v={r.prod_qty}/>
       <KV k="Current Good WIP Qty" v={r.current_good_wip_qty}/>
       <KV k="Last Labor Qty" v={r.last_labor_qty}/>
       <KV k="Last Operation" v={r.last_operation}/>
       <KV k="Next Operation" v={r.next_operation}/>
       <KV k="Total Surface" v={r.total_surface}/>
       <KV k="Surface / Part dm²" v={r.surface_per_part_dm2}/>
       <KV k="ST" v={r.st}/>
       <KV k="ST WIP Area" v={r.st_wip_area}/>
       <KV k="WIP Sequence" v={r.wip_sequence}/>
       <KV k="Open DMR" v={r.open_dmr}/>
       <KV k="Priority Type" v={r.priority_type}/>
       <KV k="Last Seen" v={r.last_seen_at?new Date(r.last_seen_at).toLocaleString("vi-VN"):"—"}/>
      </div>
     </div>

     <div className="erp-table-panel section">
      <div className="erp-panel-head"><b>Operation Chain</b><span>AllOperation</span></div>
      <div className="job-operation-chain">{r.all_operation||"—"}</div>
     </div>

     <div className="erp-table-panel section">
      <div className="erp-panel-head">
       <b>Dữ liệu nguồn</b>
       <span>{sourceEntries.length} cột</span>
      </div>
      <div className="table-wrap">
       <table className="erp-table">
        <thead><tr><th>Cột</th><th>Giá trị</th></tr></thead>
        <tbody>
         {sourceEntries.map(([k,v])=>
          <tr key={k}><td><b>{k}</b></td><td className="job-source-value">{V(v)}</td></tr>
         )}
        </tbody>
       </table>
      </div>
     </div>

     <div className="erp-table-panel section">
      <div className="erp-panel-head"><b>Lịch sử thay đổi Job</b><span>{historyQ.rows.length} thay đổi</span></div>
      <div className="table-wrap">
       <table className="erp-table">
        <thead>
         <tr>
          <th>Time</th><th>Change</th><th>Prod Qty</th><th>WIP Qty</th>
          <th>Last Qty</th><th>Last Operation</th><th>Next Operation</th><th>Total Surface</th>
         </tr>
        </thead>
        <tbody>
         {historyQ.rows.map((h:any)=>
          <tr key={h.id}>
           <td>{new Date(h.created_at).toLocaleString("vi-VN")}</td>
           <td><span className={`job-state state-${String(h.change_type).toLowerCase()}`}>{h.change_type}</span></td>
           <td className="num">{h.prod_qty??"—"}</td>
           <td className="num">{h.current_good_wip_qty??"—"}</td>
           <td className="num">{h.last_labor_qty??"—"}</td>
           <td>{h.last_operation||"—"}</td>
           <td>{h.next_operation||"—"}</td>
           <td className="num">{h.total_surface??"—"}</td>
          </tr>
         )}
        </tbody>
       </table>
      </div>
     </div>
    </section>
   </main>
 }finally{c.release()}
}

function KV({k,v}:{k:string;v:unknown}){
 return <div className="job-kv"><span>{k}</span><b>{V(v)}</b></div>
}
