import {AppTabs,SubTabs} from "@/components/app-tabs";
import {OperationRecipeMappingMasterManager} from "@/components/operation-recipe-mapping-master-manager";
import {getPool} from "@/lib/db";

const sub=[
 {key:"part",label:"Part",href:"/master/part"},{key:"revision",label:"Part Revision",href:"/master/revision"},
 {key:"sourceoperation",label:"Source Operation",href:"/master/sourceoperation"},{key:"routing",label:"Routing Detail",href:"/master/routing"},
 {key:"finish",label:"Material Finish",href:"/master/finish"},{key:"requirement",label:"Process Requirement",href:"/master/requirement"},
 {key:"strouting",label:"ST Routing Master",href:"/master/strouting"},{key:"stroutingchain",label:"ST Routing Chain",href:"/master/stroutingchain"},
 {key:"partrouting",label:"Part → Routing",href:"/master/partrouting"},{key:"operationrecipemapping",label:"Main Op → Recipe",href:"/master/operation-recipe-mapping"}
];
export const dynamic="force-dynamic";
export default async function Page(){
 const c=await getPool().connect();
 try{
  const [rowsQ,opsQ,recipesQ]=await Promise.all([
   c.query(`select m.standard_operation,m.recipe_key,m.source_slot,m.is_default,r.recipe_no,r.recipe_name,r.recipe_group,r.process_family from md_operation_recipe_mapping m join md_process_recipe r on r.recipe_key=m.recipe_key where m.is_active=true and r.is_active=true order by m.standard_operation,r.recipe_no,r.recipe_key`),
   c.query(`select standard_operation from md_operation_master where is_active=true order by planning_sort_order,standard_operation`),
   c.query(`select recipe_key,recipe_no,recipe_name,recipe_group,process_family from md_process_recipe where is_active=true order by process_family,recipe_group,recipe_no,recipe_name`)
  ]);
  return <main className="erp-shell"><header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">MASTER DATA</div></header><AppTabs active="master"/><div className="erp-workspace"><aside className="erp-sidebar"><div className="erp-sidebar-title">MASTER DATA</div><SubTabs items={sub} active="operationrecipemapping"/></aside><section className="erp-content"><div className="erp-page-head"><div><h2>Main Operation → Recipe</h2><p>Quản lý mapping Standard Operation → Recipe</p></div></div><OperationRecipeMappingMasterManager rows={rowsQ.rows as any} operations={opsQ.rows.map((x:any)=>x.standard_operation)} recipes={recipesQ.rows as any}/></section></div></main>;
 }finally{c.release();}
}
