import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar} from "@/components/config-nav";
import {ConfigOverviewClient} from "@/components/config-overview-client";

// The overview shell is static. Config health is intentionally loaded in the
// browser so the expensive health query never blocks the initial HTML.
export const revalidate=300;

export default function Page(){
 return <main className="erp-shell">
  <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">CONFIGURATION</div></header>
  <AppTabs active="config"/>
  <div className="erp-workspace">
   <ConfigSidebar active="overview"/>
   <section className="erp-content">
    <div className="erp-page-head"><div><h2>🧭 Tổng quan Cấu hình</h2><p>Luồng chuẩn: từ Operation Code → mapping hoàn chỉnh → sẵn sàng lập kế hoạch</p></div></div>
    <ConfigOverviewClient/>
   </section>
  </div>
 </main>;
}
