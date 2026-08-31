# v314 — NO_CHAIN + AllOperation Main => All Main READY

## Phạm vi

Chỉ áp dụng khi resolver cuối cùng vẫn là `NO_CHAIN` **và** `AllOperation` của Job sau Mapping + Planning Scope có ít nhất một Main Planning occurrence.

Không thay đổi resolver của chain bình thường: `MANUAL Segment → AUTO Segment → AllOperation fallback → direct NextOperation Main rescue → NO_CHAIN`.

## Logic mới

Nếu cuối cùng vẫn `NO_CHAIN` nhưng `AllOperation` có Main Planning:

1. Không tự đoán `Current Main`.
2. Toàn bộ Main Planning occurrence tìm được trong chính `AllOperation` của Job được giữ active.
3. Main chưa có Batch active = `ELIGIBLE` / UI `READY`.
4. Main đã có Batch nhưng chưa Schedule = `PLANNED-UNSCHEDULED`.
5. Main đã Schedule = hiển thị trạng thái Schedule thực tế (`SCHEDULED`, `RUNNING`, `HOLD`, `COMPLETED`).
6. Batch/Schedule history chỉ xác định trạng thái của đúng Main occurrence; không dùng để suy ra Current Main.

UI `Current Main` của nhóm này hiển thị `NO CHAIN · ALL MAIN READY` thay vì giả định Main đầu tiên là Current Main. Planner chọn đúng Main cần tạo Batch từ Route Matrix.

## Clear Batch

Riêng `NO_CHAIN_ALL_MAIN`:

- Có thể xóa/clear Batch ở một Main dù Main phía sau đã có Batch.
- Batch chưa Schedule và Batch đã Schedule đều có thể clear để làm lại Batch mới.
- Nếu Batch có Schedule, Schedule cũ được chuyển `CANCELLED` trước khi giải phóng Job.
- Không cho clear nếu Schedule đã `RUNNING` hoặc `COMPLETED`.
- Sau clear, đúng Main đã giải phóng quay lại `READY`; các Main khác giữ nguyên trạng thái Batch/Schedule hiện tại.

Chain bình thường vẫn giữ sequence protection cũ, không được xóa Main trước nếu Main sau đã có Batch.

## Dấu nhận diện

Migration 057 thêm `planning_job_operation.route_resolution_mode`.

Giá trị đặc biệt:

`NO_CHAIN_ALL_MAIN`

Dấu này đảm bảo ngoại lệ Clear Batch và UI chỉ áp dụng đúng nhóm NO_CHAIN có Main trong AllOperation, không ảnh hưởng các Job đã resolve chain bình thường.

## Triển khai

1. Chạy `supabase/migrations/057_no_chain_all_main_ready.sql`.
2. Deploy code v314.
3. Vào Planning Board bấm **Rebuild Chain** một lần để gắn `route_resolution_mode` và mở READY cho các Main của Job NO_CHAIN.
