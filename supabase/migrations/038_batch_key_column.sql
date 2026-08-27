-- =====================================================================
-- 038_batch_key_column.sql
-- v188+ - Batch Key là khóa gom lô (khác Batch No Prefix).
-- Lưu Batch Key trên planning_batch khi tạo lô theo Batch Key/Recipe Rule.
-- =====================================================================
begin;

alter table public.planning_batch
  add column if not exists batch_key text;

create index if not exists ix_planning_batch_batch_key
  on public.planning_batch(batch_key)
  where batch_key is not null;

commit;
