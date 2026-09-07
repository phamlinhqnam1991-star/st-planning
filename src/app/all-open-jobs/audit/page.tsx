import Link from "next/link";
import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs,SubTabs} from "@/components/app-tabs";
import {AuditMultiSelect,type AuditMultiSelectOption} from "@/components/audit-multi-select";
import {getPool} from "@/lib/db";
import {
 AUDIT_REASON_LABELS,
 loadOpenJobBoardAudit,
 type OpenJobBoardAuditFilters,
 type OpenJobBoardAuditReason,
} from "@/lib/planning/all-open-job-board-audit";

export const dynamic="force-dynamic";

type SearchValue=string|string[]|undefined;
type SearchParams={
 board?:SearchValue;job?:SearchValue;part?:SearchValue;revision?:SearchValue;program?:SearchValue;
 next?:SearchValue;last?:SearchValue;main?:SearchValue;pstatus?:SearchValue;chain?:SearchValue;
 qty?:SearchValue;surface?:SearchValue;import?:SearchValue;reason?:SearchValue;p?:string;
};

const EMPTY_FILTER_VALUE="__EMPTY__";

function asArray(value:SearchValue){
 return Array.isArray(value)?value.filter(Boolean):String(value||"").trim()?[String(value).trim()]:[];
}

function hasValue(value:SearchValue,target:string){
 return asArray(value).some(v=>v.toUpperCase()===target.toUpperCase());
}

function auditUrl(sp:SearchParams,patch:Record<string,string|number|string[]|undefined>={}){
 const q=new URLSearchParams();
 const merged:{[k:string]:string|number|string[]|undefined}={...sp,...patch};
 for(const [k,v] of Object.entries(merged)){
  const values=Array.isArray(v)?v:[v];
  for(const raw of values){
   const value=String(raw??"").trim();
   if(value&&!(k==="p"&&value==="1"))q.append(k,value);
  }
 }
 const query=q.toString();
 return `/all-open-jobs/audit${query?`?${query}`:""}`;
}

function optionList(values:string[],labeler?:(value:string)=>string):AuditMultiSelectOption[]{
 return values.map(value=>({
  value,
  label:value===EMPTY_FILTER_VALUE?"(Trống)":labeler?labeler(value):value,
 }));
}

export default async function Page({searchParams}:{searchParams:Promise<SearchParams>}){
 const sp=await searchParams;
 const filters:OpenJobBoardAuditFilters={
  board:sp.board,job:sp.job,part:sp.part,revision:sp.revision,program:sp.program,
  nextOperation:sp.next,lastOperation:sp.last,mainOperation:sp.main,
  planningStatus:sp.pstatus,chainRows:sp.chain,wipQty:sp.qty,surface:sp.surface,
  importStatus:sp.import,reason:sp.reason,
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
     <Link className={`missing-chip ${asArray(sp.board).length===0&&asArray(sp.reason).length===0?"active":""}`} href="/all-open-jobs/audit"><b>{Number(summary.total_open||0).toLocaleString("vi-VN")}</b> Tất cả</Link>
     <Link className={`missing-chip audit-yes-chip ${hasValue(sp.board,"YES")?"active":""}`} href={auditUrl(sp,{board:"YES",reason:"",p:1})}><b>{Number(summary.planning_yes||0).toLocaleString("vi-VN")}</b> Planning Board YES</Link>
     <Link className={`missing-chip audit-no-chip ${hasValue(sp.board,"NO")&&asArray(sp.reason).length===0?"active":""}`} href={auditUrl(sp,{board:"NO",reason:"",p:1})}><b>{Number(summary.planning_no||0).toLocaleString("vi-VN")}</b> Planning Board NO</Link>
     {data.reasons.map((r:OpenJobBoardAuditReason)=><Link key={r.reason_code} className={`missing-chip ${hasValue(sp.reason,r.reason_code)?"active":""}`} href={auditUrl(sp,{board:"NO",reason:r.reason_code,p:1})}><b>{r.n.toLocaleString("vi-VN")}</b> {r.reason}</Link>)}
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
         <th><AuditMultiSelect name="board" options={optionList(data.filterOptions.board)} selected={asArray(sp.board)} placeholder="All" searchPlaceholder="Planning Board..." minWidth={105}/></th>
         <th><AuditMultiSelect name="job" options={optionList(data.filterOptions.job)} selected={asArray(sp.job)} placeholder="All Jobs" searchPlaceholder="Tìm Job..." minWidth={120}/></th>
         <th><AuditMultiSelect name="part" options={optionList(data.filterOptions.part)} selected={asArray(sp.part)} placeholder="All Parts" searchPlaceholder="Tìm Part..." minWidth={125}/></th>
         <th><AuditMultiSelect name="revision" options={optionList(data.filterOptions.revision)} selected={asArray(sp.revision)} placeholder="All Rev" searchPlaceholder="Tìm Rev..." minWidth={95}/></th>
         <th><AuditMultiSelect name="program" options={optionList(data.filterOptions.program)} selected={asArray(sp.program)} placeholder="All Program" searchPlaceholder="Tìm Program..." minWidth={120}/></th>
         <th><AuditMultiSelect name="next" options={optionList(data.filterOptions.nextOperation)} selected={asArray(sp.next)} placeholder="All Next Op" searchPlaceholder="Tìm Next Op..." minWidth={125}/></th>
         <th><AuditMultiSelect name="last" options={optionList(data.filterOptions.lastOperation)} selected={asArray(sp.last)} placeholder="All Last Op" searchPlaceholder="Tìm Last Op..." minWidth={125}/></th>
         <th><AuditMultiSelect name="main" options={optionList(data.filterOptions.mainOperation)} selected={asArray(sp.main)} placeholder="All Main" searchPlaceholder="Tìm Main..." minWidth={125}/></th>
         <th><AuditMultiSelect name="pstatus" options={optionList(data.filterOptions.planningStatus)} selected={asArray(sp.pstatus)} placeholder="All Status" searchPlaceholder="Tìm Status..." minWidth={115}/></th>
         <th><AuditMultiSelect name="chain" options={optionList(data.filterOptions.chainRows)} selected={asArray(sp.chain)} placeholder="All" searchPlaceholder="Chain..." minWidth={80}/></th>
         <th><AuditMultiSelect name="qty" options={optionList(data.filterOptions.wipQty,value=>Number(value).toLocaleString("vi-VN"))} selected={asArray(sp.qty)} placeholder="All Qty" searchPlaceholder="Tìm Qty..." minWidth={105}/></th>
         <th><AuditMultiSelect name="surface" options={optionList(data.filterOptions.surface,value=>Number(value).toLocaleString("vi-VN",{maximumFractionDigits:2}))} selected={asArray(sp.surface)} placeholder="All Surface" searchPlaceholder="Tìm Surface..." minWidth={120}/></th>
         <th><AuditMultiSelect name="import" options={optionList(data.filterOptions.importStatus)} selected={asArray(sp.import)} placeholder="All Import" searchPlaceholder="Tìm Import..." minWidth={110}/></th>
         <th><AuditMultiSelect name="reason" options={optionList(data.filterOptions.reason,value=>AUDIT_REASON_LABELS[value]||value)} selected={asArray(sp.reason)} placeholder="All reasons" searchPlaceholder="Tìm lý do..." minWidth={250}/></th>
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
