# Planning Board performance v315

Phạm vi: chỉ cải thiện tốc độ mở/tải tab Planning Board trên nền v314. Không đổi Candidate membership, Current/Next Main, NO_CHAIN_ALL_MAIN, READY/PLANNED/SCHEDULED, Batch Key, Recipe hoặc Scheduling.

## 1. SSR của /planning nhẹ hơn

Trước v315, Server Component `/planning` chờ đồng thời:

- Planning View từ DB,
- Recent Planning Batches,
- Planning static data.

Trong khi Planning View lại được `/api/planning/candidates` đọc lần nữa sau khi client mount.

v315:

- SSR chỉ chờ `getPlanningStaticData()` đã cache.
- `initialView/serverViews` lấy duy nhất từ Candidate API.
- Recent Batches và thống kê NextOperation không còn nằm trên critical path SSR.
- Thêm `src/app/planning/loading.tsx` để khi chuyển tab có shell/loading ngay.

## 2. Tách bundle Planning Board nặng

`planning-board-client.tsx` hơn 3.400 dòng được chuyển sang `next/dynamic` (`ssr:false`).

Kết quả:

- PlanningCandidateShell tải trước.
- Candidate API có thể bắt đầu ngay mà không cần chờ parse/evaluate toàn bộ Board client.
- Board bundle tải song song và remount một lần khi Candidate + saved Planning View đã sẵn sàng.

## 3. Dữ liệu phụ tải sau Candidate

Thêm API:

`GET /api/planning/deferred-data`

API này trả:

- Recent active Planning Batches,
- count Job theo RAW NextOperation.

Luồng mới:

1. Candidate metadata tải trước.
2. Candidate hiển thị được.
3. Sau đó mới gọi deferred-data, không await.
4. Khi Batch/Candidate reload, dữ liệu phụ được refresh lại.

Như vậy query thống kê `open_job_current group by next_operation` và query Recent Batch không tranh critical path của lần tải Candidate đầu.

## 4. Candidate SQL giảm lookup lặp theo từng Job

Các lookup tĩnh trước đây dùng LATERAL cho từng Candidate được gom thành map/normal join một lần mỗi query:

- NextOperation type: `ST_SCOPE_ONLY / PLANNING_OPERATION / INTERMEDIATE`.
- NextOperation planning sort order.
- ST Group → Area deterministic winner.
- Material Finish dùng direct join theo primary key Part/Revision.
- Recipe No/Name SQL per-row bị bỏ vì kết quả cuối vốn đã overwrite từ cached Recipe Metadata trong server mapping.

Các lookup nghiệp vụ theo từng Job vẫn giữ nguyên:

- Current live Planning occurrence.
- Current Batch.
- Previous Main.
- Previous Batch history.
- Recipe-required checks.
- Next Main.

## 5. Hủy request Candidate cũ

Khi user đổi filter/load nhanh liên tiếp, request Candidate trước được AbortController hủy ở browser. Client không còn chờ/parse response cũ và không ghi đè dữ liệu mới.

## Không thay đổi

- Giữ load-all, không đưa pagination UI trở lại.
- Không đổi sort Candidate.
- Không đổi Route Matrix lazy-load/chunk 60/parallel 3.
- Không đổi v314 `NO_CHAIN_ALL_MAIN`.
- Không đổi Clear Batch rules.
- Không migration SQL mới.
- Không cần Rebuild Chain chỉ vì nâng v315.
