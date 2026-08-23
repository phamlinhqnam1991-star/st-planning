-- =====================================================================
-- 015_process_time_by_recipe.sql
-- ST Planning - Process Time Rule by Recipe
--
-- CHEMICAL_LINE:
--   FIXED_HOURS by Recipe.
--
-- PAINT:
--   QTY_SURFACE rules by Recipe.
--   Multiple rules may exist for the same Recipe, selected by Priority
--   and Qty/Surface ranges.
--
-- This is configuration/master data only.
-- Planning calculation engine will consume these rules later.
-- =====================================================================

begin;

create table if not exists public.md_recipe_time_rule (
    id bigserial primary key,

    recipe_key text not null
        references public.md_process_recipe(recipe_key)
        on delete restrict,

    calc_type text not null
        check (calc_type in ('FIXED_HOURS','QTY_SURFACE')),

    priority integer not null default 100,

    qty_min numeric,
    qty_max numeric,

    surface_min_dm2 numeric,
    surface_max_dm2 numeric,

    fixed_hours numeric,
    standard_hours numeric,

    note text,

    is_active boolean not null default true,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint ck_recipe_time_qty_range
        check (qty_min is null or qty_max is null or qty_min <= qty_max),

    constraint ck_recipe_time_surface_range
        check (
            surface_min_dm2 is null
            or surface_max_dm2 is null
            or surface_min_dm2 <= surface_max_dm2
        ),

    constraint ck_recipe_time_value
        check (
            (calc_type='FIXED_HOURS' and fixed_hours is not null and fixed_hours >= 0)
            or
            (calc_type='QTY_SURFACE' and standard_hours is not null and standard_hours >= 0)
        )
);

create index if not exists ix_recipe_time_rule_lookup
on public.md_recipe_time_rule(recipe_key,is_active,priority);

create index if not exists ix_recipe_time_rule_calc
on public.md_recipe_time_rule(calc_type,is_active);

alter table public.md_recipe_time_rule enable row level security;

drop policy if exists "authenticated read recipe time rule"
on public.md_recipe_time_rule;

create policy "authenticated read recipe time rule"
on public.md_recipe_time_rule
for select
to authenticated
using (true);

analyze public.md_recipe_time_rule;

commit;

select
    r.process_family,
    r.recipe_group,
    r.recipe_no,
    r.recipe_name,
    t.calc_type,
    t.priority,
    t.qty_min,
    t.qty_max,
    t.surface_min_dm2,
    t.surface_max_dm2,
    t.fixed_hours,
    t.standard_hours
from public.md_recipe_time_rule t
join public.md_process_recipe r
  on r.recipe_key=t.recipe_key
where t.is_active=true
order by
    r.process_family,
    r.recipe_group,
    r.recipe_no,
    t.priority;
