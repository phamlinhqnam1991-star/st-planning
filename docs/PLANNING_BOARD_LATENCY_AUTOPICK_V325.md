# Planning Board — Latency Auto-Pick + Timeout Tuning — v325

## Vấn đề

Sau v324 (payload đã giảm 3.1MB → 1.3MB) board vẫn timeout 25s → payload không còn là
nguyên nhân. DB kiểm tra lúc đó khỏe mạnh (không query kẹt, không lock) → vấn đề nằm ở
**đường kết nối máy/dịch vụ của người dùng tới Supabase pooler AWS Seoul**: mỗi
query round-trip mất nhiều giây (mạng chập chờn, cùng gốc với lỗi `ENOTFOUND` trước đó).

## Đã làm (v325)

1. **Latency probe + tự chọn endpoint nhanh** (`db.ts`): khi DNS bình thường, lúc khởi
   tạo pool app connect thử CẢ pooler (`configured`, IPv4) và direct host
   (`supabase-direct`, IPv6) với timeout 4s mỗi bên, rồi **giữ endpoint kết nối nhanh
   hơn**. Log: `[db] latency probe: configured=792ms supabase-direct=FAIL -> using
   configured`. ISP có IPv6 tốt sẽ tự chuyển sang direct host — không cần sửa cấu hình.
2. **Nới timeout**: client 25s → **40s** (có đếm giây + nút Thử lại), route 45s → 55s.
3. **Health endpoint tự đo độ trễ**: mở `GET /api/config/health?fresh=1` (không cần đăng
   nhập) → JSON có `_timingMs` = thời gian thật của request DB. Dùng để kiểm tra đường
   truyền máy mình nhanh/chậm mà không cần vào app.
4. Thông báo timeout trên UI nhắc: "Mở /api/config/health?fresh=1 để đo độ trễ DB
   (xem _timingMs), gửi dev dòng log [candidates]/[db]".

## Cách kiểm tra nhanh từ máy người dùng

- Mở `http://localhost:3000/api/config/health?fresh=1`:
  - `_timingMs` vài trăm ms → đường truyền OK; lỗi ở chỗ khác (gửi log `[candidates]`).
  - `_timingMs` vài giây hoặc không mở được → đường mạng tới Supabase rất chậm; thử
    chuyển mạng (hotspot/mạng khác) hoặc dùng override
    `DB_CONNECTION_STRING=postgresql://postgres:<pass>@db.<project-ref>.supabase.co:5432/postgres`
    (đường IPv6 direct).

## Rollback

Chỉ đổi code (db.ts, candidates route, 2 hook client, health route). Không có migration SQL.
