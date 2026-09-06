# V504 · Cross Check / Audit Missing multi-select filters

## Phạm vi sửa
Chỉ thay đổi bộ lọc của `All Open Jobs -> Cross Check / Audit Missing`.

## Logic mới
- Planning Board, Job, Part, Revision, Program, Next Operation, Last Operation, Current Main, Board Status, Chain, Import và Reason dùng multi-select theo danh sách unique của toàn bộ `open_job_current.is_open=true` audit population.
- Có ô tìm trong từng danh sách và có thể chọn nhiều giá trị.
- Nhiều giá trị trong cùng một cột = OR.
- Nhiều cột khác nhau = AND.
- Giá trị trống được hiển thị `(Trống)`.
- WIP Qty và Surface dm² cũng dùng multi-select theo danh sách giá trị exact.

## Không thay đổi
Planning Board YES/NO, audit reason engine, Planning Chain, READY/WAIT, Recipe, Batch, Schedule và Auto Planning không đổi.
