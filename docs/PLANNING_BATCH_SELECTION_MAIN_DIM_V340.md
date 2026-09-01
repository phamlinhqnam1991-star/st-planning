# Planning Board - Batch Selection Main Dim (v340)

Khi planner chọn READY đầu tiên (hoặc chọn Target Batch hiện có), Board đi vào Batch Selection Mode:

- Main Operation đang build Batch giữ nguyên độ sáng.
- Tất cả cột Main Planning khác được làm mờ và tạm khóa tương tác.
- Trong Main đang active, Batch Compatibility vẫn chỉ mở Job cùng Recipe + các Open Job condition của Recipe.
- Các cột thông tin Job / All Open Job không bị làm mờ.
- Clear Selection / bỏ hết Job sẽ thoát Batch Selection Mode và trả Board về bình thường.
- Không thay đổi database và không cần migration mới.
