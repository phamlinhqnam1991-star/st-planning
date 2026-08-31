-- v342: cho phép 1 Recipe No có nhiều Recipe Name (mỗi Name là 1 recipe ACTIVE riêng).
--
-- Trước (migration 012-H):
--   uq_process_recipe_active_lookup = unique(process_family, recipe_group, recipe_no)
--   WHERE is_active=true -> chỉ được 1 recipe active cho mỗi No.
--   Khi v340 thêm logic "cùng No khác Name -> tạo variant" sẽ vi phạm index này
--   (duplicate key value violates unique constraint "uq_process_recipe_active_lookup").
--
-- Sau:
--   unique(process_family, recipe_group, recipe_no, upper(trim(coalesce(recipe_name,''))))
--   WHERE is_active=true -> cùng No KHÁC Name được phép cùng active;
--   cùng No + cùng Name (không phân biệt hoa/thường) vẫn bị chặn trùng.
--
-- Lưu ý: chạy migration này TRƯỚC khi deploy code v340/v342, nếu không thao tác
-- "thêm recipe cùng No khác Name" sẽ báo duplicate key.

drop index if exists public.uq_process_recipe_active_lookup;

create unique index if not exists uq_process_recipe_active_lookup
on public.md_process_recipe (
  process_family,
  recipe_group,
  recipe_no,
  upper(trim(coalesce(recipe_name,'')))
)
where is_active=true and recipe_no is not null;

analyze public.md_process_recipe;
