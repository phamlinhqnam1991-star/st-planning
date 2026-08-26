import {AppTabs,SubTabs} from "@/components/app-tabs";
import {OperationCodeOrderManager} from "@/components/operation-code-order-manager";
import {getPool} from "@/lib/db";
import {ensureOperationCodePlanningOrderSchema} from "@/lib/operation-code-planning-order";

export const dynamic="force-dynamic";

const tabs=[
 {key:"operation",label:"Operation Master",href:"/master/operation"},
 {key:"operationcodeorder",label:"Operation Code Order",href:"/operation-code-order"},
 {key:"operationmapping",label:"ST Operation Mapping",href:"/master/operationmapping"},
 {key:"stgroup",label:"ST Group Master",href:"/st-groups"},
 {key:"area",label:"Area Master",href:"/area"},
 {key:"schedulearea",label:"Schedule Area Mapping",href:"/schedule-areas"},
 {key:"plannerassignment",label:"Phân chia Planner",href:"/planner-work-assignment"},
 {key:"processrecipe",label:"Process Recipe",href:"/process-recipes"},
 {key:"autoplanning",label:"Auto Planning Rules",href:"/auto-planning-rules"}
];

export default async function Page(){
 const c=await getPool().connect();
 try{
  await ensureOperationCodePlanningOrderSchema(c);

  const q=await c.query(`
   select operation_code,operation_name,planning_sort_order
   from public.md_operation
   where is_active=true
   order by planning_sort_order nulls last,operation_code
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
       <h2>Operation Code · Planning Order</h2>
       <p>
        Thứ tự sản xuất chung dùng cho NextOperation. Số nhỏ được xếp trước.
        Không phụ thuộc routing riêng của từng Job.
       </p>
      </div>
     </div>

     <div className="notice section">
      Ví dụ: CPBILP = 10 · PIONBL = 20 · BSAUNSLD = 30.
      Candidate Sort theo NextOperation ASC sẽ dùng thứ tự này.
     </div>

     <OperationCodeOrderManager rows={q.rows as any}/>
    </section>
   </div>
  </main>;
 }finally{
  c.release();
 }
}
