-- 043_recipe_mapping_integrity.sql
-- Enforce one active default Recipe per Standard Operation.
begin;

with ranked as (
  select id,
         row_number() over (
           partition by standard_operation
           order by updated_at desc nulls last, id desc
         ) as rn
  from public.md_operation_recipe_mapping
  where is_active=true and is_default=true
)
update public.md_operation_recipe_mapping m
set is_default=false, updated_at=now()
from ranked r
where m.id=r.id and r.rn>1;

create unique index if not exists uq_operation_recipe_one_default
on public.md_operation_recipe_mapping(standard_operation)
where is_active=true and is_default=true;

create index if not exists ix_operation_recipe_active_operation
on public.md_operation_recipe_mapping(standard_operation,is_active,recipe_key);

commit;
