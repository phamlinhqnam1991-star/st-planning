-- v341: tăng tốc truy vấn md_process_requirement (2.1M rows).
-- Trang Công thức & Rule không còn tải toàn bộ bảng mỗi lần mở; danh sách
-- requirement_code được cache 5 phút, giá trị từng mã được lazy-load qua
-- /api/config/recipe-condition-values. Hai index dưới giúp các query đó
-- (lọc theo is_active + upper(trim(requirement_code))) không phải seq-scan.

create index if not exists idx_md_process_requirement_active_code
  on public.md_process_requirement (is_active, upper(trim(requirement_code)));

create index if not exists idx_md_process_requirement_active_code_value
  on public.md_process_requirement (is_active, upper(trim(requirement_code)), upper(trim(requirement_value)));
