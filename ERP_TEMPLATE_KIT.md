# ST Planning — ERP Template Kit

## Phạm vi bản này

Bản này chỉ thêm lớp giao diện dùng chung và trang showcase `/erp-kit`. Không thay đổi logic nghiệp vụ, API, database, Candidate, Batch hay Scheduling.

## Component chuẩn

- `ErpAppShell`: header + module navigation + sidebar + workspace.
- `ErpPageHeader`: tiêu đề, mô tả, status và action.
- `ErpToolbar`: search, filter, bulk selection và action.
- `ErpDataGrid`: data table compact/comfortable, sticky header, selected row, empty/footer.
- `ErpFormGrid` + `ErpField`: form layout/validation/hint chuẩn.
- `ErpStatus`: status badge từ một status config dùng chung.
- `ErpKpiCard`: KPI summary.
- `ErpSection`: panel/section dùng chung.
- `ErpTabs`: page-level tabs.
- `ErpEmptyState`: trạng thái không có dữ liệu.

## Nguyên tắc migrate sau khi duyệt

1. Không rewrite logic trong lúc migrate UI.
2. Migrate từng page một, ưu tiên `Master Data` / `Tracker` trước rồi mới tới `Planning Board` và `Board Điều Độ`.
3. Dùng component + token chung; không tạo CSS riêng cho cùng một pattern nếu kit đã có.
4. Sau mỗi page phải chạy build và so sánh hành vi trước/sau.

## All Tabs Demo

Mở `/erp-kit` để duyệt giao diện ERP cho toàn bộ 10 tab chính trước khi migrate production:

1. Master Data — có demo 9 sub-tab Master.
2. Cấu hình — có demo toàn bộ luồng 01–12.
3. Part Tracker.
4. Job Tracker.
5. All Open Jobs — Current Jobs / Change History.
6. Planning Board — Matrix / Candidate Jobs / Recent Planning Batches. Matrix là view mặc định; cột sinh theo Main Planning Order.
7. Masking / Unmasking — Masking Queue / Unmasking Queue.
8. Board Điều Độ — timeline resource + Unscheduled Batch.
9. Import Master — upload + import history.
10. Logic & Hướng dẫn — các nhóm flow chính.

Trang demo chỉ dùng mock data, không đọc/ghi database và không thay đổi logic production.
