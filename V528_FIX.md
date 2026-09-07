# V528 — ST Output ERP Deep Style

## Phạm vi
- Chỉ thay đổi presentation/UI của tab `ST Output`.
- Không thay đổi query, công thức, priority, dedup, ST Final Steps, CHEMMILL, Final ST, FINSST/CFINM-VN hoặc dữ liệu report.

## UI đã cập nhật
- Chuyển filter sang ERP form panel đồng nhất với ERP Kit hiện hành.
- Thêm context strip: Report Date, Output Window, Snapshot, Dedup Priority.
- KPI card chuẩn ERP cho Total Output, Job counted, Qty counted và Output Window.
- Summary theo nguồn dùng ERP grid, status badge và tỷ trọng dm² counted.
- Job detail chuyển sang ERP compact grid, sticky header và freeze 3 cột Count / Source / Job.
- Operation Code dùng mono badge; Job/Batch dùng ERP link; dòng bị loại/trùng được làm dịu để phân biệt với dòng được tính.
- Pager, empty state và error state đồng bộ ERP style.
- Responsive desktop/tablet/mobile được bổ sung.

## Logic
Không thay đổi logic V527.
