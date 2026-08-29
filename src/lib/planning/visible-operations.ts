import type {PoolClient} from "pg";

/**
 * Các Operation Code được phép hiển thị trên Planning Board
 * (thuộc ST Scope, loại PLANNING_OPERATION) + trạng thái chuỗi cấu hình + số Job đang hiện.
 */

export type VisibleOperation = {
  operation_code: string;
  operation_name: string | null;
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
    with active_scope as (
      select
        upper(trim(operation_code)) operation_code,
        case when bool_or(operation_type='ST_SCOPE_ONLY')
          then 'ST_SCOPE_ONLY' else 'PLANNING_OPERATION' end operation_type
      from md_st_operation_scope
      where is_active=true
      group by upper(trim(operation_code))
    )
    select
      scope.operation_code,
      coalesce(o.operation_name, scope.operation_code) operation_name,
      map.standard_operation_rule standard_operation,
      map.mapping_rule,
      coalesce(map.st_group, om.st_group) st_group,
      a.id area_id,
      a.area_name,
      sa.schedule_area_code,
      sa.schedule_area_name,
      sa.planner_owner,
      coalesce(j.jobs_on_board,0)::int jobs_on_board,
      case
        when map.id is null then 'MISSING_MAIN_MAPPING'
        when om.standard_operation is null then 'MISSING_MAIN_MASTER'
        when sg.st_group is null then 'MISSING_ST_GROUP'
        when a.id is null then 'MISSING_AREA'
        when sa.schedule_area_code is null then 'MISSING_SCHEDULE_AREA'
        when coalesce(sa.planner_owner,'UNASSIGNED')='UNASSIGNED' then 'MISSING_PLANNER_OWNER'
        else 'OK'
      end config_status
    from active_scope scope
    left join lateral (
      select x.operation_name,x.planning_sort_order
      from md_operation x
      where upper(trim(x.operation_code))=scope.operation_code and x.is_active=true
      order by case when trim(x.operation_code)=scope.operation_code then 0 else 1 end,
               x.updated_at desc nulls last,x.operation_code
      limit 1
    ) o on true
    left join lateral (
      select m.* from md_st_operation_mapping m
      where upper(trim(m.source_operation_code))=scope.operation_code and m.is_active=true
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
      join md_schedule_area s
        on s.schedule_area_code=m.schedule_area_code and s.is_active=true
      left join md_planner_work_assignment w
        on w.schedule_area_code=s.schedule_area_code and w.is_active=true
      where m.standard_operation=map.standard_operation_rule and m.is_active=true
      order by s.display_order,s.schedule_area_code limit 1
    ) sa on true
    left join lateral (
      select count(*)::int jobs_on_board
      from planning_job_operation p
      where p.is_active=true
        and p.status in ('ELIGIBLE','PLANNED')
        and upper(trim(p.source_operation_code))=scope.operation_code
    ) j on true
    where scope.operation_type='PLANNING_OPERATION'
    order by o.planning_sort_order nulls last,scope.operation_code
  `);
  return (q.rows || []) as VisibleOperation[];
}
