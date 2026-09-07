import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {UnconfiguredOperationsManager} from "@/components/unconfigured-operations-manager";
import {getPool} from "@/lib/db";
import {loadOperationInbox} from "@/lib/config/unconfigured-operations";

export const dynamic="force-dynamic";

export default async function Page(){
 const c=await getPool().connect();
 try{
  const [{rows,reviewTableReady},mainQ,groupQ,areaQ,scheduleQ]=await Promise.all([
   loadOperationInbox(c),
   c.query(`select standard_operation,st_group,planning_sort_order,batch_prefix from md_operation_master where is_active=true order by planning_sort_order nulls last,standard_operation`),
   c.query(`select st_group,group_name from md_st_group where is_active=true order by sort_order,st_group`),
   c.query(`select id,area_code,area_name from md_area where is_active=true order by sort_order,area_name`),
   c.query(`select a.schedule_area_code,a.schedule_area_name,coalesce(w.planner_owner,'') planner_owner from md_schedule_area a left join md_planner_work_assignment w on w.schedule_area_code=a.schedule_area_code and w.is_active=true where a.is_active=true order by a.display_order,a.schedule_area_code`),
  ]);
  return <main className="erp-shell erpkit-migrated-page"><ErpAppHeader module="CONFIGURATION"/><AppTabs active="config"/><div className="erp-workspace"><ConfigSidebar active="unconfiguredoperations"/><section className="erp-content"><ConfigPageHeader
   title="New / Unconfigured Operations"
   subtitle="Operation Inbox từ All Open Job — review trước khi đưa Operation mới vào ST."
   purpose="Quét unique NextOperation + AllOperation, tách Operation chưa cấu hình, inactive, partial config hoặc đã xác nhận Not ST."
   impact="Chỉ khi bấm Add to ST Operation mới ghi ST Scope/Mapping theo loại được chọn. Not ST chỉ lưu quyết định review, không sửa All Open Job."
   prev={{label:"Health Dashboard",href:"/settings"}}
   next={{label:"ST Operation Flow",href:"/st-operation-flow"}}
  /><UnconfiguredOperationsManager rows={rows} mainOperations={mainQ.rows as any} groups={groupQ.rows as any} areas={areaQ.rows as any} scheduleAreas={scheduleQ.rows as any} reviewTableReady={reviewTableReady}/></section></div></main>;
 }finally{c.release()}
}
