import {AppTabs,SubTabs} from "@/components/app-tabs";
import {ProcessRecipeManager} from "@/components/process-recipe-manager";
import {ChemicalRecipeMappingManager} from "@/components/chemical-recipe-mapping-manager";
import {ProcessTimeRuleManager} from "@/components/process-time-rule-manager";
import {getPool} from "@/lib/db";
export const dynamic="force-dynamic";

const tabs=[
 {key:"operation",label:"Operation Master",href:"/master/operation"},
 {key:"operationmapping",label:"ST Operation Mapping",href:"/master/operationmapping"},
 {key:"stgroup",label:"ST Group Master",href:"/st-groups"},
 {key:"area",label:"Area Master",href:"/area"},
 {key:"processrecipe",label:"Process Recipe",href:"/process-recipes"},{key:"autoplanning",label:"Auto Planning Rules",href:"/auto-planning-rules"},
];

export default async function Page({searchParams}:{searchParams:Promise<{part?:string}>}){
 const sp=await searchParams,part=(sp.part||"").trim().toUpperCase();
 const c=await getPool().connect();
 try{
  const [recipesQ,mapsQ,opsQ,partQ,sourceOpsQ,chemicalRecipesQ,chemicalMapsQ,timeRulesQ]=await Promise.all([
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
            where is_active=true and process_family='CHEMICAL_LINE'
            order by
              case when recipe_no ~ '^[0-9]+$' then recipe_no::int else 9999 end,
              recipe_no`),
   c.query(`select m.operation_code,o.operation_name,m.recipe_key,m.note,
                   m.priority,m.selection_rule,m.is_default,
                   r.recipe_no,r.recipe_name,r.batch_key
            from md_operation_code_recipe m
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
            order by r.process_family,r.recipe_group,r.recipe_no,t.priority,t.id`)
  ]);
  return <main className="erp-shell">
   <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">CONFIGURATION</div></header>
   <AppTabs active="config"/>
   <div className="erp-workspace">
    <aside className="erp-sidebar"><div className="erp-sidebar-title">CẤU HÌNH</div><SubTabs items={tabs} active="processrecipe"/></aside>
    <section className="erp-content">
     <div className="erp-page-head"><div><h2>Process Recipe Master</h2><p>Kiến trúc dùng chung cho mọi công đoạn · Phase 1 tự động hóa Paint Recipe</p></div></div>
     <div className="notice recipe-note"><b>Phase 1 – Painting:</b> Master List chỉ cung cấp Recipe No. Paint: Recipe Name resolve từ Process Recipe Master. Chemical Line: mỗi Operation Code có thể cấu hình nhiều Recipe; Auto Select sẽ dùng Priority/Selection Rule khi có All Open Job.</div>
     <ProcessRecipeManager recipes={recipesQ.rows as any} mappings={mapsQ.rows as any} operations={opsQ.rows as any} partRows={partQ.rows as any} partQuery={part}/>
     <ChemicalRecipeMappingManager
       operations={sourceOpsQ.rows as any}
       recipes={chemicalRecipesQ.rows as any}
       mappings={chemicalMapsQ.rows as any}
     />
     <ProcessTimeRuleManager
       recipes={recipesQ.rows as any}
       rules={timeRulesQ.rows as any}
     />
    </section>
   </div>
  </main>
 }finally{c.release()}
}
