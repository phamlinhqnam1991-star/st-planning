-- Auto Planning Rule Master
-- One configurable rule row per Standard Operation.

create table if not exists public.md_auto_planning_rule (
    standard_operation text primary key,

    auto_plan_enabled boolean not null default false,
    auto_plan_mode text not null default 'OFF'
        check (auto_plan_mode in ('OFF','SUGGEST','FULL_AUTO')),
    auto_plan_order integer not null default 100,

    -- Eligibility / where a Job may enter Auto Planning.
    allow_first_plan_operation boolean not null default true,
    allow_actual_wip_without_previous_batch boolean not null default true,
    allow_from_previous_batch boolean not null default true,
    allow_plan_ahead boolean not null default true,
    require_previous_completed boolean not null default false,

    -- Grouping / compatibility.
    require_same_recipe boolean not null default false,
    group_by_previous_batch boolean not null default false,
    require_same_part boolean not null default false,
    require_same_revision boolean not null default false,
    require_same_program boolean not null default false,
    require_same_primer1 boolean not null default false,
    require_same_primer2 boolean not null default false,
    require_same_primer3 boolean not null default false,

    -- Candidate exclusion / minimum data requirements.
    recipe_required boolean not null default false,
    exclude_open_dmr boolean not null default false,

    -- Batch size constraints. NULL means no limit.
    min_jobs_per_batch integer,
    max_jobs_per_batch integer,
    min_qty_per_batch numeric,
    max_qty_per_batch numeric,
    min_surface_dm2_per_batch numeric,
    max_surface_dm2_per_batch numeric,

    -- Start a new Batch when the selected value changes.
    split_on_recipe boolean not null default false,
    split_on_previous_batch boolean not null default false,
    split_on_part boolean not null default false,
    split_on_revision boolean not null default false,
    split_on_program boolean not null default false,
    split_on_primer1 boolean not null default false,
    split_on_primer2 boolean not null default false,
    split_on_primer3 boolean not null default false,

    -- Ordered array:
    -- [{"field":"priority_type","direction":"asc"}, ...]
    priority_rules jsonb not null default '[]'::jsonb,

    note text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint ck_auto_plan_jobs_min check (
      min_jobs_per_batch is null or min_jobs_per_batch >= 0
    ),
    constraint ck_auto_plan_jobs_max check (
      max_jobs_per_batch is null or max_jobs_per_batch > 0
    ),
    constraint ck_auto_plan_qty_min check (
      min_qty_per_batch is null or min_qty_per_batch >= 0
    ),
    constraint ck_auto_plan_qty_max check (
      max_qty_per_batch is null or max_qty_per_batch > 0
    ),
    constraint ck_auto_plan_surface_min check (
      min_surface_dm2_per_batch is null or min_surface_dm2_per_batch >= 0
    ),
    constraint ck_auto_plan_surface_max check (
      max_surface_dm2_per_batch is null or max_surface_dm2_per_batch > 0
    )
);

create index if not exists ix_auto_planning_rule_enabled
    on public.md_auto_planning_rule(auto_plan_enabled,auto_plan_order,standard_operation)
    where is_active=true;

alter table public.md_auto_planning_rule enable row level security;

drop policy if exists "authenticated read auto planning rule"
    on public.md_auto_planning_rule;
create policy "authenticated read auto planning rule"
    on public.md_auto_planning_rule
    for select to authenticated
    using (true);

comment on table public.md_auto_planning_rule is
'Per-Standard-Operation Auto Planning configuration. The engine reads this table; no business grouping rule is hard-coded.';

comment on column public.md_auto_planning_rule.allow_actual_wip_without_previous_batch is
'YES: if All Open Job actual WIP / Next Main Plan Op is this operation, Job may be Auto Planned even without a previous Planning Batch.';

comment on column public.md_auto_planning_rule.allow_from_previous_batch is
'YES: future operation may enter Auto Planning when its immediately previous main Planning Operation has a Batch.';

comment on column public.md_auto_planning_rule.allow_plan_ahead is
'YES: previous main operation only needs PLANNED/Batch. NO: use require_previous_completed when completion is required.';

comment on column public.md_auto_planning_rule.group_by_previous_batch is
'YES: keep Jobs from the same Previous Batch together as a primary grouping key.';

comment on column public.md_auto_planning_rule.priority_rules is
'Ordered JSON array of Candidate/All Open Job fields used by the future Auto Planning Engine to sort candidates before grouping.';
