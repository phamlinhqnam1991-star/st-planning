import {AppTabs,SubTabs} from "@/components/app-tabs";
import {ProcessRecipeManager} from "@/components/process-recipe-manager";
import {MainOperationRecipeMappingManager} from "@/components/main-operation-recipe-mapping-manager";
import {ProcessTimeRuleManager} from "@/components/process-time-rule-manager";
import {ChemicalHandlingTimeManager} from "@/components/chemical-handling-time-manager";
import {getPool} from "@/lib/db";
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

export default async function Page({searchParams}:{searchParams:Promise<{part?:string}>}){
 const sp=await searchParams,part=(sp.part||"").trim().toUpperCase();
 const c=await getPool().connect();
 try{
  const [recipesQ,mapsQ,opsQ,partQ,sourceOpsQ,chemicalRecipesQ,chemicalMapsQ,timeRulesQ,handlingRulesQ]=await Promise.all([
   c.query(`select recipe_key,process_family,recipe_group,recipe_no,recipe_name,batch_key,source_system,note,is_active
            from md_process_recipe where is_active=true
            order by process_family,recipe_group,recipe_no nulls last,recipe_name limit 3000`),
   c.query(`select m.standard_operation,m.recipe_key,m.source_slot,m.is_default,
                   r.recipe_no,r.recipe_name,r.recipe_group,r.process_family
            from md_operation_recipe_mapping m
            join md_process_recipe r on r.recipe_key=m.recipe_key
            where m.is_active=true and r.is_active=true
            order by m.standard_operation,r.process_family,r.recipe_group,r.recipe_no nulls last`),
   c.query(`select standard_operation from md_operation_master where is_active=true order by standard_operation`),
   part?c.query(`select p.part_num,p.revision_num,p.standard_operation,p.recipe_key,p.source_slot,p.source_recipe_no,
                        r.recipe_no,r.recipe_name,r.recipe_group,r.process_family,r.batch_key
                 from md_part_process_recipe p
                 join md_process_recipe r on r.recipe_key=p.recipe_key
                 where p.part_num=$1 and p.is_active=true and r.is_active=true
                 order by p.revision_num,p.standard_operation`,[part]):Promise.resolve({rows:[]}),
   c.query(`select operation_code,operation_name
            from md_operation
            where is_active=true
            order by operation_code`),
   c.query(`select recipe_key,process_family,recipe_group,recipe_no,recipe_name,batch_key
            from md_process_recipe
            where is_active=true
            order by process_family,
              case when recipe_no ~ '^[0-9]+$' then recipe_no::int else 9999 end,
              recipe_no`),
   c.query(`select m.operation_code,o.operation_name,m.standard_operation,m.recipe_key,m.note,
                   m.priority,m.selection_rule,m.is_default,
                   r.recipe_no,r.recipe_name,r.batch_key
            from md_main_operation_recipe m
            left join md_operation o on o.operation_code=m.operation_code
            join md_process_recipe r on r.recipe_key=m.recipe_key
            where m.is_active=true and r.is_active=true
            order by m.operation_code,m.priority,r.recipe_no`),
   c.query(`select t.id,t.recipe_key,t.calc_type,t.priority,
                   t.qty_min,t.qty_max,t.surface_min_dm2,t.surface_max_dm2,
                   t.fixed_hours,t.standard_hours,t.note,
                   r.process_family,r.recipe_group,r.recipe_no,r.recipe_name
            from md_recipe_time_rule t
            join md_process_recipe r on r.recipe_key=t.recipe_key
            where t.is_active=true and r.is_active=true
            order by r.process_family,r.recipe_group,r.recipe_no,t.priority,t.id`),
   c.query(`select id,phase,priority,qty_min,qty_max,surface_min_dm2,surface_max_dm2,duration_minutes,note
            from md_chemical_handling_time_rule where is_active=true order by phase,priority,id`)
  ]);
  return <main className="erp-shell">
   <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">CONFIGURATION</div></header>
   <AppTabs active="config"/>
   <div className="erp-workspace">
    <aside className="erp-sidebar"><div className="erp-sidebar-title">CẤU HÌNH</div><SubTabs items={tabs} active="processrecipe"/></aside>
    <section className="erp-content">
     <div className="erp-page-head"><div><h2>Process Recipe Master</h2><p>Recipe + Process Time + Recipe Mapping dùng chung cho mọi công đoạn chính</p></div></div>
     <div className="notice recipe-note"><b>Kiến trúc dùng chung:</b> Recipe Name resolve từ Process Recipe Master. Mỗi Operation Code / Main Operation có thể cấu hình nhiều Recipe; Process Time không còn giới hạn Chemical/Paint. Batch Key / Recipe Rules điều khiển đề xuất Recipe trên Planning Board.</div>
     <ProcessRecipeManager recipes={recipesQ.rows as any} mappings={mapsQ.rows as any} operations={opsQ.rows as any} partRows={partQ.rows as any} partQuery={part}/>
     <MainOperationRecipeMappingManager
       operations={sourceOpsQ.rows as any}
       mainOperations={(opsQ.rows as any[]).map((x:any)=>x.standard_operation)}
       recipes={chemicalRecipesQ.rows as any}
       mappings={chemicalMapsQ.rows as any}
     />
     <ChemicalHandlingTimeManager rules={handlingRulesQ.rows as any}/>
     <ProcessTimeRuleManager
       recipes={recipesQ.rows as any}
       rules={timeRulesQ.rows as any}
     />
    </section>
   </div>
  </main>
 }finally{c.release()}
}
