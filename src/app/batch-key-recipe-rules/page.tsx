import {AppTabs,SubTabs} from "@/components/app-tabs";
import {BatchKeyRecipeRuleManager} from "@/components/batch-key-recipe-rule-manager";
export const dynamic="force-dynamic";

const tabs=[
 {key:"flow",label:"ST Operation Flow",href:"/st-operation-flow"},{key:"operation",label:"Main Operation Master",href:"/master/operation"},{key:"operationcodeorder",label:"ST Scope & Operation Order",href:"/operation-code-order"},
 {key:"operationmapping",label:"Source → Main Mapping",href:"/master/operationmapping"},
 {key:"stgroup",label:"ST Group Master",href:"/st-groups"},
 {key:"area",label:"Physical Area Master",href:"/area"},
 {key:"schedulearea",label:"Schedule Area Mapping",href:"/schedule-areas"},
 {key:"plannerassignment",label:"Phân chia Planner",href:"/planner-work-assignment"},
 {key:"processrecipe",label:"Process Recipe",href:"/process-recipes"},
 {key:"openjobcolumnvalues",label:"Open Job Column Values",href:"/open-job-column-values"},
 {key:"batchkeyrules",label:"Batch Key / Recipe Rules",href:"/batch-key-recipe-rules"},
 {key:"autoplanning",label:"Auto Planning Rules",href:"/auto-planning-rules"},
];

export default async function Page({searchParams}:{searchParams:Promise<{op?:string}>}){
 const sp=await searchParams;
 const prefillOp=(sp.op||"").trim();
 return <main className="erp-shell">
  <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">CONFIGURATION</div></header>
  <AppTabs active="config"/>
  <div className="erp-workspace">
   <aside className="erp-sidebar"><div className="erp-sidebar-title">CẤU HÌNH</div><SubTabs items={tabs} active="batchkeyrules"/></aside>
   <section className="erp-content">
    <div className="erp-page-head"><div><h2>Batch Key / Recipe Rules</h2><p>Mỗi rule: Main Operation + điều kiện trên cột All Open Job → đề xuất Recipe + Batch Key + Prefix số lô. Áp dụng cho MỌI công đoạn chính.</p></div></div>
    <div className="notice recipe-note"><b>Nguyên tắc:</b> Batch Key = khóa gom lô (vd <span className="mono">PAINT|PRIMER|20-T3-10 EPOXY PRIMER</span>); Batch No Prefix = 3 ký tự sinh số lô (vd <span className="mono">PRI_27AUG_001</span>). Template Batch Key có thể dùng <span className="mono">{`{TEN_COT}`}</span> để lấy giá trị thật của Job. Nếu nhiều rule cùng ưu tiên khớp, hệ thống sẽ báo để planner chọn tay — không tự chọn bừa.</div>
    <BatchKeyRecipeRuleManager prefillOperation={prefillOp}/>
   </section>
  </div>
 </main>
}
