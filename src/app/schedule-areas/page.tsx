import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {ScheduleAreaManager} from "@/components/schedule-area-manager";
export const dynamic="force-dynamic";
export default function Page(){return <main className="erp-shell erpkit-migrated-page">
 <header className="erp-header"><div><h1>ST Planning</h1></div><div className="erp-env">CONFIGURATION</div></header>
 <AppTabs active="config"/>
 <div className="erp-workspace">
  <ConfigSidebar active="schedulearea"/>
  <section className="erp-content">
   <ConfigPageHeader
    title="Schedule Area Mapping"
    subtitle="Cấu hình khu vực điều độ, số dòng mặc định và Standard Operation thuộc từng khu vực."
    purpose="Tạo 'lane' trên Board Điều Độ: mỗi khu vực điều độ có tên, thứ tự, số dòng, resource và danh sách công đoạn chính được phép điều độ tại đó."
    impact="Công đoạn chính chưa gán vào Schedule Area nào sẽ không xuất hiện trên Board Điều Độ. Chỉ khu vực bật Điều độ tay mới xuất hiện trong luồng điều độ thủ công."
    prev={{label:"Physical Area Master",href:"/area"}}
    next={{label:"Phân chia Planner",href:"/planner-work-assignment"}}
   />
   <ScheduleAreaManager/>
  </section>
 </div>
</main>}
