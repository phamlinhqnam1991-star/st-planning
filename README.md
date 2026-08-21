# ST Planning — Master Data

Baseline đầu tiên cho ST Planning theo **Next.js + Supabase PostgreSQL + Vercel**. Project này chỉ triển khai **Master Data + Import Master Excel**, chưa triển khai Planning/Waiting/Eligible/Capacity.

## File nguồn được hỗ trợ

`Partinfo_Used for Surface Treatment - *.xlsx`, sheet `Part_Masterlist`, với cấu trúc 108 cột đã xác nhận:
- Part: `Program`, `PartCluster`, `PartDescription`, `PartNum`, `RevisionNum`, `Surface (dm2)`
- Routing: `OpCode_OP10` ... `OpCode_OP500`
- Finish: `PRIMER1..ANTIABRATION`, tên Primer/Topcoat/AntiAbrasion/Varnish, Alloy/Temper/TSA/Chemicalconv Airbus
- 38 Process Requirement columns

Mỗi lần import là **full snapshot sync**: dữ liệu có trong file được thêm/cập nhật và active; dữ liệu cũ không còn trong file chuyển `is_active=false`, không xóa lịch sử.

## Master Data được cập nhật

- `md_part`
- `md_part_revision`
- `md_operation`
- `md_routing_detailed`
- `md_material_finish`
- `md_process_requirement`
- `md_st_operation_scope`
- `md_st_routing_summary`
- `md_st_routing`
- `md_part_routing`
- `master_import_batch`

ST Routing giữ logic baseline: chỉ lấy operation thuộc scope 125 mã đã chốt; giữ thứ tự nguồn; operation lặp dùng `*_BEFORE_*`; `UNMSKG` luôn dùng `*_BEFORE_*`; trường hợp cùng detail lặp lại dùng `_01`, `_02`; không tự chọn revision mới nhất và không tự loại BOM. 1,060 routing signature cũ được seed để cố gắng giữ nguyên `RT_ST_0001...RT_ST_1060`; signature mới được cấp mã tiếp theo.

# Cài từ tài khoản mới hoàn toàn

## 1. Supabase
1. Tạo project mới trong Supabase.
2. Vào **SQL Editor** → chạy lần lượt:
   - `supabase/migrations/001_schema.sql`
   - `supabase/migrations/002_rebuild_st_routing.sql`
3. Vào **Authentication → Users** → tạo user đầu tiên bằng email/password.
4. Vào **Project → Connect** lấy:
   - Project URL
   - Publishable key
   - Database connection string. Với Vercel nên dùng pooler URL trong Connect panel.
5. Vào API keys lấy **secret key**. Key này chỉ đặt ở Vercel/server, tuyệt đối không đưa vào biến `NEXT_PUBLIC_*`.

## 2. GitHub
1. Tạo repository mới, ví dụ `st-planning`.
2. Khi tạo repo để trống README/.gitignore nếu bạn sẽ push nguyên project này.
3. Giải nén ZIP, mở Terminal tại thư mục project:

```bash
git init
git add .
git commit -m "Initial ST Planning master data"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/st-planning.git
git push -u origin main
```

## 3. Vercel
1. Login Vercel bằng GitHub.
2. **Add New → Project** → Import repo `st-planning`.
3. Framework tự nhận **Next.js 16** (project dùng `src/proxy.ts`, không dùng convention middleware cũ).
4. Thêm Environment Variables từ `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `SUPABASE_DB_URL`
   - `ADMIN_EMAILS` = email được phép import, có thể nhiều email ngăn cách bằng dấu phẩy.
5. Deploy.

## 4. Chạy local

```bash
cp .env.example .env.local
npm install
npm run dev
```

Mở `http://localhost:3000`.

## 5. Import
1. Login.
2. Chọn file `.xlsx` master.
3. File được upload **trực tiếp từ browser → Supabase Storage**. Không upload file 13 MB qua Vercel Function.
4. API chỉ nhận `storagePath`, tải file server-side và stream Excel vào PostgreSQL.
5. Sau khi base master cập nhật xong, PostgreSQL rebuild ST Routing và Part → Routing.
6. Các ô thống kê trên Dashboard có thể bấm vào để duyệt/tìm kiếm từng Master Data (50 dòng/trang).

## Lưu ý Vercel
File master hiện tại khoảng 13 MB, lớn hơn giới hạn request body 4.5 MB của Vercel Functions. Vì vậy project cố ý dùng direct upload vào Supabase Storage. Route import dùng Node runtime và `maxDuration=300` giây. Nếu dữ liệu sau này tăng quá nhiều và import vượt thời gian này, kiến trúc tiếp theo nên tách worker/import service; chưa cần đổi ở baseline hiện tại.

## Bảo mật
- RLS bật cho toàn bộ bảng master; user authenticated chỉ có quyền đọc.
- Ghi master chỉ qua server bằng secret-key/Postgres connection.
- Storage bucket private, chỉ authenticated user được upload/read.
- `ADMIN_EMAILS` chặn user không được phép chạy import.
- Không commit `.env.local` lên GitHub.
