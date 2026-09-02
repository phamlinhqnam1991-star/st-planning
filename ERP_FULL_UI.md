# ERP Full UI Migration

Bản này chuyển lớp presentation của toàn bộ ST Planning sang ERP Template Kit nhưng giữ nguyên business logic, API và database.

## Phạm vi đã chuyển

- Master Data và toàn bộ màn hình con `/master/*`
- Cấu hình và toàn bộ flow cấu hình
- Part Tracker
- Job Tracker
- All Open Jobs + History + Job Detail
- Planning Board ERP hiện tại
- Masking / Unmasking
- Board Điều Độ, Manual Schedule Grid, Timeline, Planner views
- Import Master
- Logic & Hướng dẫn
- Login

## Baseline giữ lại

- `/planning-old` và các route con của nó giữ presentation cũ để regression.
- `PlanningCandidateShell` và `planning-board-client.tsx` không bị thay đổi trong vòng migrate toàn app này.

## Kiến trúc

Các page cũ được đánh dấu bằng class `erpkit-migrated-page`. ERP Kit áp design tokens và component styling dùng chung từ:

- `src/components/erp/erp-kit.css`
- `src/components/app-tabs.tsx`

Không fork business logic. Không đổi schema, API contract hay planning/scheduling engine.

## Kiểm tra tĩnh

- TypeScript/TSX syntax parse: OK.
- Local imports: OK.
- CSS braces: OK.
- Full `npm ci`/production build không hoàn tất trong môi trường audit do package install timeout; cần chạy `npm run build` trên môi trường dự án.
