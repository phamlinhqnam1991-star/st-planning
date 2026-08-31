# v313 Recovery Rebuild Fix

Baseline nghiệp vụ vẫn là **v313 — NextOperation Main = Current Main fallback**.

Chỉ sửa kỹ thuật `POST /api/planning/rebuild`:

- Ngăn hai Rebuild chạy đồng thời bằng PostgreSQL advisory lock.
- Khi DB từng chạy Snapshot 058/059, Rebuild sẽ thử `SET LOCAL session_replication_role=replica` trong đúng transaction để trigger Snapshot cũ không chặn canonical rebuild v313.
- `SET LOCAL` tự trở lại bình thường sau COMMIT/ROLLBACK.
- Nếu DB role không có quyền đổi `session_replication_role`, hệ thống tự tiếp tục theo đúng rebuild v313 bình thường.
- Lỗi `ROLLBACK` không còn che lỗi PostgreSQL gốc; API trả `error` + `code` thật.
- Không đổi resolver, NO_CHAIN, READY, Batch, Schedule, Recipe hay Batch Key.

Gói delivery đã bỏ các source/migration TEST sau v313: 057, 058, 059, Snapshot TEST và Planning V2 TEST.
Không có migration SQL mới.
