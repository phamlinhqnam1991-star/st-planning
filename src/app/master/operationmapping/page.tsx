import {getPool} from "@/lib/db";
import {OperationMappingManager} from "@/components/operation-mapping-manager";
import {AppTabs,SubTabs} from "@/components/app-tabs";
export const dynamic="force-dynamic";
const tabs=[{key:"flow",label:"ST Operation Flow",href:"/st-operation-flow"},{key:"operation",label:"Main Operation Master",href:"/master/operation"},{key:"operationcodeorder",label:"ST Scope & Operation Order",href:"/operation-code-order"},{key:"operationmapping",label:"Source → Main Mapping",href:"/master/operationmapping"},{key:"stgroup",label:"ST Group Master",href:"/st-groups"},{key:"area",label:"Physical Area Master",href:"/area"},{key:"schedulearea",label:"Schedule Area Mapping",href:"/schedule-areas"},
 {key:"processrecipe",label:"Process Recipe",href:"/process-recipes"},{key:"autoplanning",label:"Auto Planning Rules",href:"/auto-planning-rules"}];
export default async function Page(){
 const c=await getPool().connect();
 let rows:any[]=[];
 let masters:any[]=[];
 let ops:any[]=[];
 try{
  const [mappingQ,groupQ,operationQ]=await Promise.all([
   c.query(`select m.* from md_st_operation_mapping m join md_st_operation_scope s on upper(trim(s.operation_code))=upper(trim(m.source_operation_code)) and s.is_active=true and s.operation_type='PLANNING_OPERATION' where m.is_active=true order by m.sort_order,m.id`),
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
 return <main className="erp-shell">
  <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">CONFIGURATION</div></header>
  <AppTabs active="config"/>
  <div className="erp-workspace">
   <aside className="erp-sidebar"><div className="erp-sidebar-title">CẤU HÌNH</div><SubTabs items={tabs} active="operationmapping"/></aside>
   <section className="erp-content">
    <div className="erp-page-head"><div><h2>Source → Main Mapping</h2><p>{rows?.length||0} active mappings · chi tiết nâng cao; thêm Operation mới nên dùng ST Operation Flow</p></div></div><div className="notice section"><b>Nguồn chuẩn:</b> Chỉ Operation có loại Planning Operation mới được Source → Main Mapping. ST_SCOPE_ONLY không xuất hiện tại đây và không tham gia Planning/Batch/Điều độ. Cấu hình loại tại <a href="/st-operation-flow">ST Operation Flow</a>.</div>
    <OperationMappingManager rows={(rows||[]) as any} groups={groups} sourceOperations={sourceOperations}/>
   </section>
  </div>
 </main>
}
