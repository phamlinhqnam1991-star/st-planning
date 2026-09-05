# V468 · Production Change Alerts

## Mục tiêu
Thêm tab riêng **Cảnh báo thay đổi bởi Sản xuất** để planner nhìn một nơi và hiểu ngay tất cả Job được Production thêm ngoài Batch cùng ảnh hưởng downstream.

## Logic
- Chỉ đọc/audit, không sửa Batch hoặc Schedule tại tab này.
- Nguồn dữ liệu dùng đúng audit đã có từ V464–V467: `production_adjustment_item`, `production_adjustment_set`, `planning_handover_change_event`.
- Hiển thị cả:
  - Production thêm Job trực tiếp ngoài lô.
  - Job được thêm vào downstream từ Attention Main trước.
  - Batch/Main/Recipe/Resource/Schedule bị thay đổi.
  - Qty/Surface Job; Batch Qty before → after khi có handover event.
  - Next Main, Planner, Batch/Resource đích, Planned Start.
  - Trạng thái Attention: đang chờ, chưa có Batch đích, đã được Main sau nhận, hoặc Main cuối.
  - Audit reason/validation/impact/note.
- Có filter theo Job/Batch/Part/Main/Resource, nguồn thay đổi và trạng thái downstream.

## Database
Không cần migration mới.
