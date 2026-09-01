import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {OperationCodeOrderManager} from "@/components/operation-code-order-manager";
import {getPool} from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
 const c=await getPool().connect();
 try{
  const q=await c.query(`
   with bridge_ops as (
    select distinct upper(trim(bo.operation_code)) operation_code
    from md_intermediate_bridge_operation bo
    join md_intermediate_bridge_segment bs on bs.id=bo.segment_id and bs.is_active=true
   ), manual_scope as (
    select
     upper(trim(operation_code)) operation_code,
     case
      when bool_or(operation_type='ST_SCOPE_ONLY') then 'ST_SCOPE_ONLY'
      else 'PLANNING_OPERATION'
     end operation_type
    from public.md_st_operation_scope
    where is_active=true and operation_type<>'INTERMEDIATE'
    group by upper(trim(operation_code))
   ), catalog as (
    select operation_code,operation_type from manual_scope
    union
    select b.operation_code,'BRIDGE_INTERMEDIATE'::text operation_type
    from bridge_ops b
    where not exists(select 1 from manual_scope s where s.operation_code=b.operation_code)
   )
   select cat.operation_code,o.operation_name,o.planning_sort_order,cat.operation_type
   from catalog cat
   left join lateral (
    select x.operation_name,x.planning_sort_order
    from public.md_operation x
    where x.is_active=true and upper(trim(x.operation_code))=cat.operation_code
    order by case when trim(x.operation_code)=cat.operation_code then 0 else 1 end,x.updated_at desc nulls last,x.operation_code
    limit 1
   ) o on true
   order by o.planning_sort_order nulls last,cat.operation_code
  `);

  return <main className="erp-shell">
   <header className="erp-header">
    <div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div>
    <div className="erp-env">CONFIGURATION</div>
   </header>

   <AppTabs active="config"/>

   <div className="erp-workspace">
    <ConfigSidebar active="operationcodeorder"/>

    <section className="erp-content">
     <ConfigPageHeader
      title="ST Scope · Next Operation Sort"
      subtitle="Đặt Next Op Sort cho mọi Operation Code thuộc ST, kể cả Bridge Intermediate. Chỉ dùng để sort RAW NextOperation trên Planning Board."
      purpose="Đặt thứ tự hiển thị/sort của RAW NextOperation (vd CMSA = 10 · INSPLM = 25 · CHEMMILL = 30). Field này độc lập với Main Planning Order."
      impact="Đổi Next Op Sort không thay đổi READY/WAIT hay Planning Chain. Chỉ Add/Remove ST Scope mới ảnh hưởng chuỗi công đoạn."
      prev={{label:"Tổng quan Cấu hình",href:"/settings"}}
      next={{label:"Source → Main Mapping",href:"/master/operationmapping"}}
     />

     <div className="notice section">
      Ví dụ: CMSA = 10 · INSPLM = 25 · SCRB-CM = 27 · CHEMMILL = 30.
      Planning Board sort Next Operation sẽ dùng số này, kể cả Intermediate.
      Next Op Sort không can thiệp Main Planning Order, READY/WAIT hay Planning Chain. Để thêm Operation đầy đủ một lần, dùng <a href="/st-operation-flow">ST Operation Flow</a>.
     </div>

     <OperationCodeOrderManager rows={q.rows as any}/>
    </section>
   </div>
  </main>;
 }finally{
  c.release();
 }
}
