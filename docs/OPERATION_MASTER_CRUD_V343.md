# Operation Master CRUD v343

## Mục tiêu
Bổ sung quản trị Main Operation trực tiếp tại Cấu hình → Công đoạn chính (Main Operation).

## Chức năng
- Thêm Main Operation mới.
- Chọn ST Group đang active.
- Bắt buộc Batch Prefix đúng 3 ký tự A-Z/0-9.
- Planning Order tùy chọn.
- Ngưng sử dụng: giữ lịch sử, tắt Planning Scope tương ứng.
- Kích hoạt lại: bật lại Operation Master và Planning Scope.
- Xóa vĩnh viễn: chỉ cho phép sau khi đã Ngưng và không còn dependency.
- Có nút Hiện/Ẩn công đoạn ngưng.

## Kiểm tra dependency trước khi xóa
Kiểm tra các nhóm dữ liệu như Source → Main Mapping, ST Routing, Recipe Mapping,
Part Process Recipe, Schedule Area, Auto Planning, Batch Key/Recipe Rule,
Planning Job, Planning Batch, Batch Job, Intermediate Bridge và Handover History.

## Rename fix
Rename Main Operation giữ nguyên Batch Prefix + Planning Order và cập nhật thêm
Schedule Area, Auto Planning Rule, Batch Key/Recipe Rule, Intermediate Bridge,
Handover History cùng các liên kết Planning/Recipe/Batch hiện có.

## Database
Không có migration mới.
