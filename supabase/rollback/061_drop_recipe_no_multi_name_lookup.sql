-- Rollback 061_recipe_no_multi_name_lookup.sql
-- Chỉ nên rollback khi KHÔNG còn 2 recipe active cùng (family, group, no) khác name;
-- nếu có, lệnh create index dưới sẽ fail vì vi phạm unique.

drop index if exists public.uq_process_recipe_active_lookup;

create unique index if not exists uq_process_recipe_active_lookup
on public.md_process_recipe (process_family, recipe_group, recipe_no)
where is_active=true and recipe_no is not null;
