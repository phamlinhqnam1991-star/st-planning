# Planning Batch Compatibility — Main Operation Scope v339

## Mục tiêu

Batch Compatibility chỉ tác động lên đúng Main Operation đang được tạo/thêm Batch.
Không làm mờ hoặc khóa các Main Operation khác trên Route Matrix.

## Quy tắc

1. Click READY ở Main Operation X -> X trở thành Main Operation của selection.
2. Quét tất cả READY occurrence của X trên mọi Candidate row, không dùng READY đầu tiên của dòng.
3. Nếu X có Recipe:
   - chỉ Job cùng Recipe được phép chọn;
   - nếu Recipe có Process Time Open Job Conditions, Job phải match cùng condition group.
4. Nếu X không dùng Recipe:
   - cho phép mọi Job READY của X;
   - chỉ giới hạn cùng Main Operation.
5. Main Operation khác X vẫn hiển thị bình thường, không bị compatibility dim.
6. Không làm mờ toàn bộ row; chỉ cell READY của X không tương thích mới bị dim/locked.
7. API compatibility cũng scope candidates theo X để số Compatible/Locked chỉ phản ánh Main Operation đang batch.
8. Server-side Create/Add Batch guard vẫn giữ nguyên để chặn Recipe/condition không hợp lệ.

## Không cần migration SQL
