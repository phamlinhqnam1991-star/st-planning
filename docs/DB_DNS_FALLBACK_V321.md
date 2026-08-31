# DB DNS Fallback — v321

## Vấn đề

Một số máy/mạng (và một số môi trường deploy) không phân giải được hostname pooler:
`getaddrinfo ENOTFOUND aws-0-ap-northeast-2.pooler.supabase.com` — dù host có A record
hợp lệ (thường do resolver OS lỗi trên query AAAA, DNS ISP, hoặc DNS tạm thời lỗi).
Hậu quả: mọi page/API chạm DB đều crash ngay tại `getPool().connect()`.

## Giải pháp — `src/lib/db.ts`

Chuỗi fallback host, chạy 1 lần khi pool khởi tạo, không đổi hành vi khi DNS bình thường:

1. **configured** — URL như cấu hình (pooler :6543). Probe bằng `dns.lookup` (cùng
   resolver OS với `net.connect`), retry 1 lần cho trường hợp DNS tạm lỗi.
2. **configured-ipv4** — nếu OS resolver fail, `dns.resolve4` (chỉ query A record,
   bỏ qua AAAA hỏng) → **connect bằng IPv4 literal + TLS SNI**
   (`ssl.servername` = hostname thật). Đã test OK với Supabase.
3. **supabase-direct / supabase-direct-ipv4** — nếu URL là pooler, thêm host direct
   `db.<project-ref>.supabase.co:5432` (IPv6-first) với cùng 2 probe.
4. Nếu mọi probe fail → vẫn dùng URL cấu hình để lỗi connect thật (không nuốt lỗi)
   hiện qua chẩn đoán v321.

Log: `[db] connect ... (configured)` khi bình thường; `[db] Supabase host fallback -> ...`
khi đổi host.

## Override thủ công

- `DB_CONNECTION_STRING=postgres://...` — dùng đúng URL này, bỏ qua probe/fallback.
- `DB_POOL_MAX`, `DB_CONNECT_TIMEOUT_MS` — giữ nguyên như cũ.

## Theo dõi

- `/api/config/health?fresh=1` → `db: {label, host, port, ipOverride}`.
- `/api/planning/candidates` → `_debug.db` tương tự, hiện trong "Chi tiết kỹ thuật" của board.

## Rollback

Chỉ đổi code ở `src/lib/db.ts` + health/candidates route (thêm trường debug). Không có
migration SQL. Quay lại v320 bằng cách restore file cũ nếu cần.
