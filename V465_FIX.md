# V465 — Direct Production Add Job + Stable Extra Job Input

- Extra Job trong Production Report được thêm trực tiếp vào Batch sau validation, không tạo PENDING approval.
- production_adjustment_item vẫn lưu ADD_JOB ở trạng thái APPROVED để tab Điều chỉnh đầu ngày hiển thị thông báo/audit Batch + Job đã thêm.
- Production Report hiển thị Job thêm mới ngay dưới dòng Batch, áp dụng cả khu vực báo cáo theo Batch và theo Job.
- Sửa input Extra Job bị mất focus sau mỗi ký tự bằng cách không render nested WorkTable như component type thay đổi trên mỗi state update.
- Carry Over / Remove Job / Cross-Main Dependency / Resource Cascade giữ nguyên V464.
