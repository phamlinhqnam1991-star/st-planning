import Link from "next/link";
import {LogoutButton} from "@/components/logout-button";
import {ErpAppShell,ErpKpiCard,ErpPageHeader,ErpSection,ErpStatus} from "@/components/erp";
import {ST_ERP_MODULE_GROUPS} from "@/lib/erp/st-navigation";
import {getPool} from "@/lib/db";
import {loadStOutputReport,type StOutputSource} from "@/lib/planning/st-output-report";
import type {ErpStatusTone} from "@/lib/erp/status-config";

export const dynamic="force-dynamic";

const SOURCE_META:Record<StOutputSource,{label:string;short:string;tone:ErpStatusTone}>={
 CHEMMILL:{label:"CHEMMILL",short:"CHEM",tone:"info"},
 FINAL_ST_OPERATION:{label:"Công đoạn ST cuối",short:"FINAL",tone:"success"},
 FINSST_CFINM_VN:{label:"FINSST / CFINM-VN",short:"FINSST",tone:"purple"},
 INTERMEDIATE_NO_CHAIN:{label:"ST Final Steps",short:"FINAL STEPS",tone:"warning"},
};

const SOURCE_LABEL:Record<StOutputSource,string>=Object.fromEntries(
 Object.entries(SOURCE_META).map(([key,value])=>[key,value.label])
) as Record<StOutputSource,string>;

function fmt(value:unknown,max=2){
 const n=Number(value??0);
 if(!Number.isFinite(n))return "0";
 return new Intl.NumberFormat("vi-VN",{maximumFractionDigits:max}).format(n);
}

function dt(value:string|null|undefined){
 if(!value)return "—";
 const d=new Date(value);
 if(Number.isNaN(d.getTime()))return "—";
 return new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(d);
}

function shortDt(value:string|null|undefined){
 if(!value)return "—";
 const d=new Date(value);
 if(Number.isNaN(d.getTime()))return "—";
 return new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(d);
}

function qs(base:Record<string,string|undefined>,patch:Record<string,string|number|undefined>={}){
 const p=new URLSearchParams();
 for(const [k,v] of Object.entries({...base,...patch})){
  if(v!=null&&String(v).trim()!=="")p.set(k,String(v));
 }
 const q=p.toString();
 return `/st-output${q?`?${q}`:""}`;
}

function op(value:string|null|undefined){
 return value?<span className="st-output-op-code">{value}</span>:<span className="st-output-empty">—</span>;
}

