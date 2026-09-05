-- V464 FIX
-- Configurable Batch Number + Auto Split
-- IMPORTANT: file này có đúng 4 câu SQL thực thi, không dùng DO block.

-- Query 1/4: thêm cấu hình Batch vào Main Operation.
alter table public.md_operation_master
  add column if not exists batch_sequence_start bigint not null default 1,
  add column if not exists batch_sequence_padding integer not null default 5,
  add column if not exists batch_size_qty numeric,
  add column if not exists batch_auto_split boolean not null default false;

-- Query 2/4: chuẩn hóa constraint của Batch Config.
alter table public.md_operation_master
  drop constraint if exists md_operation_master_batch_sequence_start_check,
  drop constraint if exists md_operation_master_batch_sequence_padding_check,
  drop constraint if exists md_operation_master_batch_size_qty_check,
  drop constraint if exists md_operation_master_batch_auto_split_size_check,
  add constraint md_operation_master_batch_sequence_start_check
    check (batch_sequence_start >= 0),
  add constraint md_operation_master_batch_sequence_padding_check
    check (batch_sequence_padding between 1 and 12),
  add constraint md_operation_master_batch_size_qty_check
    check (batch_size_qty is null or batch_size_qty > 0),
  add constraint md_operation_master_batch_auto_split_size_check
    check (not batch_auto_split or batch_size_qty is not null);

-- Query 3/4: cho phép 1 Job Operation nằm trong nhiều Batch,
-- nhưng không được lặp lại cùng Job Operation trong cùng một Batch.
alter table public.planning_batch_job
  drop constraint if exists planning_batch_job_planning_job_operation_id_key,
  drop constraint if exists planning_batch_job_batch_operation_key,
  add constraint planning_batch_job_batch_operation_key
    unique (batch_id, planning_job_operation_id);

-- Query 4/4: index phục vụ tính Qty đã allocate / Qty còn lại theo Job Operation.
create index if not exists ix_planning_batch_job_operation_allocation
  on public.planning_batch_job(planning_job_operation_id, batch_id);
