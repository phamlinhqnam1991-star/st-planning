-- ================================================================
-- 028_planner_handover_change_event.sql
-- Cross-planner Change Impact / Handover Alerts
-- ================================================================

begin;

create table if not exists public.planning_handover_change_event (
  id bigserial primary key,

  source_batch_id bigint not null references public.planning_batch(id) on delete cascade,
  source_batch_no text not null,
  source_standard_operation text not null,
  source_planner text,

  job_num text not null,
  change_type text not null check (change_type in ('ADD_JOB','REMOVE_JOB')),

  next_standard_operation text,
  affected_planner text,

  affected_batch_id bigint references public.planning_batch(id) on delete set null,
  affected_batch_no text,
  affected_schedule_id bigint references public.planning_schedule(id) on delete set null,
  affected_resource_code text,
  affected_planned_start timestamptz,

  source_batch_qty_before numeric not null default 0,
  source_batch_qty_after numeric not null default 0,
  source_batch_surface_before numeric not null default 0,
  source_batch_surface_after numeric not null default 0,

  changed_job_qty numeric not null default 0,
  changed_job_surface numeric not null default 0,

  impact_level text not null default 'INFO'
    check (impact_level in ('INFO','WARNING','IMPACTED','CRITICAL')),

  status text not null default 'NEW'
    check (status in ('NEW','ACKNOWLEDGED')),

  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by text,

  note text
);

create index if not exists ix_handover_change_event_planner_new
  on public.planning_handover_change_event(affected_planner,status,created_at desc);

create index if not exists ix_handover_change_event_source_batch
  on public.planning_handover_change_event(source_batch_id,created_at desc);

create index if not exists ix_handover_change_event_affected_batch
  on public.planning_handover_change_event(affected_batch_id,created_at desc);

alter table public.planning_handover_change_event enable row level security;

drop policy if exists "authenticated read handover change event"
  on public.planning_handover_change_event;
create policy "authenticated read handover change event"
  on public.planning_handover_change_event
  for select to authenticated
  using (true);

comment on table public.planning_handover_change_event is
'Change Impact events emitted when a Job is added/removed from an upstream Batch and the Job next main operation belongs to the other Planner.';

commit;
