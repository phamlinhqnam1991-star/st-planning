# v358 — Masking / Unmasking Planning tab

- Thêm top-level tab `Masking / Unmasking` tại `/masking-unmasking-planning`.
- Hiển thị tất cả Main Planning theo `md_operation_master.planning_sort_order`.
- UI đổi nhãn `PRIMER` thành `PRIMER1` để tách rõ PRIMER1/2/3; không đổi dữ liệu Master.
- Trong mỗi Main chia riêng `Masking` và `Unmasking`.
- Support operation được suy ra trực tiếp từ `md_routing_detailed.operation_detail_code` nằm giữa Previous Main và Current Main của đúng Job/Part/Revision.
- `MSKG/MASK` => Masking; `UNMSK/UNMASK` => Unmasking.
- Một Job có nhiều support detail code trong cùng đoạn route được gom một dòng và liệt kê theo sequence.
- Chỉ hiển thị Job khi Main occurrence đã nằm trong Batch; Batch chưa schedule vẫn hiển thị `UNSCHEDULED`.
- Batch No. lấy từ Batch của đúng Main phía sau.
- Start Time lấy trực tiếp từ `planning_schedule.planned_start`; đổi lịch Main sẽ tự phản ánh, không lưu bản sao support time.
- Bảng Job giữ các field: Job, Part/Rev, PartDescription, Qty, Surface, LastLaborOp, NextOperation, Priority + Support Operation + Batch No. + Start/End/Resource.
- Job link sang Job Tracker; Batch link sang Batch Detail.
- Tab là derived/read-only view, không thay READY/WAIT, Planning Chain, Recipe, Batch Compatibility, Process Time hay Scheduling engine.
- Không cần migration SQL mới.
