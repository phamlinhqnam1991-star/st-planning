# V401 — Dashboard bỏ trạng thái PLANNED riêng

## Thay đổi
- Bỏ `PLANNED` khỏi global Dashboard KPI cards.
- Bỏ `PLANNED` khỏi KPI từng Area.
- Bỏ cột `PLANNED` khỏi Main Planning → Recipe workload table.
- Bỏ series/legend `PLANNED` khỏi stacked dm² chart.
- `planning_job_operation.status=PLANNED` nếu chưa có Schedule được chuẩn hóa vào `PLANNED-UNSCHEDULED` trên Dashboard.
- CAT3/CAT5 cũng hiển thị occurrence nội bộ PLANNED chưa schedule là `PLANNED-UNSCHEDULED`.
- Xóa CSS Dashboard riêng của status `planned` đã không còn dùng.

## Không thay đổi
Planning Chain vẫn giữ trạng thái nội bộ `PLANNED`; Batch/Schedule/Recipe/Hold/Planning Board không đổi. Không cần migration.
