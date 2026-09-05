# ST Planning V438 — Chuyển FULL PostgreSQL từ Supabase sang Aiven

## Mục tiêu đã chốt

Giai đoạn này **không giảm database trước**. Chuyển nguyên trạng database nghiệp vụ hiện tại (~600 MB) sang Aiven trước, xác nhận app chạy ổn, sau đó mới làm Phase 2 dọn history/index/routing.

Luồng:

`Supabase PostgreSQL OLD (~600 MB)` → `pg_dump FULL public` → `Aiven PostgreSQL NEW` → `verify row count` → `Vercel V438 dùng DATABASE_URL=Aiven`.

Không thay Planning Chain, Recipe, Batch, Schedule, Chemical Line, Masking/Unmasking, Production, Dashboard.

> Gói này chỉ chuyển **PostgreSQL public schema + public data**. Supabase Auth/Storage không nằm trong Aiven PostgreSQL. V438 giữ Supabase tạm thời cho Storage/Auth; toàn bộ database nghiệp vụ đi Aiven.

---

## 1. Tạo Aiven PostgreSQL Free

1. Đăng nhập Aiven Console.
2. Tạo Project.
3. Create Service → PostgreSQL.
4. Chọn Free Plan.
5. Chọn region gần hệ thống của bạn nhất.
6. Đợi service trạng thái Running.
7. Mở `Overview / Connect` và copy **Service URI**.

Aiven URI thường dạng:

`postgres://avnadmin:PASSWORD@HOST:PORT/defaultdb?sslmode=require`

Aiven Free hiện có 1 CPU, 1 GB RAM, 1 GB disk và `max_connections=20`, không có built-in connection pooling. Vì vậy V438 mặc định `DB_POOL_MAX=1` trên Vercel.

---

## 2. Lấy SOURCE URL từ Supabase OLD

Supabase → Project OLD → Connect.

Ưu tiên **Session Pooler / port 5432** hoặc Direct PostgreSQL port 5432.

Không dùng URL HTTP/API. Phải là PostgreSQL URI.

Ví dụ:

`postgresql://postgres.PROJECT_REF:PASSWORD@HOST:5432/postgres?sslmode=require`

Project Supabase đang vượt Database Size vẫn có thể được dùng làm nguồn đọc/dump nếu kết nối PostgreSQL còn hoạt động. Trong lúc dump, không thực hiện Import/Save/Batch/Schedule mới.

---

## 3. Chuẩn bị máy Windows

Cần:

- Node.js
- PostgreSQL client tools (`pg_dump`, `pg_restore`)

Kiểm tra:

```bat
node --version
pg_dump --version
pg_restore --version
```

Nếu Windows không nhận `pg_dump`, cài PostgreSQL client hoặc điền đường dẫn vào `.env`:

```text
PG_DUMP_PATH=C:\Program Files\PostgreSQL\17\bin\pg_dump.exe
PG_RESTORE_PATH=C:\Program Files\PostgreSQL\17\bin\pg_restore.exe
```

---

## 4. Giải nén package và tạo `.env`

Copy `.env.example` → `.env`.

Điền:

```text
SOURCE_DB_URL=<PostgreSQL URL Supabase OLD>
TARGET_DB_URL=<Aiven Service URI>
MIGRATION_CONFIRM=SUPABASE_TO_AIVEN_FULL
```

Không đảo SOURCE/TARGET.

---

## 5. RUN_1_PREFLIGHT.cmd

Double-click:

`RUN_1_PREFLIGHT.cmd`

Lần đầu script tự chạy `npm install`.

Preflight kiểm tra:

- SOURCE và TARGET không trùng nhau.
- SOURCE có public tables.
- TARGET Aiven phải là database mới/rỗng.
- PostgreSQL version.
- Database size hai bên.

Kết quả cần thấy:

`PRE-FLIGHT OK`

Nếu TARGET đã có public tables, script dừng để tránh ghi đè.

---

## 6. RUN_2_PREPARE_AIVEN.cmd

Chạy:

`RUN_2_PREPARE_AIVEN.cmd`

