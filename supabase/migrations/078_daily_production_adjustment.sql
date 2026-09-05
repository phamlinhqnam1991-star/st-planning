-- ============================================================
-- 078_daily_production_adjustment.sql
-- V464 · Daily Production Reconciliation / đầu ngày 06:00
-- MAX 4 executable statements for hosted SQL runner compatibility.
-- ============================================================

create table if not exists public.production_adjustment_set(
    id bigserial primary key,
    production_date date not null,
    status text not null default 'DRAFT' check(status in ('DRAFT','READY','APPROVED','REJECTED')),
    generated_at timestamptz not null default now(),
    approved_at timestamptz,
    approved_by text,
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint production_adjustment_set_date_ux unique(production_date)
);

create table if not exists public.production_adjustment_item(
    id bigserial primary key,
    adjustment_set_id bigint not null references public.production_adjustment_set(id) on delete cascade,
    item_type text not null check(item_type in ('CARRY_OVER','REMOVE_JOB','ADD_JOB')),
    status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED','ERROR')),
    batch_id bigint not null references public.planning_batch(id) on delete cascade,
    schedule_id bigint references public.planning_schedule(id) on delete set null,
    planning_job_operation_id bigint references public.planning_job_operation(id) on delete set null,
    job_num text,
    standard_operation text not null,
    source_planner text,
    old_start timestamptz,
    old_end timestamptz,
    proposed_start timestamptz,
    proposed_end timestamptz,
    reason text,
    validation_status text not null default 'OK' check(validation_status in ('OK','WARNING','BLOCKED')),
    validation_message text,
    proposal_json jsonb not null default '{}'::jsonb,
    approved_at timestamptz,
    approved_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint production_adjustment_item_auto_ux unique(adjustment_set_id,item_type,batch_id,planning_job_operation_id)
);

create index if not exists ix_production_adjustment_item_set_status
  on public.production_adjustment_item(adjustment_set_id,status,item_type);

create index if not exists ix_production_adjustment_item_batch
  on public.production_adjustment_item(batch_id,job_num,created_at desc);
