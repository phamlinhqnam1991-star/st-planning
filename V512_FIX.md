# V512 · Masking Time Estimate advisory for Scheduling

## Mục tiêu
Masking Time chỉ là dữ liệu tham khảo để Planner điều độ Main Operation chính xác hơn. V512 không tạo Masking resource/timeline riêng, không thay READY/WAIT và không khóa Start Batch.

## Configuration
Thêm `Masking Time Estimate` trong nhóm `Time & Scheduling`:
- `Masking Team Total People`.
- Phân bổ `Allocated People` theo `Physical Area`.
- Mapping `Main Operation -> All Open Job Masking Time Column -> Physical Area`.
- `Time Basis`: `JOB_TOTAL` hoặc `PER_PIECE`.
- `Value Unit`: `HOURS` hoặc `MINUTES`.
- Danh sách cột lấy từ `Open Job Column Values`, không hard-code tên cột.

## Công thức
- `Masking Workload (person-hours) = sum(time value)` với `JOB_TOTAL`.
- `Masking Workload (person-hours) = sum(time value * Job Qty)` với `PER_PIECE`.
- `Estimated Duration = Workload / Allocated People`.
- Nếu có `Previous Main planned_end`, `Estimated Masking Ready = latest Previous Main End + Estimated Duration`.

## Scheduling Board
- Unscheduled Batch hiển thị `MASKING EST.` với Duration, person-hours, manpower và Ready time nếu tính được.
- Batch đã schedule hiển thị `NOT READY` nếu planned start sớm hơn Estimated Masking Ready.
- Dữ liệu trống/sai format được cảnh báo nhưng không chặn Planner.
- Migration/table thiếu phải fail-open: Scheduling Board vẫn tải bình thường và chỉ không có estimate.

## Không thay đổi
Planning Chain, READY/WAIT, Recipe, Batch compatibility/membership, Chemical/Paint process-time engine, Schedule dependency, Production, Realtime và Internal Chat giữ nguyên.
