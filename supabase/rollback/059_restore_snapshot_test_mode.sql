-- OPTIONAL MANUAL ROLLBACK: v317 -> v316 Snapshot TEST mode.
-- Run this SQL, then deploy v316 code.

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
      execute format('drop trigger if exists trg_planning_snapshot_dirty on public.%I',t);
    end if;
  end loop;
end $$;

drop function if exists public.bump_planning_snapshot_version();

create or replace function public.bump_planning_snapshot_test_version()
returns trigger language plpgsql as $$
begin
  insert into public.planning_snapshot_state(singleton,source_version,updated_at)
  values(true,2,now())
  on conflict(singleton) do update
    set source_version=public.planning_snapshot_state.source_version+1,
        updated_at=now();
  return null;
end;
$$;

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
      execute format(
        'create trigger trg_snapshot_test_dirty after insert or update or delete on public.%I for each statement execute function public.bump_planning_snapshot_test_version()',
        t
      );
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('public.planning_candidate_snapshot_test') is null
     and to_regclass('public.planning_candidate_snapshot') is not null then
    alter table public.planning_candidate_snapshot rename to planning_candidate_snapshot_test;
  end if;
end $$;

commit;
