# Planning Board V2 Rewrite — v319

## Mục tiêu

Viết lại lớp giao diện Planning Board theo kiến trúc module hóa nhưng không tạo business logic mới.
V2 dùng lại các API chuẩn đang chạy ở v318:

- `GET /api/planning/candidates` — Candidate + Snapshot-first read path.
- `POST /api/planning/route-status` — Route Matrix theo occurrence.
- `GET /api/planning/deferred-data` — Recent/active Batch phụ trợ.
- `POST /api/planning/batch` — tạo Batch / add vào Batch hiện hữu và toàn bộ validation chuẩn.
- `POST /api/planning/rebuild` — rebuild Planning Chain chuẩn.

Do đó các rule Current/Next Main, `NO_CHAIN_ALL_MAIN`, READY, PLANNED-UNSCHEDULED,
SCHEDULED, Recipe, Batch Key, paint same-key validation, plan-ahead và chain resolver vẫn do
nguồn chuẩn hiện tại quyết định.

## Phạm vi thử nghiệm an toàn

Planning Board cũ `/planning` giữ nguyên.
Planning V2 nằm ở `/planning/v2` và được thêm thành tab `Planning V2 (TEST)`.
Không có migration SQL mới.

Nếu không dùng V2, chỉ cần quay lại `/planning`; V2 không thay dữ liệu hoặc cấu trúc bảng riêng.

## Kiến trúc V2

- `planning-v2-client.tsx`: orchestration và actions.
- `use-planning-v2-data.ts`: Candidate fetch, Snapshot metadata, deferred Batch, progressive Route Matrix.
- `planning-v2-filters.tsx`: scope filter.
- `planning-v2-grid.tsx`: Candidate grid, client filter, incremental DOM rows, Route Matrix.
- `planning-v2-batch-panel.tsx`: selection summary, create/add Batch, Rebuild.
- `domain.ts`: pure display/selection helpers copied theo behavior hiện tại, không query DB.
- `types.ts`: contract rõ ràng cho Candidate/Route/Batch.

## Load strategy

1. SSR chỉ lấy static Planning master cache.
2. Candidate API là critical path và vẫn dùng Snapshot-first của v318.
3. Candidate rows hiện trước.
4. Route Matrix chỉ tải cho các rows đang được render, chunk 60 IDs, tối đa 3 request song song.
5. DOM Candidate mở dần 100 rows/lần nhưng dữ liệu Candidate vẫn Load All.
6. Deferred Batch tải sau Candidate.
7. Create Batch/Rebuild không reload toàn trang; force refresh Candidate Snapshot sau action.

## So sánh với Board cũ

V2 cố tình không mang theo các phần UI tùy biến nặng của monolith cũ như Default View package,
column drag package, freeze picker, Recipe diagnosis/compare trong lần thử đầu tiên. Đây là UI utility,
không phải business rule. Workflow nghiệp vụ cốt lõi vẫn đi qua cùng API chuẩn.

Chỉ chuyển V2 thành board chính sau khi đối chiếu Candidate/Route/Batch trên dữ liệu thật và xác nhận ổn.
