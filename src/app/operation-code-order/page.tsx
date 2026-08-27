import {AppTabs,SubTabs} from "@/components/app-tabs";
import {OperationCodeOrderManager} from "@/components/operation-code-order-manager";
import {getPool} from "@/lib/db";

export const dynamic="force-dynamic";

const tabs=[
 {key:"flow",label:"ST Operation Flow",href:"/st-operation-flow"},
 {key:"operation",label:"Main Operation Master",href:"/master/operation"},
 {key:"operationcodeorder",label:"ST Scope & Operation Order",href:"/operation-code-order"},
 {key:"operationmapping",label:"Source → Main Mapping",href:"/master/operationmapping"},
 {key:"stgroup",label:"ST Group Master",href:"/st-groups"},
 {key:"area",label:"Physical Area Master",href:"/area"},
 {key:"schedulearea",label:"Schedule Area Mapping",href:"/schedule-areas"},
 {key:"plannerassignment",label:"Phân chia Planner",href:"/planner-work-assignment"},
 {key:"processrecipe",label:"Process Recipe",href:"/process-recipes"},
 {key:"openjobcolumnvalues",label:"Open Job Column Values",href:"/open-job-column-values"},
 {key:"batchkeyrules",label:"Batch Key / Recipe Rules",href:"/batch-key-recipe-rules"},
 {key:"autoplanning",label:"Auto Planning Rules",href:"/auto-planning-rules"}
];

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
    <aside className="erp-sidebar">
     <div className="erp-sidebar-title">CẤU HÌNH</div>
     <SubTabs items={tabs} active="operationcodeorder"/>
    </aside>

    <section className="erp-content">
     <div className="erp-page-head">
      <div>
       <h2>ST Scope · Operation Code Order</h2>
       <p>
        Chỉ Operation Code thuộc ST Scope. Đây là thứ tự sản xuất chung của RAW NextOperation.
        Source→Main Mapping và Area/Schedule được quản lý tập trung tại ST Operation Flow.
       </p>
      </div>
     </div>

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
