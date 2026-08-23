import {AppTabs,SubTabs} from "@/components/app-tabs";
import {ScheduleAreaManager} from "@/components/schedule-area-manager";
export const dynamic="force-dynamic";
const tabs=[
 {key:"operation",label:"Operation Master",href:"/master/operation"},
 {key:"operationmapping",label:"ST Operation Mapping",href:"/master/operationmapping"},
 {key:"stgroup",label:"ST Group Master",href:"/st-groups"},
 {key:"area",label:"Area Master",href:"/area"},
 {key:"schedulearea",label:"Schedule Area Mapping",href:"/schedule-areas"},
 {key:"plannerassignment",label:"Phân chia Planner",href:"/planner-work-assignment"},
 {key:"processrecipe",label:"Process Recipe",href:"/process-recipes"},
 {key:"autoplanning",label:"Auto Planning Rules",href:"/auto-planning-rules"}
];
export default function Page(){return <main className="erp-shell">
 <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">CONFIGURATION</div></header>
 <AppTabs active="config"/>
 <div className="erp-workspace">
  <aside className="erp-sidebar"><div className="erp-sidebar-title">CẤU HÌNH</div><SubTabs items={tabs} active="schedulearea"/></aside>
  <section className="erp-content">
   <div className="erp-page-head"><div><h2>Schedule Area Mapping</h2><p>Cấu hình khu vực điều độ, số dòng mặc định và Standard Operation thuộc từng khu vực.</p></div></div>
   <ScheduleAreaManager/>
  </section>
 </div>
</main>}
