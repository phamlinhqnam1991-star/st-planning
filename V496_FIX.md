# V496 · Dashboard Workload Alignment + Scheduling READY Recipe Breakdown

## Phạm vi
Chỉ thay đổi presentation/read-model của Dashboard và ST Workload Summary trên Scheduling Board. Không thay đổi READY/WAIT gating, Planning Chain, Batch, Recipe resolver hiện tại, Scheduling engine, Production hay RBAC.

## Dashboard
- Xóa toàn bộ KPI/workload card trên Dashboard, cả card tổng và card trong từng Area.
- `ST Workload Summary · By Area` là workload view chính.
- Thứ tự cột đồng bộ với Planning Board:
  1. Current Main / ST Only
  2. Recipe No
  3. Recipe Name
  4. WAIT · Next Main
  5. WAIT · Future Mains
  6. READY · Previous Main Scheduled
  7. READY · Previous Main Unscheduled / START
  8. PLANNED-UNSCHEDULED
  9. SCHEDULED
  10. HOLD
  11. ST ONLY
  12. Total
- Màu WAIT/READY/HOLD và các bucket còn lại được đồng bộ theo ngôn ngữ màu của Planning Board.
- Không thay đổi canonical Dashboard ST population hay phép tính workload.

## Scheduling Board
- Giữ layout V491: `Main → Recipe No → Recipe Name → READY Scheduled/Done → READY Not Yet Scheduled → WAIT Next → WAIT Future → HOLD`.
- Với từng **Recipe row**, hai cột READY hiển thị thêm breakdown theo **Recipe của Previous Main**:
  - Previous Main
  - Previous Recipe No
  - Job
  - pcs
  - dm²
  - Recipe Name nằm trong tooltip/title để giữ bảng gọn.
- Dòng **MAIN TOTAL không breakdown READY**.
- First Main/START không có Previous Main nên không có previous-recipe breakdown.
- WAIT · Next Main breakdown V491 vẫn giữ nguyên, kể cả Chemical Line/Flybar.

## Dữ liệu breakdown
`dashboard-st-workload.ts` bổ sung `previous_recipe_key` từ Batch/Planning occurrence của Previous Main và resolve metadata bằng `md_process_recipe`. Dữ liệu này chỉ phục vụ read-model/presentation; không ghi DB.

## Database
Không có migration SQL mới.
