# V522 · Cập nhật hướng dẫn ST Output

- Cập nhật `Logic & Hướng dẫn` lên V521/V522 context, thêm mục `ST Output`.
- Cập nhật `New User Training` để trainer dạy workflow Output ST dm²/ngày bằng dữ liệu thật.
- Thêm giải thích chọn ngày báo cáo, chọn All Open Job Import History, đọc các nguồn CHEMMILL / Final ST Operation / FINSST-CFINM-VN / Intermediate No Chain.
- Thêm checklist chống trùng và drill-down Job: Output Source, Count YES/NO, Qty, Surface, Batch, Scheduled End, Import và Audit Reason.
- Bổ sung cửa sổ Scheduled End cho báo cáo ngày: `00:00 D -> 03:00 D+1`, tránh cộng lũy kế batch cũ.
- Hotfix parser `AllOperation` của ST Output dùng lại chuẩn hiện hữu `[...]` + dấu `|`, tránh regex lạ gây lỗi server.
- ST Output có lỗi query sẽ hiển thị thông báo mềm trên trang thay vì làm sập Server Component.
- Khi lọc một Output Source cụ thể, report chỉ dựng đúng nhánh nguồn đó để giảm tải DB và tránh timeout.
