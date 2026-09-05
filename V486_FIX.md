# V486 — Dashboard READY split giống Planning Board

## Phạm vi
Chỉ thay đổi cách hiển thị/classify READY trong `ST Workload Summary · By Area` của Dashboard và tài liệu liên quan. Không đổi Planning Chain, Batch, Recipe, Scheduling, Production, RBAC hay database.

## Thay đổi
- Dashboard workload table tách `READY` thành:
  - `READY · Previous Main Scheduled`
  - `READY · Previous Main Unscheduled / START`
- Dùng đúng classifier đã chuẩn hóa ở Planning Board:
  - Previous Main có Schedule → Scheduled.
  - Previous Main đã DONE theo physical progress dù không có Batch/Schedule → Scheduled.
  - First Main không có predecessor → Scheduled.
  - Plan-ahead chưa handoff → Unscheduled / START.
- Hai cột READY cộng lại đúng READY tổng.
- Recipe breakdown dùng cùng split.

## Không thay đổi
WAIT, PLANNED-UNSCHEDULED, SCHEDULED, HOLD, ST ONLY; chart; Batch/Schedule/Production logic.

## Database
Không có migration SQL mới.
