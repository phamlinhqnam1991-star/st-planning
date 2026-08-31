# v292 — Nhóm cột All Open Job

Mục tiêu: không bắt Planner tick/sắp xếp hàng trăm cột All Open Job từng dòng trong `Columns`.

## Logic

- `columns`: vẫn là danh sách cột thực sự được hiển thị (giữ tương thích view cũ).
- `columnLayout`: lớp bố cục mới, có virtual item `group:allopen`.
- Các `source:*` đang visible nhưng không nằm riêng trong `columnLayout` được xem là thành viên của `group:allopen`.
- Cột source được Planner đưa ra khỏi nhóm sẽ xuất hiện riêng trước/sau `group:allopen`.
- Main Operation / Route columns vẫn tự động, không lưu trong `columns` hay `columnLayout`.

## UI

- Mặc định picker chỉ hiển thị thứ tự bố cục + `📦 Nhóm cột All Open Job`.
- Gõ tên cột để tìm.
- Với cột All Open Job có 3 thao tác nhanh: `Trước nhóm`, `Trong nhóm`, `Sau nhóm`.
- Cả nhóm có thể kéo/di chuyển lên xuống/đầu/cuối như một layout item.
- `Gom All Open Job` đưa toàn bộ source columns đã tách trở lại nhóm nhưng không đổi visibility.

## Tương thích

View cũ không có `columnLayout` được tự động chuyển sang layout có một `group:allopen` tại vị trí source column đầu tiên. Không cần migration database.
