# Planning Board Performance v283

## Phạm vi

Bản v283 tiếp tục tối ưu hiệu năng Planning Board trên nền v282. Không thay đổi logic nghiệp vụ Candidate, READY / WAITING, Batch, Schedule, Recipe, Main Operation, ST routing hoặc logic Route Matrix. SQL dựng `route_status` được giữ nguyên và chỉ chuyển khỏi Candidate query sang API lazy-load riêng.

## 1. Candidate metadata tách khỏi Route Matrix

Trước v283, Candidate query tính `route_status` bằng LATERAL subquery cho từng Candidate trước khi trả bảng.

v283:

1. `/api/planning/candidates` chỉ trả Candidate metadata và `route_status_loaded=false`.
2. Client hiển thị bảng Candidate ngay khi metadata về.
3. `/api/planning/route-status` nhận danh sách `candidateIds` và tải Route Matrix theo chunk 40 Job.
4. Route cells hiển thị `…` trong lúc chờ và được điền dần theo từng chunk.

Khối SQL Route Matrix cũ được chuyển nguyên sang `src/lib/planning/route-status-data.ts`; không đổi điều kiện READY / WAITING / Batch / Schedule trong khối này.

## 2. Planning page SSR chỉ dựng shell

`/planning` không còn chạy Candidate SQL trong Server Component. SSR chỉ tải:

- Planning view cần thiết.
- Recent Planning Batches.
- Planning static data đã cache.

Candidate metadata được fetch ngay sau mount. Vì vậy first HTML không phải chờ Candidate/Route Matrix SQL.

## 3. Pagination không chạy lại count khi chỉ đổi trang

Count SQL hiện tại được giữ nguyên để tránh thay đổi semantics. Khi người dùng chỉ chuyển page/page-size trong cùng filter, client gửi `knownTotal`; API dùng lại tổng đã biết và bỏ count query cho request đó.

Khi Area / Operation / Recipe / Previous Batch thay đổi, count vẫn được tính lại theo SQL cũ.

## 4. Giảm DOM Candidate

Planning Board vẫn dùng table hiện tại để giữ Freeze Pane, sticky header, drag/drop và column view. Không thêm dependency virtualization mới.

- Render ban đầu tối đa 50 Candidate rows.
- IntersectionObserver tăng thêm 50 rows khi người dùng cuộn gần cuối bảng.
- Filter, sort, select-all và pagination vẫn làm việc trên toàn bộ Candidate dataset của page; chỉ DOM rendering được giới hạn.

## 5. Giảm re-render / tính toán lặp

- `selectableTargetFor()` được pre-compute theo Candidate dataset thay vì sort/scan Route Matrix nhiều lần trong cùng render.
- Danh sách source columns lấy từ `md_open_job_column_value` trong static cache, không quét `source_data` của toàn bộ Candidate mỗi render.
- Board-view đã có từ server/API được truyền thẳng vào `PlanningBoardClient`; không GET `/api/planning/board-view` lại khi mount.
- Pagination không remount toàn bộ PlanningBoardClient; selection được reset bằng effect khi page/pageSize đổi.

## 6. Static cache

Planning static cache tăng từ 120 giây lên 300 giây và dùng tag `planning-static`.

Các API thay đổi cấu hình liên quan Area / ST Operation / Mapping / Open Job Column Values / Operation order và import Open Jobs gọi invalidation sau write thành công, nên không phải chờ hết TTL mới thấy cấu hình mới.

Live Recipe Context và Recipe Metadata vẫn giữ TTL ngắn 60 giây nhưng khi cache miss sẽ tái sử dụng pg client của Candidate request, tránh lấy thêm pool connection không cần thiết.

## 7. Database indexes

Migration mới:

`supabase/migrations/046_planning_route_status_lazy_indexes.sql`

Bổ sung index cho các lookup chính trong Route Matrix lazy query:

- `md_routing_detailed(part_num, revision_num, source_seq, operation_code)` active rows.
- `md_part_routing(part_num, revision_num, routing_code)` active rows.
- `planning_job_operation` theo Job + source operation expression + main/status/sequence.
- `planning_batch_job` theo Job/Main/source sequence và Job/source operation.

Migration 044 của v281 vẫn giữ nguyên; 046 chỉ bổ sung index cho đường Route Matrix lazy-load.

## 8. Những phần cố ý chưa đổi

- Không materialize `route_status_snapshot`: cách này thay đổi write lifecycle và invalidation logic của Batch/Schedule.
- Không đổi Count SQL thành `count(*) over()`: giữ nguyên count semantics hiện tại; chỉ skip count an toàn khi paging trong cùng filter.
- Không chuyển Rebuild Chain sang background worker: đây là thay đổi kiến trúc deployment riêng, ngoài phạm vi Planning Board load path.
- Không thay đổi SQL business logic của Route Matrix/Candidate sorting/READY/Batch/Schedule.
