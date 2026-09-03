# V395 — Planning Workload Summary

## Mục tiêu
Planner cần nhìn nhanh workload READY / WAIT / HOLD của tất cả Main Operation mà không phải đọc từng ô trong Planning Matrix.

## Kiến trúc
Workload Summary là lớp READ-ONLY trên Planning Board:

`planning_job_operation + open_job_current + Area/Main master -> aggregate -> Planning Board UI`

Không thay đổi Planning Chain, READY/WAIT rule, Batch, Recipe, Schedule hay Production Execution.

## Dữ liệu tổng hợp
Theo từng `Area + Main Operation`:
- READY: Jobs / pcs / dm²
- WAIT: Jobs / pcs / dm²
- HOLD: Jobs / pcs / dm²
- Total Load = READY + WAIT + HOLD

Qty dùng cùng cách tính Planning Board:
`current_good_wip_qty` nếu > 0, nếu không dùng `prod_qty`.

Surface dùng `total_surface`; nếu thiếu thì `qty * surface_per_part_dm2`.

Một Job chỉ được tính một lần trong cùng `Main Operation + status bucket`, tránh route occurrence lặp làm nhân đôi pcs/dm².

## Drill-down
Click ô READY / WAIT / HOLD của một Main Operation:
1. Hydrate Route Matrix cho Candidate scope hiện tại nếu chưa tải.
2. Áp dụng filter đúng `Main Operation + route status`.
3. Candidate Matrix bên dưới chỉ hiện Job phù hợp.
4. `Xóa lọc ...` trả lại scope trước khi drill-down.

Nếu đang gom Job vào Batch, drill-down bị chặn để không làm mất ngữ cảnh Batch Selection.

## Refresh
Workload Summary tự refresh:
- Khi mở/load scope Planning Board.
- Sau Create/Add Batch.
- Sau Hold / Unhold.
- Sau Rebuild Planning Chain.
- Hoặc planner bấm `Làm mới`.

## API
`GET /api/planning/workload-summary?areaId=<id>&op=<main>`

Chỉ đọc database, có auth guard hiện hành, không có write action.

## Migration
Không có migration mới cho V395.