Bước này chuẩn bị compatibility cho schema Supabase trên PostgreSQL chuẩn:

- bật `aiven_extras`;
- claim ownership của schema `public` cho `avnadmin`;
- bật `pgcrypto`;
- tạo placeholder roles `anon`, `authenticated`, `service_role` để các RLS policy trong schema Supabase restore được.

Các role này `NOLOGIN`; V438 không dùng chúng làm runtime database user.

Kết quả:

`AIVEN PREPARE OK`

---

## 7. DỪNG GHI dữ liệu tạm thời

Ngay trước dump chính thức:

- không Import Master;
- không Import All Open Jobs;
- không Create/Add/Delete Batch;
- không Save/Edit/Bỏ điều độ;
- không cập nhật Production Execution.

Tốt nhất chỉ một mình bạn thao tác trong khoảng migration.

`pg_dump` là snapshot tại một thời điểm; dữ liệu ghi sau thời điểm snapshot sẽ không tự sang Aiven.

---

## 8. RUN_3_DUMP_SUPABASE.cmd

Chạy:

`RUN_3_DUMP_SUPABASE.cmd`

Script dump:

- toàn bộ `public` schema;
- toàn bộ data trong `public`;
- tables/indexes/functions/triggers/views/RLS policies/constraints;
- **không lọc history**;
- **không giảm md_routing_detailed**;
- **không xóa index cũ**.

File tạo tại:

`artifacts/st-planning-full.dump`

Đây đúng với quyết định: **copy nguyên DB hiện hành trước, giảm sau**.

---

## 9. RUN_4_RESTORE_AIVEN.cmd

Chỉ chạy khi dump thành công.

Double-click:

`RUN_4_RESTORE_AIVEN.cmd`

Script kiểm tra TARGET vẫn rỗng rồi mới restore. Không dùng `--clean`, vì target phải là database mới; cách này tránh vô tình xóa database Aiven đã có dữ liệu.

Sau restore script chạy `ANALYZE` để PostgreSQL có statistics mới cho query planner.

Kết quả:

`AIVEN RESTORE OK`

---

## 10. RUN_5_VERIFY.cmd

Chạy:

`RUN_5_VERIFY.cmd`

Verify thực hiện:

- so danh sách public tables SOURCE ↔ TARGET;
- chạy exact `count(*)` cho từng public table;
- báo table nào thiếu/mismatch;
- hiển thị Database Size SOURCE và Aiven.

Chỉ khi thấy:

`VERIFY OK — table set and row counts match.`

mới được đổi Vercel.

Nếu fail: **không đổi Vercel**.

---

## 11. Deploy source ST Planning V438

V438 thay tầng database sang PostgreSQL chuẩn:

```text
DATABASE_URL=<Aiven Service URI>
DB_POOL_MAX=1
DB_CONNECT_TIMEOUT_MS=20000
```

Trong Vercel → Project → Settings → Environment Variables:

### Thêm/đổi

```text
DATABASE_URL=postgres://avnadmin:.../defaultdb?sslmode=require
DB_POOL_MAX=1
DB_CONNECT_TIMEOUT_MS=20000
```

