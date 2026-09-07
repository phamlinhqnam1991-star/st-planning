import type {PoolClient} from "pg";

/**
 * RAW Operation Codes available in VIEW ST.
 * v297: Planning operations come from md_st_operation_scope; Intermediate
 * operations are inferred automatically from active Bridge Segments. No manual
 * INTERMEDIATE classification is required. Explicit ST_SCOPE_ONLY is excluded.
 */

export type VisibleOperation = {
  operation_code: string;
  operation_name: string | null;
  operation_type?: "PLANNING_OPERATION" | "INTERMEDIATE";
  previous_main_operation?: string | null;
  next_main_operation?: string | null;
  bridge_count?: number;
  bridge_summary?: string | null;
  standard_operation: string | null;
  st_group: string | null;
  area_id: number | null;
  area_name: string | null;
  schedule_area_code: string | null;
  schedule_area_name: string | null;
  planner_owner: string | null;
  mapping_rule: string | null;
  jobs_on_board: number;
  config_status: string;
};

export async function visibleOperations(c: PoolClient): Promise<VisibleOperation[]> {
  const q = await c.query(`
    with bridge_ops as (
      select
        upper(trim(bo.operation_code)) operation_code,
        count(distinct s.id)::int bridge_count,
        count(distinct upper(trim(s.next_main_operation)))::int next_main_count,
        min(upper(trim(s.previous_main_operation))) previous_main_operation,
        min(upper(trim(s.next_main_operation))) next_main_operation,
        string_agg(
          distinct s.previous_main_operation||' → '||s.next_main_operation,
          ', ' order by s.previous_main_operation||' → '||s.next_main_operation
        ) bridge_summary
      from md_intermediate_bridge_operation bo
      join md_intermediate_bridge_segment s on s.id=bo.segment_id and s.is_active=true
      group by upper(trim(bo.operation_code))
    ), active_scope as (
      select
        upper(trim(operation_code)) operation_code,
        case when bool_or(operation_type='ST_SCOPE_ONLY') then 'ST_SCOPE_ONLY' else 'PLANNING_OPERATION' end operation_type
      from md_st_operation_scope
      where is_active=true and operation_type<>'INTERMEDIATE'
      group by upper(trim(operation_code))
    ), catalog as (
      select operation_code,'PLANNING_OPERATION'::text operation_type
      from active_scope where operation_type='PLANNING_OPERATION'
      union
      select b.operation_code,'INTERMEDIATE'::text operation_type
      from bridge_ops b
      where not exists(
        select 1 from active_scope s
        where s.operation_code=b.operation_code and s.operation_type='ST_SCOPE_ONLY'
      )
        and not exists(
          select 1 from active_scope s
          where s.operation_code=b.operation_code and s.operation_type='PLANNING_OPERATION'
        )
    )
    select
      cat.operation_code,
      coalesce(o.operation_name,cat.operation_code) operation_name,
      cat.operation_type,
      case when cat.operation_type='INTERMEDIATE' and coalesce(bridge.bridge_count,0)=1 then bridge.previous_main_operation else null end previous_main_operation,
      case when cat.operation_type='INTERMEDIATE' and coalesce(bridge.bridge_count,0)=1 then bridge.next_main_operation else null end next_main_operation,
      coalesce(bridge.bridge_count,0)::int bridge_count,
      bridge.bridge_summary,
      case when cat.operation_type='INTERMEDIATE' and coalesce(bridge.next_main_count,0)=1 then bridge.next_main_operation else map.standard_operation_rule end standard_operation,
      map.mapping_rule,
      coalesce(map.st_group,om.st_group) st_group,
      a.id area_id,a.area_name,
      sa.schedule_area_code,sa.schedule_area_name,sa.planner_owner,
      coalesce(openj.jobs_on_board,0)::int jobs_on_board,
      case
        when cat.operation_type='INTERMEDIATE' then 'INTERMEDIATE_AUTO'
        when map.id is null then 'MISSING_MAIN_MAPPING'
        when om.standard_operation is null then 'MISSING_MAIN_MASTER'
        when sg.st_group is null then 'MISSING_ST_GROUP'
        when a.id is null then 'MISSING_AREA'
        when sa.schedule_area_code is null then 'MISSING_SCHEDULE_AREA'
        when coalesce(sa.planner_owner,'UNASSIGNED')='UNASSIGNED' then 'MISSING_PLANNER_OWNER'
        else 'OK'
      end config_status
    from catalog cat
    left join bridge_ops bridge on bridge.operation_code=cat.operation_code
    left join lateral (
      select x.operation_name,x.planning_sort_order
      from md_operation x
      where upper(trim(x.operation_code))=cat.operation_code and x.is_active=true
      order by case when trim(x.operation_code)=cat.operation_code then 0 else 1 end,
               x.updated_at desc nulls last,x.operation_code
      limit 1
    ) o on true
    left join lateral (
      select m.* from md_st_operation_mapping m
      where upper(trim(m.source_operation_code))=cat.operation_code and m.is_active=true
      order by m.updated_at desc,m.id desc limit 1
    ) map on true
    left join md_operation_master om
      on om.standard_operation=map.standard_operation_rule and om.is_active=true
    left join md_st_group sg
      on sg.st_group=coalesce(map.st_group,om.st_group) and sg.is_active=true
    left join md_area_operation_group ag
      on ag.st_group=coalesce(map.st_group,om.st_group) and ag.is_active=true
    left join md_area a on a.id=ag.area_id and a.is_active=true
    left join lateral (
      select s.schedule_area_code,s.schedule_area_name,coalesce(w.planner_owner,'UNASSIGNED') planner_owner
      from md_schedule_area_operation m
      join md_schedule_area s on s.schedule_area_code=m.schedule_area_code and s.is_active=true
      left join md_planner_work_assignment w on w.schedule_area_code=s.schedule_area_code and w.is_active=true
      where m.standard_operation=map.standard_operation_rule and m.is_active=true
      order by s.display_order,s.schedule_area_code limit 1
    ) sa on true
    left join lateral (
      select count(*)::int jobs_on_board
      from open_job_current oj
      where oj.is_open=true and upper(trim(oj.next_operation))=cat.operation_code
    ) openj on true
    order by o.planning_sort_order nulls last,cat.operation_code
  `);
  return (q.rows || []) as VisibleOperation[];
}
