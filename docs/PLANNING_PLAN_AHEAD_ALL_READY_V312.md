# Planning Plan-Ahead All READY — v312

## Mục tiêu

Sau khi vị trí Job đã được resolver xác định bằng `LastLaborOp + NextOperation` theo thứ tự:

`MANUAL Segment → AUTO Segment → AllOperation fallback → NO CHAIN`

thì vị trí vật lý và trạng thái lập kế hoạch được tách riêng:

- Main trước `Current Main`: Job đã đi qua theo progress thực tế.
- `Current Main` và toàn bộ `Next Main(s)`: được phép plan-ahead ngay.
- Batch/Schedule history không còn dùng làm gate mở Main phía sau.

## Trạng thái Current + Next Main(s)

Với mọi active `planning_job_operation` từ Current Main trở về sau:

1. Có Batch không CANCELLED → `PLANNED` (Route Matrix hiển thị `PLANNED-UNSCHEDULED` nếu chưa Schedule).
2. Có Schedule thực tế → Route Matrix hiển thị `SCHEDULED / RUNNING / HOLD / COMPLETED` theo Schedule.
3. Chưa có Batch → `ELIGIBLE`, UI hiển thị `READY`.

Không còn `LOCKED / WAIT PREV` chỉ vì Main trước chưa Schedule.

## Trạng thái Main phía trước Current

Route Matrix vẫn giữ trạng thái thực tế mạnh hơn nếu có lịch sử:

- Có Schedule → `SCHEDULED / RUNNING / HOLD / COMPLETED`.
- Có Batch nhưng chưa Schedule → `PLANNED-UNSCHEDULED`.
- Không có Batch/Schedule history → `DONE` theo progress của All Open Job.

## Ví dụ

Route:

`CPBILP → V_A-SHPN → BSAUNSLD → PRIMER → TOPCOAT1`

Resolver xác định `Current Main = V_A-SHPN`.

Nếu chưa có Batch/Schedule:

- `CPBILP = DONE`
- `V_A-SHPN = READY`
- `BSAUNSLD = READY`
- `PRIMER = READY`
- `TOPCOAT1 = READY`

Nếu `BSAUNSLD` đã Schedule và `PRIMER` đã có Batch chưa Schedule:

- `CPBILP = DONE`
- `V_A-SHPN = READY`
- `BSAUNSLD = SCHEDULED`
- `PRIMER = PLANNED-UNSCHEDULED`
- `TOPCOAT1 = READY`

## Kiến trúc đã loại bỏ

v312 loại bỏ Schedule-handoff helper cũ. Scheduling một Batch không còn là hành động mở khóa Main kế tiếp. Rebuild/recompute trạng thái chỉ giữ hai trạng thái planning nội bộ cho active suffix:

- `PLANNED` nếu có Batch active.
- `ELIGIBLE` nếu chưa có Batch.

Không có migration SQL mới.
