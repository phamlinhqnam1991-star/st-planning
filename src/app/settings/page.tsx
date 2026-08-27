import Link from "next/link";
import {getPool} from "@/lib/db";
import {AppTabs,SubTabs} from "@/components/app-tabs";
export const dynamic="force-dynamic";
const sub=[
 {key:"flow",label:"ST Operation Flow",href:"/st-operation-flow"},{key:"operation",label:"Main Operation Master",href:"/master/operation"},{key:"operationcodeorder",label:"ST Scope & Operation Order",href:"/operation-code-order"},
 {key:"operationmapping",label:"Source → Main Mapping",href:"/master/operationmapping"},
 {key:"stgroup",label:"ST Group Master",href:"/st-groups"},
 {key:"area",label:"Physical Area Master",href:"/area"},
 {key:"schedulearea",label:"Schedule Area Mapping",href:"/schedule-areas"},
 {key:"plannerassignment",label:"Phân chia Planner",href:"/planner-work-assignment"},
 {key:"processrecipe",label:"Process Recipe",href:"/process-recipes"},{key:"autoplanning",label:"Auto Planning Rules",href:"/auto-planning-rules"},
];
export default async function Page(){
 const db=await getPool().connect();
 let counts:any={
  md_st_operation_scope:0,
  md_operation_master:0,
  md_st_operation_mapping:0,
  md_st_group:0,
  md_area:0,
  md_schedule_area:0,
  md_process_recipe:0,
  md_auto_planning_rule:0
 };
 let issues:string[]=[];

 try{
  // One database round-trip only. /settings previously called getStats(),
  // which made many sequential Supabase Data API requests and could take 20–30s.
  const q=await db.query(`
   select
    (select count(*)::int from md_st_operation_scope where is_active=true) md_st_operation_scope,
    (select count(*)::int from md_operation_master where is_active=true) md_operation_master,
    (select count(*)::int from md_st_operation_mapping where is_active=true) md_st_operation_mapping,
    (select count(*)::int from md_st_group where is_active=true) md_st_group,
    (select count(*)::int from md_area where is_active=true) md_area,
    (select count(*)::int from md_schedule_area where is_active=true) md_schedule_area,
    (select count(*)::int from md_process_recipe where is_active=true) md_process_recipe,
    (select count(*)::int from md_auto_planning_rule where is_active=true) md_auto_planning_rule
  `);
  counts=q.rows[0]||counts;
 }catch(e){
  issues=[e instanceof Error?e.message:String(e)];
 }finally{
  db.release();
 }

 const c=counts;
 const rows=[
  ["ST Operation Flow","Nguồn chuẩn: ST Scope → Source/Main → Group → Area → Schedule",c.md_st_operation_scope||0,"/st-operation-flow"],
  ["Main Operation Master","Standard/Main Operation + Time Rules",c.md_operation_master,"/master/operation"],
  ["ST Scope & Operation Order","Operation Code thuộc ST + thứ tự RAW NextOperation",c.md_st_operation_scope||0,"/operation-code-order"],
  ["Source → Main Mapping","Operation Code → ST Group / Main Operation",c.md_st_operation_mapping,"/master/operationmapping"],
  ["ST Group Master","Danh mục nhóm công đoạn ST",c.md_st_group,"/st-groups"],
  ["Physical Area Master","Danh mục Area + gán ST Group",c.md_area,"/area"],
  ["Schedule Area Mapping","Khu vực điều độ + số dòng + Standard Operation",c.md_schedule_area||0,"/schedule-areas"],
  ["Phân chia Planner","Chuyển khu vực điều độ giữa Planner 1 / Planner 2",0,"/planner-work-assignment"],
  ["Process Recipe","Recipe theo process; Phase 1 Paint",c.md_process_recipe,"/process-recipes"],
  ["Auto Planning Rules","Rule tự động gom Batch theo từng Standard Operation",c.md_auto_planning_rule||0,"/auto-planning-rules"],
 ];
 return <main className="erp-shell">
  <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">CONFIGURATION</div></header>
  <AppTabs active="config"/>
  <div className="erp-workspace">
   <aside className="erp-sidebar"><div className="erp-sidebar-title">CẤU HÌNH</div><SubTabs items={sub}/></aside>
   <section className="erp-content">
    <div className="erp-page-head"><div><h2>Cấu hình Planning</h2><p>Quản lý Operation, Group và Area dùng cho lập kế hoạch</p></div></div>
    {issues.length>0&&<div className="notice"><b>Database cần kiểm tra:</b><ul className="issue-list">{issues.map((x:string,i:number)=><li key={`${i}-${x}`}>{x}</li>)}</ul></div>}
    <div className="erp-table-panel">
     <div className="erp-panel-head"><b>Configuration Master</b><span>{rows.length} configuration groups</span></div>
     <div className="table-wrap"><table className="erp-table"><thead><tr><th>Configuration</th><th>Mô tả</th><th className="num">Records</th><th></th></tr></thead><tbody>
      {rows.map(([name,desc,n,href])=><tr key={String(name)}><td><b>{String(name)}</b></td><td>{String(desc)}</td><td className="num mono">{Number(n||0).toLocaleString()}</td><td className="action"><Link className="erp-link" href={String(href)}>Open →</Link></td></tr>)}
     </tbody></table></div>
    </div>
   </section>
  </div>
 </main>
}