import {revalidateTag,unstable_cache} from "next/cache";
import {getPool} from "@/lib/db";
import type {ConfigHealth} from "@/lib/config/config-flow";

async function loadConfigHealth(): Promise<Partial<ConfigHealth>> {
  try {
    const c = await getPool().connect();
    try {
      const q = await c.query(`
        with active_scope as (
          select
            upper(trim(operation_code)) operation_code,
            case
              when bool_or(operation_type='ST_SCOPE_ONLY') then 'ST_SCOPE_ONLY'
              else 'PLANNING_OPERATION'
            end operation_type
          from md_st_operation_scope
          where is_active=true and operation_type<>'INTERMEDIATE'
          group by upper(trim(operation_code))
        ),
        chain as (
          select s.operation_code,s.operation_type,map.id map_id,om.standard_operation,
                 sg.st_group,a.id area_id,sa.schedule_area_code,sa.planner_owner
          from active_scope s
          left join lateral (
            select m.* from md_st_operation_mapping m
            where upper(trim(m.source_operation_code))=s.operation_code and m.is_active=true
            order by m.updated_at desc,m.id desc limit 1
          ) map on true
          left join md_operation_master om on om.standard_operation=map.standard_operation_rule and om.is_active=true
          left join md_st_group sg on sg.st_group=coalesce(map.st_group,om.st_group) and sg.is_active=true
          left join md_area_operation_group ag on ag.st_group=coalesce(map.st_group,om.st_group) and ag.is_active=true
          left join md_area a on a.id=ag.area_id and a.is_active=true
          left join lateral (
            select s2.schedule_area_code,coalesce(w.planner_owner,'UNASSIGNED') planner_owner
            from md_schedule_area_operation m2
            join md_schedule_area s2 on s2.schedule_area_code=m2.schedule_area_code and s2.is_active=true
            left join md_planner_work_assignment w on w.schedule_area_code=s2.schedule_area_code and w.is_active=true
            where m2.standard_operation=map.standard_operation_rule and m2.is_active=true
            order by s2.display_order limit 1
          ) sa on true
        )
        select
          (select count(*)::int from md_st_operation_scope where is_active=true and operation_type<>'INTERMEDIATE') scope_total,
          (select count(*)::int from md_st_operation_mapping where is_active=true) mapping_total,
          (select count(*)::int from chain where operation_type='PLANNING_OPERATION' and map_id is null) mapping_missing,
          (select count(*)::int from md_operation_master where is_active=true) master_total,
          (select count(*)::int from md_st_group where is_active=true) group_total,
          (select count(*)::int from md_area where is_active=true) area_total,
          (select count(*)::int from md_area_operation_group where is_active=true) area_group_total,
          (select count(*)::int from md_schedule_area where is_active=true) schedule_total,
          (select count(*)::int from md_schedule_area_operation where is_active=true) schedule_op_total,
          (select count(*)::int from md_planner_work_assignment where is_active=true and planner_owner in ('1','2')) planner_assigned,
          (select count(*)::int from chain where operation_type='PLANNING_OPERATION'
             and map_id is not null and standard_operation is not null
             and st_group is not null and area_id is not null
             and schedule_area_code is not null and planner_owner in ('1','2')) chain_ok,
          (select count(*)::int from chain where operation_type='PLANNING_OPERATION') chain_planning_total,
          (select count(*)::int from md_process_recipe where is_active=true) recipe_total,
          (select count(*)::int from md_main_operation_recipe where is_active=true) recipe_op_total,
          (select count(*)::int from md_chemical_handling_time_rule where is_active=true) handling_total,
          (select count(*)::int from md_recipe_time_rule where is_active=true) time_total,
          (select count(*)::int from md_open_job_column_value where is_active=true) colval_total,
          (select count(*)::int from open_job_current j
             where j.is_open=true
               and not exists(
                 select 1 from planning_job_operation po
                 where po.job_num=j.job_num and po.is_active=true
                   and po.status in ('ELIGIBLE','PLANNED')
               )) missing_jobs
      `);
      return (q.rows[0] || {}) as Partial<ConfigHealth>;
    } finally {
      c.release();
    }
  } catch {
    return {};
  }
}

export const getConfigHealth = unstable_cache(
  loadConfigHealth,
  ["config-health-v2"],
  {revalidate: 60, tags: ["config-health"]},
);

export function invalidateConfigHealth() {
  revalidateTag("config-health", {expire: 0});
}
