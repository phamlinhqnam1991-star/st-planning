# V492 — Scheduling Workload → Planning Board Quick View

## Mục tiêu
Biến các workload card ở Scheduling Board thành lối tắt vào Planning Board mà không tạo một planning/batch engine thứ hai.

## Logic
- Card filter: Area + Main Operation + Recipe + READY/WAIT/HOLD bucket.
- WAIT breakdown filter thêm immediate Previous Main.
- READY Scheduled/Done và READY Not Yet Scheduled: có thể chọn Job và Add to Existing Batch / Create New Batch.
- WAIT Next, WAIT Future, HOLD: read-only.
- Mutation dùng nguyên `/api/planning/batch`; backend permission/scope, recipe compatibility, batch size/auto split và Sequential READY không đổi.

## Popup columns
Job | Part/Rev | Description | Qty | dm² | Priority | Previous Main | Main | Recipe No | Recipe Name | Next Main | Next Recipe No | Next Recipe Name | Batch

Next Main/Recipe được resolve từ active Planning Chain theo Main Planning Order, không hard-code tên Main.

## Phạm vi file
- `src/lib/dashboard-st-workload.ts`: detail resolver dùng lại canonical Dashboard visible population + chain workload classifier.
- `src/app/api/schedule/workload-quick-view/route.ts`: read endpoint cho popup.
- `src/components/manual-schedule-grid.tsx`: clickable cards, popup, select Job, create/add Batch.
- `src/components/erp/erp-kit.css`: presentation popup/click states.
- `src/app/logic-guide/page.tsx`, `src/app/training/page.tsx`: cập nhật đồng bộ.

Không có SQL migration mới.