export default async function Page({
 searchParams
}:{
 searchParams:Promise<{date?:string;import?:string;source?:string;counted?:string;q?:string;p?:string}>
}){
 const sp=await searchParams;
 const c=await getPool().connect();
 try{
  const report=await loadStOutputReport(c,{
    date:sp.date,
    importId:sp.import,
    source:sp.source,
    counted:sp.counted,
    q:sp.q,
    page:Number(sp.p)||1,
   }).catch((e:unknown)=>({error:e instanceof Error?e.message:String(e)}));
  if("error" in report){
   return <ErpAppShell
    moduleGroups={ST_ERP_MODULE_GROUPS}
    activeModule="operations"
    activeSecondary="output"
    environment="ST PLANNING"
    userArea={<LogoutButton presentation="erp"/>}
    breadcrumb={<><Link href="/all-open-jobs">Operations</Link><span>/</span><b>ST Output</b></>}
   >
    <div className="planning-erp-version st-output-erp-page">
     <ErpPageHeader
      eyebrow="ST OUTPUT"
      title="Output ST dm²/ngày"
      description="Không tải được dữ liệu báo cáo. Màn hình giữ lỗi mềm để có thể kiểm tra query/report."
      status={<ErpStatus label="ERROR" tone="danger"/>}
     />
     <div className="st-output-error-panel">
      <div><b>Không tải được ST Output.</b><span>Vui lòng gửi nội dung lỗi bên dưới để kiểm tra.</span></div>
      <pre>{report.error}</pre>
      <Link className="erpkit-btn" href="/st-output">Tải lại ST Output</Link>
     </div>
    </div>
   </ErpAppShell>;
  }

  const current={
   date:report.reportDate,
   import:report.selectedImportId||undefined,
   source:report.sourceFilter==="ALL"?undefined:report.sourceFilter,
   counted:report.countedFilter==="COUNTED"?undefined:report.countedFilter,
   q:report.q||undefined,
  };
  const countedSourceRows=report.summary.filter(x=>x.counted_jobs>0).length;
  const selectedImportText=report.selectedImport?.file_name||report.selectedImport?.id||"—";

  return <ErpAppShell
   moduleGroups={ST_ERP_MODULE_GROUPS}
   activeModule="operations"
   activeSecondary="output"
   environment="ST PLANNING"
   userArea={<LogoutButton presentation="erp"/>}
   breadcrumb={<><Link href="/all-open-jobs">Operations</Link><span>/</span><b>ST Output</b></>}
  >
   <div className="planning-erp-version st-output-erp-page">
    <ErpPageHeader
     eyebrow="OPERATIONS · OUTPUT CONTROL"
     title="ST Output · Kế hoạch dm²/ngày"
     description="CHEMMILL và công đoạn ST cuối theo Scheduled End 00:00 D → 03:00 D+1. FINSST/CFINM-VN và ST Final Steps lấy từ snapshot All Open Job được chọn."
     status={<ErpStatus label="LIVE" tone="success"/>}
     actions={<div className="st-output-header-actions">
      <Link className="erpkit-btn" href="/logic-guide#st-output">Logic & Hướng dẫn</Link>
      <Link className="erpkit-btn" href="/all-open-jobs/audit">Audit Open Jobs</Link>
     </div>}
    />

    <div className="st-output-context-strip">
     <span><b>Report date</b>{report.reportDate}</span>
     <span><b>Output window</b>{shortDt(report.windowStartIso)} → {shortDt(report.cutoffIso)}</span>
     <span className="st-output-context-import" title={selectedImportText}><b>Snapshot</b>{selectedImportText}</span>
     <span><b>Dedup priority</b>Final ST → FINSST/CFINM-VN → ST Final Steps</span>
    </div>

    <ErpSection
     title="Bộ lọc báo cáo"
     description="Chọn ngày, snapshot và phạm vi audit. Bộ lọc chỉ thay đổi dữ liệu hiển thị, không thay đổi logic tính output."
     className="st-output-filter-section"
    >
     <form method="get" className="st-output-filter-form">
      <label className="erpkit-field">
       <span className="erpkit-field-label">Ngày báo cáo</span>
       <input className="erpkit-input" type="date" name="date" defaultValue={report.reportDate}/>
      </label>
      <label className="erpkit-field st-output-filter-import">
       <span className="erpkit-field-label">All Open Job Import History</span>
       <select className="erpkit-select" name="import" defaultValue={report.selectedImportId||""}>
        {report.importOptions.map(x=><option key={x.id} value={x.id}>{dt(x.finished_at||x.created_at)} · {x.file_name||x.id}</option>)}
       </select>
      </label>
      <label className="erpkit-field">
       <span className="erpkit-field-label">Nguồn output</span>
       <select className="erpkit-select" name="source" defaultValue={report.sourceFilter}>
        <option value="ALL">Tất cả nguồn</option>
        {Object.entries(SOURCE_LABEL).map(([key,label])=><option key={key} value={key}>{label}</option>)}
       </select>
      </label>
      <label className="erpkit-field">
       <span className="erpkit-field-label">Trạng thái tính</span>
       <select className="erpkit-select" name="counted" defaultValue={report.countedFilter}>
        <option value="COUNTED">Đã tính output</option>
        <option value="EXCLUDED">Bị loại / trùng</option>
        <option value="ALL">Tất cả dòng audit</option>
       </select>
      </label>
      <label className="erpkit-field st-output-filter-search">
       <span className="erpkit-field-label">Tìm Job / Part / Batch / Operation</span>
       <span className="erpkit-search"><input className="erpkit-input" name="q" defaultValue={report.q} placeholder="Nhập Job, Part, Batch hoặc Operation..."/></span>
      </label>
      <div className="st-output-filter-actions">
       <Link className="erpkit-btn" href="/st-output">Đặt lại</Link>
       <button className="erpkit-btn erpkit-btn-primary">Tính output</button>
      </div>
     </form>
    </ErpSection>

    <div className="erpkit-kpi-grid st-output-kpi-grid">
     <ErpKpiCard label="Total Output" value={<>{fmt(report.total.dm2)} <small>dm²</small></>} helper={`Ngày báo cáo ${report.reportDate}`} tone="info"/>
     <ErpKpiCard label="Job counted" value={fmt(report.total.jobs,0)} helper={`${fmt(report.totalRows,0)} dòng sau bộ lọc`} tone="success"/>
     <ErpKpiCard label="Qty counted" value={<>{fmt(report.total.qty,0)} <small>pcs</small></>} helper={`${countedSourceRows} nguồn có output`} tone="neutral"/>
     <ErpKpiCard label="Output window" value="27h" helper={`${shortDt(report.windowStartIso)} → ${shortDt(report.cutoffIso)}`} tone="warning"/>
    </div>

    <ErpSection
     title="Tổng theo nguồn"
     description="CHEMMILL tính độc lập. Các nguồn output cuối chống trùng theo thứ tự ưu tiên đã chốt."
     flush
     className="st-output-summary-section"
    >
     <div className="erpkit-grid erpkit-grid-compact st-output-summary-grid">
      <div className="erpkit-grid-scroll">
       <table>
        <thead className="is-sticky"><tr>
         <th>Nguồn</th><th className="is-right">Job</th><th className="is-right">Qty</th><th className="is-right">Tổng dm²</th>
         <th className="is-right">Job counted</th><th className="is-right">Qty counted</th><th className="is-right">dm² counted</th><th>Tỷ trọng</th>
        </tr></thead>
        <tbody>
         {report.summary.map(r=>{
          const meta=SOURCE_META[r.output_source];
          const pct=report.total.dm2>0?Math.max(0,Math.min(100,(r.counted_dm2/report.total.dm2)*100)):0;
          return <tr key={r.output_source}>
           <td><Link className="st-output-source-link" href={qs(current,{source:r.output_source,p:1})}><ErpStatus label={meta.label} tone={meta.tone}/></Link></td>
           <td className="is-right">{fmt(r.jobs,0)}</td>
           <td className="is-right">{fmt(r.qty,0)}</td>
           <td className="is-right">{fmt(r.total_dm2)}</td>
           <td className="is-right"><b>{fmt(r.counted_jobs,0)}</b></td>
           <td className="is-right"><b>{fmt(r.counted_qty,0)}</b></td>
           <td className="is-right st-output-dm2"><b>{fmt(r.counted_dm2)}</b></td>
           <td><div className="st-output-share"><span><i style={{width:`${pct}%`}}/></span><b>{fmt(pct,1)}%</b></div></td>
          </tr>;
         })}
         {!report.summary.length&&<tr><td colSpan={8}><div className="erpkit-grid-empty"><strong>Chưa có dữ liệu output</strong><span>Thay đổi ngày, snapshot hoặc bộ lọc để kiểm tra lại.</span></div></td></tr>}
        </tbody>
       </table>
      </div>
     </div>
    </ErpSection>

    <ErpSection
     title="Danh sách Job chi tiết"
     description={`${fmt(report.totalRows,0)} dòng sau lọc · trang ${report.page}/${report.pages}`}
     actions={<div className="st-output-active-filter-row">
      {report.sourceFilter!=="ALL"?<span className="erpkit-filter-chip">Source <b>{SOURCE_LABEL[report.sourceFilter as StOutputSource]||report.sourceFilter}</b></span>:null}
      {report.countedFilter!=="COUNTED"?<span className="erpkit-filter-chip">Status <b>{report.countedFilter}</b></span>:null}
      {report.q?<span className="erpkit-filter-chip">Search <b>{report.q}</b></span>:null}
     </div>}
     flush
     className="st-output-detail-section"
    >
     <div className="erpkit-grid erpkit-grid-compact is-striped st-output-detail-grid">
      <div className="erpkit-grid-scroll">
       <table>
        <thead className="is-sticky"><tr>
         <th className="st-col-count">Count</th><th className="st-col-source">Source</th><th className="st-col-job">Job</th><th>Part</th><th>Rev</th><th>Program</th>
         <th className="is-right">Qty</th><th className="is-right">Surface/part</th><th className="is-right">Total dm²</th>
         <th>NextOperation</th><th>LastOperation</th><th>Final ST Operation</th><th>Intermediate Operation</th>
         <th>Batch</th><th>Main Operation</th><th>Area</th><th>Resource</th><th>Scheduled Start</th><th>Scheduled End</th>
         <th>Import</th><th>Audit Reason</th><th>Dedup</th>
        </tr></thead>
        <tbody>
         {report.rows.map((r,i)=>{
          const meta=SOURCE_META[r.output_source];
          return <tr key={`${r.output_source}-${r.job_num}-${r.batch_id||"snapshot"}-${i}`} className={r.is_counted?"":"st-output-row-excluded"}>
           <td className="st-col-count"><ErpStatus label={r.is_counted?"YES":"NO"} tone={r.is_counted?"success":"neutral"}/></td>
           <td className="st-col-source"><ErpStatus label={meta.short} tone={meta.tone}/></td>
           <td className="st-col-job"><Link className="erpkit-grid-link erpkit-grid-code" href={`/job-tracker?q=${encodeURIComponent(r.job_num)}`}>{r.job_num}</Link></td>
           <td className="st-output-part">{r.part_num||"—"}</td>
           <td>{r.revision_num||"—"}</td>
           <td>{r.program||"—"}</td>
           <td className="is-right">{fmt(r.qty,0)}</td>
           <td className="is-right">{r.surface_per_part_dm2==null?"—":fmt(r.surface_per_part_dm2)}</td>
           <td className="is-right st-output-dm2"><b>{fmt(r.total_dm2)}</b></td>
           <td>{op(r.next_operation)}</td>
           <td>{op(r.last_operation)}</td>
           <td>{op(r.final_st_operation)}</td>
           <td>{op(r.intermediate_operation)}</td>
           <td>{r.batch_id?<Link className="erpkit-grid-link erpkit-grid-code" href={`/planning/batches/${r.batch_id}`}>{r.batch_no||r.batch_id}</Link>:(r.batch_no||<span className="st-output-empty">—</span>)}</td>
           <td>{op(r.main_operation)}</td>
           <td>{r.schedule_area||<span className="st-output-empty">—</span>}</td>
           <td>{op(r.resource_code)}</td>
           <td className="st-output-date">{dt(r.scheduled_start)}</td>
           <td className="st-output-date">{dt(r.scheduled_end)}</td>
           <td className="st-output-import-cell"><b>{r.import_file_name||r.import_batch_id||"—"}</b>{r.import_time?<small>{dt(r.import_time)}</small>:null}</td>
           <td className="st-output-audit-cell"><span>{r.audit_reason||"—"}</span>{r.duplicate_of_source?<small>Duplicate, counted by {SOURCE_LABEL[r.duplicate_of_source as StOutputSource]||r.duplicate_of_source}</small>:null}</td>
           <td><span className="st-output-dedup">{r.dedup_key}</span></td>
          </tr>;
         })}
         {!report.rows.length&&<tr><td colSpan={22}><div className="erpkit-grid-empty"><strong>Không có Job phù hợp</strong><span>Thay đổi bộ lọc hoặc kiểm tra snapshot All Open Job đã chọn.</span></div></td></tr>}
        </tbody>
       </table>
      </div>
      <div className="erpkit-grid-footer st-output-grid-footer">
       <div><b>{fmt(report.totalRows,0)}</b> dòng · Ưu tiên Final ST → FINSST/CFINM-VN → ST Final Steps · CHEMMILL độc lập</div>
       <div className="st-output-pager">
        <Link className={`erpkit-btn ${report.page<=1?"is-disabled":""}`} aria-disabled={report.page<=1} href={qs(current,{p:Math.max(1,report.page-1)})}>← Trước</Link>
        <span>Trang <b>{report.page}</b> / {report.pages}</span>
        <Link className={`erpkit-btn ${report.page>=report.pages?"is-disabled":""}`} aria-disabled={report.page>=report.pages} href={qs(current,{p:Math.min(report.pages,report.page+1)})}>Sau →</Link>
       </div>
      </div>
     </div>
    </ErpSection>
   </div>
  </ErpAppShell>;
 }finally{c.release();}
}
