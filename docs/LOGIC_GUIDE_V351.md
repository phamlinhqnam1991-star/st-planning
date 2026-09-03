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

## V399 · Dashboard workload theo Area
Dashboard giữ RAW NextOperation ST gate của V398, sau đó chia Workload theo `Area -> Main Planning -> Recipe`. Mỗi Area có bộ card `Unique Jobs / WAIT / READY / PLANNED-UNSCHEDULED / SCHEDULED / HOLD` riêng và bảng Main Planning + Recipe riêng. Các bảng Dashboard không giới hạn chiều cao theo viewport nữa; hiển thị toàn bộ dòng, chỉ giữ cuộn ngang khi bảng rộng.
## V400 — Strict RAW NextOperation ST-only gate

Dashboard và Planning Board dùng Current Main đã được Planning Chain resolver xác định từ `LastOperation + RAW NextOperation`. RAW NextOperation có thể là `PLANNING_OPERATION` hoặc Intermediate Operation thuộc active Bridge; điều kiện bắt buộc là Job phải có live Current Main trong Planning Chain. `ST_SCOPE_ONLY` vẫn không tham gia Board/Batch/Schedule. Immediate Operation trên Dashboard chính là RAW `NextOperation`, được nhóm dưới Current Main hiện tại.



## V401 · Dashboard status chuẩn
Dashboard bỏ bucket `PLANNED` riêng. Job/Main có trạng thái nội bộ `planning_job_operation.status='PLANNED'` nhưng chưa có Schedule được hiển thị/tổng hợp vào `PLANNED-UNSCHEDULED`. Dashboard chỉ còn các status vận hành: `WAIT`, `READY`, `PLANNED-UNSCHEDULED`, `SCHEDULED`, `HOLD`. Planning Chain vẫn có thể dùng `PLANNED` nội bộ để giữ lịch sử Batch; V401 không thay business state đó.


## V404 · Current Main + Immediate Operation Dashboard
- Nguồn chuẩn: `LastOperation + RAW NextOperation -> Planning Board resolver -> first active Planning Chain row = Current Main`.
- `Immediate Operation = RAW NextOperation`; Bridge Intermediate hợp lệ được giữ và gán vào Current Main mà resolver đã xác định.
- Ví dụ `BSAUNSLD -> INS-AND -> MSKG-TC -> PPRSLVT(PRIMER)`: Job có NextOperation lần lượt `INS-AND`, `MSKG-TC`, `PPRSLVT` đều được nhóm vào `PRIMER / <RAW NextOperation>` khi Current Main là PRIMER.
- Hai chart nằm ở đầu Dashboard. Combo chart: dm² column (left axis max 50,000 dm²), pcs line (right axis max 10,000), data label trực tiếp trên bar/point và thêm `TOTAL / ALL ST`.

## V408 · Dashboard kiểm tra lại population theo RAW NextOperation
Dashboard trước tiên lọc trực tiếp `open_job_current.next_operation`: chỉ Open Job có RAW NextOperation match `md_st_operation_scope` active với `operation_type='PLANNING_OPERATION'` mới được tính. Bridge Intermediate và `ST_SCOPE_ONLY` không mở rộng population Dashboard ở bước kiểm tra này. `ST TOTAL` là unique Open Job sau RAW gate; Planning Chain/Batch/Schedule chỉ được đọc sau đó để lấy Main/Recipe/status. Planning Board giữ resolver V404; chart chưa đổi công thức, chỉ nhận population Dashboard đã lọc chặt hơn.

## V411 · Dashboard chart chỉ nhận Immediate Operation thuộc ST
Nguồn của Dashboard/chart được lọc theo đúng ST visibility trước khi cộng Qty/Surface: RAW `NextOperation` phải nằm trong `md_st_operation_scope` active và có loại `PLANNING_OPERATION` hoặc `INTERMEDIATE`; sau đó resolver hiện hành mới xác nhận Current Main. `ST_SCOPE_ONLY` và operation ngoài ST bị loại. RAW `LastOperation` chỉ dùng làm context để kiểm tra thứ tự Bridge, không bắt buộc phải là ST vì một Job có thể vừa đi từ công đoạn ngoài ST vào công đoạn ST đầu tiên.
