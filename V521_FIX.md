# V521 · ST Output dm²/ngày

- Thêm màn `Operations → ST Output`.
- Tính output theo kế hoạch với cutoff `03:00` ngày hôm sau.
- `CHEMMILL` tính độc lập theo `Scheduled End <= cutoff`, không quan tâm công đoạn cuối.
- Công đoạn ST cuối ưu tiên Planning Chain, fallback AllOperation.
- Nhóm final out-of-ST gồm `FINSST` và `CFINM-VN` từ All Open Job import được chọn.
- `INTERMEDIATE_NO_CHAIN` dùng tinh thần audit hiện tại: Intermediate/Bridge thuộc ST chưa resolve Planning Chain, bổ sung điều kiện `NextOperation` thuộc ST.
- Chống trùng theo ưu tiên: Final ST Operation Batch > FINSST/CFINM-VN > INTERMEDIATE_NO_CHAIN. CHEMMILL không bị loại bởi rule này.
- Hiển thị tổng theo nguồn và bảng drill-down Job đầy đủ để kiểm tra từng dòng.