### Giữ tạm Supabase cho Storage/Auth

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
```

### Có thể bỏ sau khi deploy V438

```text
SUPABASE_DB_URL
DB_CONNECTION_STRING
```

V438 không còn dùng hai biến DB Supabase cũ.

Redeploy deployment mới.

---

## 12. Smoke test bắt buộc

Test lần lượt:

1. Dashboard.
2. Master Data.
3. Part Tracker.
4. All Open Jobs.
5. Job Tracker.
6. Planning Board.
7. Existing Batch.
8. Create/Add Batch test.
9. Board Điều Độ.
10. Previous Main lock.
11. Chemical Line proposal/FB/Loading/Process/NDT/Unloading.
12. Masking/Unmasking.
13. Báo cáo sản xuất.
14. Save Schedule và Bỏ điều độ.

Sau đó kiểm tra Aiven metrics: connections, CPU, disk.

### Aiven Free connection limit

Bắt đầu `DB_POOL_MAX=1`.

Nếu trang DB bị queue/chậm nhưng Aiven `Connections` luôn thấp, có thể thử `DB_POOL_MAX=2`. Không tăng cao ngay vì Aiven Free có tổng `max_connections=20` và Vercel có thể tạo nhiều runtime instance.

---

## 13. Supabase Storage sau cutover

V438 chỉ chuyển **database** sang Aiven. Import `.xlsx` vẫn dùng Supabase Storage tạm thời.

Nếu project Supabase OLD vẫn đang bị restriction do Database Size >500 MB, phần upload/import qua Storage có thể vẫn bị ảnh hưởng. Sau khi Aiven đã verify và app DB chạy ổn, ta sẽ làm một bước riêng:

- giữ OLD làm backup ngắn hạn;
- giảm/xóa dữ liệu PostgreSQL ở Supabase OLD hoặc chuyển Storage sang provider khác;
- không trộn việc này vào migration database lần đầu.

Không được xóa OLD trước khi Aiven smoke test hoàn tất.

---

## 14. Rollback

Nếu V438 + Aiven có lỗi nghiệp vụ:

1. Không xóa Aiven.
2. Vercel → `DATABASE_URL` đổi tạm về PostgreSQL URI của Supabase OLD.
3. Redeploy.

V438 là provider-neutral nên `DATABASE_URL` có thể trỏ lại PostgreSQL OLD để rollback.

---

## 15. Phase 2 sau khi Aiven chạy ổn

Sau khi bạn xác nhận vận hành ổn, mới giảm DB Aiven:

- audit `md_routing_detailed` inactive;
- audit 202 MB Routing indexes và index overlap;
- dọn `open_job_history`;
- dọn inactive/stale planning rows nếu an toàn;
- giữ đúng index runtime V437/V438;
- VACUUM/REINDEX khi cần.

Mục tiêu Phase 2: giảm ~600 MB xuống vùng an toàn hơn mà **không làm migration và cleanup cùng lúc**.


## V462 — Batch Size theo Recipe
- Batch Prefix / Sequence Start / Padding vẫn cấu hình theo Main Operation.
- Common Batch Size để trống được phép.
- Có thể thêm nhiều dòng Recipe + Batch Size cho cùng Main Operation.
- Ưu tiên: Recipe Batch Size → Common Batch Size → không split nếu cả hai trống.
- Auto Split OFF: luôn tạo một batch cho phần Qty được chọn, bất kể Batch Size.
- Planning Board vẫn gộp nhiều Batch No trong cùng ô bằng dấu `&`; Scheduling/Preparation/Production vẫn tách từng Batch.


## V464 — Daily Production Adjustment + Universal Add Job
- Thêm tab **Điều chỉnh đầu ngày** trong nhóm Vận hành.
- Production day giữ chuẩn 06:00 → 05:59 hôm sau. Production Report không tự sửa Planning/Schedule.
- Quét báo cáo để tạo đề xuất: **CARRY_OVER**, **REMOVE_JOB**, **ADD_JOB**.
- Carry Over mặc định sang đầu ngày kế tiếp và bắt buộc Preview trước khi duyệt.
- Preview chạy hai chiều ảnh hưởng cần thiết: **Cross-Main Dependency** (kể cả planner khác) + **Resource Cascade**.
- Chỉ khi planner bấm Duyệt mới commit; schedule cũ được giữ dạng CANCELLED để audit và tạo schedule active mới.
- Production Execution có ô **Extra Job** ngay trên từng Batch để báo Job hoàn thành ngoài lô; hệ thống tạo đề xuất Add Job, không thêm thẳng.
- Batch Detail có **Add Job nhanh** dùng chung tất cả khu vực: chỉ nhập Job Number, tự lookup Part/Rev/Qty/Surface/Main/Operation/Recipe/Status và validate.
- ADD_JOB từ thực tế sản xuất hỗ trợ **Duyệt ngoại lệ** khi có mismatch cần audit; thao tác Add Job thông thường vẫn giữ validation chặt hiện tại.
- Migration mới: `078_daily_production_adjustment.sql`, tối đa 4 SQL statements theo giới hạn executor.
