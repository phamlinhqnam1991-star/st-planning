# Planning Auto Bridge v306 — Finalize / Resume hardening

## Vấn đề
Một run có thể đã xử lý đủ toàn bộ routing nhưng UI dừng ở `READY_TO_FINALIZE`. Nếu Finalize trước đó lỗi, API có thể đánh run `FAILED` trong DB trong khi client vẫn giữ state cũ; lần bấm Tiếp tục sau đó bị guard status chặn mặc dù `processed_routings = total_routings`.

## Nguồn chuẩn mới cho Finalize
Finalize kiểm tra trực tiếp bảng snapshot `md_intermediate_bridge_rebuild_route`:

- `total_rows`
- `processed_rows`
- `remaining_rows = processed_at is null`

Khi `remaining_rows = 0`, publish được phép retry an toàn vì toàn bộ publish nằm trong transaction. Status `READY_TO_FINALIZE`, `FAILED`, `RUNNING` hoặc `FINALIZING` chỉ là workflow marker, không còn là điều kiện hoàn tất duy nhất.

## UI
Khi `processedRoutings === totalRoutings`, nút hiển thị `✓ Finalize Bridge`. Sau lỗi, client GET lại overview để đồng bộ trạng thái thật từ DB.

## Migration
Không có migration mới.
