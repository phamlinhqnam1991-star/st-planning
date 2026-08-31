# Planning Board — Candidate Load Performance — v322

## Vấn đề

Lần load Candidate metadata đầu tiên mất ~14.7s (đo trên dữ liệu thật 643 candidates,
không lọc). Break-down:
- ~9.3s: `loadLiveRecipeContext()` — scan toàn bộ `md_process_requirement` (**2.1M rows**)
  + `md_part_process_recipe` (75k rows, query kèm correlated EXISTS mất ~9s).
- ~5.4s: query Candidate chính (buffer DB lạnh; ~0.35–0.9s khi buffer đã ấm).

## Đã sửa

1. **`src/lib/planning/live-recipe.ts`** — bỏ hoàn toàn `md_process_requirement` khỏi
   recipe context: xác minh 2026-08-31 **không selection_rule nào tham chiếu `MD:REQ:*`**
   (rule chỉ dùng `AddInfo_*`, `Part_Masterlist.*`, `MD:PRIMER1…`). `sync-planning-chains`
   vẫn tự load requirements qua query riêng của nó. → tiết kiệm ~10s/cold-start.
2. **`md_part_process_recipe`** — bỏ correlated EXISTS (9.3s → 1.7s), lọc lại bằng
   Set các recipe_key active trong JS (giữ nguyên ngữ nghĩa).
3. **`candidates/route.ts`** — thêm `_debug.timing {queryMs, recipeMs, mapMs, totalMs}`
   (đã có `viewMs/loadMs/db`), log server đầy đủ.
4. **UX** — notice "Đang tải Candidate metadata… (Ns)" đếm giây + nút **"Thử lại"**
   khi lỗi (cả `/planning` và `/planning/v2`).

Kết quả đo (dữ liệu thật): cold-start còn ~2.1s cho context (+ query chính lạnh 5–11s,
phụ thuộc buffer DB); load ấm ~0.35–0.9s.

## Quyết định: KHÔNG bật Snapshot-first cho candidates route

Đã thử nối `loadPlanningCandidatesFromSnapshot` (thiết kế v317) vào route và đo:
- SNAPSHOT HIT: **0.5–1.0s** (đọc + parse JSONB ~2MB payload 643 rows qua pooler).
- Canonical (SQL ấm): **~0.35s**.

Với kích thước dữ liệu hiện tại, JSONB round-trip chậm hơn SQL có index, nên giữ
canonical làm đường chính (ổn định hơn, không có rủi ro stale). `candidate-snapshot.ts`
được giữ nguyên + thêm guard `to_regclass` (tránh double-load khi thiếu bảng 058/059)
phòng khi bật lại sau này. Snapshot test row đã được dọn khỏi DB.

## Rollback

Chỉ đổi code (live-recipe.ts, candidates route, 2 component UI). Không có migration SQL.
