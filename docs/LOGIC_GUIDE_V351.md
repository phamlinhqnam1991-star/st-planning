# Logic & Hướng dẫn v351

Cập nhật toàn bộ tab `/logic-guide` theo hệ thống hiện tại.

## Phạm vi

- Bắt đầu nhanh + flow dữ liệu end-to-end.
- Master Data: giải thích từng sub-tab và downstream dependency.
- Cấu hình: chi tiết 1 → 12, tách rõ Main Planning Order và Next Op Sort.
- Part Tracker.
- All Open Jobs + Import snapshot + ST Scope visibility.
- Planning Board:
  - Sequential READY/WAIT.
  - Columns / Freeze / Excel filters / Default View.
  - Sort Priority và Next Op Sort.
  - Batch Selection Mode.
  - Recipe resolver + selectable Batch Compatibility conditions.
  - Process Time.
  - Create/Add Batch + server validation + Delta Refresh.
- Board Điều Độ: Planner ownership, Unscheduled Batch, Chemical timeline, resources, Schedule Table, Timeline, Handover.
- Import Master incremental flow.
- Impact Matrix: thay đổi upstream → ảnh hưởng downstream → hành động sau khi sửa.
- Live Mapping: đọc trực tiếp cấu hình production hiện tại.
- FAQ chẩn đoán nhanh.

## Logic mới nhất được phản ánh

- Current Main và Main Planning Order không còn là cột Planning Board.
- `md_operation.planning_sort_order` = Next Op Sort cho RAW NextOperation.
- `md_operation_master.planning_sort_order` = Main Planning Order nội bộ cho chain.
- Planning Board không hard-sort NextOperation/Priority ngoài Sort Priority.
- Sequential READY: only immediate next Main opens after DONE / non-cancelled Batch handoff.
- Batch UNSCHEDULED đã là handoff; Scheduling không phải gate READY.
- Batch Compatibility checkbox lấy từ `md_main_operation_recipe.selection_rule`, không lấy từ Process Time condition.
- Planner có thể chọn subset condition; selection lưu theo Batch.
- Process Time condition là hệ rule độc lập.
- Create/Add Batch dùng Delta Refresh, không full reload Candidate Board.
