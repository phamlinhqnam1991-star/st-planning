-- ================================================================
-- 011_normalize_recipe_no_3_digits.sql
-- Numeric Recipe No canonical format:
--   1   -> 001
--   12  -> 012
--   160 -> 160
-- Non-numeric Recipe No is unchanged.
--
-- Batch Key remains:
--   Process Family | Recipe Group | Recipe Name
-- Recipe No is NOT part of Batch Key.
-- ================================================================

begin;

-- Normalize recipe_no stored in Recipe Master.
update public.md_process_recipe
set
    recipe_no = lpad(trim(recipe_no), 3, '0'),
    updated_at = now()
where recipe_no is not null
  and trim(recipe_no) ~ '^[0-9]+$'
  and length(trim(recipe_no)) < 3;

-- Normalize source_recipe_no stored in Part -> Recipe.
update public.md_part_process_recipe
set
    source_recipe_no = lpad(trim(source_recipe_no), 3, '0'),
    updated_at = now()
where source_recipe_no is not null
  and trim(source_recipe_no) ~ '^[0-9]+$'
  and length(trim(source_recipe_no)) < 3;

-- Re-assert current Batch Key rule. Recipe No is excluded.
update public.md_process_recipe
set
    batch_key =
        process_family || '|' ||
        recipe_group || '|' ||
        coalesce(upper(nullif(trim(recipe_name),'')), 'UNNAMED'),
    updated_at = now()
where process_family = 'PAINT'
  and is_active = true;

analyze public.md_process_recipe;
analyze public.md_part_process_recipe;

commit;

select
    process_family,
    recipe_group,
    recipe_no,
    recipe_name,
    batch_key
from public.md_process_recipe
where process_family='PAINT'
  and is_active=true
order by recipe_group,recipe_no,recipe_name;
