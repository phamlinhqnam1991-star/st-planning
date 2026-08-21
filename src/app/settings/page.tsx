import Link from "next/link";
import {getStats} from "@/lib/stats";
import {AppTabs,SubTabs} from "@/components/app-tabs";
export const dynamic="force-dynamic";
const sub=[
 {key:"operation",label:"Operation Master",href:"/master/operation"},
 {key:"operationmapping",label:"ST Operation Mapping",href:"/master/operationmapping"},
 {key:"stgroup",label:"ST Group Master",href:"/st-groups"},
 {key:"area",label:"Area Master",href:"/area"},
];
export default async function Page(){
 const data=await getStats(),c=data.counts;
 const rows=[
  ["Operation Master","Standard Operation + Time Rules",c.md_operation_master,"/master/operation"],
  ["ST Operation Mapping","Operation Code → ST Group / Standard Operation",c.md_st_operation_mapping,"/master/operationmapping"],
  ["ST Group Master","Danh mục nhóm công đoạn ST",c.md_st_group,"/st-groups"],
  ["Area Master","Danh mục Area + gán ST Group",c.md_area,"/area"],
 ];
 return <main className="erp-shell">
  <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">CONFIGURATION</div></header>
  <AppTabs active="config"/>
  <div className="erp-workspace">
   <aside className="erp-sidebar"><div className="erp-sidebar-title">CẤU HÌNH</div><SubTabs items={sub}/></aside>
   <section className="erp-content">
    <div className="erp-page-head"><div><h2>Cấu hình Planning</h2><p>Quản lý Operation, Group và Area dùng cho lập kế hoạch</p></div></div>
    {data.issues.length>0&&<div className="notice"><b>Database cần kiểm tra:</b><ul className="issue-list">{data.issues.map((x:string)=><li key={x}>{x}</li>)}</ul></div>}
    <div className="erp-table-panel">
     <div className="erp-panel-head"><b>Configuration Master</b><span>{rows.length} configuration groups</span></div>
     <div className="table-wrap"><table className="erp-table"><thead><tr><th>Configuration</th><th>Mô tả</th><th className="num">Records</th><th></th></tr></thead><tbody>
      {rows.map(([name,desc,n,href])=><tr key={String(name)}><td><b>{String(name)}</b></td><td>{String(desc)}</td><td className="num mono">{Number(n||0).toLocaleString()}</td><td className="action"><Link className="erp-link" href={String(href)}>Open →</Link></td></tr>)}
     </tbody></table></div>
    </div>
   </section>
  </div>
 </main>
}