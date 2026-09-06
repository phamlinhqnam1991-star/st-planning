import Link from "next/link";
import {LogoutButton} from "@/components/logout-button";
import {ErpAppShell,ErpPageHeader} from "@/components/erp";
import {ST_ERP_MODULE_GROUPS} from "@/lib/erp/st-navigation";
import {getPool} from "@/lib/db";
import {loadStOutputReport,type StOutputSource} from "@/lib/planning/st-output-report";

export const dynamic="force-dynamic";

const SOURCE_LABEL:Record<StOutputSource,string>={
 CHEMMILL:"CHEMMILL",
 FINAL_ST_OPERATION:"Công đoạn ST cuối",
 FINSST_CFINM_VN:"FINSST / CFINM-VN",
 INTERMEDIATE_NO_CHAIN:"Intermediate No Chain",
};

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

function qs(base:Record<string,string|undefined>,patch:Record<string,string|number|undefined>={}){
 const p=new URLSearchParams();
 for(const [k,v] of Object.entries({...base,...patch})){
  if(v!=null&&String(v).trim()!=="")p.set(k,String(v));
 }
 const q=p.toString();
 return `/st-output${q?`?${q}`:""}`;
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
  });
  const current={
   date:report.reportDate,
   import:report.selectedImportId||undefined,
   source:report.sourceFilter==="ALL"?undefined:report.sourceFilter,
   counted:report.countedFilter==="COUNTED"?undefined:report.countedFilter,
   q:report.q||undefined,
  };
  return <ErpAppShell
   moduleGroups={ST_ERP_MODULE_GROUPS}
   activeModule="operations"
   activeSecondary="output"
   environment="ST PLANNING"
   userArea={<LogoutButton presentation="erp"/>}
   breadcrumb={<><Link href="/all-open-jobs">Operations</Link><span>/</span><b>ST Output</b></>}
  >
   <div className="planning-erp-version">
    <ErpPageHeader
     eyebrow="ST OUTPUT"
     title="Output ST dm²/ngày"
     description="Tính theo kế hoạch: CHEMMILL và công đoạn ST cuối lấy theo Scheduled End trước 03:00 ngày hôm sau; FINSST/CFINM-VN và Intermediate No Chain lấy từ All Open Job import được chọn."
     status={<span className="erpkit-status erpkit-status-success"><span className="erpkit-status-dot"/>LIVE</span>}
    />

    <form method="get" className="erp-form-panel section">
     <div>
      <label>Ngày báo cáo</label>
      <input className="input" type="date" name="date" defaultValue={report.reportDate}/>
     </div>
     <div>
      <label>All Open Job Import History</label>
      <select className="input" name="import" defaultValue={report.selectedImportId||""}>
       {report.importOptions.map(x=><option key={x.id} value={x.id}>{dt(x.finished_at||x.created_at)} · {x.file_name||x.id}</option>)}
      </select>
     </div>
     <div>
      <label>Output Source</label>
      <select className="input" name="source" defaultValue={report.sourceFilter}>
       <option value="ALL">Tất cả</option>
       {Object.entries(SOURCE_LABEL).map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select>
     </div>
     <div>
      <label>Trạng thái tính</label>
      <select className="input" name="counted" defaultValue={report.countedFilter}>
       <option value="COUNTED">Đã tính output</option>
       <option value="EXCLUDED">Bị loại/trùng</option>
       <option value="ALL">Tất cả dòng audit</option>
      </select>
     </div>
     <div>
      <label>Tìm Job / Part / Batch</label>
      <input className="input" name="q" defaultValue={report.q} placeholder="Job, Part, Batch, Operation..."/>
     </div>
     <button className="btn primary">Tính output</button>
    </form>

    <div className="part-summary-grid section">
     <div className="kv"><span>Total Output</span><b>{fmt(report.total.dm2)} dm²</b></div>
     <div className="kv"><span>Qty</span><b>{fmt(report.total.qty,0)} pcs</b></div>
     <div className="kv"><span>Job counted</span><b>{fmt(report.total.jobs,0)}</b></div>
     <div className="kv"><span>Cutoff</span><b>{dt(report.cutoffIso)}</b></div>
    </div>

    <div className="erp-table-panel section">
     <div className="erp-panel-head"><div><b>Tổng theo nguồn</b><small>CHEMMILL tính độc lập; các nguồn còn lại chống trùng theo ưu tiên đã chốt.</small></div></div>
     <div className="table-wrap">
      <table className="erp-table">
       <thead><tr><th>Nguồn</th><th className="num">Job</th><th className="num">Qty</th><th className="num">dm²</th><th className="num">Job counted</th><th className="num">Qty counted</th><th className="num">dm² counted</th></tr></thead>
       <tbody>
        {report.summary.map(r=><tr key={r.output_source}>
         <td><b>{SOURCE_LABEL[r.output_source]}</b></td>
         <td className="num">{fmt(r.jobs,0)}</td>
         <td className="num">{fmt(r.qty,0)}</td>
         <td className="num">{fmt(r.total_dm2)}</td>
         <td className="num">{fmt(r.counted_jobs,0)}</td>
         <td className="num">{fmt(r.counted_qty,0)}</td>
         <td className="num"><b>{fmt(r.counted_dm2)}</b></td>
        </tr>)}
        {!report.summary.length&&<tr><td colSpan={7} className="muted">Chưa có dữ liệu output theo điều kiện đã chọn.</td></tr>}
       </tbody>
      </table>
     </div>
    </div>

    <div className="erp-table-panel section">
     <div className="erp-panel-head">
      <div><b>Danh sách Job chi tiết</b><small>{fmt(report.totalRows,0)} dòng sau lọc · trang {report.page}/{report.pages}</small></div>
      <div className="muted">Ưu tiên: Công đoạn ST cuối đã điều độ &gt; FINSST/CFINM-VN &gt; Intermediate No Chain. CHEMMILL tính riêng.</div>
     </div>
     <div className="table-wrap">
      <table className="erp-table open-job-all-columns">
       <thead><tr>
        <th>Count</th><th>Source</th><th>Job</th><th>Part</th><th>Rev</th><th>Program</th>
        <th className="num">Qty</th><th className="num">Surface/part</th><th className="num">Total dm²</th>
        <th>NextOperation</th><th>LastOperation</th><th>Final ST Operation</th><th>Intermediate Operation</th>
        <th>Batch</th><th>Main Operation</th><th>Area</th><th>Resource</th><th>Scheduled Start</th><th>Scheduled End</th>
        <th>Import</th><th>Audit Reason</th><th>Dedup</th>
       </tr></thead>
       <tbody>
        {report.rows.map((r,i)=><tr key={`${r.output_source}-${r.job_num}-${r.batch_id||"snapshot"}-${i}`}>
         <td><span className={`erpkit-status ${r.is_counted?"erpkit-status-success":"erpkit-status-neutral"}`}><span className="erpkit-status-dot"/>{r.is_counted?"YES":"NO"}</span></td>
         <td><b>{SOURCE_LABEL[r.output_source]}</b></td>
         <td><b>{r.job_num}</b></td>
         <td>{r.part_num||"—"}</td>
         <td>{r.revision_num||"—"}</td>
         <td>{r.program||"—"}</td>
         <td className="num">{fmt(r.qty,0)}</td>
         <td className="num">{r.surface_per_part_dm2==null?"—":fmt(r.surface_per_part_dm2)}</td>
         <td className="num"><b>{fmt(r.total_dm2)}</b></td>
         <td>{r.next_operation||"—"}</td>
         <td>{r.last_operation||"—"}</td>
         <td>{r.final_st_operation||"—"}</td>
         <td>{r.intermediate_operation||"—"}</td>
         <td>{r.batch_id?<Link className="erp-link" href={`/planning/batches/${r.batch_id}`}>{r.batch_no||r.batch_id}</Link>:(r.batch_no||"—")}</td>
         <td>{r.main_operation||"—"}</td>
         <td>{r.schedule_area||"—"}</td>
         <td>{r.resource_code||"—"}</td>
         <td>{dt(r.scheduled_start)}</td>
         <td>{dt(r.scheduled_end)}</td>
         <td>{r.import_file_name||r.import_batch_id||"—"}{r.import_time?<small className="planning-sub">{dt(r.import_time)}</small>:null}</td>
         <td>{r.audit_reason||"—"}{r.duplicate_of_source?<small className="planning-sub">Duplicate, counted by {SOURCE_LABEL[r.duplicate_of_source as StOutputSource]||r.duplicate_of_source}</small>:null}</td>
         <td>{r.dedup_key}</td>
        </tr>)}
        {!report.rows.length&&<tr><td colSpan={22} className="muted">Không có Job phù hợp.</td></tr>}
       </tbody>
      </table>
     </div>
     <div className="pager">
      <Link className={`btn ${report.page<=1?"disabled":""}`} aria-disabled={report.page<=1} href={qs(current,{p:Math.max(1,report.page-1)})}>← Trước</Link>
      <span>Trang {report.page}/{report.pages}</span>
      <Link className={`btn ${report.page>=report.pages?"disabled":""}`} aria-disabled={report.page>=report.pages} href={qs(current,{p:Math.min(report.pages,report.page+1)})}>Sau →</Link>
     </div>
    </div>
   </div>
  </ErpAppShell>;
 }finally{c.release();}
}
