import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {getPool} from "@/lib/db";
import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {AutoPlanningRuleManager} from "@/components/auto-planning-rule-manager";

export const dynamic="force-dynamic";


const BASE_FIELDS=[
 ["priority_type","Priority"],
 ["next_standard_operation","Next Main Plan Op"],
 ["next_operation","NextOperation"],
 ["previous_standard_operation","Previous Main Plan Op"],
 ["previous_batch_no","Previous Batch No"],
 ["recipe_no","Recipe No"],
 ["recipe_name","Recipe Name"],
 ["part_num","Part Num"],
 ["revision_num","Revision"],
 ["program","Program"],
 ["primer1","Part Master PRIMER1"],
 ["primer2","Part Master PRIMER2"],
 ["primer3","Part Master PRIMER3"],
 ["plan_qty","Qty / pcs"],
 ["plan_surface","Surface dm²"],
 ["job_num","Job"],
 ["last_operation","LastLaborOp"],
 ["open_dmr","Open DMR"],
] as const;

export default async function Page(){
 const c=await getPool().connect();
 try{
  const [rulesQ,sourceKeysQ]=await Promise.all([
   c.query(`
    select
      o.standard_operation,o.st_group,
      coalesce(r.auto_plan_enabled,false) auto_plan_enabled,
      coalesce(r.auto_plan_mode,'OFF') auto_plan_mode,
      coalesce(r.auto_plan_order,100) auto_plan_order,

      coalesce(r.allow_first_plan_operation,true) allow_first_plan_operation,
      coalesce(r.allow_actual_wip_without_previous_batch,true) allow_actual_wip_without_previous_batch,
      coalesce(r.allow_from_previous_batch,true) allow_from_previous_batch,
      coalesce(r.allow_plan_ahead,true) allow_plan_ahead,
      coalesce(r.require_previous_completed,false) require_previous_completed,

      coalesce(r.require_same_recipe,false) require_same_recipe,
      coalesce(r.group_by_previous_batch,false) group_by_previous_batch,
      coalesce(r.require_same_part,false) require_same_part,
      coalesce(r.require_same_revision,false) require_same_revision,
      coalesce(r.require_same_program,false) require_same_program,
      coalesce(r.require_same_primer1,false) require_same_primer1,
      coalesce(r.require_same_primer2,false) require_same_primer2,
      coalesce(r.require_same_primer3,false) require_same_primer3,

      coalesce(r.recipe_required,false) recipe_required,
      coalesce(r.exclude_open_dmr,false) exclude_open_dmr,

      r.min_jobs_per_batch,r.max_jobs_per_batch,
      r.min_qty_per_batch,r.max_qty_per_batch,
      r.min_surface_dm2_per_batch,r.max_surface_dm2_per_batch,

      coalesce(r.split_on_recipe,false) split_on_recipe,
      coalesce(r.split_on_previous_batch,false) split_on_previous_batch,
      coalesce(r.split_on_part,false) split_on_part,
      coalesce(r.split_on_revision,false) split_on_revision,
      coalesce(r.split_on_program,false) split_on_program,
      coalesce(r.split_on_primer1,false) split_on_primer1,
      coalesce(r.split_on_primer2,false) split_on_primer2,
      coalesce(r.split_on_primer3,false) split_on_primer3,

      coalesce(r.allow_empty_batch,true) allow_empty_batch,
      coalesce(r.allow_schedule_empty_batch,true) allow_schedule_empty_batch,
      coalesce(r.auto_create_empty_batch,false) auto_create_empty_batch,
      coalesce(r.auto_fill_scheduled_batch,false) auto_fill_scheduled_batch,
      coalesce(r.require_recipe_before_schedule,false) require_recipe_before_schedule,
      coalesce(r.require_paint_type_before_schedule,false) require_paint_type_before_schedule,
      coalesce(r.batch_lock_before_start_minutes,0) batch_lock_before_start_minutes,

      coalesce(r.priority_rules,'[]'::jsonb) priority_rules,
      r.note
    from md_operation_master o
    left join md_auto_planning_rule r
      on r.standard_operation=o.standard_operation
     and r.is_active=true
    where o.is_active=true
    order by
      coalesce(r.auto_plan_order,100),
      o.standard_operation
   `),
   c.query(`
    select distinct k.key
    from (
      select source_data
      from open_job_current
      where is_open=true
      order by last_seen_at desc nulls last
      limit 500
    ) j
    cross join lateral jsonb_object_keys(j.source_data) k(key)
    order by k.key
    limit 500
   `).catch(()=>({rows:[]} as any))
  ]);

  const fields=[
   ...BASE_FIELDS.map(([key,label])=>({key,label})),
   ...sourceKeysQ.rows.map((x:any)=>({
    key:`source:${String(x.key)}`,
    label:String(x.key)
   }))
  ];

  return <main className="erp-shell erpkit-migrated-page">
   <ErpAppHeader module="CONFIGURATION"/>

   <AppTabs active="config"/>

   <div className="erp-workspace">
    <ConfigSidebar active="autoplanning"/>

    <section className="erp-content erp-content-full">
     <ConfigPageHeader
      title="Auto Planning Rules"
      subtitle="Cấu hình quy tắc tự động riêng cho từng Main Operation."
      purpose="Cấu hình quy tắc tự động gom lô cho từng công đoạn chính: job nào được gom, gom theo tiêu chí nào, giới hạn lô ra sao, ưu tiên xếp lô thế nào."
      impact="Các rule này chỉ tác động khi Auto Planning được sử dụng; Planning thủ công hiện tại không thay đổi."
      prev={{label:"Process Time",href:"/recipe-time-process"}}
     />

     <AutoPlanningRuleManager
      initialRules={rulesQ.rows as any}
      fieldOptions={fields as any}
     />

    </section>
   </div>
  </main>
 }finally{
  c.release();
 }
}
