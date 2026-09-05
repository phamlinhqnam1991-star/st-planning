# V466 — Fix Add Job bigint/text parameter error

## Lỗi
Khi thêm Job trực tiếp từ Production Report, PostgreSQL báo:

`column "batch_id" is of type bigint but expression is of type text`

## Nguyên nhân
Trong câu INSERT `production_execution_job`, cùng parameter `$1` vừa được dùng để ghép `source_key` dạng text (`BATCH:<id>`) vừa được dùng cho cột `batch_id` bigint. PostgreSQL suy luận parameter theo ngữ cảnh text và làm `batch_id` nhận text.

## Sửa
Ép kiểu rõ ràng các ID trong INSERT:
- `$1::bigint::text` khi tạo `source_key`
- `$1::bigint` cho `batch_id`
- `$2::bigint` cho `schedule_id`
- `$3::bigint` cho `planning_job_operation_id`

Không thay đổi flow V465: Job thêm từ Production Report vẫn được thêm trực tiếp, không cần approve; tab Điều chỉnh đầu ngày chỉ ghi nhận/audit.

Không cần migration SQL mới.
