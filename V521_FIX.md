# V521 · ST Output dm²/ngày

- Thêm màn `Operations → ST Output`.
- Tính output theo kế hoạch với cửa sổ `00:00 D -> 03:00 D+1` dựa trên `Scheduled End`.
- `CHEMMILL` tính độc lập theo `Scheduled End <= cutoff`, không quan tâm công đoạn cuối.
- Công đoạn ST cuối ưu tiên Planning Chain, fallback AllOperation.
- Nhóm final out-of-ST gồm `FINSST` và `CFINM-VN` từ All Open Job import được chọn.
- `INTERMEDIATE_NO_CHAIN` dùng tinh thần audit hiện tại: Intermediate/Bridge thuộc ST chưa resolve Planning Chain, bổ sung điều kiện `NextOperation` thuộc ST Scope.
- Chống trùng theo ưu tiên: Final ST Operation Batch > FINSST/CFINM-VN > INTERMEDIATE_NO_CHAIN. CHEMMILL không bị loại bởi rule này.
- Hiển thị tổng theo nguồn và bảng drill-down Job đầy đủ để kiểm tra từng dòng.
- Cập nhật `Logic & Hướng dẫn` và `New User Training` để người mới biết cách đọc Output ST theo ngày/import/cutoff và kiểm từng Job.
