import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {ProcessRequirementFilterManager} from "@/components/process-requirement-filter-manager";

export const dynamic="force-dynamic";

export default function Page(){
 return <main className="erp-shell erpkit-migrated-page">
  <ErpAppHeader module="CONFIGURATION"/>
  <AppTabs active="config"/>
  <div className="erp-workspace">
   <ConfigSidebar active="processrequirementfilter"/>
   <section className="erp-content">
    <ConfigPageHeader
     title="Process Requirement Import Filter"
     subtitle="Part-level Gate first, then store only Process Requirements required by Recipe Rules or explicitly marked Keep."
     purpose="Reduce md_process_requirement size in two levels: a Part/Revision Gate can skip all 38 Requirements (default ST = NO), then active MD:REQ Recipe Rules + Manual Keep decide which non-blank values remain."
     impact="After changing a Gate, Recipe Rule or Keep setting, use Requirement-only Rebuild for the lightest synchronization. It rebuilds only md_process_requirement and does not run Routing, Recipe, Auto Bridge or Planning Chain."
     prev={{label:"Recipe & Batch Rules",href:"/recipe-operation-map"}}
     next={{label:"Open Job Column Values",href:"/open-job-column-values"}}
    />
    <ProcessRequirementFilterManager/>
   </section>
  </div>
 </main>;
}
