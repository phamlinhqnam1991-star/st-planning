# V461 — Planning Board gộp Batch No trong cùng ô Main Operation

- Nếu một Job/Main Operation được auto-split thành nhiều Batch, Planning Board không nhân đôi Job chỉ để hiển thị Batch No.
- Cột Main Operation gộp toàn bộ Batch No active của đúng route occurrence bằng dấu ` & `.
- Ví dụ A-SHPN: `ASP_0001 & ASP_0002`.
- Dữ liệu batch/allocation vẫn tách riêng; Scheduling, Execution, Qty allocation và trạng thái không bị gộp.
- Route loader bổ sung `batch_nos` để UI nhận đủ nhiều Batch thay vì chỉ Batch mới nhất.
