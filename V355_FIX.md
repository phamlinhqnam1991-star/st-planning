# v355 - Manual Process Recipe Entry

## Mục tiêu
Cho phép khai báo Process Recipe bằng tay ngoài cách chọn từ All Open Job Column Values.

## Thay đổi
- Recipe Group: Chọn từ Open Job / Nhập tay.
- Recipe No: Chọn từ Open Job / Nhập tay.
- Recipe Name: Chọn từ Open Job / Nhập tay.
- Có thể trộn hai cách, ví dụ Recipe No nhập tay nhưng Recipe Name chọn từ một cột Open Job.
- Field nhập tay lưu `*_source_column = NULL`.
- Field chọn từ Open Job vẫn validate source column/value như trước.
- Recipe No nhập tay dạng số vẫn chuẩn hóa padding 3 số (`5` -> `005`).
- Sửa kiểm tra identity để Recipe Name rỗng không vô tình match/ghi đè một Recipe cùng No nhưng có tên khác.
- Không cần migration SQL mới.
