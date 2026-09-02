# Hướng dẫn triển khai ST Planning

## 1. Chuẩn bị biến môi trường

Tạo `.env.local` từ `.env.example` và điền Supabase URL/key/database URL. Nếu cần ép đúng một PostgreSQL URL và bỏ qua cơ chế dò host/DNS tự động, dùng `DB_CONNECTION_STRING`.

Không đưa `.env.local` vào ZIP/repository.

## 2. Database

Chạy migration theo đúng thứ tự số hiện có, đến:

`066_drop_unused_planning_snapshot_cache.sql`

Migration 066 chỉ dọn kiến trúc snapshot Candidate cũ; không thay READY, Batch, Schedule hay Auto Planning. Không xóa migration 058/059 khỏi lịch sử.

## 3. Kiểm tra source trước deploy

```bash
npm ci
npm run typecheck
npm run lint
npm run build
```

Nếu dùng local development:

```bash
npm run dev
```

## 4. Deploy Vercel

- Project root là thư mục chứa `package.json`.
- Node.js >= 22.
- Khai báo các biến môi trường giống `.env.local` trên Vercel.
- Deploy sau khi migration database hoàn tất.

## 5. Smoke test sau deploy

Kiểm tra lần lượt:

1. Login / Logout.
2. Master Data và Import Master.
3. All Open Jobs và Import All Open Jobs.
4. ST Operation Flow / Mapping / Main Operation.
5. Công thức & Rule và Process Time.
6. Planning Board tải Candidate theo progressive paging.
7. Sort NextOperation theo Main Planning Order; Operation Code Order chỉ tie-break trong cùng Main.
8. Tạo Batch, thêm Job vào Batch, mở Batch Detail.
9. Board Điều Độ tạo/sửa Schedule; Chemical Line auto-adjust trả thông báo khi bị đẩy giờ.
10. Job Tracker / Part Tracker.

Không cần Rebuild Chain chỉ vì đổi Operation Code Order. Rebuild chỉ dùng sau thay đổi cấu trúc Scope/Mapping/Bridge/Planning Chain hoặc khi cần tái tạo dữ liệu chain cũ.
