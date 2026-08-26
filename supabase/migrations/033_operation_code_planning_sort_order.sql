-- Global production order for raw Operation Code / NextOperation.
-- Independent from Standard Operation and per-Job routing.
alter table public.md_operation
add column if not exists planning_sort_order integer;

create index if not exists idx_md_operation_planning_sort_order
on public.md_operation(planning_sort_order);
