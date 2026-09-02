import {getPool} from "@/lib/db";
import {OperationMappingManager} from "@/components/operation-mapping-manager";
import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
export const dynamic="force-dynamic";
export default async function Page(){
 const c=await getPool().connect();
 let rows:any[]=[];
 let masters:any[]=[];
 let ops:any[]=[];
 try{
  const [mappingQ,groupQ,operationQ]=await Promise.all([
   c.query(`select distinct m.* from md_st_operation_mapping m join md_st_operation_scope s on upper(trim(s.operation_code))=upper(trim(m.source_operation_code)) and s.is_active=true and s.operation_type='PLANNING_OPERATION' where m.is_active=true order by m.sort_order,m.id`),
   c.query(`select st_group from md_st_group where is_active=true order by sort_order,st_group`),
   c.query(`select o.operation_code from md_operation o join md_st_operation_scope s on upper(trim(s.operation_code))=upper(trim(o.operation_code)) and s.is_active=true and s.operation_type='PLANNING_OPERATION' where o.is_active=true order by o.operation_code`)
  ]);
  rows=mappingQ.rows;
  masters=groupQ.rows;
  ops=operationQ.rows;
 }finally{
  c.release();
 }
 const groups=[...new Set(masters.map((x:any)=>String(x.st_group)).filter(Boolean))];
 const sourceOperations=[...new Set(ops.map((x:any)=>String(x.operation_code)).filter(Boolean))];
 return <main className="erp-shell erpkit-migrated-page">
  <header className="erp-header"><div><h1>ST Planning</h1></div><div className="erp-env">CONFIGURATION</div></header>
  <AppTabs active="config"/>
  <div className="erp-workspace">
   <ConfigSidebar active="operationmapping"/>
   <section className="erp-content">
    <ConfigPageHeader
     title="Source → Main Mapping"
     subtitle="Gán mỗi Operation Code vào ST Group + Công đoạn chính (Main Operation) + quy tắc."
     purpose="Quyết định Operation Code nguồn 'thành' công đoạn chính nào khi lập kế hoạch, kèm quy tắc ánh xạ (DIRECT / OCCURRENCE / SEQUENCE / SEQUENCE/FALLBACK)."
     impact="Mapping sai sẽ khiến Job đi vào sai công đoạn trên Planning Board. Chỉ Operation loại Planning Operation mới xuất hiện ở đây; ST_SCOPE_ONLY không tham gia Planning/Batch/Điều độ."
     prev={{label:"ST Scope · Operation Code Order",href:"/operation-code-order"}}
     next={{label:"Main Operation Master",href:"/master/operation"}}
    />
    <OperationMappingManager rows={(rows||[]) as any} groups={groups} sourceOperations={sourceOperations}/>
   </section>
  </div>
 </main>
}
