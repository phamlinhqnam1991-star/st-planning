-- ============================================================
-- 068_production_execution.sql
-- Production Execution / Báo cáo sản xuất
-- Execution state is intentionally separated from Planning/Schedule state.
-- Planned data remains sourced from planning_batch/planning_schedule and
-- Masking/Unmasking derived routing. This table stores only execution facts.
-- ============================================================

begin;

create table if not exists public.production_execution(
    id bigserial primary key,
    source_type text not null
      check(source_type in ('BATCH','MASKING','UNMASKING')),
    source_key text not null,
    batch_id bigint not null
      references public.planning_batch(id) on delete cascade,
    schedule_id bigint
      references public.planning_schedule(id) on delete set null,
    execution_status text not null default 'WAITING'
      check(execution_status in ('WAITING','ON-GOING','DONE')),
    actual_start timestamptz,
    actual_end timestamptz,
    remark text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint production_execution_source_ux unique(source_type,source_key),
    constraint production_execution_actual_time_ck
      check(actual_end is null or actual_start is null or actual_end >= actual_start)
);

create index if not exists ix_production_execution_batch
  on public.production_execution(batch_id);

create index if not exists ix_production_execution_schedule
  on public.production_execution(schedule_id)
  where schedule_id is not null;

create index if not exists ix_production_execution_status
  on public.production_execution(execution_status,updated_at desc);

comment on table public.production_execution is
  'Production reporting layer. Does not control Planning Chain or Schedule state.';
comment on column public.production_execution.source_key is
  'Stable work-item identity: BATCH:<batchId>, MASKING:<batchId>:<main>, UNMASKING:<batchId>:<main>.';

commit;
