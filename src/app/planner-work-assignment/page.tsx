import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {PlannerWorkAssignmentManager} from "@/components/planner-work-assignment-manager";
export const dynamic="force-dynamic";
export default function Page(){return <main className="erp-shell">
 <header className="erp-header"><div><h1>ST Planning</h1></div><div className="erp-env">CONFIGURATION</div></header>
 <AppTabs active="config"/>
 <div className="erp-workspace">
  <ConfigSidebar active="plannerassignment"/>
  <section className="erp-content">
   <ConfigPageHeader
    title="Phân chia công việc Planner"
    subtitle="Thêm/bớt hoặc chuyển Schedule Area giữa Planner 1 và Planner 2."
    purpose="Xác định người phụ trách điều độ từng khu vực (Planner 1 / Planner 2) — ai thấy việc gì trên Board Điều Độ."
    impact="Việc chuyển chỉ đổi người phụ trách điều độ, không đổi Standard Operation, Routing, Batch hoặc logic công đoạn."
    prev={{label:"Schedule Area Mapping",href:"/schedule-areas"}}
    next={{label:"Công thức & Thời gian",href:"/recipe-operation-map"}}
   />
   <PlannerWorkAssignmentManager/>
  </section>
 </div>
</main>}
