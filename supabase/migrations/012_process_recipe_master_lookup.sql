-- =====================================================================
-- 012_process_recipe_master_lookup.sql
-- FINAL RECIPE LOOKUP ARCHITECTURE
--
-- Master List:
--   supplies Recipe No only.
--
-- Process Recipe Master:
--   is the single source of truth for Recipe Name.
--
-- Lookup key:
--   Process Family + Recipe Group + normalized Recipe No
--
-- Batch Key:
--   Process Family + Recipe Group + Recipe Name
--   (Recipe No is NOT included)
--
-- Safe to run after migrations 009 -> 011.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- A. Normalize numeric Recipe No to 3 digits.
-- ---------------------------------------------------------------------

update public.md_process_recipe
set
    recipe_no = lpad(trim(recipe_no),3,'0'),
    updated_at = now()
where recipe_no is not null
  and trim(recipe_no) ~ '^[0-9]+$'
  and length(trim(recipe_no)) < 3;

update public.md_part_process_recipe
set
    source_recipe_no = lpad(trim(source_recipe_no),3,'0'),
    updated_at = now()
where source_recipe_no is not null
  and trim(source_recipe_no) ~ '^[0-9]+$'
  and length(trim(source_recipe_no)) < 3;

-- ---------------------------------------------------------------------
-- B. Approved ANTI_ABRASION Recipe Master names.
-- These names now live in Process Recipe Master, not Master List.
-- ---------------------------------------------------------------------

update public.md_process_recipe
set
    recipe_name = case recipe_no
        when '004' then '23-T3-10 White Resistant Polyurethane Coating'
        when '005' then '23-T3-105 Gray Resistant Polyurethane Coating'
        when '014' then 'CA 8100 Gray Abrasion Resistant Topcoat'
        when '015' then 'CA 8100 White Abrasion Resistant Topcoat'
        when '019' then 'CA 8101 White Series Anti-Chafe Topcoat'
        when '020' then 'CA 8101 Gray Series Anti-Chafe Topcoat'
        when '160' then 'CA8100F12197BMG43K base component Orange'
        else recipe_name
    end,
    updated_at = now()
where process_family='PAINT'
  and recipe_group='ANTI_ABRASION'
  and recipe_no in ('004','005','014','015','019','020','160');

-- ---------------------------------------------------------------------
-- C. Select ONE canonical active Recipe Master row for each:
-- Family + Recipe Group + Recipe No.
--
-- Preference:
-- 1. MANUAL row
-- 2. row having Recipe Name
-- 3. most recently updated
-- ---------------------------------------------------------------------

drop table if exists tmp_recipe_canonical;

create temporary table tmp_recipe_canonical
on commit drop
as
select
    recipe_key as old_recipe_key,
    first_value(recipe_key) over (
        partition by process_family,recipe_group,recipe_no
        order by
            case when source_system='MANUAL' then 0 else 1 end,
            case when nullif(trim(recipe_name),'') is not null then 0 else 1 end,
            updated_at desc,
            recipe_key
    ) as canonical_recipe_key,
    process_family,
    recipe_group,
    recipe_no
from public.md_process_recipe
where is_active=true
  and recipe_no is not null;

create index on tmp_recipe_canonical(old_recipe_key);
create index on tmp_recipe_canonical(canonical_recipe_key);

-- ---------------------------------------------------------------------
-- D. Remap Standard Operation -> Recipe to canonical Recipe Master.
-- ---------------------------------------------------------------------

insert into public.md_operation_recipe_mapping(
    standard_operation,
    recipe_key,
    source_slot,
    is_default,
    is_active,
    updated_at
)
select distinct on (m.standard_operation,c.canonical_recipe_key)
    m.standard_operation,
    c.canonical_recipe_key,
    m.source_slot,
    m.is_default,
    true,
    now()
from public.md_operation_recipe_mapping m
join tmp_recipe_canonical c
  on c.old_recipe_key=m.recipe_key
where m.is_active=true
order by
    m.standard_operation,
    c.canonical_recipe_key,
    m.is_default desc,
    m.updated_at desc

