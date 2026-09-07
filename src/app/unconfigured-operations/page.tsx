import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {UnconfiguredOperationsManager} from "@/components/unconfigured-operations-manager";
import {getPool} from "@/lib/db";
import {loadOperationInbox} from "@/lib/config/unconfigured-operations";
import type {PoolClient} from "pg";

export const dynamic="force-dynamic";

async function safeRows(c:PoolClient,sql:string,fallbackSql?:string){
 try{return (await c.query(sql)).rows}
 catch{
  if(!fallbackSql)return [];
  try{return (await c.query(fallbackSql)).rows}catch{return []}
 }
}

function ErrorPanel({message}:{message:string}){
 return <div className="erp-panel" style={{marginTop:16}}>
  <div className="erp-panel-head"><div><b>Operation Inbox chưa tải được</b><small>Trang Configuration vẫn hoạt động; lỗi được cô lập tại nguồn dữ liệu Operation Inbox.</small></div><span className="erp-status-pill warn">SERVER DATA</span></div>
  <div style={{padding:16}}>
   <p style={{marginTop:0}}>Kiểm tra DB migration/schema rồi Reload. Chi tiết:</p>
   <pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",fontSize:12}}>{message}</pre>
  </div>
 </div>;
}

export default async function Page(){
 let c:PoolClient|null=null;
 let error="";
 try{
  c=await getPool().connect();
  const {rows,reviewTableReady}=await loadOperationInbox(c);

  // These are editor helpers only. A missing optional configuration table must
  // not take down the Inbox list itself.
  const [mainOperations,groups,areas,scheduleAreas,bridgeSegments]=await Promise.all([
   safeRows(c,`select standard_operation,st_group,planning_sort_order,null::text batch_prefix from md_operation_master where is_active=true order by planning_sort_order nulls last,standard_operation`),
   safeRows(c,`select st_group,group_name from md_st_group where is_active=true order by sort_order,st_group`),
   safeRows(c,`select id,area_code,area_name from md_area where is_active=true order by sort_order,area_name`),
   safeRows(c,
    `select a.schedule_area_code,a.schedule_area_name,coalesce(w.planner_owner,'') planner_owner from md_schedule_area a left join md_planner_work_assignment w on w.schedule_area_code=a.schedule_area_code and w.is_active=true where a.is_active=true order by a.display_order,a.schedule_area_code`,
    `select schedule_area_code,schedule_area_name,case when planner_owner in ('1','2') then planner_owner else '' end planner_owner from md_schedule_area where is_active=true order by display_order,schedule_area_code`
   ),
   safeRows(c,`select id,previous_main_operation,next_main_operation,intermediate_signature,source from md_intermediate_bridge_segment where is_active=true order by case when source='MANUAL' then 0 else 1 end,previous_main_operation,next_main_operation,id`),
  ]);

  return <main className="erp-shell erpkit-migrated-page"><ErpAppHeader module="CONFIGURATION"/><AppTabs active="config"/><div className="erp-workspace"><ConfigSidebar active="unconfiguredoperations"/><section className="erp-content"><ConfigPageHeader
   title="New / Unconfigured Operations"
   subtitle="Operation Inbox từ All Open Job — review trước khi đưa Operation mới vào ST."
   purpose="Quét unique NextOperation + AllOperation, tách Operation chưa cấu hình, inactive, partial config hoặc đã xác nhận Not ST."
   impact="Chỉ khi bấm Add to ST Operation mới ghi ST Scope/Mapping theo loại được chọn. Not ST chỉ lưu quyết định review, không sửa All Open Job."
   prev={{label:"Health Dashboard",href:"/settings"}}
   next={{label:"ST Operation Flow",href:"/st-operation-flow"}}
  /><UnconfiguredOperationsManager rows={rows} mainOperations={mainOperations as any} groups={groups as any} areas={areas as any} scheduleAreas={scheduleAreas as any} bridgeSegments={bridgeSegments as any} reviewTableReady={reviewTableReady}/></section></div></main>;
 }catch(e){
  error=e instanceof Error?e.message:String(e);
 }finally{
  c?.release();
 }

 return <main className="erp-shell erpkit-migrated-page"><ErpAppHeader module="CONFIGURATION"/><AppTabs active="config"/><div className="erp-workspace"><ConfigSidebar active="unconfiguredoperations"/><section className="erp-content"><ConfigPageHeader
  title="New / Unconfigured Operations"
  subtitle="Operation Inbox từ All Open Job — review trước khi đưa Operation mới vào ST."
  purpose="Quét unique NextOperation + AllOperation và review Operation trước khi đưa vào ST."
  impact="Không thay đổi All Open Job / Planning Chain / Batch / Schedule."
  prev={{label:"Health Dashboard",href:"/settings"}}
  next={{label:"ST Operation Flow",href:"/st-operation-flow"}}
 /><ErrorPanel message={error||"Unknown server data error"}/></section></div></main>;
}
