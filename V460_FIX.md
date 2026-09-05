# V460 — Configurable Batch No + Batch Size Auto Split

## Đã thay đổi
- Operation Master có Batch Config theo từng Main Operation:
  - `batch_prefix`: chuỗi tùy biến 1–30 ký tự, ví dụ `XXX_`, `PRI_`, `CHM-`.
  - `batch_sequence_start`: số bắt đầu.
  - `batch_sequence_padding`: số chữ số sequence (1..12).
  - `batch_size_qty`: Batch Size theo pcs.
  - `batch_auto_split`: bật/tắt tự chia Batch theo Qty.
- Bỏ generator cũ `XXX_DDMMM_NNN`. Batch No mới = `Prefix + numeric sequence`.
- Sequence được cấp atomically theo Prefix, không reset theo ngày.
- Nếu `XXX_ / Start=1 / Padding=5 / Size=12 / Auto Split=ON`, Job 24 pcs tạo:
  - `XXX_00001` = 12 pcs
  - `XXX_00002` = 12 pcs
- Surface được chia tỷ lệ theo Qty của từng allocation.
- Process Time được tính lại riêng cho từng Batch sau split.
- `planning_batch_job` cho phép một Planning Job Operation xuất hiện ở nhiều Batch để lưu partial allocation, nhưng vẫn unique trong cùng một Batch.
- Sequential Planning chỉ xem operation là PLANNED khi tổng Qty allocation của exact planning operation đạt Qty hiện tại của Job.
- Manual Schedule Grid dùng cùng Batch Number generator mới.

## Database
Chạy migration `supabase/migrations/076_configurable_batch_number_and_auto_split.sql` (hoặc `V460_APPLY_AIVEN.sql`) trước khi dùng cấu hình mới.

## Không đổi
- Recipe compatibility / Batch Key.
- READY / WAIT chain ngoài việc nhận đúng trạng thái khi Job bị split theo Qty.
- Scheduling / Production Execution data model; các module này tiếp tục đọc `planning_batch` + `planning_batch_job`.
