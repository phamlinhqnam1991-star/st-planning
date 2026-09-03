# V430 — Trial: dời toàn bộ ngày điều độ in-place

## Mục tiêu
Cho phép planner dùng một ngày điều độ làm dữ liệu trial, nếu chưa test xong thì chuyển nguyên ngày sang ngày kế tiếp để tiếp tục test, không giữ bản sao ở ngày cũ.

## Logic chuẩn
- Nút `Dời toàn bộ lịch → +1 ngày`: MOVE toàn bộ Schedule của ngày Board đang xem sang ngày kế tiếp.
- Nút `← Lùi 1 ngày`: MOVE ngược một ngày, dùng như undo đơn giản trong mô hình trial chỉ giữ một ngày.
- Không clone `planning_batch` và không clone `planning_schedule`.
- Sau commit, ngày nguồn bắt buộc không còn active Schedule thuộc population Board ngày đó.
- Giữ nguyên Batch No, Batch membership, Recipe, Resource, Duration, Sequence và Schedule status.
- Dịch đồng bộ `planned_start/planned_end` và Chemical Line `loading/process/ndt/unloading start/end` đúng ±1 ngày.
- Đồng bộ `planning_batch.planned_start/planned_end` theo Schedule mới.
- Chạy all-or-nothing trong một DB transaction.
- Chặn nếu ngày đích đã có lịch độc lập, nếu có RUNNING/COMPLETED, hoặc có lịch khác chạy xuyên khoảng thời gian đích.
- Không tự xóa lịch ngày đích và không merge hai ngày.
- Không thay đổi Planning Chain, Candidate, Batch membership, Recipe, READY/WAIT hay Dashboard population.

## Phạm vi code
- `src/app/api/schedule/shift-day/route.ts`
- `src/components/schedule-day-shift-control.tsx`
- `src/app/schedule/page.tsx`
- `src/app/globals.css`
- Logic Guide / AI knowledge
