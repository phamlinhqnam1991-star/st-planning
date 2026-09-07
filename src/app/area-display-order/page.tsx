import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {AreaDisplayOrderManager} from "@/components/area-display-order-manager";
export const dynamic="force-dynamic";
export default function Page(){return <main className="erp-shell erpkit-migrated-page">
 <ErpAppHeader module="CONFIGURATION"/><AppTabs active="config"/>
 <div className="erp-workspace"><ConfigSidebar active="areaorder"/><section className="erp-content">
  <ConfigPageHeader title="Area Display Order" subtitle="Thiết lập thứ tự hiển thị khu vực dựa trên Physical Area." purpose="Cho Planner chủ động sắp thứ tự Area trên các màn hình workload/report có grouping theo Area." impact="Chỉ đổi thứ tự hiển thị bằng md_area.sort_order; không đổi ST Group, Main Operation, Schedule Area, Resource hay Planner." prev={{label:"Physical Area Master",href:"/area"}} next={{label:"Schedule Area Mapping",href:"/schedule-areas"}}/>
  <AreaDisplayOrderManager/>
 </section></div>
 </main>}
