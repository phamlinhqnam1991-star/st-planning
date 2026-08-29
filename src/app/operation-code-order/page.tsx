import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {OperationCodeOrderManager} from "@/components/operation-code-order-manager";
import {getPool} from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
 const c=await getPool().connect();
 try{
  const q=await c.query(`
   with active_scope as (
    select
     upper(trim(operation_code)) operation_code,
     case when bool_or(operation_type='ST_SCOPE_ONLY')
      then 'ST_SCOPE_ONLY' else 'PLANNING_OPERATION' end operation_type
    from public.md_st_operation_scope
    where is_active=true
    group by upper(trim(operation_code))
   )
   select s.operation_code,o.operation_name,o.planning_sort_order,s.operation_type
   from active_scope s
   left join lateral (
    select x.operation_name,x.planning_sort_order
    from public.md_operation x
    where x.is_active=true and upper(trim(x.operation_code))=s.operation_code
    order by case when trim(x.operation_code)=s.operation_code then 0 else 1 end,x.updated_at desc nulls last,x.operation_code
    limit 1
   ) o on true
   order by o.planning_sort_order nulls last,s.operation_code
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
      title="ST Scope · Operation Code Order"
      subtitle="Chỉ Operation Code thuộc ST Scope mới tham gia lập kế hoạch. Đây là thứ tự sản xuất chung của RAW NextOperation."
      purpose="Khai báo Operation Code nào thuộc phạm vi ST và đặt thứ tự công đoạn (vd CPBILP = 10 · PIONBL = 20 · BSAUNSLD = 30). Add/Remove ở đây chỉ quản lý ST Scope + Order."
      impact="Thêm/bỏ code khỏi ST Scope sẽ thay đổi toàn bộ chuỗi công đoạn của các Job liên quan. Source→Main Mapping và Khu vực được quản lý tập trung tại ST Operation Flow."
      prev={{label:"Tổng quan Cấu hình",href:"/settings"}}
      next={{label:"Source → Main Mapping",href:"/master/operationmapping"}}
     />

     <div className="notice section">
      Ví dụ: CPBILP = 10 · PIONBL = 20 · BSAUNSLD = 30.
      Candidate Sort theo NextOperation ASC sẽ dùng thứ tự này.
      Add/Remove ở đây chỉ quản lý ST Scope + Order. Để thêm Operation đầy đủ một lần, dùng <a href="/st-operation-flow">ST Operation Flow</a>.
     </div>

     <OperationCodeOrderManager rows={q.rows as any}/>
    </section>
   </div>
  </main>;
 }finally{
  c.release();
 }
}
