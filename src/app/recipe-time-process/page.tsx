import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {ProcessTimeRuleManager} from "@/components/process-time-rule-manager";
import {getPool} from "@/lib/db";
export const dynamic="force-dynamic";

export default async function Page(){
 const c=await getPool().connect();
 try{
  const [recipesQ,timeRulesQ]=await Promise.all([
   c.query(`select recipe_key,process_family,recipe_group,recipe_no,recipe_name,batch_key
            from md_process_recipe
            where is_active=true
            order by process_family,
              case when recipe_no ~ '^[0-9]+$' then recipe_no::int else 9999 end,
              recipe_no`),
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
    <ConfigSidebar active="recipetimeprocess"/>
    <section className="erp-content">
     <ConfigPageHeader
      title="Thời gian xử lý (Process)"
      subtitle="Thời gian chạy Process theo Recipe — áp dụng cho MỌI công đoạn chính."
      purpose="Định nghĩa thời gian xử lý của từng Recipe: FIXED_HOURS = giờ cố định; QTY_SURFACE = tính theo khoảng Số lượng + Diện tích."
      impact="Đây là phần giữa của chuỗi thời gian mỗi lô. Recipe chưa có rule thời gian → lô không ước lượng được giờ Process trên Board Điều Độ."
      prev={{label:"Thời gian Loading / Unloading",href:"/recipe-time-loading"}}
      next={{label:"Cột All Open Job (từ điển)",href:"/open-job-column-values"}}
     />
     <ProcessTimeRuleManager recipes={recipesQ.rows as any} rules={timeRulesQ.rows as any}/>
    </section>
   </div>
  </main>
 }finally{c.release()}
}
