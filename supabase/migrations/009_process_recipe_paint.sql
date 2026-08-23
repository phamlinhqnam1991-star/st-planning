-- =====================================================================
-- 009_process_recipe_paint.sql
-- ST Planning - Process Recipe Master
-- Generic architecture for ALL processes.
-- Phase 1: automatically build PAINT recipes from md_material_finish.
--
-- IMPORTANT:
-- Run THIS ENTIRE FILE in Supabase SQL Editor.
-- Do not select only the bottom/backfill section.
-- This script is idempotent: it can be run again safely.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PHASE A - SCHEMA
-- ---------------------------------------------------------------------

create table if not exists public.md_process_recipe (
    recipe_key       text primary key,
    process_family   text not null,
    recipe_group     text not null,
    recipe_no        text,
    recipe_name      text,
    batch_key        text not null,
    source_system    text,
    note             text,
    is_active        boolean not null default true,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create table if not exists public.md_operation_recipe_mapping (
    standard_operation text not null,
    recipe_key          text not null,
    source_slot         text,
    is_default          boolean not null default false,
    is_active           boolean not null default true,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    constraint pk_md_operation_recipe_mapping
        primary key (standard_operation, recipe_key),

    constraint fk_md_operation_recipe_mapping_recipe
        foreign key (recipe_key)
        references public.md_process_recipe(recipe_key)
        on delete restrict
);

create table if not exists public.md_part_process_recipe (
    part_num            text not null,
    revision_num        text not null,
    standard_operation  text not null,
    recipe_key          text not null,
    source_slot         text,
    source_recipe_no    text,
    source_recipe_name  text,
    is_active           boolean not null default true,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    last_import_batch_id uuid,

    constraint pk_md_part_process_recipe
        primary key (part_num, revision_num, standard_operation),

    constraint fk_md_part_process_recipe_recipe
        foreign key (recipe_key)
        references public.md_process_recipe(recipe_key)
        on delete restrict
);

create index if not exists ix_process_recipe_family_group
    on public.md_process_recipe(process_family, recipe_group, is_active);

create index if not exists ix_operation_recipe_operation
    on public.md_operation_recipe_mapping(standard_operation, is_active);

create index if not exists ix_operation_recipe_recipe
    on public.md_operation_recipe_mapping(recipe_key, is_active);

create index if not exists ix_part_process_recipe_partrev
    on public.md_part_process_recipe(part_num, revision_num, is_active);

create index if not exists ix_part_process_recipe_recipe
    on public.md_part_process_recipe(recipe_key, is_active);

-- ---------------------------------------------------------------------
-- RLS
-- Current app uses server-side access, but keep read policies available.
-- ---------------------------------------------------------------------

alter table public.md_process_recipe enable row level security;
alter table public.md_operation_recipe_mapping enable row level security;
alter table public.md_part_process_recipe enable row level security;

drop policy if exists "authenticated read process recipe"
    on public.md_process_recipe;

create policy "authenticated read process recipe"
    on public.md_process_recipe
    for select
    to authenticated
    using (true);

drop policy if exists "authenticated read operation recipe"
    on public.md_operation_recipe_mapping;

create policy "authenticated read operation recipe"
    on public.md_operation_recipe_mapping
    for select
    to authenticated
    using (true);

drop policy if exists "authenticated read part process recipe"
    on public.md_part_process_recipe;

create policy "authenticated read part process recipe"
    on public.md_part_process_recipe
    for select
    to authenticated
    using (true);

-- ---------------------------------------------------------------------
-- PHASE B - PREPARE PAINT SOURCE
--
-- Master List source currently available:
--   PRIMER1 / PRIMER2 / PRIMER3 + Primer1Name
--   TOPCOAT1 / TOPCOAT2       + TopcoatName
--   ANTIABRATION              + AntiAbrasionName
--   VarinishName              = name-only VARNISH source
--
-- N/A / NA / NONE / - / blank are ignored.
-- ---------------------------------------------------------------------

drop table if exists tmp_st_paint_recipe_source;

create temporary table tmp_st_paint_recipe_source
on commit drop
as
with paint_source as (

    select
        part_num,
        revision_num,
        'PAINT'::text as process_family,
        'PRIMER'::text as recipe_group,
        'PRIMER'::text as standard_operation,
        'PRIMER1'::text as source_slot,
        case
            when upper(trim(coalesce(primer1, ''))) in ('', 'N/A', 'NA', 'NONE', '-')
                then null
            else trim(primer1)
        end as recipe_no,
        case
            when upper(trim(coalesce(primer1_name, ''))) in ('', 'N/A', 'NA', 'NONE', '-')
                then null
            else trim(primer1_name)
        end as recipe_name
    from public.md_material_finish
    where is_active = true

    union all

    select
        part_num,
        revision_num,
        'PAINT',
        'PRIMER',
        'PRIMER2',
        'PRIMER2',
        case
            when upper(trim(coalesce(primer2, ''))) in ('', 'N/A', 'NA', 'NONE', '-')
                then null
            else trim(primer2)
        end,
        case
            when upper(trim(coalesce(primer1_name, ''))) in ('', 'N/A', 'NA', 'NONE', '-')
                then null
            else trim(primer1_name)
        end
    from public.md_material_finish
    where is_active = true

    union all

    select
        part_num,
        revision_num,
        'PAINT',
        'PRIMER',
        'PRIMER3',
        'PRIMER3',
        case
            when upper(trim(coalesce(primer3, ''))) in ('', 'N/A', 'NA', 'NONE', '-')
                then null
            else trim(primer3)
        end,
        case
            when upper(trim(coalesce(primer1_name, ''))) in ('', 'N/A', 'NA', 'NONE', '-')
                then null
            else trim(primer1_name)
        end
    from public.md_material_finish
    where is_active = true

    union all

    select
        part_num,
        revision_num,
        'PAINT',
        'TOPCOAT',
        'TOPCOAT1',
        'TOPCOAT1',
        case
            when upper(trim(coalesce(topcoat1, ''))) in ('', 'N/A', 'NA', 'NONE', '-')
                then null
            else trim(topcoat1)
        end,
        case
            when upper(trim(coalesce(topcoat_name, ''))) in ('', 'N/A', 'NA', 'NONE', '-')
                then null
            else trim(topcoat_name)
        end
    from public.md_material_finish
    where is_active = true

    union all

    select
        part_num,
        revision_num,
        'PAINT',
        'TOPCOAT',
        'TOPCOAT2',
        'TOPCOAT2',
        case
            when upper(trim(coalesce(topcoat2, ''))) in ('', 'N/A', 'NA', 'NONE', '-')
                then null
            else trim(topcoat2)
        end,
        case
            when upper(trim(coalesce(topcoat_name, ''))) in ('', 'N/A', 'NA', 'NONE', '-')
                then null
            else trim(topcoat_name)
        end
    from public.md_material_finish
    where is_active = true

    union all

    select
        part_num,
        revision_num,
        'PAINT',
        'ANTI_ABRASION',
        'ANTI-ABRASION',
        'ANTIABRATION',
        case
            when upper(trim(coalesce(antiabration, ''))) in ('', 'N/A', 'NA', 'NONE', '-')
                then null
            else trim(antiabration)
        end,
        case
            when upper(trim(coalesce(antiabrasion_name, ''))) in ('', 'N/A', 'NA', 'NONE', '-')
                then null
            else trim(antiabrasion_name)
        end
    from public.md_material_finish
    where is_active = true

    union all

    select
        part_num,
        revision_num,
        'PAINT',
        'VARNISH',
        'VARNISH',
        'VARINISHNAME',
        null::text,
        case
            when upper(trim(coalesce(varinish_name, ''))) in ('', 'N/A', 'NA', 'NONE', '-')
                then null
            else trim(varinish_name)
        end
    from public.md_material_finish
    where is_active = true
),
valid_source as (
    select *
    from paint_source
    where
        -- Paint slots with recipe-number columns require Recipe No.
        (source_slot <> 'VARINISHNAME' and recipe_no is not null)
        or
        -- Current VARNISH source is name-only.
        (source_slot = 'VARINISHNAME' and recipe_name is not null)
)
select
    part_num,
    revision_num,
    process_family,
    recipe_group,
    standard_operation,
    source_slot,
    recipe_no,
    recipe_name,

    process_family || '|' ||
    recipe_group || '|' ||
    coalesce(upper(recipe_no), 'NAME') || '|' ||
    coalesce(upper(recipe_name), '') as recipe_key

from valid_source;

create index on tmp_st_paint_recipe_source(recipe_key);
create index on tmp_st_paint_recipe_source(part_num, revision_num, standard_operation);

-- ---------------------------------------------------------------------
-- PHASE C - PROCESS RECIPE MASTER
-- ---------------------------------------------------------------------

insert into public.md_process_recipe (
    recipe_key,
    process_family,
    recipe_group,
    recipe_no,
    recipe_name,
    batch_key,
    source_system,
    is_active
)
select distinct on (recipe_key)
    recipe_key,
    process_family,
    recipe_group,
    recipe_no,
    recipe_name,
    recipe_key as batch_key,
    'MASTER_LIST' as source_system,
    true
from tmp_st_paint_recipe_source
order by
    recipe_key,
    recipe_no nulls last,
    recipe_name nulls last

on conflict (recipe_key)
do update set
    process_family = excluded.process_family,
    recipe_group   = excluded.recipe_group,
    recipe_no      = excluded.recipe_no,
    recipe_name    = excluded.recipe_name,
    source_system  = excluded.source_system,
    is_active      = true,
    updated_at     = now();

-- ---------------------------------------------------------------------
-- PHASE D - STANDARD OPERATION -> ALLOWED RECIPE
-- ---------------------------------------------------------------------

insert into public.md_operation_recipe_mapping (
    standard_operation,
    recipe_key,
    source_slot,
    is_default,
    is_active
)
select distinct on (standard_operation, recipe_key)
    standard_operation,
    recipe_key,
    source_slot,
    false,
    true
from tmp_st_paint_recipe_source
order by
    standard_operation,
    recipe_key,
    source_slot

on conflict (standard_operation, recipe_key)
do update set
    source_slot = excluded.source_slot,
    is_active   = true,
    updated_at  = now();

-- ---------------------------------------------------------------------
-- PHASE E - PART + REVISION + OPERATION -> ACTUAL RECIPE
--
-- Primary key allows only one recipe for one Part/Revision/Operation.
-- If duplicated source rows exist, choose deterministically:
-- 1. row with both Recipe No + Name
-- 2. Recipe No
-- 3. Recipe Name
-- ---------------------------------------------------------------------

insert into public.md_part_process_recipe (
    part_num,
    revision_num,
    standard_operation,
    recipe_key,
    source_slot,
    source_recipe_no,
    source_recipe_name,
    is_active
)
select
    part_num,
    revision_num,
    standard_operation,
    recipe_key,
    source_slot,
    recipe_no,
    recipe_name,
    true
from (
    select distinct on (part_num, revision_num, standard_operation)
        part_num,
        revision_num,
        standard_operation,
        recipe_key,
        source_slot,
        recipe_no,
        recipe_name
    from tmp_st_paint_recipe_source
    order by
        part_num,
        revision_num,
        standard_operation,
        case
            when recipe_no is not null and recipe_name is not null then 1
            when recipe_no is not null then 2
            when recipe_name is not null then 3
            else 9
        end,
        source_slot,
        recipe_key
) d

on conflict (part_num, revision_num, standard_operation)
do update set
    recipe_key         = excluded.recipe_key,
    source_slot        = excluded.source_slot,
    source_recipe_no   = excluded.source_recipe_no,
    source_recipe_name = excluded.source_recipe_name,
    is_active          = true,
    updated_at         = now();

-- ---------------------------------------------------------------------
-- PHASE F - STATS / PLANNER
-- ---------------------------------------------------------------------

analyze public.md_process_recipe;
analyze public.md_operation_recipe_mapping;
analyze public.md_part_process_recipe;

-- ---------------------------------------------------------------------
-- PHASE G - VERIFICATION
-- The Results pane should return one row with counts.
-- ---------------------------------------------------------------------

select
    (select count(*) from public.md_process_recipe where is_active)          as active_recipes,
    (select count(*) from public.md_operation_recipe_mapping where is_active) as active_operation_recipe_maps,
    (select count(*) from public.md_part_process_recipe where is_active)      as active_part_recipe_maps;
