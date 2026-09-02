import {ErpAppHeader} from "@/components/erp/erp-app-header";
import Link from "next/link";
import {getStats} from "@/lib/stats";
import {AppTabs,SubTabs} from "@/components/app-tabs";
import {errorMessage} from "@/lib/error-message";
export const dynamic="force-dynamic";
const sub=[
 {key:"part",label:"Part",href:"/master/part"},
 {key:"revision",label:"Part Revision",href:"/master/revision"},
 {key:"sourceoperation",label:"Source Operation",href:"/master/sourceoperation"},
 {key:"routing",label:"Routing Detail",href:"/master/routing"},
 {key:"finish",label:"Material Finish",href:"/master/finish"},
 {key:"requirement",label:"Process Requirement",href:"/master/requirement"},
 {key:"strouting",label:"ST Routing Master",href:"/master/strouting"},
 {key:"stroutingchain",label:"ST Routing Chain",href:"/master/stroutingchain"},
 {key:"partrouting",label:"Part → Routing",href:"/master/partrouting"},
];
export default async function Page(){
 let data:any=null,err="";
 try{data=await getStats()}catch(e){err=errorMessage(e)}
 const c=data?.counts||{};
 const rows=[
  ["Part","Danh mục Part",c.md_part,"/master/part"],
  ["Part Revision","Revision theo Part",c.md_part_revision,"/master/revision"],
  ["Source Operation","Operation nguồn từ file Master",c.md_operation,"/master/sourceoperation"],
  ["Routing Detail","Routing đầy đủ theo Part + Revision",c.md_routing_detailed,"/master/routing"],
  ["Material Finish","Surface / Primer / Topcoat / Finish",c.md_material_finish,"/master/finish"],
  ["Process Requirement","Yêu cầu process theo Part + Revision",c.md_process_requirement,"/master/requirement"],
  ["ST Routing Master","Danh mục routing ST chuẩn hóa",c.md_st_routing_summary,"/master/strouting"],
  ["ST Routing Chain","Chuỗi operation ST chuẩn hóa",c.md_st_routing,"/master/stroutingchain"],
  ["Part → Routing","Map Part + Revision → RoutingCode",c.md_part_routing,"/master/partrouting"],
 ];
 return <main className="erp-shell erpkit-migrated-page">
  <ErpAppHeader module="MASTER DATA"/>
  <AppTabs active="master"/>
  <div className="erp-workspace">
   <aside className="erp-sidebar"><div className="erp-sidebar-title">MASTER DATA</div><SubTabs items={sub}/></aside>
   <section className="erp-content">
    <div className="erp-page-head"><div><h2>Master Data</h2><p>Dữ liệu nền dùng cho ST Planning</p></div><Link className="btn primary" href="/import-master">Import Master</Link></div>
    {err&&<div className="notice"><b>Lỗi kết nối:</b> {err}</div>}
    {data?.issues?.length>0&&<div className="notice"><b>Cần kiểm tra dữ liệu:</b><ul className="issue-list">{data.issues.map((x:string)=><li key={x}>{x}</li>)}</ul></div>}
    <div className="erp-overview-metrics">
     <div className="erp-overview-metric"><span>Part</span><b>{Number(c.md_part||0).toLocaleString()}</b><small>Part Master</small></div>
     <div className="erp-overview-metric"><span>Source Operation</span><b>{Number(c.md_operation||0).toLocaleString()}</b><small>Operation nguồn</small></div>
     <div className="erp-overview-metric success"><span>Routing Detail</span><b>{Number(c.md_routing_detailed||0).toLocaleString()}</b><small>Routing Part / Revision</small></div>
     <div className="erp-overview-metric"><span>Process Requirement</span><b>{Number(c.md_process_requirement||0).toLocaleString()}</b><small>Yêu cầu process</small></div>
    </div>
    <div className="erp-table-panel">
     <div className="erp-panel-head"><b>Tổng quan Master Data</b><span>{rows.length} nhóm dữ liệu</span></div>
     <div className="table-wrap"><table className="erp-table"><thead><tr><th>Master</th><th>Mô tả</th><th className="num">Records</th><th className="action"></th></tr></thead><tbody>
      {rows.map(([name,desc,n,href])=><tr key={String(name)}><td><b>{String(name)}</b></td><td>{String(desc)}</td><td className="num mono">{Number(n||0).toLocaleString()}</td><td className="action"><Link className="erp-link" href={String(href)}>Mở</Link></td></tr>)}
     </tbody></table></div>
    </div>
   </section>
  </div>
 </main>
}