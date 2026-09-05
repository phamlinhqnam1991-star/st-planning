# V477 — Login + RBAC + Permission + Scope + Users & Permissions

## Mục tiêu
V477 đưa ST Planning từ public/no-login sang mô hình phân quyền thật: đăng nhập trước khi vào app, mỗi account chỉ thấy các tab được cấp quyền và API vẫn chặn 401/403 nếu gọi trực tiếp ngoài quyền.

Nguyên tắc chuẩn:

**Role = được làm gì. Scope = được làm ở đâu.**

## Role mặc định
- `ADMIN`: toàn quyền, quản lý Users & Permissions.
- `PLANNER`: Planning Board + Board Điều Độ theo phạm vi được giao; xem Production/Adjustment/Alerts/Tracker để theo dõi flow.
- `PRODUCTION_OPERATOR`: báo cáo sản xuất trong Production Area được giao; không được thêm Job ngoài lô.
- `SHIFT_SUPERVISOR`: có toàn bộ quyền báo cáo của Operator và thêm Job ngoài lô / nhận Next Main Attention trong Production Area được giao.

Role chỉ là preset. Admin có thể bật/tắt từng Permission cho từng account.

## Scope
- `PLANNING_MAIN`: Main Operation mà user được thao tác trên Planning Board.
- `SCHEDULE_AREA`: Schedule Area mà user được thao tác trên Board Điều Độ.
- `PRODUCTION_AREA`: Area mà user được thao tác Production Execution.

Không chọn scope = toàn bộ phạm vi của permission đó. Có chọn scope = chỉ những mục được chọn.

## Users & Permissions
Trang `Quản trị → Users & Permissions` chỉ dành cho `security.manage`.
Admin có thể:
- tạo account Supabase Auth bất kỳ bằng email + mật khẩu tạm;
- bật/tắt Active;
- gán nhiều Role;
- bật/tắt từng Permission;
- gán Planning Main / Schedule Area / Production Area Scope;
- đổi mật khẩu;
- xóa account.

Admin không được tự khóa, tự xóa hoặc tự gỡ `security.manage` của account đang đăng nhập.

## Bảo vệ 2 lớp
1. Frontend/navigation: chỉ hiện module/tab được phép xem; action Production Add Job chỉ hiện cho `production.add_job`.
2. Server/API: mọi route API có permission guard; các thao tác Planning/Schedule/Production cốt lõi còn kiểm tra Scope. Gọi API thủ công ngoài quyền vẫn trả `401/403`.

## Production tách 2 quyền
- `production.report`: WAITING / ON-GOING / DONE, Actual time, Qty, Note.
- `production.add_job`: thêm Job ngoài lô và Accept Next Main Attention. Mặc định chỉ Admin + Shift Supervisor có quyền này.

## Bootstrap Admin
`ADMIN_EMAILS` chỉ dùng để bootstrap/emergency Admin. Email nằm trong biến này có toàn quyền ngay khi đăng nhập Supabase, kể cả trước khi có profile RBAC trong Aiven.

Sau khi deploy:
1. Chạy migration `079 → 080 → 081 → 082` trên Aiven.
2. Đảm bảo `.env` có `ADMIN_EMAILS` chứa email Admin đầu tiên và có `SUPABASE_SECRET_KEY`.
3. Deploy app.
4. Đăng nhập bằng bootstrap Admin.
5. Vào `Users & Permissions` để tạo các account ADMIN/PLANNER/OPERATOR/SHIFT SUPERVISOR và gán Scope.

## Database migrations
Mỗi file migration V477 có tối đa 4 câu SQL:
- `079_rbac_core.sql`
- `080_rbac_permissions_scope.sql`
- `081_rbac_seed_roles_permissions.sql`
- `082_rbac_indexes.sql`

## Không thay đổi business logic
V477 không thay đổi logic READY/WAIT, Batch, Recipe, Batch Size, Process Time, Scheduling dependency, Production Add Job propagation, Carry Over hay Daily Adjustment. V477 chỉ thêm Authentication + Authorization + Audit quanh các flow hiện có.

Logic & Hướng dẫn và Training người mới đã được cập nhật song song cho V477.
