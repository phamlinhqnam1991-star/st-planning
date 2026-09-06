import Link from "next/link";
import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs,SubTabs} from "@/components/app-tabs";
import {getPool} from "@/lib/db";
import {
 AUDIT_REASON_LABELS,
 loadOpenJobBoardAudit,
 type OpenJobBoardAuditFilters,
 type OpenJobBoardAuditReason,
} from "@/lib/planning/all-open-job-board-audit";

export const dynamic="force-dynamic";

type SearchParams={
 board?:string;job?:string;part?:string;revision?:string;program?:string;
 next?:string;last?:string;main?:string;pstatus?:string;chain?:string;qtyMin?:string;qtyMax?:string;surfaceMin?:string;surfaceMax?:string;import?:string;reason?:string;p?:string;
};

function auditUrl(sp:SearchParams,patch:Record<string,string|number|undefined>={}){
 const q=new URLSearchParams();
 const merged:{[k:string]:any}={...sp,...patch};
 for(const [k,v] of Object.entries(merged)){
  const value=String(v??"").trim();
  if(value&&!(k==="p"&&value==="1"))q.set(k,value);
 }
 const s=q.toString();
 return `/all-open-jobs/audit${s?`?${s}`:""}`;
}

export default async function Page({searchParams}:{searchParams:Promise<SearchParams>}){
 const sp=await searchParams;
 const filters:OpenJobBoardAuditFilters={
  board:sp.board,job:sp.job,part:sp.part,revision:sp.revision,program:sp.program,
  nextOperation:sp.next,lastOperation:sp.last,mainOperation:sp.main,
  planningStatus:sp.pstatus,chainRows:sp.chain,qtyMin:sp.qtyMin,qtyMax:sp.qtyMax,
  surfaceMin:sp.surfaceMin,surfaceMax:sp.surfaceMax,importStatus:sp.import,reason:sp.reason,
 };
 const requestedPage=Math.max(1,Number(sp.p)||1);
 const c=await getPool().connect();
 try{
  const data=await loadOpenJobBoardAudit(c,filters,requestedPage,100);
  const summary=data.summary as any;
  const currentSp={...sp,p:String(data.page)};
  return <main className="erp-shell erpkit-migrated-page">
   <ErpAppHeader module="ALL OPEN JOBS"/>
   <AppTabs active="jobs"/>
   <section className="erp-content erp-content-full">
    <div className="erp-page-head">
     <div>
      <h2>Cross Check / Audit Missing</h2>
      <p>Đối chiếu từng dòng Open Job với population thực tế của Planning Board và giải thích các dòng không xuất hiện.</p>
     </div>
    </div>

    <SubTabs active="audit" items={[
     {key:"current",label:"Current Jobs",href:"/all-open-jobs"},
     {key:"audit",label:"Cross Check / Audit Missing",href:"/all-open-jobs/audit"},
     {key:"history",label:"Change History",href:"/all-open-jobs/history"},
    ]}/>

    <div className="notice section">
     Audit lấy <b>toàn bộ dòng <code>is_open=true</code> trong All Open Job</b> làm nguồn gốc. <b>Planning Board = YES</b> khi RAW <code>NextOperation</code> thuộc canonical Planning Board scope và Job có live Planning Chain. Các filter/view cá nhân trên Planning Board có thể tiếp tục ẩn một Job dù audit nền là YES.
    </div>

    <div className="open-job-audit-kpis section">
     <div><span>Open Job rows</span><b>{Number(summary.total_open||0).toLocaleString("vi-VN")}</b></div>
     <div className="audit-yes"><span>Planning Board · YES</span><b>{Number(summary.planning_yes||0).toLocaleString("vi-VN")}</b></div>
     <div className="audit-no"><span>Planning Board · NO</span><b>{Number(summary.planning_no||0).toLocaleString("vi-VN")}</b></div>
     <div><span>ST_SCOPE_ONLY</span><b>{Number(summary.st_scope_only||0).toLocaleString("vi-VN")}</b></div>
     <div><span>ST config / chain issue</span><b>{Number(summary.st_config_or_chain_issue||0).toLocaleString("vi-VN")}</b></div>
    </div>

    <div className="open-job-audit-reasons section">
     <Link className={`missing-chip ${!sp.board&&!sp.reason?"active":""}`} href="/all-open-jobs/audit"><b>{Number(summary.total_open||0).toLocaleString("vi-VN")}</b> Tất cả</Link>
     <Link className={`missing-chip audit-yes-chip ${String(sp.board||"").toUpperCase()==="YES"?"active":""}`} href={auditUrl(sp,{board:"YES",reason:"",p:1})}><b>{Number(summary.planning_yes||0).toLocaleString("vi-VN")}</b> Planning Board YES</Link>
     <Link className={`missing-chip audit-no-chip ${String(sp.board||"").toUpperCase()==="NO"&&!sp.reason?"active":""}`} href={auditUrl(sp,{board:"NO",reason:"",p:1})}><b>{Number(summary.planning_no||0).toLocaleString("vi-VN")}</b> Planning Board NO</Link>
     {data.reasons.map((r:OpenJobBoardAuditReason)=><Link key={r.reason_code} className={`missing-chip ${sp.reason===r.reason_code?"active":""}`} href={auditUrl(sp,{board:"NO",reason:r.reason_code,p:1})}><b>{r.n.toLocaleString("vi-VN")}</b> {r.reason}</Link>)}
    </div>

    <form method="get" className="erp-table-panel section open-job-audit-panel">
     <div className="erp-panel-head">
      <div><b>All Open Job ↔ Planning Board Audit</b><small className="planning-sub">{data.total.toLocaleString("vi-VN")} dòng sau lọc · trang {data.page}/{data.pages}</small></div>
      <div className="row">
       <button className="btn primary" type="submit">Áp dụng lọc</button>
       <Link className="btn" href="/all-open-jobs/audit">Xóa lọc</Link>
      </div>
     </div>
     <input type="hidden" name="p" value="1"/>
     <div className="table-wrap">
      <table className="erp-table open-job-audit-table">
       <thead>
        <tr>
         <th>Planning Board</th><th>Job</th><th>Part</th><th>Rev</th><th>Program</th>
         <th>Next Operation</th><th>Last Operation</th><th>Current Main</th><th>Board Status</th>
         <th className="num">Chain</th><th className="num">WIP Qty</th><th className="num">Surface dm²</th>
         <th>Import</th><th>Lý do</th><th className="action"></th>
        </tr>
        <tr className="audit-filter-row">
         <th><select className="input" name="board" defaultValue={sp.board||""}><option value="">All</option><option value="YES">YES</option><option value="NO">NO</option></select></th>
         <th><input className="input" name="job" defaultValue={sp.job||""} placeholder="Job..."/></th>
         <th><input className="input" name="part" defaultValue={sp.part||""} placeholder="Part..."/></th>
         <th><input className="input" name="revision" defaultValue={sp.revision||""} placeholder="Rev..."/></th>
         <th><input className="input" name="program" defaultValue={sp.program||""} placeholder="Program..."/></th>
         <th><input className="input" name="next" defaultValue={sp.next||""} placeholder="Next Op..."/></th>
         <th><input className="input" name="last" defaultValue={sp.last||""} placeholder="Last Op..."/></th>
         <th><input className="input" name="main" defaultValue={sp.main||""} placeholder="Main..."/></th>
         <th><select className="input" name="pstatus" defaultValue={sp.pstatus||""}><option value="">All</option><option value="ELIGIBLE">ELIGIBLE</option><option value="LOCKED">LOCKED</option><option value="PLANNED">PLANNED</option><option value="HOLD">HOLD</option></select></th>
         <th><input className="input" name="chain" type="number" min="0" defaultValue={sp.chain||""} placeholder="= n"/></th>
         <th><div className="audit-range-filter"><input className="input" name="qtyMin" type="number" defaultValue={sp.qtyMin||""} placeholder="Min"/><input className="input" name="qtyMax" type="number" defaultValue={sp.qtyMax||""} placeholder="Max"/></div></th>
         <th><div className="audit-range-filter"><input className="input" name="surfaceMin" type="number" step="any" defaultValue={sp.surfaceMin||""} placeholder="Min"/><input className="input" name="surfaceMax" type="number" step="any" defaultValue={sp.surfaceMax||""} placeholder="Max"/></div></th>
         <th><select className="input" name="import" defaultValue={sp.import||""}><option value="">All</option><option value="NEW">NEW</option><option value="CHANGED">CHANGED</option><option value="UNCHANGED">UNCHANGED</option></select></th>
         <th><select className="input audit-reason-filter" name="reason" defaultValue={sp.reason||""}><option value="">All reasons</option>{Object.entries(AUDIT_REASON_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></th>
         <th></th>
        </tr>
       </thead>
       <tbody>
        {data.rows.map(r=><tr key={r.job_num} className={r.planning_board?"audit-row-yes":"audit-row-no"}>
         <td><span className={`audit-board-flag ${r.planning_board?"yes":"no"}`}>{r.planning_board?"YES":"NO"}</span></td>
         <td><b>{r.job_num}</b></td>
         <td>{r.part_num||"—"}</td>
         <td>{r.revision_num||"—"}</td>
         <td>{r.program||"—"}</td>
         <td><b>{r.next_operation||"—"}</b></td>
         <td>{r.last_operation||"—"}</td>
         <td>{r.current_main_operation||r.mapped_main_operation||"—"}</td>
         <td>{r.planning_status||"—"}</td>
         <td className="num mono">{r.chain_rows}</td>
         <td className="num mono">{Number(r.current_good_wip_qty??r.prod_qty??0).toLocaleString("vi-VN")}</td>
         <td className="num mono">{Number(r.total_surface||0).toLocaleString("vi-VN",{maximumFractionDigits:2})}</td>
         <td><span className={`job-state state-${String(r.last_import_status||"").toLowerCase()}`}>{r.last_import_status||"—"}</span></td>
         <td><span className={`audit-reason ${r.planning_board?"ok":"miss"}`}>{r.reason}</span></td>
         <td className="action"><Link className="erp-link" href={`/all-open-jobs/${encodeURIComponent(r.job_num)}`}>Mở</Link></td>
        </tr>)}
        {!data.rows.length?<tr><td colSpan={15} className="muted">Không có dòng phù hợp với bộ lọc.</td></tr>:null}
       </tbody>
      </table>
     </div>
    </form>

    <div className="row pager">
     <Link className={`btn ${data.page<=1?"disabled":""}`} aria-disabled={data.page<=1} href={auditUrl(currentSp,{p:Math.max(1,data.page-1)})}>← Trước</Link>
     <span className="muted">Trang {data.page} / {data.pages} · {data.total.toLocaleString("vi-VN")} dòng</span>
     <Link className={`btn ${data.page>=data.pages?"disabled":""}`} aria-disabled={data.page>=data.pages} href={auditUrl(currentSp,{p:Math.min(data.pages,data.page+1)})}>Sau →</Link>
    </div>
   </section>
  </main>;
 }finally{c.release();}
}
