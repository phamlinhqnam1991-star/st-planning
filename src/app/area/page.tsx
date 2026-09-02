import {AreaManager} from "@/components/area-manager";
import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
export const dynamic="force-dynamic";
export default async function AreaPage(){return <main className="erp-shell">
 <header className="erp-header"><div><h1>ST Planning</h1></div><div className="erp-env">CONFIGURATION</div></header>
 <AppTabs active="config"/>
 <div className="erp-workspace">
  <ConfigSidebar active="area"/>
  <section className="erp-content">
   <ConfigPageHeader
    title="Physical Area Master"
    subtitle="Danh mục khu vực vật lý trong nhà máy + gán ST Group vào khu."
    purpose="Khai báo khu vực (vd khu Chemical Line) và xác định ST Group nào chạy ở khu nào."
    impact="Một ST Group chỉ thuộc 1 khu vật lý. Đây là cầu nối từ Nhóm ST sang Khu vực điều độ (Schedule Area)."
    prev={{label:"ST Group Master",href:"/st-groups"}}
    next={{label:"Schedule Area Mapping",href:"/schedule-areas"}}
   />
   <AreaManager/>
  </section>
 </div>
 </main>}
