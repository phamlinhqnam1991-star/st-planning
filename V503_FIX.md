# V503 · Scheduling READY Scheduled/Done → Next Main Recipe

## Scope
Chỉ sửa `Tab Điều độ → ST Workload Summary · By Area` tại cột `READY · Previous Main Scheduled / Done`.

## Thay đổi
- Giữ nguyên Recipe row / workload total của Main đang READY.
- Detail line trong cột READY Scheduled/Done không còn lặp `Current READY Main · Current READY Recipe`.
- Detail line được regroup theo **immediate Next Main + Recipe của Next Main** và hiển thị `→ Next Main · Next Recipe · Job · pcs · dm²`.
- Nếu cùng Current READY Recipe dẫn tới nhiều Next Main Recipe khác nhau, hiển thị thành nhiều detail line tương ứng.
- Click detail vẫn mở Planning Board Quick View và lọc thêm đúng `Next Main + Next Recipe` của dòng đã click.
- Cột `READY · Previous Main Not Yet Scheduled` giữ nguyên Current READY Main + Current READY Recipe.

## Không thay đổi
- READY/WAIT gating và Previous Main Scheduled/Done classifier.
- Canonical Dashboard workload totals / population.
- Recipe resolver.
- Batch / Schedule / Auto Planning.

## Kiểm tra
- TypeScript/TSX syntax transpile: OK cho các file sửa.
- Full typecheck không chạy hoàn tất trong môi trường đóng gói vì `node_modules` baseline không đầy đủ; `npm ci` bị treo/timeout khi dựng dependency.
