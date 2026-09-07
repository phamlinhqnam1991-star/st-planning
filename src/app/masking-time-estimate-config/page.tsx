import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {MaskingTimeEstimateConfigManager} from "@/components/masking-time-estimate-config-manager";

export const dynamic="force-dynamic";

/**
 * V514: this route intentionally does not read Masking config from PostgreSQL
 * inside the Server Component.  All Masking data is loaded by the client via
 * the fail-safe API.  Therefore a config/API/DB problem can never reject the
 * RSC payload and replace the whole page with "This page couldn't load".
 */
export default function Page(){
 return <main className="erp-shell erpkit-migrated-page">
  <ErpAppHeader module="CONFIGURATION"/><AppTabs active="config"/>
  <div className="erp-workspace"><ConfigSidebar active="maskingtime"/><section className="erp-content erp-content-full">
   <ConfigPageHeader
    title="Masking Time Estimate"
    subtitle="Gán Main Operation với cột thời gian Masking trong All Open Job và số người theo Physical Area."
    purpose="Ước tính Masking workload / duration / ready time để Planner điều độ chính xác hơn."
    impact="Chỉ là Planning Advisory trên Scheduling Board. Không tạo Masking resource, không đổi READY/WAIT, Batch, Recipe hay khóa Start."
    prev={{label:"Process Time",href:"/recipe-time-process"}}
    next={{label:"Auto Planning Rules",href:"/auto-planning-rules"}}
   />
   <MaskingTimeEstimateConfigManager/>
  </section></div>
 </main>;
}
