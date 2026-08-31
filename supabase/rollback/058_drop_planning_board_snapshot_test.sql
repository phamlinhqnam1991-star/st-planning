-- MANUAL ROLLBACK ONLY - v316 Snapshot TEST
-- Run this only if you decide to remove the experimental Snapshot TEST feature.

begin;

do $$
declare
  t text;
  tables text[] := array[
    'open_job_current','planning_job_operation','planning_batch','planning_batch_job',
    'planning_schedule','planning_board_view','md_st_operation_scope',
    'md_intermediate_bridge_operation','md_intermediate_bridge_segment',
    'md_st_operation_mapping','md_planning_operation_scope','md_operation_master',
    'md_operation','md_area_operation_group','md_area','md_material_finish',
    'md_main_operation_recipe','md_part_process_recipe','md_process_recipe',
    'md_recipe_time_rule','md_part','md_process_requirement'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists trg_snapshot_test_dirty on public.%I',t);
    end if;
  end loop;
end $$;

drop function if exists public.bump_planning_snapshot_test_version();
drop table if exists public.planning_candidate_snapshot_test;
drop table if exists public.planning_snapshot_state;

commit;
