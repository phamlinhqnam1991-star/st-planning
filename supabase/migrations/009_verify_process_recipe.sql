-- Optional verification after 009_process_recipe_paint.sql
select table_name
from information_schema.tables
where table_schema='public'
and table_name in (
  'md_process_recipe',
  'md_operation_recipe_mapping',
  'md_part_process_recipe'
)
order by table_name;

select
  (select count(*) from public.md_process_recipe where is_active) as active_recipes,
  (select count(*) from public.md_operation_recipe_mapping where is_active) as active_operation_recipe_maps,
  (select count(*) from public.md_part_process_recipe where is_active) as active_part_recipe_maps;
