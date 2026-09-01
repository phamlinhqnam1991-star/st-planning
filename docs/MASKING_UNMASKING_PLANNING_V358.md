# Masking / Unmasking Planning v358

## Mục tiêu

Thêm tab riêng để theo dõi công việc Masking / Unmasking phục vụ từng Main Planning Operation.

## Thứ tự hiển thị

- Tất cả Main Planning Operation lấy từ `md_operation_master`.
- Sắp xếp theo `md_operation_master.planning_sort_order`.
- `PRIMER` chỉ đổi nhãn UI thành `PRIMER1`; không đổi dữ liệu master.
- `PRIMER2`, `PRIMER3`, `TOPCOAT1`, `TOPCOAT2` giữ tách riêng.

## Cách xác định support operation

Với mỗi Job đã nằm trong Batch của một Main Planning occurrence:

1. Lấy `previous_source_seq_snapshot` và `source_seq` của `planning_job_operation`.
2. Đọc `md_routing_detailed` cùng Part + Revision.
3. Chỉ lấy các row có `source_seq` nằm giữa Previous Main và Current Main.
4. Phân loại trực tiếp từ `operation_detail_code`:
   - `UNMSK` / `UNMASK` => UNMASKING.
   - `MSKG` / `MASK` => MASKING.
5. Gắn support operation đó vào Current Main phía sau.

Ví dụ:

`BSAUNSLD -> INSAND-B -> MSKG-TC -> PPRSLVT`

`MSKG-TC` được hiển thị tại `PPRSLVT -> Masking`.

## Batch và thời gian

- Batch No. lấy từ `planning_batch` của đúng Main occurrence.
- Start Time lấy từ `planning_schedule.planned_start` của Batch.
- Nếu Batch chưa được điều độ, hiển thị `UNSCHEDULED / Chưa điều độ`.
- Khi Board Điều Độ đổi Start của Main Batch, tab này tự đọc giờ mới; không lưu bản sao thời gian support.

## Không thay đổi logic hiện tại

Tab này là derived/read-only view. Không thay đổi:

- READY / WAIT / DONE.
- Planning Chain.
- Recipe resolver.
- Batch Compatibility.
- Process Time.
- Next Op Sort.
- Board Điều Độ.

Không cần migration SQL mới.
