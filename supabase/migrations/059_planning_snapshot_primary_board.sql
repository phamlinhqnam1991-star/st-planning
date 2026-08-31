-- =====================================================================
-- 059_planning_snapshot_primary_board.sql
-- ST Planning v317
-- Promote v316 Snapshot TEST into the primary /planning read path.
-- Safe after v316/058 and also safe if 058 was never applied.
-- =====================================================================

begin;

create table if not exists public.planning_snapshot_state(
  singleton boolean primary key default true check(singleton=true),
  source_version bigint not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.planning_snapshot_state(singleton,source_version)
values(true,1) on conflict(singleton) do nothing;

do $$
begin
  if to_regclass('public.planning_candidate_snapshot') is null
     and to_regclass('public.planning_candidate_snapshot_test') is not null then
    alter table public.planning_candidate_snapshot_test rename to planning_candidate_snapshot;
  end if;
end $$;

create table if not exists public.planning_candidate_snapshot(
  scope_key text primary key,
  source_version bigint not null,
  scope_payload jsonb not null default '{}'::jsonb,
  payload jsonb not null,
  candidate_count integer not null default 0,
  build_ms integer,
  refreshed_at timestamptz not null default now()
);

drop index if exists public.ix_planning_candidate_snapshot_test_version;
create index if not exists ix_planning_candidate_snapshot_version
on public.planning_candidate_snapshot(source_version,refreshed_at desc);

comment on table public.planning_candidate_snapshot is
  'v317 primary Planning Board read cache. Canonical business logic remains planning_job_operation + loadPlanningCandidates().';

create or replace function public.bump_planning_snapshot_version()
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
      execute format('drop trigger if exists trg_planning_snapshot_dirty on public.%I',t);
      execute format(
        'create trigger trg_planning_snapshot_dirty after insert or update or delete on public.%I for each statement execute function public.bump_planning_snapshot_version()',
        t
      );
    end if;
  end loop;
end $$;

drop function if exists public.bump_planning_snapshot_test_version();
drop table if exists public.planning_candidate_snapshot_test;

-- Force one clean production MISS after promotion.
update public.planning_snapshot_state
set source_version=source_version+1,updated_at=now()
where singleton=true;

commit;
