import Link from "next/link";
import {AppTabs} from "@/components/app-tabs";
import {OpenJobImporter} from "@/components/open-job-importer";
import {getPool} from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page({
 searchParams
}:{
 searchParams:Promise<{q?:string;status?:string;p?:string;all?:string}>
}){
 const sp=await searchParams;
 const q=(sp.q||"").trim();
 const status=(sp.status||"OPEN").toUpperCase();
 const page=Math.max(1,Number(sp.p)||1);
 const all=(sp.all||"")==="1";
 const size=50;
 const offset=(page-1)*size;

 const c=await getPool().connect();
 try{
   // Canonical ST filter: All Open Jobs in this ST application are selected
   // ONLY by md_st_operation_scope. ST Mapping is NOT the visibility filter.
   const conditions:string[]=[`exists(
     select 1 from md_st_operation_scope scope
     where scope.is_active=true
       and upper(trim(scope.operation_code))=upper(trim(open_job_current.next_operation))
   )`];
   const args:any[]=[];

   if(status==="OPEN")conditions.push("is_open=true");
   if(status==="CLOSED")conditions.push("is_open=false");
   if(["NEW","CHANGED","UNCHANGED"].includes(status)){
     conditions.push("is_open=true");
     args.push(status);
     conditions.push(`last_import_status=$${args.length}`);
   }

   if(q){
     args.push(`%${q}%`);
     const n=args.length;
     conditions.push(`(
       job_num ilike $${n}
       or coalesce(part_num,'') ilike $${n}
       or coalesce(last_operation,'') ilike $${n}
       or coalesce(next_operation,'') ilike $${n}
       or coalesce(program,'') ilike $${n}
     )`);
   }

   const where=conditions.length?`where ${conditions.join(" and ")}`:"";

   const [statsQ,rowsQ,countQ,importsQ]=await Promise.all([
     c.query(`
       select
         count(*) filter(where is_open) open_jobs,
         count(*) filter(where not is_open) closed_jobs,
         count(*) filter(where is_open and last_import_status='NEW') new_jobs,
         count(*) filter(where is_open and last_import_status='CHANGED') changed_jobs,
         count(*) filter(where is_open and last_import_status='UNCHANGED') unchanged_jobs
       from open_job_current
       where exists(
        select 1 from md_st_operation_scope scope
        where scope.is_active=true
          and upper(trim(scope.operation_code))=upper(trim(open_job_current.next_operation))
       )
     `),
     c.query(`
       select
         job_num,part_num,revision_num,program,part_cluster,
         prod_qty,current_good_wip_qty,last_labor_qty,
         last_operation,next_operation,total_surface,
         st,st_wip_area,wip_sequence,open_dmr,
         priority_type,last_import_status,is_open,last_seen_at,
         source_data
       from open_job_current
       ${where}
       order by
         case when last_import_status='NEW' then 0
              when last_import_status='CHANGED' then 1
              else 2 end,
         job_num
       limit ${size} offset ${offset}
     `,args),
     c.query(`select count(*)::int n from open_job_current ${where}`,args),
     c.query(`
       select id,file_name,status,source_rows,new_jobs,changed_jobs,
              unchanged_jobs,closed_jobs,created_at,finished_at,error_message
       from open_job_import_batch
       order by created_at desc
       limit 10
     `)
   ]);

   const stats=statsQ.rows[0]||{};
   const total=Number(countQ.rows[0]?.n||0);
   const pages=Math.max(1,Math.ceil(total/size));
   const rows=rowsQ.rows as any[];

   // Chế độ "Xem tất cả cột": union mọi key trong source_data của các Job
   // đang hiển thị (source_data giữ nguyên 140+ cột của file All Open Job).
   let allColumns:string[]=[];
   if(all){
    const seen=new Set<string>();
    for(const r of rows){
     const sd=r.source_data||{};
     for(const k of Object.keys(sd)){
      const key=String(k||"").trim();
      if(key&&!seen.has(key)){seen.add(key);allColumns.push(key);}
     }
    }
    allColumns.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
   }

   const cell=(r:any,col:string)=>{
    const v=r[col];
    if(v!=null&&v!=="")return v;
    const sv=r.source_data?.[col];
    return sv==null?"—":sv;
   };

   const statusTabs=[
     ["OPEN",`Open (${Number(stats.open_jobs||0).toLocaleString()})`],
     ["NEW",`New (${Number(stats.new_jobs||0).toLocaleString()})`],
     ["CHANGED",`Changed (${Number(stats.changed_jobs||0).toLocaleString()})`],
     ["UNCHANGED",`Unchanged (${Number(stats.unchanged_jobs||0).toLocaleString()})`],
     ["CLOSED",`Closed (${Number(stats.closed_jobs||0).toLocaleString()})`],
     ["ALL","All"]
   ];

   return <main className="erp-shell">
    <header className="erp-header">
     <div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div>
     <div className="erp-env">ALL OPEN JOBS</div>
    </header>

    <AppTabs active="jobs"/>

    <section className="erp-content erp-content-full">
     <div className="erp-page-head">
      <div>
       <h2>All Open Jobs</h2>
       <p>ST Scope Jobs · nguồn từ latest imported snapshot · lọc bằng ST Operation Scope</p>
      </div>
     </div>

     <OpenJobImporter/>

     <div className="notice section">
      <b>ST Scope filter:</b> Trang này chỉ hiển thị Job có <code>NextOperation</code> nằm trong <code>md_st_operation_scope</code> active.
      <code>ST_SCOPE_ONLY</code> vẫn được hiển thị tại đây nhưng không tham gia Planning Chain, Batch hoặc Board Điều Độ. Cấu hình tập trung tại <a href="/st-operation-flow">ST Operation Flow</a>.
     </div>

     <div className="open-job-status-tabs section">
      {statusTabs.map(([key,label])=>
       <Link
        key={key}
        className={`open-job-status-tab ${status===key?"active":""}`}
        href={`/all-open-jobs?status=${key}&q=${encodeURIComponent(q)}`}>
        {label}
       </Link>
      )}
     </div>

     <form className="erp-form-panel open-job-search" method="get">
      <input type="hidden" name="status" value={status}/>
      <input
       className="input"
       name="q"
       defaultValue={q}
       placeholder="JobNum / Part / Last Operation / Next Operation / Program..."
      />
      <button className="btn primary">Search</button>
      <Link className="btn" href="/all-open-jobs/history">Change History</Link>
      {all
       ? <Link className="btn" href={`/all-open-jobs?status=${status}&q=${encodeURIComponent(q)}`}>Xem gọn (12 cột)</Link>
       : <Link className="btn" href={`/all-open-jobs?status=${status}&q=${encodeURIComponent(q)}&all=1`}>Xem tất cả cột</Link>}
     </form>

     <div className="erp-table-panel section">
      <div className="erp-panel-head">
       <b>Current Jobs</b>
       <span>{total.toLocaleString()} records{all?` · ${allColumns.length+2} cột (cuộn ngang để xem hết)`:" · 12 cột"}</span>
      </div>

      <div className="table-wrap">
       {all ? (
        <table className="erp-table open-job-table open-job-all-columns">
         <thead>
          <tr>
           <th>Status</th>
           <th>Job</th>
           {allColumns.map(col=><th key={col}>{col}</th>)}
          </tr>
         </thead>
         <tbody>
          {rows.map((r:any)=>
           <tr key={r.job_num}>
            <td><span className={`job-state state-${String(r.last_import_status).toLowerCase()}`}>{r.last_import_status}</span></td>
            <td><b>{r.job_num}</b></td>
            {allColumns.map(col=>
             <td key={col} className="open-job-cell" title={String(cell(r,col)??"")}>{cell(r,col)}</td>
            )}
           </tr>
          )}
          {!rows.length&&
           <tr><td colSpan={2+allColumns.length} className="muted">Không có Job phù hợp.</td></tr>}
         </tbody>
        </table>
       ) : (
        <table className="erp-table open-job-table">
         <thead>
          <tr>
           <th>Status</th>
           <th>Job</th>
           <th>Part</th>
           <th>Rev</th>
           <th>Program</th>
           <th className="num">Prod Qty</th>
           <th className="num">WIP Qty</th>
           <th>Last Operation</th>
           <th>Next Operation</th>
           <th>ST Area</th>
           <th className="num">Total Surface</th>
           <th>Priority</th>
           <th></th>
          </tr>
         </thead>
         <tbody>
          {rows.map((r:any)=>
           <tr key={r.job_num}>
            <td><span className={`job-state state-${String(r.last_import_status).toLowerCase()}`}>{r.last_import_status}</span></td>
            <td><b>{r.job_num}</b></td>
            <td>{r.part_num||"—"}</td>
            <td>{r.revision_num||"—"}</td>
            <td>{r.program||"—"}</td>
            <td className="num mono">{r.prod_qty??"—"}</td>
            <td className="num mono">{r.current_good_wip_qty??"—"}</td>
            <td>{r.last_operation||"—"}</td>
            <td><b>{r.next_operation||"—"}</b></td>
            <td>{r.st_wip_area||r.st||"—"}</td>
            <td className="num mono">{r.total_surface??"—"}</td>
            <td>{r.priority_type||"—"}</td>
            <td className="action">
             <Link className="erp-link" href={`/all-open-jobs/${encodeURIComponent(r.job_num)}`}>Open →</Link>
            </td>
           </tr>
          )}
          {!rows.length&&
           <tr><td colSpan={13} className="muted">Không có Job phù hợp.</td></tr>}
         </tbody>
        </table>
       )}
      </div>
     </div>

     <div className="row pager">
      <Link className="btn" href={`?status=${status}&q=${encodeURIComponent(q)}&p=${Math.max(1,page-1)}`}>← Trước</Link>
      <span className="muted">Trang {page} / {pages}</span>
      <Link className="btn" href={`?status=${status}&q=${encodeURIComponent(q)}&p=${Math.min(pages,page+1)}`}>Sau →</Link>
     </div>

     <div className="erp-table-panel section">
      <div className="erp-panel-head">
       <b>Import History</b>
       <span>10 lần import gần nhất</span>
      </div>
      <div className="table-wrap">
       <table className="erp-table">
        <thead>
         <tr>
          <th>Time</th><th>File</th><th>Status</th><th className="num">Source</th>
          <th className="num">New</th><th className="num">Changed</th>
          <th className="num">Unchanged</th><th className="num">Closed</th>
         </tr>
        </thead>
        <tbody>
         {importsQ.rows.map((x:any)=>
          <tr key={x.id}>
           <td>{new Date(x.created_at).toLocaleString("vi-VN")}</td>
           <td>{x.file_name}</td>
           <td>{x.status}</td>
           <td className="num">{Number(x.source_rows||0).toLocaleString()}</td>
           <td className="num">{Number(x.new_jobs||0).toLocaleString()}</td>
           <td className="num">{Number(x.changed_jobs||0).toLocaleString()}</td>
           <td className="num">{Number(x.unchanged_jobs||0).toLocaleString()}</td>
           <td className="num">{Number(x.closed_jobs||0).toLocaleString()}</td>
          </tr>
         )}
         {!importsQ.rows.length&&
          <tr><td colSpan={8} className="muted">Chưa import All Open Job.</td></tr>}
        </tbody>
       </table>
      </div>
     </div>
    </section>
   </main>
 }finally{c.release()}
}
