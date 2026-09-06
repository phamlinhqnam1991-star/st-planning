# V523 · Hotfix ST Output server error

- Sửa parser `AllOperation` của ST Output về đúng chuẩn hiện hữu trong app: bỏ ngoặc `[]` và tách bằng dấu `|`.
- Khi lọc `Output Source`, query chỉ dựng nhánh nguồn được chọn để giảm tải DB.
- Trang `/st-output` có lỗi query sẽ hiển thị panel lỗi mềm thay vì làm sập Server Component.
- Giữ nguyên logic output đã chốt ở V521/V522.
