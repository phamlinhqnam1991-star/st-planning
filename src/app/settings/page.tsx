import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar} from "@/components/config-nav";
import {ConfigOverviewClient} from "@/components/config-overview-client";

// The overview shell is static. Config health is intentionally loaded in the
// browser so the expensive health query never blocks the initial HTML.
export const revalidate=300;

export default function Page(){
 return <main className="erp-shell erpkit-migrated-page">
  <ErpAppHeader module="CONFIGURATION"/>
  <AppTabs active="config"/>
  <div className="erp-workspace">
   <ConfigSidebar active="overview"/>
   <section className="erp-content erp-config-workcenter-content">
    <ConfigOverviewClient/>
   </section>
  </div>
 </main>;
}
