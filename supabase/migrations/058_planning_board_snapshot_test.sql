-- =====================================================================
-- 058_planning_board_snapshot_test.sql
-- ST Planning v316 - EXPERIMENTAL / SAFE TO REMOVE
--
-- Shadow cache for the separate "Planning Snapshot (TEST)" tab.
-- The normal /planning board does NOT read these tables.
-- Drop this migration objects + remove the TEST tab to return to v315 path.
-- =====================================================================

begin;

create table if not exists public.planning_snapshot_state(
  singleton boolean primary key default true check(singleton=true),
  source_version bigint not null default 1,
  updated_at timestamptz not null default now()
);

insert into public.planning_snapshot_state(singleton,source_version)
values(true,1)
on conflict(singleton) do nothing;

create table if not exists public.planning_candidate_snapshot_test(
  scope_key text primary key,
  source_version bigint not null,
  scope_payload jsonb not null default '{}'::jsonb,
  payload jsonb not null,
  candidate_count integer not null default 0,
  build_ms integer,
  refreshed_at timestamptz not null default now()
);

create index if not exists ix_planning_candidate_snapshot_test_version
on public.planning_candidate_snapshot_test(source_version,refreshed_at desc);

comment on table public.planning_candidate_snapshot_test is
  'EXPERIMENTAL v316 shadow cache for /planning/snapshot only. Normal Planning Board never reads this table.';

create or replace function public.bump_planning_snapshot_test_version()
returns trigger
language plpgsql
as $$
begin
  insert into public.planning_snapshot_state(singleton,source_version,updated_at)
  values(true,2,now())
  on conflict(singleton) do update
    set source_version=public.planning_snapshot_state.source_version+1,
        updated_at=now();
  return null;
end;
$$;

-- Statement-level invalidation: one version bump per SQL statement, not per row.
-- These triggers DO NOT rebuild anything and DO NOT alter normal business data.
do $$
declare
  t text;
  tables text[] := array[
    'open_job_current',
    'planning_job_operation',
    'planning_batch',
    'planning_batch_job',
    'planning_schedule',
    'planning_board_view',
    'md_st_operation_scope',
    'md_intermediate_bridge_operation',
    'md_intermediate_bridge_segment',
    'md_st_operation_mapping',
    'md_planning_operation_scope',
    'md_operation_master',
    'md_operation',
    'md_area_operation_group',
    'md_area',
    'md_material_finish',
    'md_main_operation_recipe',
    'md_part_process_recipe',
    'md_process_recipe',
    'md_recipe_time_rule',
    'md_part',
    'md_process_requirement'
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

commit;
