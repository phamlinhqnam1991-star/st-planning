# ST Planning — Audit & Cleanup 2026-09-02

## Mục tiêu
Audit code hiện tại theo flow đang dùng: Import/Master → Config → All Open Jobs → Candidate Jobs → Batch → Scheduling → Tracker. Chỉ loại bỏ code có bằng chứng rõ ràng là orphan/dead/legacy/test và không còn caller trong source hiện tại.

## Kết quả chính
- `src`: 205 file → 168 file.
- Kích thước `src`: 2,040,905 bytes → 1,852,123 bytes (~188,782 bytes giảm).
- Xóa `.env.local` khỏi bản giao để tránh lộ secret; giữ `.env.example`.
- Không xóa `supabase/migrations` / `rollback` vì đây là lịch sử schema DB, dù migration cũ không còn được runtime gọi trực tiếp.
- Không xóa Login/Auth vì code hiện tại vẫn sử dụng thật (`/login`, `LoginForm`, `LogoutButton`, `requireApiUser`).

## 1) Orphan components đã xóa
Không có import/caller nào trong source hiện tại:
- `src/components/batch-key-recipe-rule-manager.tsx`
- `src/components/chemical-recipe-mapping-manager.tsx`
- `src/components/intermediate-operations-panel.tsx`
- `src/components/missing-jobs-panel.tsx`
- `src/components/missing-operations-manager.tsx`
- `src/components/planning-area-operation-filter.tsx`
- `src/components/planning-snapshot-shell.tsx`
- `src/components/visible-operations-manager.tsx`

## 2) Dead/orphan libraries đã xóa
Không còn caller trực tiếp sau khi loại các UI legacy:
- `src/lib/operation-code-planning-order.ts`
- `src/lib/planner-ownership.ts`
- `src/lib/planning-sort-order.ts`
- `src/lib/planning/candidate-snapshot.ts`
- `src/lib/planning/intermediate-operations.ts`
- `src/lib/planning/missing-config-jobs.ts`
- `src/lib/planning/schedule-history.ts`
- `src/lib/planning/unlock-next-after-schedule.ts`
- `src/lib/st-operation-flow-apply.ts`
- `src/lib/planning/intermediate-bridge-segments.ts.bak`

Lưu ý: `src/lib/planning/intermediate-bridge-segments.ts` KHÔNG xóa vì vẫn được API rebuild/manual bridge dùng.

## 3) Dead API routes đã xóa
Không có fetch/caller thực tế từ UI hiện tại, hoặc caller duy nhất là component đã chết:
- `/api/config/batch-key-recipe-rules`
- `/api/config/st-operation-flow/bulk`
- `/api/config/st-operation-flow/impact`
- `/api/planning/candidate-metadata`
- `/api/planning/snapshot/candidates`
- `/api/schedule/chemical-suggestion`

## 4) Nhánh test/legacy đã xóa
- `/planning/v2` và toàn bộ `src/components/planning-v2/*`: nhánh TEST, không có link từ flow hiện tại.
- `/planning/snapshot`: snapshot thử nghiệm cũ, hiện Planning Board chính dùng `/planning`.
- `/process-recipes`: redirect legacy sau khi chức năng đã gộp vào `/recipe-operation-map`.
- `/batch-key-recipe-rules`: redirect legacy sau khi chức năng đã gộp vào `/recipe-operation-map`.
- Các link nội bộ ở ST Operation Flow / Planner Work Assignment / Auto Planning Rules đã sửa trỏ thẳng `/recipe-operation-map`.
- `src/proxy.ts`: no-op với `matcher: []`, không tham gia flow.

## 5) File rác / artifact delivery đã loại
- `b{`, `td{` (mảnh file lỗi)
- `tsconfig.tsbuildinfo`
- `V*_FIX.md` ở root (patch notes lịch sử; không tham gia runtime)
- `CLEANUP.md` cũ vì nội dung đã lệch code hiện tại
- `.env.local` khỏi bản ZIP giao

## 6) Những thứ KHÔNG xóa
- `docs/`: giữ để tra logic/flow lịch sử khi cần.
- `supabase/migrations` và `supabase/rollback`: giữ lịch sử DB.
- Login/Auth: vẫn có caller thật.
- Recipe diagnosis: vẫn được Planning Board gọi qua `/api/planning/recipe-diagnosis`.
- Intermediate bridge rebuild hiện tại: vẫn được ST Operation Flow và Import Master gọi.
- Job Tracker, Part Tracker, All Open Jobs, Masking/Unmasking, Planning, Scheduling: đều thuộc flow hiện tại.

## 7) Kiểm tra sau cleanup
- Scan toàn bộ import local `@/...` và relative import: **0 missing local import**.
- Scan lại module non-entry không có import: **0 orphan module còn lại**.
- `npm typecheck/lint` chưa thể dùng làm bằng chứng trong container audit do việc cài dependency từ package-lock bị timeout giữa chừng; không kết luận pass/fail từ lần chạy đó.

## Khuyến nghị tiếp theo
Nếu muốn giảm thêm runtime complexity, bước tiếp theo nên là audit sâu ở cấp symbol/function trong các file rất lớn (`planning-board-client.tsx`, `manual-schedule-grid.tsx`, `master-config.ts`, API batch/schedule) bằng coverage thực tế khi thao tác UI. Static scan có thể phát hiện phần lớn orphan file, nhưng không đủ an toàn để tự xóa callback/branch động chỉ vì không thấy text caller.

## Final delivery cleanup (2026-09-02)
- Removed `tsconfig.tsbuildinfo`: generated TypeScript incremental-build cache, not source/runtime.
- Removed `.claude/`: stale internal planning notes from older v278-v281 work; not consumed by application runtime or build.
- Confirmed `.env.local` is not included in the delivery package.
