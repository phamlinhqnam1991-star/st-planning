# V431 · Board Điều Độ — Recipe theo khu vực điều độ

## Phạm vi
Chỉ sửa Recipe selector/validation trên `/schedule`. Không đổi Planning Chain, Candidate, Batch membership, Dashboard hoặc Recipe resolver của Planning Board.

## Logic mới
1. `src/app/schedule/page.tsx` tải mỗi Recipe cùng danh sách active Main Operation từ `md_main_operation_recipe.standard_operation`.
2. `ManualScheduleGrid` lọc dropdown Recipe theo Main Operation pool của từng `Schedule Area`. Khu gộp nhiều lane dùng union pool.
3. Khi Edit lịch cũ, Recipe hiện tại vẫn hiển thị nếu mapping đã đổi để không làm mất dữ liệu lịch sử; các Recipe ngoài khu vực không xuất hiện để chọn mới.
4. `Create Empty Batch` lọc Recipe theo Main Operation đã chọn.
5. API manual-grid ưu tiên `md_main_operation_recipe.standard_operation` khi derive Operation và revalidate Recipe → Main trước khi tạo Batch/Schedule.

## Không thay đổi
- Recipe resolver / condition của Planning Board
- Planning Chain READY/WAIT
- Candidate population
- Batch membership
- Trial day shift V430
- Dashboard ST population / workload

## Migration
Không cần migration database.
