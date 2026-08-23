-- =====================================================================
-- 010_fix_anti_abrasion_recipe_batch_key.sql
-- Paint Recipe correction v19
--
-- FINAL RULES:
-- Recipe No:
--   Primer 1            -> PRIMER / PRIMER2 / PRIMER3
--   Top Coat            -> TOPCOAT1 / TOPCOAT2
--   Anti Abrasion Paint -> ANTI-ABRASION
--   Clear Coat          -> VARNISH
--
-- Recipe Name:
--   Primer1Name
--   TopcoatName
--   AntiAbrasionName; source Master is normally blank, therefore
--     use approved fallback names for Recipe No 004/005/014/015/020/019/160.
--   VarinishName
--
-- Recipe Group remains exactly: ANTI_ABRASION
--
-- Batch Key:
--   Process Family | Recipe Group | Recipe Name
-- Recipe No is NOT part of Batch Key.
--
-- This migration is safe after 009 and preserves MANUAL recipes/mappings.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- A. Build corrected PAINT source.
-- Recipe No comes from md_process_requirement.
-- Recipe Name comes from md_material_finish.
-- ---------------------------------------------------------------------

drop table if exists tmp_correct_paint_recipe_source;

create temporary table tmp_correct_paint_recipe_source
on commit drop
as
with req as (
    select
        part_num,
        revision_num,
        max(requirement_value) filter (
            where requirement_code = 'Primer 1' and is_active
        ) as primer_no,
        max(requirement_value) filter (
            where requirement_code = 'Top Coat' and is_active
        ) as topcoat_no,
        max(requirement_value) filter (
            where requirement_code = 'Anti Abrasion Paint' and is_active
        ) as anti_no,
        max(requirement_value) filter (
            where requirement_code = 'Clear Coat' and is_active
        ) as varnish_no
    from public.md_process_requirement
    where is_active = true
      and requirement_code in (
          'Primer 1',
          'Top Coat',
          'Anti Abrasion Paint',
          'Clear Coat'
      )
    group by part_num, revision_num
),
base as (
    select
        f.part_num,
        f.revision_num,

        case
            when upper(trim(coalesce(r.primer_no,''))) in ('','N/A','NA','NONE','-')
                then null
            else trim(r.primer_no)
        end as primer_no,

        case
            when upper(trim(coalesce(r.topcoat_no,''))) in ('','N/A','NA','NONE','-')
                then null
            else trim(r.topcoat_no)
        end as topcoat_no,

        case
            when upper(trim(coalesce(r.anti_no,''))) in ('','N/A','NA','NONE','-')
                then null
            else trim(r.anti_no)
        end as anti_no,

        case
            when upper(trim(coalesce(r.varnish_no,''))) in ('','N/A','NA','NONE','-')
                then null
            else trim(r.varnish_no)
        end as varnish_no,

        case
            when upper(trim(coalesce(f.primer1_name,''))) in ('','N/A','NA','NONE','-')
                then null
            else trim(f.primer1_name)
        end as primer_name,

        case
            when upper(trim(coalesce(f.topcoat_name,''))) in ('','N/A','NA','NONE','-')
                then null
            else trim(f.topcoat_name)
        end as topcoat_name,

        case
            when upper(trim(coalesce(f.antiabrasion_name,''))) not in ('','N/A','NA','NONE','-')
                then trim(f.antiabrasion_name)

            when trim(coalesce(r.anti_no,'')) = '004'
                then '23-T3-10 White Resistant Polyurethane Coating'

            when trim(coalesce(r.anti_no,'')) = '005'
                then '23-T3-105 Gray Resistant Polyurethane Coating'

            when trim(coalesce(r.anti_no,'')) = '014'
                then 'CA 8100 Gray Abrasion Resistant Topcoat'

            when trim(coalesce(r.anti_no,'')) = '015'
                then 'CA 8100 White Abrasion Resistant Topcoat'

            when trim(coalesce(r.anti_no,'')) = '020'
                then 'CA 8101 Gray Series Anti-Chafe Topcoat'

            when trim(coalesce(r.anti_no,'')) = '019'
                then 'CA 8101 White Series Anti-Chafe Topcoat'

            when trim(coalesce(r.anti_no,'')) = '160'
                then 'CA8100F12197BMG43K base component Orange'

            else null
        end as anti_name,

        case
            when upper(trim(coalesce(f.varinish_name,''))) in ('','N/A','NA','NONE','-')
                then null
            else trim(f.varinish_name)
        end as varnish_name

    from public.md_material_finish f
    left join req r
      on r.part_num = f.part_num
     and r.revision_num = f.revision_num
    where f.is_active = true
),
paint_source as (
    select
        part_num, revision_num,
        'PAINT'::text as process_family,
        'PRIMER'::text as recipe_group,
        'PRIMER'::text as standard_operation,
        'Primer 1'::text as source_slot,
        primer_no as recipe_no,
        primer_name as recipe_name
    from base
    where primer_no is not null

    union all

    select
        part_num, revision_num,
        'PAINT','PRIMER','PRIMER2','Primer 1',
        primer_no,primer_name
    from base
    where primer_no is not null

    union all

    select
        part_num, revision_num,
        'PAINT','PRIMER','PRIMER3','Primer 1',
        primer_no,primer_name
    from base
    where primer_no is not null

    union all

    select
        part_num, revision_num,
        'PAINT','TOPCOAT','TOPCOAT1','Top Coat',
        topcoat_no,topcoat_name
    from base
    where topcoat_no is not null

    union all

    select
        part_num, revision_num,
        'PAINT','TOPCOAT','TOPCOAT2','Top Coat',
        topcoat_no,topcoat_name
    from base
    where topcoat_no is not null

    union all

    select
        part_num, revision_num,
        'PAINT','ANTI_ABRASION','ANTI-ABRASION','Anti Abrasion Paint',
        anti_no,anti_name
    from base
    where anti_no is not null

    union all

    select
        part_num, revision_num,
        'PAINT','VARNISH','VARNISH','Clear Coat',
        varnish_no,varnish_name
    from base
    where varnish_no is not null
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

    -- Recipe identity keeps Recipe No because Recipe No is still master identity.
    process_family || '|' ||
    recipe_group || '|' ||
    upper(recipe_no) || '|' ||
    coalesce(upper(recipe_name),'') as recipe_key,

    -- Batch compatibility intentionally excludes Recipe No.
    process_family || '|' ||
    recipe_group || '|' ||
    coalesce(upper(recipe_name),'UNNAMED') as batch_key

from paint_source;

create index on tmp_correct_paint_recipe_source(recipe_key);
create index on tmp_correct_paint_recipe_source(part_num,revision_num,standard_operation);

-- ---------------------------------------------------------------------
-- B. Remove ONLY old MASTER_LIST Paint relations.
-- Manual Recipe configuration is preserved.
-- ---------------------------------------------------------------------

delete from public.md_part_process_recipe p
using public.md_process_recipe r
where p.recipe_key = r.recipe_key
  and r.process_family = 'PAINT'
  and r.source_system = 'MASTER_LIST';

delete from public.md_operation_recipe_mapping m
using public.md_process_recipe r
where m.recipe_key = r.recipe_key
  and r.process_family = 'PAINT'
  and r.source_system = 'MASTER_LIST';

delete from public.md_process_recipe r
where r.process_family = 'PAINT'
  and r.source_system = 'MASTER_LIST'
  and not exists (
      select 1
      from public.md_part_process_recipe p
      where p.recipe_key = r.recipe_key
  )
  and not exists (
      select 1
      from public.md_operation_recipe_mapping m
      where m.recipe_key = r.recipe_key
  );

-- ---------------------------------------------------------------------
-- C. Rebuild auto-generated Process Recipe Master.
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
    batch_key,
    'MASTER_LIST',
    true
from tmp_correct_paint_recipe_source
order by recipe_key, recipe_name nulls last

on conflict (recipe_key)
do update set
    process_family = excluded.process_family,
    recipe_group   = excluded.recipe_group,
    recipe_no      = excluded.recipe_no,
    recipe_name    = excluded.recipe_name,
    batch_key      = excluded.batch_key,
    source_system  = excluded.source_system,
    is_active      = true,
    updated_at     = now();

-- ---------------------------------------------------------------------
-- D. Rebuild Standard Operation -> Recipe Mapping.
-- ---------------------------------------------------------------------

insert into public.md_operation_recipe_mapping (
    standard_operation,
    recipe_key,
    source_slot,
    is_default,
    is_active
)
select distinct
    standard_operation,
    recipe_key,
    source_slot,
    false,
    true
from tmp_correct_paint_recipe_source

on conflict (standard_operation, recipe_key)
do update set
    source_slot = excluded.source_slot,
    is_active   = true,
    updated_at  = now();

-- ---------------------------------------------------------------------
-- E. Rebuild Part + Revision + Operation -> Recipe.
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
select distinct on (part_num,revision_num,standard_operation)
    part_num,
    revision_num,
    standard_operation,
    recipe_key,
    source_slot,
    recipe_no,
    recipe_name,
    true
from tmp_correct_paint_recipe_source
order by
    part_num,
    revision_num,
    standard_operation,
    recipe_key

on conflict (part_num,revision_num,standard_operation)
do update set
    recipe_key         = excluded.recipe_key,
    source_slot        = excluded.source_slot,
    source_recipe_no   = excluded.source_recipe_no,
    source_recipe_name = excluded.source_recipe_name,
    is_active          = true,
    updated_at         = now();

-- ---------------------------------------------------------------------
-- F. Enforce Batch Key rule for ALL active Paint recipes,
-- including any manually maintained Paint recipe.
-- Recipe No is deliberately excluded.
-- ---------------------------------------------------------------------

update public.md_process_recipe
set
    batch_key =
        process_family || '|' ||
        recipe_group || '|' ||
        coalesce(upper(nullif(trim(recipe_name),'')),'UNNAMED'),
    updated_at = now()
where process_family = 'PAINT'
  and is_active = true;

analyze public.md_process_recipe;
analyze public.md_operation_recipe_mapping;
analyze public.md_part_process_recipe;

commit;

-- ---------------------------------------------------------------------
-- G. Verification.
-- Expected ANTI_ABRASION:
-- 004 / 005 / 014 / 015 / 020 / 019 / 160 all have Recipe Name.
-- Batch Key must NOT contain Recipe No.
-- ---------------------------------------------------------------------

select
    m.standard_operation,
    r.process_family,
    r.recipe_group,
    r.recipe_no,
    r.recipe_name,
    r.batch_key,
    m.source_slot
from public.md_operation_recipe_mapping m
join public.md_process_recipe r
  on r.recipe_key = m.recipe_key
where m.is_active = true
  and r.is_active = true
  and r.process_family = 'PAINT'
order by
    m.standard_operation,
    r.recipe_no,
    r.recipe_name;
