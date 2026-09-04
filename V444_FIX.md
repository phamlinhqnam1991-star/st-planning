# V444 — Trial Schedule Day Shift theo Production Day

## Vấn đề
V430 xác định ngày nguồn/ngày đích bằng calendar date (`schedule_date` hoặc local `planned_start` date). Trong khi Board Timeline dùng production day 06:00 → 06:00. Vì vậy các lô bắt đầu sau 00:00 và trước 06:00 của ngày kế tiếp (ví dụ 04/09 00:05) thực tế thuộc ngày sản xuất 03/09 nhưng bị xem nhầm là lô độc lập của ngày đích 04/09 và chặn thao tác dời cả ngày.

## Sửa
- Source population: `planned_start >= source 06:00` và `< next day 06:00`.
- Destination guard: cùng production-day window 06:00 → 06:00.
- Các lô 00:00–05:59 hôm sau được MOVE cùng ngày nguồn.
- `schedule_date` sau MOVE lấy từ shifted `planned_start` local Asia/Ho_Chi_Minh, thay vì ép mọi row về cùng target calendar date.
- UI count/confirm của nút dời ngày dùng production-day count.

## Không thay đổi
Planning Chain, READY/WAIT, Candidate, Batch membership, Recipe, Previous Main lock, Chemical Line proposal/capacity/NDT/Flybar, Masking/Unmasking, Production Report và Dashboard.
