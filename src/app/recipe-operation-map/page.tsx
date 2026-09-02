import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {MainOperationRecipeMappingManager} from "@/components/main-operation-recipe-mapping-manager";
import {ProcessRecipeManager} from "@/components/process-recipe-manager";
import {getPool} from "@/lib/db";
import {unstable_cache} from "next/cache";
export const dynamic="force-dynamic";

// v341: danh sách mã yêu cầu (MD:REQ:*) — cache 5 phút thay vì quét
// md_process_requirement (2.1M rows) mỗi lần mở trang. Giá trị của từng mã
// được lazy-load qua /api/config/recipe-condition-values khi người dùng chọn
// cột đó trong builder điều kiện.
const getRequirementCodes=unstable_cache(async()=>{
 const c=await getPool().connect();
 try{
  const q=await c.query(`
    select distinct requirement_code
    from md_process_requirement
    where is_active=true and nullif(trim(requirement_code),'') is not null
    order by requirement_code
  `);
  return q.rows;
 }finally{c.release();}
},["config-recipe-req-codes"],{revalidate:300,tags:["config-recipe"]});

// Recipe Catalog + runtime Operation Code → Recipe are maintained together here.

export default async function Page({searchParams}:{searchParams:Promise<{part?:string}>}){
 const sp=await searchParams;
 const part=(sp.part||"").trim().toUpperCase();
 const c=await getPool().connect();
 try{
  const [sourceOpsQ,opsQ,chemicalRecipesQ,chemicalMapsQ,recipesQ,columnsQ,columnValuesQ,unmappedQ,masterValuesQ,masterReqCodesQ,timeRulesQ,partQ]=await Promise.all([
   c.query(`select distinct o.operation_code,o.operation_name
            from md_operation o
            join md_st_operation_scope s
              on upper(trim(s.operation_code))=upper(trim(o.operation_code))
             and s.is_active=true
             and coalesce(s.operation_type,'PLANNING_OPERATION')='PLANNING_OPERATION'
            join md_st_operation_mapping m
              on upper(trim(m.source_operation_code))=upper(trim(o.operation_code))
             and m.is_active=true
            where o.is_active=true
            order by o.operation_code`),
   c.query(`select standard_operation from md_operation_master where is_active=true order by standard_operation`),
   c.query(`select recipe_key,process_family,recipe_group,recipe_no,recipe_name,batch_key
            from md_process_recipe
            where is_active=true
            order by process_family,
              case when recipe_no ~ '^[0-9]+$' then recipe_no::int else 9999 end,
              recipe_no`),
   c.query(`select m.mapping_id,m.operation_code,o.operation_name,m.standard_operation,m.recipe_key,m.note,
                   m.priority,m.selection_rule,m.is_default,m.updated_at,
                   m.batch_key_template,m.batch_no_prefix,
                   r.recipe_no,r.recipe_name,r.batch_key,r.process_family,r.recipe_group
            from md_main_operation_recipe m
            left join md_operation o on o.operation_code=m.operation_code
            join md_process_recipe r on r.recipe_key=m.recipe_key
            where m.is_active=true and r.is_active=true
            order by m.operation_code,m.priority,m.mapping_id,r.recipe_no`),
   c.query(`select recipe_key,process_family,recipe_group,recipe_group_source_column,
                   recipe_no,recipe_no_source_column,recipe_name,recipe_name_source_column,
                   batch_key,source_system,note,is_active
            from md_process_recipe where is_active=true
            order by process_family,recipe_group,recipe_no nulls last,recipe_name limit 3000`),
   c.query(`select source_column
            from md_open_job_column_value
            where is_active=true
            group by source_column
            order by source_column`),
   c.query(`select source_column,source_value,coalesce(nullif(trim(display_name),''),source_value) display_name
            from md_open_job_column_value
            where is_active=true
              and nullif(trim(source_value),'') is not null
            order by source_column,source_value`),
   c.query(`select distinct o.operation_code,o.operation_name
            from md_operation o
            join md_st_operation_scope s
              on upper(trim(s.operation_code))=upper(trim(o.operation_code))
             and s.is_active=true
             and coalesce(s.operation_type,'PLANNING_OPERATION')='PLANNING_OPERATION'
            join md_st_operation_mapping sm
              on upper(trim(sm.source_operation_code))=upper(trim(o.operation_code))
             and sm.is_active=true
            where o.is_active=true
              and not exists(
                select 1 from md_main_operation_recipe m
                where upper(trim(m.operation_code))=upper(trim(o.operation_code))
                  and m.is_active=true
              )
            order by o.operation_code`),
   // v269: cột MASTER DATA (file Master Data) cho điều kiện "Áp dụng cho Job".
   c.query(`
     select 'PROGRAM' k, program v from md_part where is_active=true and nullif(trim(program),'') is not null
     union all select 'PART_CLUSTER', part_cluster from md_part where is_active=true and nullif(trim(part_cluster),'') is not null
     union all select 'PART_DESCRIPTION', part_description from md_part where is_active=true and nullif(trim(part_description),'') is not null
     union all select 'SURFACE_DM2', surface_dm2::text from md_part where is_active=true and nullif(trim(surface_dm2::text),'') is not null
     union all select 'ALLOY', alloy from md_material_finish where is_active=true and nullif(trim(alloy),'') is not null
     union all select 'TEMPER', temper from md_material_finish where is_active=true and nullif(trim(temper),'') is not null
     union all select 'TSA', tsa from md_material_finish where is_active=true and nullif(trim(tsa),'') is not null
     union all select 'CHEMCONV_AIRBUS', chemicalconv_airbus from md_material_finish where is_active=true and nullif(trim(chemicalconv_airbus),'') is not null
     union all select 'PRIMER1', primer1 from md_material_finish where is_active=true and nullif(trim(primer1),'') is not null
     union all select 'PRIMER2', primer2 from md_material_finish where is_active=true and nullif(trim(primer2),'') is not null
     union all select 'PRIMER3', primer3 from md_material_finish where is_active=true and nullif(trim(primer3),'') is not null
     union all select 'TOPCOAT1', topcoat1 from md_material_finish where is_active=true and nullif(trim(topcoat1),'') is not null
     union all select 'TOPCOAT2', topcoat2 from md_material_finish where is_active=true and nullif(trim(topcoat2),'') is not null
     union all select 'ANTIABRASION', antiabration from md_material_finish where is_active=true and nullif(trim(antiabration),'') is not null
     union all select 'PRIMER1_NAME', primer1_name from md_material_finish where is_active=true and nullif(trim(primer1_name),'') is not null
     union all select 'TOPCOAT_NAME', topcoat_name from md_material_finish where is_active=true and nullif(trim(topcoat_name),'') is not null
     union all select 'ANTIABRASION_NAME', antiabrasion_name from md_material_finish where is_active=true and nullif(trim(antiabrasion_name),'') is not null
     union all select 'VARINISH_NAME', varinish_name from md_material_finish where is_active=true and nullif(trim(varinish_name),'') is not null
   `),
   getRequirementCodes(),
   c.query(`select recipe_key,calc_type,priority,fixed_hours,standard_hours
            from md_recipe_time_rule where is_active=true
            order by recipe_key,priority,id`),
   part?c.query(`select p.part_num,p.revision_num,p.standard_operation,p.recipe_key,p.source_slot,p.source_recipe_no,
                        r.recipe_no,r.recipe_name,r.recipe_group,r.process_family,r.batch_key
                 from md_part_process_recipe p
                 join md_process_recipe r on r.recipe_key=p.recipe_key
                 where p.part_num=$1 and p.is_active=true and r.is_active=true
                 order by p.revision_num,p.standard_operation`,[part]):Promise.resolve({rows:[]})
  ]);
  return <main className="erp-shell erpkit-migrated-page">
   <ErpAppHeader module="CONFIGURATION"/>
   <AppTabs active="config"/>
   <div className="erp-workspace">
    <ConfigSidebar active="recipeoperationmap"/>
    <section className="erp-content">
     <ConfigPageHeader
      title="Công thức & Rule"
      subtitle="Quản lý Danh mục Recipe và quy tắc Operation Code → Recipe dùng trên Planning Board."
      purpose="Xác định Operation Code dùng Recipe nào, điều kiện áp dụng, độ ưu tiên, Mã lô mẫu và Prefix số lô."
      impact="Job chưa xác định được Recipe sẽ không tạo lô được. Thay đổi ở đây ảnh hưởng ngay tới Recipe đề xuất trên Planning Board."
      prev={{label:"Planner Assignment",href:"/planner-work-assignment"}}
      next={{label:"Open Job Column Values",href:"/open-job-column-values"}}
     />

     {(()=>{
       const mdFixed:{key:string;label:string}[]=[
        {key:"MD:ALLOY",label:"Alloy (Master)"},
        {key:"MD:TEMPER",label:"Temper (Master)"},
        {key:"MD:TSA",label:"TSA (Master)"},
        {key:"MD:CHEMCONV_AIRBUS",label:"Chemical Conv Airbus (Master)"},
        {key:"MD:PRIMER1",label:"Primer 1 (Master)"},
        {key:"MD:PRIMER2",label:"Primer 2 (Master)"},
        {key:"MD:PRIMER3",label:"Primer 3 (Master)"},
        {key:"MD:TOPCOAT1",label:"Top Coat 1 (Master)"},
        {key:"MD:TOPCOAT2",label:"Top Coat 2 (Master)"},
        {key:"MD:ANTIABRASION",label:"Anti Abrasion (Master)"},
        {key:"MD:PRIMER1_NAME",label:"Tên Primer 1 (Master)"},
        {key:"MD:TOPCOAT_NAME",label:"Tên Top Coat (Master)"},
        {key:"MD:ANTIABRASION_NAME",label:"Tên Anti Abrasion (Master)"},
        {key:"MD:VARINISH_NAME",label:"Tên Varnish (Master)"},
        {key:"MD:PROGRAM",label:"Program (Master)"},
        {key:"MD:PART_CLUSTER",label:"Part Cluster (Master)"},
        {key:"MD:PART_DESCRIPTION",label:"Part Description (Master)"},
        {key:"MD:SURFACE_DM2",label:"Surface dm² (Master)"}
       ];
       const mdReq=(masterReqCodesQ as any[]).map((x:any)=>({key:`MD:REQ:${String(x.requirement_code).trim().toUpperCase()}`,label:`Yêu cầu (Req): ${String(x.requirement_code).trim().toUpperCase()} (Master)`}));
       const masterColumns=[...mdFixed,...mdReq];
       const masterValues=(masterValuesQ.rows as any[]).map((x:any)=>({column:`MD:${String(x.k).trim().toUpperCase()}`,value:String(x.v)}));
       return <MainOperationRecipeMappingManager
        operations={sourceOpsQ.rows as any}
        mainOperations={(opsQ.rows as any[]).map((x:any)=>x.standard_operation)}
        recipes={chemicalRecipesQ.rows as any}
        mappings={chemicalMapsQ.rows as any}
        sourceColumns={(columnsQ.rows as any[]).map((x:any)=>x.source_column)}
        columnValues={(columnValuesQ.rows as any[]).map((x:any)=>({column:x.source_column,value:x.source_value}))}
        masterColumns={masterColumns}
        masterValues={masterValues}
        timeRules={timeRulesQ.rows as any}
        unmapped={unmappedQ.rows as any}
       />;
     })()}

     <details className="config-section-collapsible" open>
      <summary>Danh mục Recipe</summary>
      <ProcessRecipeManager
       recipes={recipesQ.rows as any}
       partRows={partQ.rows as any}
       partQuery={part}
       sourceColumns={(columnsQ.rows as any[]).map((x:any)=>String(x.source_column))}
       columnValues={(columnValuesQ.rows as any[]).map((x:any)=>({column:String(x.source_column),value:String(x.source_value),label:String(x.display_name||x.source_value)}))}
      />
     </details>

    </section>
   </div>
  </main>
 }finally{c.release()}
}
