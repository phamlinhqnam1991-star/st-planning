-- ============================================================
-- 074_production_execution_job_level.sql
-- V446 · Job-level Production Execution reporting
-- Keeps parent production_execution as an aggregate/compatibility summary.
-- Does NOT change Planning Chain, Batch, Schedule, Recipe or Production Day.
-- ============================================================

begin;

create table if not exists public.production_execution_job(
    id bigserial primary key,
    source_type text not null
      check(source_type in ('BATCH','MASKING','UNMASKING')),
    source_key text not null,
    batch_id bigint not null
      references public.planning_batch(id) on delete cascade,
    schedule_id bigint
      references public.planning_schedule(id) on delete set null,
    planning_job_operation_id bigint not null
      references public.planning_job_operation(id) on delete restrict,
    job_num text not null,
    execution_status text not null default 'WAITING'
      check(execution_status in ('WAITING','ON-GOING','DONE')),
    actual_start timestamptz,
    actual_end timestamptz,
    remark text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint production_execution_job_source_ux
      unique(source_type,source_key,planning_job_operation_id),
    constraint production_execution_job_actual_time_ck
      check(actual_end is null or actual_start is null or actual_end >= actual_start)
);

create index if not exists ix_production_execution_job_batch
  on public.production_execution_job(batch_id,planning_job_operation_id);

create index if not exists ix_production_execution_job_source
  on public.production_execution_job(source_type,source_key);

create index if not exists ix_production_execution_job_status
  on public.production_execution_job(execution_status,updated_at desc);


-- Preserve legacy Batch-level execution facts by seeding the same state to each
-- Batch Job. Masking/Unmasking are not backfilled because their Job subset is
-- derived from routing and must not be guessed by a migration.
insert into public.production_execution_job(
    source_type,source_key,batch_id,schedule_id,planning_job_operation_id,job_num,
    execution_status,actual_start,actual_end,remark,created_at,updated_at
)
select
    pe.source_type,pe.source_key,pe.batch_id,pe.schedule_id,bj.planning_job_operation_id,bj.job_num,
    pe.execution_status,pe.actual_start,pe.actual_end,pe.remark,pe.created_at,pe.updated_at
from public.production_execution pe
join public.planning_batch_job bj on bj.batch_id=pe.batch_id
where pe.source_type='BATCH'
on conflict(source_type,source_key,planning_job_operation_id) do nothing;

comment on table public.production_execution_job is
  'V446 Job-level production reporting. Parent production_execution remains aggregate compatibility state.';
comment on column public.production_execution_job.source_key is
  'Parent work-item identity: BATCH:<batchId>, MASKING:<batchId>:<main>, or UNMASKING:<batchId>:<main>.';

commit;
