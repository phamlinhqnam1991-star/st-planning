import {AppTabs,SubTabs} from "@/components/app-tabs";
import {PlannerWorkAssignmentManager} from "@/components/planner-work-assignment-manager";
export const dynamic="force-dynamic";
const tabs=[
 {key:"flow",label:"ST Operation Flow",href:"/st-operation-flow"},{key:"operation",label:"Main Operation Master",href:"/master/operation"},{key:"operationcodeorder",label:"ST Scope & Operation Order",href:"/operation-code-order"},
 {key:"operationmapping",label:"Source → Main Mapping",href:"/master/operationmapping"},
 {key:"stgroup",label:"ST Group Master",href:"/st-groups"},
 {key:"area",label:"Physical Area Master",href:"/area"},
 {key:"schedulearea",label:"Schedule Area Mapping",href:"/schedule-areas"},
 {key:"plannerassignment",label:"Phân chia Planner",href:"/planner-work-assignment"},
 {key:"processrecipe",label:"Process Recipe",href:"/process-recipes"},
 {key:"autoplanning",label:"Auto Planning Rules",href:"/auto-planning-rules"}
];
export default function Page(){return <main className="erp-shell">
 <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">CONFIGURATION</div></header>
 <AppTabs active="config"/>
 <div className="erp-workspace">
  <aside className="erp-sidebar"><div className="erp-sidebar-title">CẤU HÌNH</div><SubTabs items={tabs} active="plannerassignment"/></aside>
  <section className="erp-content">
   <div className="erp-page-head"><div><h2>Phân chia công việc Planner</h2><p>Thêm/bớt hoặc chuyển Schedule Area giữa Planner 1 và Planner 2.</p></div></div>
   <PlannerWorkAssignmentManager/>
  </section>
 </div>
</main>}
