-- =====================================================================
-- 016_all_open_jobs.sql
-- ST Planning - All Open Jobs / Planning Input
--
-- Dynamic source. Not Master Data.
-- Every import is a full OPEN-JOB snapshot:
-- NEW       = JobNum not seen before
-- CHANGED   = existing Job content changed OR previously closed reappears
-- UNCHANGED = same content, still open
-- CLOSED    = existing open Job missing from latest snapshot
--
-- Full source row is preserved in source_data JSONB for later Planning logic.
-- =====================================================================

begin;

create table if not exists public.open_job_import_batch (
    id uuid primary key default gen_random_uuid(),
    file_name text not null,
    storage_path text,
    status text not null default 'RUNNING',
    source_rows integer not null default 0,
    new_jobs integer not null default 0,
    changed_jobs integer not null default 0,
    unchanged_jobs integer not null default 0,
    closed_jobs integer not null default 0,
    error_message text,
    created_at timestamptz not null default now(),
    finished_at timestamptz
);

create table if not exists public.open_job_current (
    job_num text primary key,

    part_num text,
    revision_num text,
    program text,
    part_cluster text,
    part_description text,

    prod_qty numeric,
    current_good_wip_qty numeric,
    last_labor_qty numeric,

    last_operation text,
    next_operation text,
    all_operation text,

    total_surface numeric,
    surface_per_part_dm2 numeric,

    open_dmr text,
    st text,
    st_wip_area text,
    wip_sequence text,

    priority_type text,
    cat35_transit text,
    impact_sale_value text,

    source_hash text not null,
    source_data jsonb not null default '{}'::jsonb,

    is_open boolean not null default true,
    last_import_status text not null default 'NEW'
        check(last_import_status in ('NEW','CHANGED','UNCHANGED','CLOSED')),

    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    last_changed_at timestamptz not null default now(),
    closed_at timestamptz,

    last_import_batch_id uuid
        references public.open_job_import_batch(id)
        on delete set null,

    updated_at timestamptz not null default now()
);

create table if not exists public.open_job_history (
    id bigserial primary key,
    job_num text not null,
    import_batch_id uuid
        references public.open_job_import_batch(id)
        on delete set null,

    change_type text not null
        check(change_type in ('NEW','CHANGED','CLOSED')),

    part_num text,
    revision_num text,
    prod_qty numeric,
    current_good_wip_qty numeric,
    last_labor_qty numeric,
    last_operation text,
    next_operation text,
    total_surface numeric,

    source_hash text,
    source_data jsonb not null default '{}'::jsonb,
    is_open boolean not null,

    created_at timestamptz not null default now()
);

create index if not exists ix_open_job_current_open
    on public.open_job_current(is_open, next_operation, last_operation);

create index if not exists ix_open_job_current_part
    on public.open_job_current(part_num, revision_num, is_open);

create index if not exists ix_open_job_current_area
    on public.open_job_current(st_wip_area, st, is_open);

create index if not exists ix_open_job_current_batch
    on public.open_job_current(last_import_batch_id);

create index if not exists ix_open_job_history_job
    on public.open_job_history(job_num, created_at desc);

create index if not exists ix_open_job_history_batch
    on public.open_job_history(import_batch_id, change_type);

create index if not exists ix_open_job_import_created
    on public.open_job_import_batch(created_at desc);

alter table public.open_job_import_batch enable row level security;
alter table public.open_job_current enable row level security;
alter table public.open_job_history enable row level security;

drop policy if exists "authenticated read open job import batch"
    on public.open_job_import_batch;
create policy "authenticated read open job import batch"
    on public.open_job_import_batch
    for select to authenticated using (true);

drop policy if exists "authenticated read open job current"
    on public.open_job_current;
create policy "authenticated read open job current"
    on public.open_job_current
    for select to authenticated using (true);

drop policy if exists "authenticated read open job history"
    on public.open_job_history;
create policy "authenticated read open job history"
    on public.open_job_history
    for select to authenticated using (true);

analyze public.open_job_current;
analyze public.open_job_history;
analyze public.open_job_import_batch;

commit;
