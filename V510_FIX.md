# V510 · Internal Chat stable realtime + unread + direct user chat

## Sửa lỗi trang Internal Chat
- Bỏ lần đọc `getAccessContext()` thứ hai ở page-level; `AppTabs` vẫn là lớp access gate chuẩn.
- `canSend/currentUser` lấy qua `/api/internal-chat`, nên lỗi Chat schema/API hiển thị trong panel Chat thay vì làm sập toàn page.
- API Chat bắt lỗi DB/schema và trả JSON fail-safe.

## Thông báo tự động ngay sau thay đổi
- Planning Batch create/delete, Batch Job add/remove, Scheduling add/move/unschedule/order/manual-grid, Production và Daily Adjustment tiếp tục ghi SYSTEM message sau commit.
- Mỗi SYSTEM/user Chat insert phát thêm domain `CHAT` vào `system_change_event` PostgreSQL.
- SYSTEM notification tái sử dụng DB client của request sau `COMMIT`; không mở connection thứ hai khi `DB_POOL_MAX=1`, tránh deadlock/pool starvation.
- Planning/Schedule/Production mutations cùng browser cũng mang domain `CHAT` để cập nhật local ngay; máy khác nhận qua V509 leader feed.
- Lỗi Chat/realtime không rollback nghiệp vụ đã commit.

## Unread
- Badge tổng tin chưa đọc hiển thị ngay tại tab Internal Chat.
- Group và từng Direct Chat có unread độc lập.
- `PATCH` read receipt vẫn phát domain CHAT để đồng bộ unread giữa các tab/máy; Chat client chỉ reload unread đối với PATCH, không reload message nên không tạo vòng lặp.

## Direct Chat
- ST Planning Group vẫn giữ nguyên cho team/system messages.
- Danh sách active users cho phép chọn người để chat trực tiếp.
- Direct messages chỉ hiện cho sender/recipient tương ứng.

## Migration
Chạy sau migration 086:

`087_internal_chat_direct_realtime.sql`

Không đổi READY/WAIT, Planning Chain, Recipe, Batch, Schedule, Production hoặc Audit.
