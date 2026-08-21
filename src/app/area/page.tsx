import {AreaManager} from "@/components/area-manager";import {AppTabs,SubTabs} from "@/components/app-tabs";
export const dynamic="force-dynamic";
const tabs=[{key:"operation",label:"Operation Master",href:"/master/operation"},{key:"operationmapping",label:"ST Operation Mapping",href:"/master/operationmapping"},{key:"stgroup",label:"ST Group Master",href:"/st-groups"},{key:"area",label:"Area Master",href:"/area"}];
export default async function AreaPage(){return <main className="erp-shell">
 <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">CONFIGURATION</div></header>
 <AppTabs active="config"/>
 <div className="erp-workspace">
  <aside className="erp-sidebar"><div className="erp-sidebar-title">CẤU HÌNH</div><SubTabs items={tabs} active="area"/></aside>
  <section className="erp-content"><div className="erp-page-head"><div><h2>Area Master</h2><p>Tự thêm/sửa Area và gán ST Group</p></div></div><AreaManager/></section>
 </div>
 </main>}