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
- Mỗi Recipe Rule có `mapping_id` riêng; cùng Operation Code + Recipe có thể có nhiều rule condition. Batch Compatibility checkbox lấy từ `selection_rule` của đúng `recipe_mapping_id` mà Job chuẩn match, không lấy từ Process Time condition.
- Planner có thể chọn subset condition; selection lưu theo Batch.
- Process Time condition là hệ rule độc lập.
- Create/Add Batch dùng Delta Refresh, không full reload Candidate Board.

## V386 — Candidate theo Area

- Áp dụng cho **tất cả Area**, không hard-code Painting.
- Khi chọn một Area và bấm tải Candidate mà không chọn riêng Main Operation, bảng chỉ hiện các Main Operation được cấu hình thuộc Area đó.
- Thêm một cột ảo **Previous Main** trước nhóm Main Operation của Area. Previous Main được xác định theo đúng occurrence của Candidate hiện tại (`standard_operation + source_seq`), sau đó hiển thị status + Batch + giờ điều độ + Resource nếu có.
- Ví dụ Painting có PRIMER/TOPCOAT/ANTI-ABRASION/... thì chỉ các Main thuộc Painting được mở thành cột; Job có Previous Main là BSASLD hay BSAUNSLD vẫn gộp trong cùng một cột Previous Main theo từng dòng.
- Khi planner bấm một READY cell, Batch Selection Mode vẫn chuyển sang `Previous Main | Selected Main | Next Main Planning` như V385; Recipe Lock không đổi.

## V389 — Job/Main Hold interaction

Planning Matrix no longer renders a permanent `H` button beside every READY/WAIT cell. Right-click the exact Main Operation cell to open the Hold context action. `Hold` uses the existing Hold Reason + Note dialog. A held Job stays visible in Candidate Jobs and its exact Main cell renders `HOLD`; that occurrence is not selectable for Batch. Right-click a held cell and choose `Unhold`; only that Job is incrementally recalculated back to READY/WAIT. This does not change Schedule/Batch HOLD semantics.


## V390 — Lưu trên Planning Board không reload trang

- Tạo/thêm Batch: sau khi API lưu thành công, chỉ refresh các Job nằm trong Batch đó bằng Candidate delta; giữ nguyên màn hình, scroll, filter, zoom, density và layout.
- Hold/Unhold: sau khi database commit, ô Main Operation đổi trạng thái ngay trên màn hình (`HOLD` hoặc READY/WAIT tương ứng), sau đó hệ thống tự đồng bộ lại đúng Job đó ở nền.
- Không gọi full Candidate reload cho Hold/Unhold.
- Mỗi lần tải Candidate đầy đủ sẽ xóa Route Matrix cache cũ trước khi tải để không giữ trạng thái stale.
- Save Operation View không còn fallback `location.reload()`.
- Batch/Rebuild chỉ báo thành công khi HTTP response thực sự thành công.
