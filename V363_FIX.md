# v363 — Job Planning Debug

Không thay đổi business logic.

Bổ sung nút 🔎 cạnh Job No. trên Planning Board để chẩn đoán một Job theo đúng engine Rebuild Chain hiện tại.

Debug hiển thị:
- All Open Job LastOperation / NextOperation / AllOperation.
- Mapping của NextOperation và vị trí trong AllOperation.
- Route sau standardize, bao gồm occurrence PRIMER/PRIMER2/PRIMER3 và TOPCOAT1/TOPCOAT2.
- Current Main resolver: Anchor mode + reason.
- Main route lý thuyết theo engine.
- planning_job_operation đang lưu trong DB, status ELIGIBLE/LOCKED/PLANNED, Batch/Schedule.
- Route Matrix thực tế trên Planning Board.
- Kết luận checkbox mở hay khóa, dùng cùng quy tắc computeSelectableTarget của Board.
- Warning khi theoretical chain lệch DB hoặc NextOperation thiếu mapping/không có trong AllOperation.

Mục tiêu: xác định nguyên nhân trước khi sửa thêm READY/WAIT logic.
