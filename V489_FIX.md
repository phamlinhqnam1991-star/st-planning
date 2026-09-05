# V489 — Split WAIT by Planning Chain position

## Mục tiêu
Tách WAIT thành hai loại để planner phân biệt Main đang chờ ngay kế tiếp với các Main tương lai còn xa hơn.

## Classifier
- `WAIT · Next Main`: occurrence `LOCKED` gần nhất của mỗi Job theo `planning_seq -> source_seq -> id`.
- `WAIT · Future Mains`: các occurrence `LOCKED` còn lại phía sau.
- `WAIT = WAIT_NEXT_MAIN + WAIT_FUTURE_MAIN`.

## Không thay đổi
- Không migration SQL.
- Không thêm trạng thái DB mới; `planning_job_operation.status` vẫn là `LOCKED`.
- Sequential READY, Batch, Recipe, Schedule, Production, Future ST và Preparation giữ nguyên.

## UI đồng bộ
- Route Matrix: `W1` / `W2`.
- Planning Board Workload Summary: 2 cột WAIT + drill-down riêng.
- Dashboard Workload Summary: 2 cột WAIT.
- Scheduling Workload Summary: 2 cột WAIT.
- Logic & Guide + Training cập nhật cùng phiên bản.
