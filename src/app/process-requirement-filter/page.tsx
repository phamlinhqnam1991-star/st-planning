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
     subtitle="Store only Process Requirements required by Recipe Rules or explicitly marked Keep by the planner."
     purpose="Reduce md_process_requirement size: active MD:REQ Recipe Rules are retained automatically; the planner marks only additional Requirements that must remain available for lookup. Blank values are not imported."
     impact="After changing a Rule or Keep setting, re-import Master to synchronize Requirements. Cleanup truncates only md_process_requirement; Part, Routing, Planning Chain, Batch, Schedule and Production Execution are untouched."
     prev={{label:"Recipe & Batch Rules",href:"/recipe-operation-map"}}
     next={{label:"Open Job Column Values",href:"/open-job-column-values"}}
    />
    <ProcessRequirementFilterManager/>
   </section>
  </div>
 </main>;
}
