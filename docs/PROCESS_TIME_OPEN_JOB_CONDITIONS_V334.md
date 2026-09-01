# Process Time · điều kiện All Open Job

## Chức năng

Mỗi `md_recipe_time_rule` có thể có 0..8 điều kiện từ các cột All Open Job.

- 0 điều kiện: rule mặc định / fallback.
- Nhiều điều kiện: dùng AND.
- Rule match nhiều điều kiện hơn được ưu tiên trước.
- Nếu cùng số điều kiện: Priority nhỏ hơn thắng, sau đó ID nhỏ hơn.
- Rule có điều kiện chỉ match khi tất cả Job trong Batch đều thỏa toàn bộ điều kiện.
- Batch trộn giá trị sẽ không match rule cụ thể và rơi về fallback nếu có.

## Database

Chạy migration:

`supabase/migrations/062_process_time_open_job_conditions.sql`

Bảng mới:

`md_recipe_time_rule_condition`

## UI

Configuration → Thời gian xử lý (Process) → `+ Thêm cột điều kiện`.

Tên cột và giá trị unique lấy từ `md_open_job_column_value`.
