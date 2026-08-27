import {AppTabs,SubTabs} from "@/components/app-tabs";
import {OpenJobColumnValueManager} from "@/components/open-job-column-value-manager";
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

export default async function Page(){
 return <main className="erp-shell">
  <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">CONFIGURATION</div></header>
  <AppTabs active="config"/>
  <div className="erp-workspace">
   <aside className="erp-sidebar"><div className="erp-sidebar-title">CẤU HÌNH</div><SubTabs items={tabs} active="openjobcolumnvalues"/></aside>
   <section className="erp-content">
    <div className="erp-page-head"><div><h2>Open Job Column Values</h2><p>Tổng hợp mọi giá trị unique theo từng cột trong All Open Job — nguồn dữ liệu để cấu hình Batch Key / Recipe Rules.</p></div></div>
    <div className="notice recipe-note"><b>Cách dùng:</b> Bấm <b>Scan / Rebuild</b> để quét lại toàn bộ cột từ All Open Job hiện tại. Khi tạo rule, chọn cột là danh sách giá trị hiện ra tự động — không cần gõ tay.</div>
    <OpenJobColumnValueManager/>
   </section>
  </div>
 </main>
}
