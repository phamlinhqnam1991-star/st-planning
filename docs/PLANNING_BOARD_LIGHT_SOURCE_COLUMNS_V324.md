# Planning Board — Light Load + Lazy All Open Source Columns — v324

## Vấn đề

Board cũ `/planning` vẫn timeout (>25s) dù V2 đã chuyển light: board cũ không gửi
`light=1` nên vẫn kéo payload ~3.1MB (trong đó `source_data` ~2.8MB) qua đường mạng
yếu tới Supabase pooler → transfer không kịp trong 25s.

## Giải pháp

1. **Board cũ cũng load light** (`planning-candidate-shell.tsx` gửi `light=1`) —
   payload giảm 3.1MB → ~1.3MB, thời gian ~0.3–1s. Board hiện ngay, cột All Open
   Source tạm trống (không crash — mọi chỗ đọc đều null-safe).
2. **Tải `source_data` nền theo yêu cầu** — endpoint mới
   `POST /api/planning/candidates/source` (`{jobNums: string[]}`) trả
   `{rows:[{job_num, source_data}]}` chỉ cho các job đang hiển thị. Shell gọi sau khi
   board đã render, timeout 45s, **thất bại chỉ hiện notice nhỏ** — không chặn board.
3. Cột All Open Source tự điền lại sau khi merge (memo `sourceColumns` phụ thuộc
   `candidates[0].source_data`).
4. `recipe-diagnosis` (mode job) nhận `source_data:null` trong light mode — tính năng
   so sánh vẫn chạy với part/rev, chỉ thiếu cột raw source.

## Kết quả

| Màn | Trước | Sau |
|---|---|---|
| `/planning` (board cũ) | 3.1MB → timeout >25s (mạng yếu) | ~1.3MB, render ngay; source columns điền nền |
| `/planning/v2` | light từ v323 | giữ nguyên |

## Rollback

Chỉ đổi code (shell + route mới). Không có migration SQL. Xoá route
`src/app/api/planning/candidates/source/route.ts` + bỏ `light=1` và `loadSourceData`
trong shell để về v323.
