-- =====================================================================
-- 063_batch_compatibility_selected_conditions.sql
-- v346 - Lưu subset condition mà planner chọn để gom Job vào từng Batch.
-- NULL  : Batch legacy/chưa thiết lập -> mặc định dùng tất cả condition Recipe.
-- []    : planner bỏ chọn tất cả -> chỉ khóa theo Recipe.
-- [{source_column,source_value}, ...] : chỉ khóa theo các condition đã chọn.
-- Process Time conditions vẫn độc lập và KHÔNG bị thay đổi bởi field này.
-- =====================================================================
begin;

alter table public.planning_batch
  add column if not exists compatibility_conditions jsonb;

comment on column public.planning_batch.compatibility_conditions is
'Planner-selected Recipe/Open Job conditions used only for Batch membership compatibility. NULL=legacy/default-all, []=Recipe-only.';

commit;
