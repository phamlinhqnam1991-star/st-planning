-- =====================================================================
-- 045_process_recipe_open_job_value_sources.sql
-- v282 - Process Recipe fields can be selected from Open Job Column Values.
--
-- Scope:
--   * Recipe Group: selected All Open Job source column.
--   * Recipe No: remember source column + selected unique source value.
--   * Recipe Name: remember source column + selected unique source value.
--
-- Existing recipes are preserved. Source-column fields are nullable so old
-- catalog rows keep working without any backfill or recipe_key change.
-- =====================================================================

begin;

alter table public.md_process_recipe
    add column if not exists recipe_group_source_column text,
    add column if not exists recipe_no_source_column text,
    add column if not exists recipe_name_source_column text;

create index if not exists ix_process_recipe_source_columns
    on public.md_process_recipe(
        recipe_group_source_column,
        recipe_no_source_column,
        recipe_name_source_column
    )
    where is_active=true;

comment on column public.md_process_recipe.recipe_group_source_column is
'All Open Job source column selected for Recipe Group. New UI stores the same column name in recipe_group for compatibility with existing recipe_key logic.';

comment on column public.md_process_recipe.recipe_no_source_column is
'All Open Job source column whose unique value was selected as recipe_no.';

comment on column public.md_process_recipe.recipe_name_source_column is
'All Open Job source column whose unique value was selected as recipe_name.';

commit;
