# V478 — Aiven Authentication + RBAC Session

V478 sửa kiến trúc V477: ST Planning không dùng Supabase Auth cho đăng nhập/phân quyền.

## Kiến trúc chuẩn
`Vercel / Next.js → ST Planning Login → HttpOnly Session → Aiven PostgreSQL → Role / Permission / Scope / Audit`.

- `app_user_profile` lưu account + password hash scrypt, không lưu plain text.
- `app_session` lưu SHA-256 hash của session token; browser chỉ giữ token trong cookie `HttpOnly`, `SameSite=Lax`, `Secure` trên production.
- `ADMIN_EMAILS` + `BOOTSTRAP_ADMIN_PASSWORD` chỉ bootstrap Admin đầu tiên.
- Admin tạo/sửa/xóa/khóa bất kỳ account trong **Users & Permissions**, đặt mật khẩu tạm và gán Role/Permission/Scope.
- API tiếp tục kiểm tra Permission + Scope server-side.
- Production Operator chỉ `production.report`; Shift Supervisor có thêm `production.add_job`.

## SQL
Nếu chưa chạy V477: chạy 079 → 080 → 081 → 082 → 083 → 084 trên Aiven.
Nếu đã chạy 079–082: chỉ cần chạy 083 → 084.
Mỗi file mới có không quá 4 statement SQL.

## Vercel env
- `DATABASE_URL` = Aiven PostgreSQL URI
- `ADMIN_EMAILS` = email Admin bootstrap
- `BOOTSTRAP_ADMIN_PASSWORD` = mật khẩu bootstrap mạnh
- `SESSION_HOURS` = tùy chọn, mặc định 12 giờ

Không cần Supabase Auth / `SUPABASE_SECRET_KEY` cho Users & Permissions.

## Không đổi business logic
Không thay READY/WAIT, Batch, Recipe, Process Time, Scheduling, Production, Carry Over hoặc downstream Attention. Logic & Hướng dẫn + Training được cập nhật song song.
