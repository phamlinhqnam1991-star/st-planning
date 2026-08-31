# Planning Board — Candidate Load Parallel + Timeout 60s — v326

## Vấn đề

Health đo từ máy người dùng: `_timingMs ~2.9s`/request DB (so với vài chục ms ở môi
trường mạng thường) → đường máy → Supabase pooler có độ trễ cao từng round-trip.
Load Candidate cũ làm **~5 query nối tiếp** (view → main → ctx → recipeMeta →
recipeOptions) → dễ vượt timeout.

## Đã làm (v326)

1. **Chạy song song các query phụ** (`candidate-data.ts`): mở thêm 1 pooled connection
   (`sideClient`) chạy đồng thời với query chính: recipeOptions + timeRules +
   live-recipe context + recipe meta → round-trip nối tiếp giảm từ ~5 còn **2**
   (view, rồi main ∥ side). Đo thực tế: load lạnh ~4.3s (trước ~13–14.7s), ấm ~0.66s.
2. **Timeout**: client → **60s** (có đếm giây + nút Thử lại), route → 58s (dưới
   `maxDuration=60` để Vercel trả lỗi trước khi platform kill).
3. Giữ nguyên: self-diagnostic khi timeout ("Server+DB OK/FAILED trong Xms"),
   light mode, latency probe chọn endpoint nhanh.

## v327 — metadata endpoint

Bổ sung export `loadPlanningCandidateMetadata(c,{op,recipeKey})` trong
`candidate-data.ts` (trả `{recipeOptions,timeRules,timing}`, chạy song song, dùng
chung `RECIPE_OPTIONS_SQL`/`TIME_RULES_SQL` đã tách riêng) — dùng cho
`/api/planning/candidate-metadata` do người dùng thêm.

## Rollback

Chỉ đổi code (candidate-data.ts, 2 hook client, candidates route). Không có migration SQL.
