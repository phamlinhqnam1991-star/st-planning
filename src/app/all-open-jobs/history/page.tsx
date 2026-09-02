import Link from "next/link";
import {AppTabs} from "@/components/app-tabs";
import {getPool} from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page({
 searchParams
}:{searchParams:Promise<{q?:string;type?:string;p?:string}>}){
 const sp=await searchParams;
 const q=(sp.q||"").trim();
 const type=(sp.type||"ALL").toUpperCase();
 const page=Math.max(1,Number(sp.p)||1);
 const size=100;
 const offset=(page-1)*size;

 const c=await getPool().connect();
 try{
   const conditions:string[]=[];
   const args:any[]=[];

   if(["NEW","CHANGED","CLOSED"].includes(type)){
     args.push(type);
     conditions.push(`change_type=$${args.length}`);
   }
   if(q){
     args.push(`%${q}%`);
     const n=args.length;
     conditions.push(`(job_num ilike $${n} or coalesce(part_num,'') ilike $${n})`);
   }
   const where=conditions.length?`where ${conditions.join(" and ")}`:"";

   const [rowsQ,countQ]=await Promise.all([
     c.query(`
       select id,job_num,change_type,part_num,revision_num,
              prod_qty,current_good_wip_qty,last_labor_qty,
              last_operation,next_operation,total_surface,is_open,created_at
       from open_job_history
       ${where}
       order by created_at desc,id desc
       limit ${size} offset ${offset}
     `,args),
     c.query(`select count(*)::int n from open_job_history ${where}`,args)
   ]);

   const total=Number(countQ.rows[0]?.n||0);
   const pages=Math.max(1,Math.ceil(total/size));

   return <main className="erp-shell erpkit-migrated-page">
    <header className="erp-header">
     <div><h1>ST Planning</h1></div>
     <div className="erp-env">JOB HISTORY</div>
    </header>

    <AppTabs active="jobs"/>

    <section className="erp-content erp-content-full">
     <div className="erp-page-head">
      <div><h2>All Open Job Change History</h2><p>Chỉ lưu các thay đổi NEW / CHANGED / CLOSED.</p></div>
      <Link className="btn" href="/all-open-jobs">← Current Jobs</Link>
     </div>

     <form className="erp-form-panel open-job-history-filter">
      <select className="input" name="type" defaultValue={type}>
       <option value="ALL">All Changes</option>
       <option value="NEW">NEW</option>
       <option value="CHANGED">CHANGED</option>
       <option value="CLOSED">CLOSED</option>
      </select>
      <input className="input" name="q" defaultValue={q} placeholder="JobNum / Part..."/>
      <button className="btn primary">Filter</button>
     </form>

     <div className="erp-table-panel section">
      <div className="erp-panel-head"><b>Change History</b><span>{total.toLocaleString()} records</span></div>
      <div className="table-wrap">
       <table className="erp-table">
        <thead>
         <tr>
          <th>Time</th><th>Change</th><th>Job</th><th>Part</th><th>Rev</th>
          <th className="num">Prod Qty</th><th className="num">WIP Qty</th>
          <th>Last Operation</th><th>Next Operation</th><th className="num">Surface</th><th></th>
         </tr>
        </thead>
        <tbody>
         {rowsQ.rows.map((r:any)=>
          <tr key={r.id}>
           <td>{new Date(r.created_at).toLocaleString("vi-VN")}</td>
           <td><span className={`job-state state-${String(r.change_type).toLowerCase()}`}>{r.change_type}</span></td>
           <td><b>{r.job_num}</b></td>
           <td>{r.part_num||"—"}</td>
           <td>{r.revision_num||"—"}</td>
           <td className="num">{r.prod_qty??"—"}</td>
           <td className="num">{r.current_good_wip_qty??"—"}</td>
           <td>{r.last_operation||"—"}</td>
           <td>{r.next_operation||"—"}</td>
           <td className="num">{r.total_surface??"—"}</td>
           <td><Link className="erp-link" href={`/all-open-jobs/${encodeURIComponent(r.job_num)}`}>Mở</Link></td>
          </tr>
         )}
        </tbody>
       </table>
      </div>
     </div>

     <div className="row pager">
      <Link className="btn" href={`?type=${type}&q=${encodeURIComponent(q)}&p=${Math.max(1,page-1)}`}>← Trước</Link>
      <span className="muted">Trang {page} / {pages}</span>
      <Link className="btn" href={`?type=${type}&q=${encodeURIComponent(q)}&p=${Math.min(pages,page+1)}`}>Sau →</Link>
     </div>
    </section>
   </main>
 }finally{c.release()}
}
