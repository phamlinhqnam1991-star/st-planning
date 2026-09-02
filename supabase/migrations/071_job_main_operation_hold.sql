-- =====================================================================
-- 071_job_main_operation_hold.sql
-- ST Planning v387
--
-- Job Hold is intentionally stored on the exact Planning Job Operation,
-- not on planning_schedule. Holding one Job/Main must never HOLD every Job
-- in the same Batch/Schedule.
-- =====================================================================

begin;

alter table public.planning_job_operation
  add column if not exists is_hold boolean not null default false;

alter table public.planning_job_operation
  add column if not exists hold_reason text;

alter table public.planning_job_operation
  add column if not exists hold_note text;

alter table public.planning_job_operation
  add column if not exists held_at timestamptz;

alter table public.planning_job_operation
  add column if not exists held_by text;

comment on column public.planning_job_operation.is_hold is
  'Planner Job/Main hold flag. This is a Job-level planning gate and is independent from planning_schedule.status=HOLD.';
comment on column public.planning_job_operation.hold_reason is
  'Planner-selected hold reason: DMR, QUALITY, MATERIAL, CUSTOMER, OTHER.';
comment on column public.planning_job_operation.hold_note is
  'Optional planner note for this Job/Main hold.';
comment on column public.planning_job_operation.held_at is
  'Timestamp when this Job/Main was most recently placed on hold.';
comment on column public.planning_job_operation.held_by is
  'Authenticated user email/id that most recently placed this Job/Main on hold.';

create index if not exists ix_planning_job_operation_hold_active
  on public.planning_job_operation(job_num,planning_seq,id)
  where is_active=true and is_hold=true;

commit;
