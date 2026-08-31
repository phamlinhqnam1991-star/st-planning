# v308 — Planning position from LastLaborOp + NextOperation

## Chốt logic

Current Main và các Next Main của một Job chỉ được định vị từ đúng cặp dữ liệu All Open Job:

- `LastLaborOp` (`open_job_current.last_operation`)
- `NextOperation` (`open_job_current.next_operation`)

Không còn các fallback dùng `NextOperation` đơn lẻ, `LastLaborOp` đơn lẻ hoặc Schedule history để đoán vị trí vật lý của Job.

## Resolver

1. Nếu cặp `LastLaborOp → NextOperation` là hai bước liền nhau trong `AllOperation`, vị trí được neo tại `NextOperation`.
2. Nếu một/both operation là Intermediate không có trong `AllOperation`, resolver dựng chuỗi vật lý từ Auto Bridge ACTIVE:

   `Previous Main source → Intermediate Operations → Next Main source`

   rồi match đúng cặp liền nhau `LastLaborOp → NextOperation`.
3. Match đúng một canonical occurrence → Current Main là Next Main target của occurrence đó; các dòng Planning sau nó là Next Main(s).
4. Match 0 hoặc nhiều occurrence → `SEQUENCE_CHECK`; không tự đoán.
5. Schedule/Batch history chỉ áp dụng sau bước định vị để tính `READY / WAIT / PLANNED / SCHEDULED`.

## Candidate Board

Candidate không tự resolve lại Current Main theo READY hoặc theo `NextOperation`. `syncPlanningChains()` đã cắt live chain từ vị trí pair; Candidate luôn lấy row live có `planning_seq` nhỏ nhất làm Current Main. Route cells phía sau tiếp tục là các Next Main và vẫn dùng `planning_job_operation_id` thật để tạo Batch.

## Recompute status

`recomputeJobPlanningStatus()` không query Bridge theo NextOperation nữa. Nếu raw `NextOperation` bằng source code của Current Main thì Current Main có thể READY trực tiếp. Nếu không, Job đang ở Intermediate/skip bridge và Previous Main snapshot phải có Schedule thật mới mở Current Main READY.