on conflict(standard_operation,recipe_key)
do update set
    source_slot=excluded.source_slot,
    is_default=excluded.is_default,
    is_active=true,
    updated_at=now();

-- ---------------------------------------------------------------------
-- E. Remap Part -> Recipe to canonical Recipe Master.
-- Recipe Name is deliberately NOT copied into Part mapping.
-- It must always be resolved by joining md_process_recipe.
-- ---------------------------------------------------------------------

insert into public.md_part_process_recipe(
    part_num,
    revision_num,
    standard_operation,
    recipe_key,
    source_slot,
    source_recipe_no,
    source_recipe_name,
    is_active,
    updated_at,
    last_import_batch_id
)
select
    p.part_num,
    p.revision_num,
    p.standard_operation,
    c.canonical_recipe_key,
    p.source_slot,
    case
        when p.source_recipe_no ~ '^[0-9]+$'
            then lpad(p.source_recipe_no,3,'0')
        else p.source_recipe_no
    end,
    null,
    true,
    now(),
    p.last_import_batch_id
from public.md_part_process_recipe p
join tmp_recipe_canonical c
  on c.old_recipe_key=p.recipe_key
where p.is_active=true

on conflict(part_num,revision_num,standard_operation)
do update set
    recipe_key=excluded.recipe_key,
    source_slot=excluded.source_slot,
    source_recipe_no=excluded.source_recipe_no,
    source_recipe_name=null,
    is_active=true,
    updated_at=now(),
    last_import_batch_id=excluded.last_import_batch_id;

-- ---------------------------------------------------------------------
-- F. Remove old duplicate references then deactivate duplicate Recipes.
-- ---------------------------------------------------------------------

delete from public.md_operation_recipe_mapping m
using tmp_recipe_canonical c
where m.recipe_key=c.old_recipe_key
  and c.old_recipe_key<>c.canonical_recipe_key;

update public.md_process_recipe r
set
    is_active=false,
    note=concat_ws(' | ',nullif(r.note,''),'Merged duplicate Recipe No into canonical Process Recipe Master'),
    updated_at=now()
from tmp_recipe_canonical c
where r.recipe_key=c.old_recipe_key
  and c.old_recipe_key<>c.canonical_recipe_key;

-- Part rows are already remapped by primary key upsert.
update public.md_part_process_recipe
set source_recipe_name=null,updated_at=now()
where is_active=true
  and standard_operation in (
      'PRIMER','PRIMER2','PRIMER3',
      'TOPCOAT1','TOPCOAT2',
      'ANTI-ABRASION','VARNISH'
  );

-- ---------------------------------------------------------------------
-- G. Process Recipe Master owns Recipe Name.
-- Recalculate Batch Key from Recipe Name only.
-- ---------------------------------------------------------------------

update public.md_process_recipe
set
    batch_key =
        process_family || '|' ||
        recipe_group || '|' ||
        coalesce(upper(nullif(trim(recipe_name),'')),'UNMAPPED'),
    source_system =
        case
            when source_system='MANUAL' then 'MANUAL'
            else 'PROCESS_RECIPE_MASTER'
        end,
    updated_at=now()
where is_active=true
  and process_family='PAINT';

-- ---------------------------------------------------------------------
-- H. Enforce unambiguous lookup.
-- Exactly one ACTIVE master row per Family + Group + Recipe No.
-- ---------------------------------------------------------------------

create unique index if not exists uq_process_recipe_active_lookup
on public.md_process_recipe(process_family,recipe_group,recipe_no)
where is_active=true and recipe_no is not null;

analyze public.md_process_recipe;
analyze public.md_operation_recipe_mapping;
analyze public.md_part_process_recipe;

commit;

-- ---------------------------------------------------------------------
-- I. Verification: Recipe No + Recipe Name returned from Process Recipe Master.
-- ---------------------------------------------------------------------

select
    process_family,
    recipe_group,
    recipe_no,
    recipe_name,
    batch_key,
    source_system
from public.md_process_recipe
where is_active=true
  and process_family='PAINT'
order by recipe_group,recipe_no;
