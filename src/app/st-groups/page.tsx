import {getPool} from "@/lib/db";import {StGroupManager} from "@/components/st-group-manager";import {AppTabs,SubTabs} from "@/components/app-tabs";
export const dynamic="force-dynamic";
const tabs=[{key:"flow",label:"ST Operation Flow",href:"/st-operation-flow"},{key:"operation",label:"Main Operation Master",href:"/master/operation"},{key:"operationcodeorder",label:"ST Scope & Operation Order",href:"/operation-code-order"},{key:"operationmapping",label:"Source → Main Mapping",href:"/master/operationmapping"},{key:"stgroup",label:"ST Group Master",href:"/st-groups"},{key:"area",label:"Physical Area Master",href:"/area"},
 {key:"schedulearea",label:"Schedule Area Mapping",href:"/schedule-areas"},
 {key:"plannerassignment",label:"Phân chia Planner",href:"/planner-work-assignment"},
 {key:"processrecipe",label:"Process Recipe",href:"/process-recipes"},
 {key:"openjobcolumnvalues",label:"Open Job Column Values",href:"/open-job-column-values"},
 {key:"batchkeyrules",label:"Batch Key / Recipe Rules",href:"/batch-key-recipe-rules"},
 {key:"autoplanning",label:"Auto Planning Rules",href:"/auto-planning-rules"}];
export default async function Page(){
 const q=await getPool().query(`
  select st_group,group_name,description,sort_order,is_active
  from md_st_group
  where is_active=true
  order by sort_order,st_group
 `);
 const data=q.rows;
 return <main className="erp-shell">
  <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">CONFIGURATION</div></header>
  <AppTabs active="config"/>
  <div className="erp-workspace">
   <aside className="erp-sidebar"><div className="erp-sidebar-title">CẤU HÌNH</div><SubTabs items={tabs} active="stgroup"/></aside>
   <section className="erp-content"><div className="erp-page-head"><div><h2>ST Group Master</h2><p>{data?.length||0} active groups · Add / Edit / Deactivate</p></div></div><StGroupManager rows={(data||[]) as any}/></section>
  </div>
 </main>
}