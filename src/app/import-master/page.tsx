import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {MasterImporter} from "@/components/master-importer";
import {getStats} from "@/lib/stats";
import {AppTabs} from "@/components/app-tabs";
export const dynamic="force-dynamic";
export default async function Page(){
 const data=await getStats();
 const latest=data.imports?.[0]||null;
 return <main className="erp-shell erpkit-migrated-page">
  <ErpAppHeader module="IMPORT MASTER"/>
  <AppTabs active="import"/>
  <section className="erp-content erp-content-full">
   <div className="erp-page-head"><div><h2>Import Master</h2><p>Cập nhật dữ liệu Master từ Excel.</p></div></div>
   {data.issues.length>0&&<div className="notice"><b>Cần kiểm tra dữ liệu:</b><ul className="issue-list">{data.issues.map((x:string)=><li key={x}>{x}</li>)}</ul></div>}
   <div className="erp-overview-metrics">
    <div className="erp-overview-metric"><span>Lần import gần nhất</span><b>{latest?new Date(latest.created_at).toLocaleDateString("vi-VN"):"—"}</b><small>{latest?.file_name||"Chưa có dữ liệu"}</small></div>
    <div className="erp-overview-metric success"><span>New</span><b>{Number(latest?.new_rows||0).toLocaleString()}</b><small>Record mới</small></div>
    <div className="erp-overview-metric warning"><span>Changed</span><b>{Number(latest?.changed_rows||0).toLocaleString()}</b><small>Record thay đổi</small></div>
    <div className="erp-overview-metric"><span>Routing</span><b>{Number(latest?.routing_rows||0).toLocaleString()}</b><small>Routing đã xử lý</small></div>
   </div>
   <MasterImporter/>
   <div className="erp-table-panel section"><div className="erp-panel-head"><b>Lịch sử Import</b><span>{data.imports.length} lần import gần đây</span></div><div className="table-wrap"><table className="erp-table"><thead><tr><th>Thời gian</th><th>File</th><th>Status</th><th>Source</th><th>New</th><th>Changed</th><th>Unchanged</th><th>Routing</th></tr></thead><tbody>{data.imports.map((x:any)=><tr key={x.id}><td>{new Date(x.created_at).toLocaleString("vi-VN")}</td><td>{x.file_name}</td><td><span className="badge">{x.status}</span></td><td>{x.source_rows?.toLocaleString?.()||0}</td><td>{x.new_rows?.toLocaleString?.()||0}</td><td>{x.changed_rows?.toLocaleString?.()||0}</td><td>{x.unchanged_rows?.toLocaleString?.()||0}</td><td>{x.routing_rows?.toLocaleString?.()||0}</td></tr>)}{!data.imports.length&&<tr><td colSpan={8} className="muted">Chưa có lần import nào.</td></tr>}</tbody></table></div></div>
  </section>
 </main>
}