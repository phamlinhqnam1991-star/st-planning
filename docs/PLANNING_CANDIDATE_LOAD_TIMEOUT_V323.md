# Planning Board — Candidate Load Hang / Payload — v323

## Vấn đề

Board dừng ở "Đang tải Candidate metadata… (65s)" không bao giờ xong. Đã kiểm tra DB
thực tế lúc đó: **không có query kẹt, không lock, chỉ có connection idle bình thường**
→ nguyên nhân nằm ở lớp kết nối/truyền dữ liệu giữa app và Supabase pooler (mạng không
ổn định — cùng gốc với lỗi `getaddrinfo ENOTFOUND` trước đó), hoặc pool connection bị
kẹt khiến `pool.connect()` xếp hàng vô hạn.

Đồng thời phát hiện payload Candidate rất nặng: `source_data` chiếm **~2.8MB** trong
tổng ~3.1MB (643 rows) — nhưng board V2 không hề render cột All Open Source.

## Đã sửa (chống treo mọi lớp + giảm payload)

1. **Light mode (V2)** — `candidates/route.ts` + `candidate-data.ts`: param `light=1`
   (V2 luôn gửi) thay `j.source_data` bằng `null`. Đo thực tế: **4.4s → 0.3s**,
   payload **3.1MB → 1.3MB**. Board cũ `/planning` không gửi `light` → giữ nguyên
   source_data cho cột All Open Source.
2. **Client timeout 25s** — `use-planning-v2-data.ts` + `planning-candidate-shell.tsx`:
   hủy request sau 25s bằng AbortController, hiện rõ
   "Mất quá 25s khi tải Candidate (timeout)… Thử lại" thay vì xoay vô hạn.
3. **Route timeout 45s** — `candidates/route.ts`: `Promise.race` trả 500
   `Candidate load timeout (>45s)` sạch sẽ; hủy connection bị kẹt (`release(true)`).
4. **Pool timeout + self-heal** — `db.ts`: `connect()`/`query()` giới hạn 20s; khi
   timeout → log `[db] … recycling pool`, đóng pool cũ và tạo mới cho request kế tiếp.
   `connectionTimeoutMillis` mặc định 20s → 10s.

## Kết quả đo (dữ liệu thật, 643 candidates)

| Chế độ | Thời gian | Payload |
|---|---|---|
| Trước v323 (full) | ~4.4s (lạnh hơn nếu buffer nguội) | ~3.1MB |
| v323 light (V2) | **~0.3–1s** | **~1.3MB** |

## Rollback

Chỉ đổi code (route, candidate-data, db.ts, 2 component UI). Không có migration SQL.
