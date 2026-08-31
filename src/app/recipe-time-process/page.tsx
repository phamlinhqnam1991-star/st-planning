import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {ProcessTimeRuleManager} from "@/components/process-time-rule-manager";
import {getPool} from "@/lib/db";
export const dynamic="force-dynamic";

export default async function Page(){
 const c=await getPool().connect();
 try{
  const [recipesQ,timeRulesQ]=await Promise.all([
   c.query(`select r.recipe_key,r.process_family,r.recipe_group,r.recipe_no,r.recipe_name,r.batch_key,
                   coalesce((
                     select array_agg(x.standard_operation order by x.standard_operation)
                     from (
                       select distinct z.standard_operation
                       from (
                         select m.standard_operation
                         from md_operation_recipe_mapping m
                         where m.recipe_key=r.recipe_key and m.is_active=true
                         union
                         select m.standard_operation
                         from md_main_operation_recipe m
                         where m.recipe_key=r.recipe_key and m.is_active=true
                       ) z
                       where nullif(trim(z.standard_operation),'') is not null
                     ) x
                   ),array[]::text[]) main_operations
            from md_process_recipe r
            where r.is_active=true
            order by r.process_family,
              case when r.recipe_no ~ '^[0-9]+$' then r.recipe_no::int else 9999 end,
              r.recipe_no`),
   c.query(`select t.id,t.recipe_key,t.calc_type,t.priority,
                   t.qty_min,t.qty_max,t.surface_min_dm2,t.surface_max_dm2,
                   t.fixed_hours,t.standard_hours,t.note,
                   r.process_family,r.recipe_group,r.recipe_no,r.recipe_name,
                   coalesce((
                     select array_agg(x.standard_operation order by x.standard_operation)
                     from (
                       select distinct z.standard_operation
                       from (
                         select m.standard_operation
                         from md_operation_recipe_mapping m
                         where m.recipe_key=t.recipe_key and m.is_active=true
                         union
                         select m.standard_operation
                         from md_main_operation_recipe m
                         where m.recipe_key=t.recipe_key and m.is_active=true
                       ) z
                       where nullif(trim(z.standard_operation),'') is not null
                     ) x
                   ),array[]::text[]) main_operations
            from md_recipe_time_rule t
            join md_process_recipe r on r.recipe_key=t.recipe_key
            where t.is_active=true and r.is_active=true
            order by r.process_family,r.recipe_group,r.recipe_no,t.priority,t.id`)
  ]);
  return <main className="erp-shell">
   <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">CONFIGURATION</div></header>
   <AppTabs active="config"/>
   <div className="erp-workspace">
    <ConfigSidebar active="recipetimeprocess"/>
    <section className="erp-content">
     <ConfigPageHeader
      title="Thời gian xử lý (Process)"
      subtitle="Main Operation → Recipe → Process Time — nguồn thời gian chuẩn dùng cho Planning và Board Điều Độ."
      purpose="Định nghĩa thời gian xử lý của từng Recipe: Cố định hoặc theo khoảng Số lượng + Diện tích. Thời gian nhập theo HH:MM."
      impact="Khi tạo/thêm/bớt Job hoặc đổi Recipe, Process Time của Batch được tính lại. Duration trên Board Điều Độ vẫn có thể được planner chỉnh riêng mà không sửa rule chuẩn."
      prev={{label:"Thời gian Loading / Unloading",href:"/recipe-time-loading"}}
      next={{label:"Cột All Open Job (từ điển)",href:"/open-job-column-values"}}
     />
     <ProcessTimeRuleManager recipes={recipesQ.rows as any} rules={timeRulesQ.rows as any}/>
    </section>
   </div>
  </main>
 }finally{c.release()}
}
