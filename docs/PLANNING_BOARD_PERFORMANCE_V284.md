# Planning Board Performance v284

Phạm vi: chỉ tối ưu hiệu năng Planning Board. Không thay đổi business rules của Candidate / READY / WAITING / Batch / Schedule / Recipe.

## Luồng tải mới

1. `/planning` SSR chỉ dựng shell, Default View, Recent Batches và static master data.
2. Candidate metadata được gọi qua `/api/planning/candidates` sau khi client mount hoặc khi đổi Area / Operation / Recipe / Previous Batch / page.
3. Candidate SQL không còn chạy `route_status` LATERAL nặng cho từng Job.
4. Route Matrix được gọi riêng qua `POST /api/planning/route-status` theo nhóm tối đa 40 Candidate mỗi request.
5. v284 chỉ yêu cầu Route Matrix cho các Candidate đang được render/đang xem. Khi cuộn xuống, nhóm tiếp theo mới được gọi.
6. Route Matrix đã tải được giữ trong cache của Planning shell trong phiên hiện tại để quay lại page/filter không phải query lại cùng Candidate.

## DOM / Client render

- Candidate table render ban đầu 50 dòng.
- Khi người dùng cuộn gần cuối vùng đã render, tăng thêm 50 dòng.
- `selectableTargetFor()` được pre-compute một lần theo revision Candidate thay vì sort/scan route lặp lại ở checkbox, row, drag và Batch Builder.
- Danh sách All Open Job source columns lấy từ catalog `md_open_job_column_value` đã cache, không quét `source_data` của toàn bộ Candidate ở mỗi render.

## Filter / View

- Area / Standard Operation / Recipe / Previous Batch / paging dùng Candidate API; không dùng form GET full-page reload.
- `VIEW CÔNG ĐOẠN ST -> Áp dụng & nạp Candidate` lưu view rồi gọi Candidate API; không reload toàn trang.
- `planning_board_view` đã được SSR/API truyền vào client, không fetch `/api/planning/board-view` lần thứ hai khi mount.

## Cache

- Static Planning data: 300 giây, tag `planning-static`.
- Các API thay đổi Area / ST Group / Operation Mapping / Operation Flow / Operation Order / Open Job Column Values / Open Job Import gọi revalidate tag ngay sau write.
- Candidate count giữ nguyên SQL cũ, có cache ngắn 30 giây. Khi chuyển page, client gửi `knownTotal` nên không chạy lại count query.
- Live Recipe Context / Recipe metadata tiếp tục cache ngắn 60 giây để không thay đổi freshness hiện tại.

## Database indexes

Migration cần chạy sau v282:

- `044_planning_candidate_performance_indexes.sql`
- `046_planning_route_status_lazy_indexes.sql`

`046` bổ sung index cho Routing Detail, Part Routing và các lookup lịch sử được dùng bởi Route Matrix SQL đã có.

## Không thay đổi

- Không thay logic xác định Candidate.
- Không thay logic `route_status`, `ready_position`, `next_op_position`.
- Không thay READY / WAITING / DONE / PLANNED-UNSCHEDULED / SCHEDULED.
- Không thay Batch Key / Recipe matching / Batch / Schedule data model.
- Không chuyển Rebuild Chain sang background job ở revision này vì đó là thay đổi kiến trúc riêng, mức rủi ro cao hơn và không nằm trên critical path của filter Planning Board nữa.
