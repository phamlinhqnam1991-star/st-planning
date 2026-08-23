-- =====================================================================
-- 017_planning_board.sql
-- ST Planning - Manual Batch Planning Board v27
--
-- Planning sequence source: All Open Jobs.AllOperation
-- Only the confirmed 35 Standard Operations are included.
-- The first future Planning Operation is ELIGIBLE.
-- A later operation becomes ELIGIBLE only after the previous Planning
-- Operation for that Job is PLANNED.
-- =====================================================================

begin;

create table if not exists public.md_planning_operation_scope (
    standard_operation text primary key,
    sort_order integer not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

insert into public.md_planning_operation_scope(standard_operation,sort_order,is_active)
values
('CMSA',10,true),
('CHEMMILL',20,true),
('CPBILP',30,true),
('CPBILP-A',40,true),
('PIONBL',50,false),
('RWK',60,true),
('V_A-SHPN',70,true),
('MANUALSP',80,true),
('CLASP',90,true),
('BSAUNSLD',100,true),
('TSAUNSL',110,true),
('BSASLD',120,true),
('TSASLD',130,true),
('CCNV-IM',140,true),
('CCNV-IA',150,true),
('V_PASS/BRTG',160,true),
('FMSKG-CM',170,true),
('SIPC',180,true),
('SI-SEAL',190,true),
('STRIP',200,true),
('HE-BAKE after plating',210,true),
('HE-BAKE before blasting',220,true),
('A-DBLST',230,true),
('M-DBLST',240,true),
('PLA-ZiNi',250,true),
('HE-BAKE',260,true),
('PLA-CC',270,true),
('PRIMER',280,true),
('PRIMER2',290,true),
('PRIMER3',300,true),
('TOPCOAT1',310,true),
('TOPCOAT2',320,true),
('ANTI-ABRASION',330,true),
('PAINT MARKING',340,true),
('VARNISH',350,true)
on conflict(standard_operation)
do update set
    sort_order=excluded.sort_order,
    is_active=excluded.is_active,
    updated_at=now();

create table if not exists public.planning_job_operation (
    id bigserial primary key,

    job_num text not null
        references public.open_job_current(job_num)
        on delete cascade,

    operation_instance_key text not null,
    source_seq integer not null,
    planning_seq integer not null,

    source_operation_code text not null,
    standard_operation text not null,
    st_group text,

    -- Snapshot of the immediately previous Planning Operation in the FULL
    -- standardized route, independent from the current future-chain anchor.
    previous_standard_operation_snapshot text,
    previous_source_operation_code_snapshot text,
    previous_source_seq_snapshot integer,

    recipe_key text
        references public.md_process_recipe(recipe_key)
        on delete set null,

    status text not null default 'LOCKED'
        check(status in ('LOCKED','ELIGIBLE','PLANNED')),

    is_active boolean not null default true,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique(job_num,operation_instance_key)
);

create table if not exists public.planning_batch (
    id bigserial primary key,
    batch_no text unique,

    planning_date date not null default current_date,

    area_id bigint
        references public.md_area(id)
        on delete set null,

    standard_operation text not null,

    recipe_key text
        references public.md_process_recipe(recipe_key)
        on delete set null,

    total_jobs integer not null default 0,
    total_qty numeric not null default 0,
    total_surface_dm2 numeric not null default 0,

    process_minutes integer,
    planned_start timestamptz,
    planned_end timestamptz,

    priority integer not null default 100,

    status text not null default 'PLANNED'
        check(status in ('PLANNED','RELEASED','COMPLETED','CANCELLED')),

    note text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.planning_batch_job (
    id bigserial primary key,

    batch_id bigint not null
        references public.planning_batch(id)
        on delete cascade,

    planning_job_operation_id bigint not null
        references public.planning_job_operation(id)
        on delete restrict,

    job_num text not null,
    source_operation_code text not null,
    standard_operation text not null,

    -- Durable sequence snapshot at the time the Job is added to this Batch.
    source_seq_snapshot integer,
    planning_seq_snapshot integer,
    operation_instance_key_snapshot text,

    qty numeric,
    surface_dm2 numeric,

    created_at timestamptz not null default now(),

    unique(planning_job_operation_id)
);

create index if not exists ix_planning_job_operation_candidate
    on public.planning_job_operation(status,standard_operation,is_active);

create index if not exists ix_planning_job_operation_job
    on public.planning_job_operation(job_num,planning_seq,is_active);

create index if not exists ix_planning_job_operation_recipe
    on public.planning_job_operation(recipe_key,status,is_active);

create index if not exists ix_planning_batch_date
    on public.planning_batch(planning_date,status,standard_operation);

create index if not exists ix_planning_batch_job_batch
    on public.planning_batch_job(batch_id);

alter table public.md_planning_operation_scope enable row level security;
alter table public.planning_job_operation enable row level security;
alter table public.planning_batch enable row level security;
alter table public.planning_batch_job enable row level security;

drop policy if exists "authenticated read planning scope"
on public.md_planning_operation_scope;
create policy "authenticated read planning scope"
on public.md_planning_operation_scope for select to authenticated using(true);

drop policy if exists "authenticated read planning job operation"
on public.planning_job_operation;
create policy "authenticated read planning job operation"
on public.planning_job_operation for select to authenticated using(true);

drop policy if exists "authenticated read planning batch"
on public.planning_batch;
create policy "authenticated read planning batch"
on public.planning_batch for select to authenticated using(true);

drop policy if exists "authenticated read planning batch job"
on public.planning_batch_job;
create policy "authenticated read planning batch job"
on public.planning_batch_job for select to authenticated using(true);

analyze public.planning_job_operation;
analyze public.planning_batch;
analyze public.planning_batch_job;

commit;
