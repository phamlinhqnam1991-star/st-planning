-- Planning Operation Order
-- md_operation_master has no sort_order column in this project.
-- planning_sort_order is intentionally independent and assigned by Planner.
alter table public.md_operation_master
add column if not exists planning_sort_order integer;

create index if not exists idx_md_operation_master_planning_sort_order
on public.md_operation_master(planning_sort_order);
