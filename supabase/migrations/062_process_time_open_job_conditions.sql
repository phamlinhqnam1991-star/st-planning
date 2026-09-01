-- =====================================================================
-- 062_process_time_open_job_conditions.sql
-- Process Time Rule: optional multi-column conditions from All Open Job.
--
-- A rule may have zero conditions (fallback/default) or many conditions.
-- Multiple conditions are AND. The resolver prefers the matching rule with
-- the highest number of conditions, then lower Priority, then lower Rule ID.
-- =====================================================================

begin;

create table if not exists public.md_recipe_time_rule_condition (
    id bigserial primary key,

    rule_id bigint not null
        references public.md_recipe_time_rule(id)
        on delete cascade,

    condition_order integer not null default 1,
    source_column text not null,
    source_value text not null,

    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint ck_recipe_time_rule_condition_column
        check (length(trim(source_column)) > 0),
    constraint ck_recipe_time_rule_condition_value
        check (length(trim(source_value)) > 0),
    constraint uq_recipe_time_rule_condition_column
        unique(rule_id, source_column)
);

create index if not exists ix_recipe_time_rule_condition_rule
    on public.md_recipe_time_rule_condition(rule_id,is_active,condition_order,id);

create index if not exists ix_recipe_time_rule_condition_lookup
    on public.md_recipe_time_rule_condition(source_column,source_value,is_active);

alter table public.md_recipe_time_rule_condition enable row level security;

drop policy if exists "authenticated read recipe time rule condition"
on public.md_recipe_time_rule_condition;

create policy "authenticated read recipe time rule condition"
on public.md_recipe_time_rule_condition
for select
to authenticated
using (true);

analyze public.md_recipe_time_rule_condition;

commit;
