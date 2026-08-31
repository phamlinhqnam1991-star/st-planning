# Process Time Standard v332

## Mục tiêu
Chuẩn hóa chức năng **Thời gian xử lý (Process)** thành nguồn thời gian chuẩn dùng chung cho Planning Batch và Board Điều Độ.

## Thay đổi chính
- `resolveProcessMinutes()` chỉ còn một implementation chuẩn tại `src/lib/planning/batch-utils.ts`.
- Configuration hiển thị theo **Main Operation → Recipe → Time Rule**.
- Process Time nhập/hiển thị theo `HH:MM`; database vẫn giữ numeric hours để tương thích dữ liệu cũ.
- Một Recipe chỉ giữ một Calculation Mode active khi lưu:
  - `FIXED_HOURS`: một rule cố định.
  - `QTY_SURFACE`: có thể có nhiều range Qty + Surface.
- Khi Time Rule thay đổi, các Batch `PLANNED/RELEASED` chưa Schedule của Recipe đó được tính lại Process Time.
- Create/Add/Remove Job và đổi Recipe tiếp tục tự tính lại `planning_batch.process_minutes`.
- Chemical Line giữ Process Duration do planner override khi Batch thay đổi; nếu không override thì tự dùng Standard Process mới.
- Manual Schedule Grid không còn ghi Duration nhập tay vào `planning_batch.process_minutes`; Duration chỉ là thời gian điều độ thực tế.
- `refreshBatchTotals()` không ghi đè `planned_end` của Batch đã có Schedule.

## Database
Không cần migration mới. Cấu trúc `md_recipe_time_rule`, `planning_batch` và `planning_schedule` hiện tại được giữ nguyên.

## Kiểm tra
Các file TypeScript/TSX thay đổi đã được kiểm tra syntax bằng TypeScript transpiler. Full `npm run typecheck` không chạy hoàn tất trong môi trường đóng gói do dependency install bị ngắt, không phải do lỗi syntax của các file sửa.
