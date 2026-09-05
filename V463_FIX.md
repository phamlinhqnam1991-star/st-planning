# V463 — SQL execution max 4 queries

Chỉ thay cách đóng gói SQL triển khai, không đổi logic Batch/Planning/Scheduling.

- `V460_APPLY_AIVEN.sql`: rút còn tối đa 4 top-level queries.
- `supabase/migrations/076_configurable_batch_number_and_auto_split.sql`: đồng bộ cùng cấu trúc 4 queries.
- `V462_APPLY_AIVEN.sql` và migration `077_recipe_specific_batch_size.sql` vốn đã là 4 queries nên giữ nguyên.
- Bỏ `BEGIN/COMMIT/ANALYZE` riêng để không chiếm thêm query trong công cụ giới hạn số câu lệnh.
- Các ALTER/constraint liên quan được gom an toàn vào một `DO $$ ... $$` block.

Logic nghiệp vụ không thay đổi:
- Batch Prefix/Sequence/Batch Size/Auto Split theo Main Operation.
- Recipe-specific Batch Size override Common Batch Size.
- Không có Recipe Batch Size và Common Batch Size thì không split.
- Planning Board gộp multi-batch bằng `&`; Scheduling/Preparation/Production tách từng batch.
