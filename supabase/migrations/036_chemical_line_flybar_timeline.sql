-- ============================================================
-- 036_chemical_line_flybar_timeline.sql
-- Chemical Line Flybar occupation:
-- Loading -> Process -> optional NDT -> Unloading
-- ============================================================

begin;

create table if not exists public.md_chemical_handling_time_rule(
    id bigserial primary key,
    phase text not null check(phase in ('LOADING','UNLOADING')),
    priority integer not null default 100 check(priority >= 1),
    qty_min numeric,
    qty_max numeric,
    surface_min_dm2 numeric,
    surface_max_dm2 numeric,
    duration_minutes integer not null check(duration_minutes > 0),
    note text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint md_chemical_handling_qty_range_ck
      check(qty_min is null or qty_max is null or qty_min <= qty_max),
    constraint md_chemical_handling_surface_range_ck
      check(surface_min_dm2 is null or surface_max_dm2 is null or surface_min_dm2 <= surface_max_dm2),
    constraint md_chemical_handling_non_negative_ck
      check(
       coalesce(qty_min,0) >= 0 and coalesce(qty_max,0) >= 0 and
       coalesce(surface_min_dm2,0) >= 0 and coalesce(surface_max_dm2,0) >= 0
      )
);

create index if not exists ix_md_chemical_handling_rule_lookup
on public.md_chemical_handling_time_rule(phase,priority,id)
where is_active=true;

comment on table public.md_chemical_handling_time_rule is
'Loading/Unloading duration rules for Chemical Line Flybars, selected by inclusive Qty and Surface ranges.';

alter table public.planning_schedule
  add column if not exists loading_start timestamptz,
  add column if not exists loading_end timestamptz,
  add column if not exists loading_duration_minutes integer,
  add column if not exists process_start timestamptz,
  add column if not exists process_end timestamptz,
  add column if not exists process_duration_minutes integer,
  add column if not exists ndt_start timestamptz,
  add column if not exists ndt_end timestamptz,
  add column if not exists ndt_duration_minutes integer,
  add column if not exists unloading_start timestamptz,
  add column if not exists unloading_end timestamptz,
  add column if not exists unloading_duration_minutes integer;

alter table public.planning_schedule
  drop constraint if exists ck_planning_schedule_segment_durations;

alter table public.planning_schedule
  add constraint ck_planning_schedule_segment_durations check(
    coalesce(loading_duration_minutes,1) > 0 and
    coalesce(process_duration_minutes,1) > 0 and
    coalesce(ndt_duration_minutes,1) > 0 and
    coalesce(unloading_duration_minutes,1) > 0
  );

create index if not exists ix_planning_schedule_ndt_start
on public.planning_schedule(ndt_start)
where status<>'CANCELLED' and ndt_start is not null;

comment on column public.planning_schedule.planned_start is
'Resource occupation start. For Chemical Line this equals Loading Start.';
comment on column public.planning_schedule.planned_end is
'Resource occupation end. For Chemical Line this equals Unloading End.';
comment on column public.planning_schedule.process_duration_minutes is
'Actual Process segment duration; planning_schedule.duration_minutes is total resource occupation for Chemical Line.';

alter table public.md_chemical_handling_time_rule enable row level security;

drop policy if exists md_chemical_handling_time_rule_read_authenticated
on public.md_chemical_handling_time_rule;

create policy md_chemical_handling_time_rule_read_authenticated
on public.md_chemical_handling_time_rule
for select to authenticated
using(true);

commit;
