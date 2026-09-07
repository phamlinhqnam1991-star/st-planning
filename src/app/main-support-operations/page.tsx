import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {MainSupportOperationManager} from "@/components/main-support-operation-manager";
import {getPool} from "@/lib/db";

export const dynamic="force-dynamic";
export default async function Page(){
 const c=await getPool().connect();
 try{
  const [mainsQ,configsQ,optionsQ]=await Promise.all([
   c.query(`select standard_operation,planning_sort_order from md_operation_master where is_active=true order by planning_sort_order nulls last,standard_operation`),
   c.query(`select standard_operation,support_type,support_operation_code from md_main_support_operation where is_active=true and relation='BEFORE_MAIN' order by standard_operation,support_type,sort_order,support_operation_code`),
   c.query(`select distinct upper(trim(operation_code)) operation_code,case when upper(trim(operation_code)) like '%UNMSK%' then 'UNMASKING' else 'MASKING' end support_type from md_routing_detailed where is_active=true and upper(trim(operation_code)) like '%MSK%' and upper(trim(operation_code)) not in ('FMSKG-CM') order by support_type,operation_code`)
  ]);
  return <main className="erp-shell erpkit-migrated-page"><ErpAppHeader module="CONFIGURATION"/><AppTabs active="config"/><div className="erp-workspace"><ConfigSidebar active="mainsupport"/><section className="erp-content erp-content-full">
   <ConfigPageHeader title="Masking / Unmasking by Main Operation" subtitle="Chọn công đoạn Masking và Unmasking nằm trước từng Main Planning Operation." purpose="Xác định rõ support operation phục vụ từng Main, đặc biệt PRIMER1 / PRIMER2 / PRIMER3 và TOPCOAT1 / TOPCOAT2." impact="Chỉ lọc/xác định Masking-Unmasking derived planning. Không thay READY, Batch, Recipe, Schedule hay Auto Planning." prev={{label:"Main Operation",href:"/master/operation"}} next={{label:"ST Group",href:"/st-groups"}}/>
   <MainSupportOperationManager mains={mainsQ.rows as any} configs={configsQ.rows as any} options={optionsQ.rows as any}/>
  </section></div></main>;
 }finally{c.release();}
}
