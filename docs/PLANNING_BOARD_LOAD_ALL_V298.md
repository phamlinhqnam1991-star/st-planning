# Planning Board Load-All Performance v298

Phạm vi: chỉ tối ưu hiệu năng tải Planning Board và BỎ PHÂN TRANG.
Không thay đổi business rules của Candidate / READY / WAITING / Batch / Schedule / Recipe.

## Vấn đề của luồng cũ (v283–v297)

1. Mỗi lần Load Candidates chạy **2 query nặng gần như giống hệt nhau**:
   - Query `count(distinct job_num)` với toàn bộ lateral-join machinery (nextscope,
     nextbridge, representative chain `p`, candidate_area, prevhist) chỉ để lấy
     tổng số Job phục vụ phân trang.
   - Query dữ liệu trang hiện tại (LIMIT/OFFSET) với cùng bộ join đó.
   → SQL server làm việc gần gấp đôi cho một lần hiển thị.
2. Phân trang (100/200/500) bắt user bấm Trước/Sau để xem hết Job; mỗi lần đổi
   trang là một round-trip API mới (kèm `knownTotal` để né count query).
3. Route Matrix lazy-load theo chunk 40 Candidate/request nhưng các chunk được
   `await` **tuần tự** — N chunk mất N lần round-trip cộng dồn.

## Luồng tải mới (v298)

1. `/planning` SSR giữ nguyên: chỉ dựng shell + Default View + Recent Batches +
   static master data đã cache.
2. Client mount → `/api/planning/candidates?pageSize=all`:
   - **Bỏ hoàn toàn COUNT query.** Tổng số Candidate = số dòng query chính trả về.
   - Query chính chạy 1 lần, không LIMIT/OFFSET → trả về TOÀN BỘ Candidate của scope.
   - Giữ nguyên mọi điều kiện lọc / lateral joins / ORDER BY (business logic không đổi).
3. Client render progressive: 100 dòng đầu, mỗi lần cuộn gần cuối thêm 100 dòng
   (IntersectionObserver, rootMargin 600px). Bảng không bị đơ khi có hàng nghìn Job.
4. Route Matrix vẫn lazy theo dòng đang render, nhưng:
   - Chunk size tăng 40 → 60 (bằng đúng giới hạn server `MAX_IDS_PER_REQUEST`).
   - Tối đa **3 chunk request chạy song song** (worker pool) thay vì tuần tự.
5. Toolbar Candidate Jobs: bỏ control "Mỗi trang" + nút Trước/Sau; hiển thị
   `Tất cả N job (không phân trang)`.
6. URL sạch: không còn `page` / `pageSize` / `knownTotal` trong query string.

## Tương thích ngược

- API `/api/planning/candidates` vẫn chấp nhận `pageSize=100|200|500` + `page` +
  `knownTotal` (đường code cũ giữ nguyên, kể cả count cache 30s) phục vụ
  debug/so sánh. `pageSize=all` (mặc định mới) = chế độ load-all.
- Route `/api/planning/candidates` khai báo `maxDuration=60` để query load-all
  trên board lớn không bị cắt bởi timeout serverless mặc định (vẫn chịu giới hạn
  theo gói Vercel đang dùng).

## Sửa kèm

- `src/app/api/planning/route-status/route.ts`: thêm type annotation `number[]`
  cho `candidateIds` — lỗi type đã tồn tại từ v297 (không ảnh hưởng runtime),
  giờ `tsc --noEmit` sạch hoàn toàn.

## Không thay đổi

- Không đổi logic xác định Candidate (VIEW CÔNG ĐOẠN ST vẫn owns row membership).
- Không đổi `route_status`, `ready_position`, `next_op_position`.
- Không đổi READY / WAITING / DONE / PLANNED-UNSCHEDULED / SCHEDULED.
- Không đổi Batch Key / Recipe matching / Batch / Schedule data model.
- Không cần migration mới; các index của `044` / `046` vẫn áp dụng.

## Lưu ý vận hành

- Với số Job rất lớn (vài nghìn), lần Load đầu là MỘT query nặng — nhưng nhanh
  hơn tổng thời gian count + nhiều trang của bản cũ. Nếu sau này dữ liệu tăng
  tới mức query load-all vượt timeout, hướng đi tiếp theo là streaming/chunked
  load theo khoảng `planning_sort_order` (không phải phân trang UI).
- Route Matrix vẫn tải dần theo vùng đang xem nên kéo dài danh sách không làm
  server chạy thừa cho các dòng chưa nhìn tới.
