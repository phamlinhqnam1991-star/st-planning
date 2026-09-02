import {MasterImporter} from "@/components/master-importer";
import {getStats} from "@/lib/stats";
import {AppTabs} from "@/components/app-tabs";
export const dynamic="force-dynamic";
export default async function Page(){
 const data=await getStats();
 return <main className="erp-shell">
  <header className="erp-header"><div><h1>ST Planning</h1></div><div className="erp-env">IMPORT MASTER</div></header>
  <AppTabs active="import"/>
  <section className="erp-content erp-content-full">
   <div className="erp-page-head"><div><h2>Import Master</h2><p>Cập nhật dữ liệu Master từ Excel.</p></div></div>
   {data.issues.length>0&&<div className="notice"><b>Cần kiểm tra dữ liệu:</b><ul className="issue-list">{data.issues.map((x:string)=><li key={x}>{x}</li>)}</ul></div>}
   <MasterImporter/>
   <div className="erp-table-panel section"><div className="erp-panel-head"><b>Import History</b><span>{data.imports.length} recent imports</span></div><div className="table-wrap"><table className="erp-table"><thead><tr><th>Thời gian</th><th>File</th><th>Status</th><th>Source</th><th>New</th><th>Changed</th><th>Unchanged</th><th>Routing</th></tr></thead><tbody>{data.imports.map((x:any)=><tr key={x.id}><td>{new Date(x.created_at).toLocaleString("vi-VN")}</td><td>{x.file_name}</td><td><span className="badge">{x.status}</span></td><td>{x.source_rows?.toLocaleString?.()||0}</td><td>{x.new_rows?.toLocaleString?.()||0}</td><td>{x.changed_rows?.toLocaleString?.()||0}</td><td>{x.unchanged_rows?.toLocaleString?.()||0}</td><td>{x.routing_rows?.toLocaleString?.()||0}</td></tr>)}{!data.imports.length&&<tr><td colSpan={8} className="muted">Chưa có lần import nào.</td></tr>}</tbody></table></div></div>
  </section>
 </main>
}