# CLEANUP — những gì đã gỡ khỏi codebase (2026-08-31)

Bản sạch này dựa trên `st-planning.zip` gốc, đã xóa các phần **không ai dùng**
đã kiểm chứng bằng scan toàn bộ `src/` (rg). Trước khi xóa có backup đầy đủ:
`st-planning-backup-full.tgz`.

## 1. File rác ở root
- `b{`, `td{` — mảnh vỡ CSS do lỗi shell (93B / 56B).
- `tsconfig.tsbuildinfo` — artifact build (1.1MB, đã có trong `.gitignore`, tự sinh lại khi build).
- `.claude/planning/` — file ghi chú kế hoạch của agent phiên cũ (task_plan/progress/findings), không thuộc app.

## 2. Feature "Intermediate Operations" (orphan)
Không có API route, không component nào render.
- `src/lib/planning/intermediate-operations.ts`
- `src/components/intermediate-operations-panel.tsx`
- CSS v229 `.intermediate-ops-panel`

## 3. Feature "Planning Snapshot" (v317, đã tắt từ v322)
Snapshot-first chậm hơn canonical (comment v322), không còn đường đọc nào dùng.
- `src/lib/planning/candidate-snapshot.ts`
- `src/components/planning-snapshot-shell.tsx` (chưa bao giờ được render; còn gọi API sai path `/api/n/candidates`)
- `src/app/planning/snapshot/page.tsx` + `loading.tsx` (page chỉ redirect về /planning)
- `src/app/api/planning/snapshot/candidates/route.ts` (caller duy nhất là shell chết)
- ⚠️ GIỮ NGUYÊN migration `058/059_planning_*snapshot*` trong `supabase/migrations` — migration là lịch sử DB, không xóa.

## 4. Feature "Missing jobs / Missing operations" (orphan)
2 component không nơi nào render; lib chỉ được 2 component đó import.
- `src/components/missing-jobs-panel.tsx`
- `src/components/missing-operations-manager.tsx`
- `src/lib/planning/missing-config-jobs.ts`
- CSS v223 `.missing-jobs-panel/.missing-*` + v224 `.missing-ops-*`
- ⚠️ `config-overview-client.tsx:62` vẫn hiện issue "Job chưa cấu hình ST" với link `/planning#missing-jobs` — link giờ không scroll tới panel nào (chưa sửa, là quyết định UI).

## 5. Dead libs (không ai import)
- `src/lib/planning/schedule-history.ts` (cả file, 2 export không nơi nào gọi)
- `src/lib/planning/unlock-next-after-schedule.ts` (v312 bỏ LOCKED/handoff nên helper này thành dead)

## 6. Dead components (không ai import)
- `src/components/login-form.tsx` (page /login chỉ redirect /master-data)
- `src/components/logout-button.tsx`
- `src/components/batch-key-recipe-rule-manager.tsx` (feature đã gộp vào /recipe-operation-map từ v266; page /batch-key-recipe-rules giữ làm redirect)
- `src/components/chemical-recipe-mapping-manager.tsx`
- `src/components/visible-operations-manager.tsx`
- `src/components/planning-area-operation-filter.tsx`
- CSS v225 `.visible-ops-panel/.visible-chip/.visible-status`

## 7. Dead API routes (không còn caller nào trong src)
- `src/app/api/planning/candidate-metadata/route.ts`
- `src/app/api/config/batch-key-recipe-rules/route.ts` (caller duy nhất là manager đã xóa)
- `src/app/api/config/recipe-condition-values/route.ts`
- `src/app/api/config/st-operation-flow/impact/route.ts`
- `src/app/api/schedule/chemical-suggestion/route.ts`

## 8. Dead code trong file còn dùng
- `num()` trong `src/app/api/planning/batch/route.ts` (không nơi nào gọi)
- `getActualOperationSequence`, `paintSelectionLocked`, `columnLabel` trong `src/components/planning-board-client.tsx`
- CSS v279 `.planning-pagination` (phân trang đã bỏ từ v298)

## 9. Giữ lại có chủ đích
- `.env.example`, `.env.local` (cần cho chạy local; `.env.local` đã bị loại khỏi zip sạch để tránh lộ — copy lại từ bản gốc nếu cần)
- `docs/`, `supabase/migrations` + `rollback`, page redirect `/batch-key-recipe-rules`, `/login`
- Tab **Planning V2 (TEST)** (`/planning/v2`) — **đã xóa toàn bộ** (2026-08-31): `src/app/planning/v2/`, `src/components/planning-v2/`, mục tab trong `planning-view-tabs.tsx`, CSS `.planning-v2-*` trong globals.css, docs `PLANNING_BOARD_V2_REWRITE_V319.md` + `PLANNING_BOARD_V2_CANDIDATE_LOAD_FIX_V320.md`. Class debug v321 `.planning-v2-debug` (legacy board vẫn dùng) được đổi tên thành `.planning-debug`.
- `src/proxy.ts` — đã xóa (no-op `matcher:[]`, không chạy gì)

## Kiểm chứng
- `npx tsc --noEmit` → pass (exit 0)
- ESLint: 37 errors / 25 warnings đều là baseline có sẵn (react-hooks/exhaustive-deps, set-state-in-effect, location.href...) ở các file/dòng không liên quan tới phần đã gỡ.
- Không còn dây mơ rễ má nào trỏ tới file đã xóa (scan lại từng tên).
