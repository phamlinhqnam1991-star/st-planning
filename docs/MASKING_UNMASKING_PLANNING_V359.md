# Masking / Unmasking Planning v359

## Mục tiêu

Tab `/masking-unmasking-planning` là derived planning view cho khu vực Masking / Unmasking. Tab không tạo Planning Chain, không tạo Batch riêng và không lưu thời gian support riêng.

## Nguồn chuẩn

1. Main Planning occurrence: `planning_job_operation`.
2. Main Planning Order: `md_operation_master.planning_sort_order`.
3. Physical routing: `md_routing_detailed`.
4. Job data: `open_job_current`.
5. Batch: `planning_batch` + `planning_batch_job`.
6. Recipe: `md_process_recipe`.
7. Schedule: `planning_schedule`.

## PRIMER / TOPCOAT occurrence

Tab không hard-code PPRSLVT là PRIMER1 hay FULTKAPP là PRIMER2.

Planning Chain đã chuẩn hóa ST Group theo occurrence:

- ST Group PRIMER occurrence 1 -> `PRIMER` (UI hiển thị `PRIMER1`)
- occurrence 2 -> `PRIMER2`
- occurrence 3+ -> `PRIMER3`
- ST Group TOPCOAT occurrence 1 -> `TOPCOAT1`
- occurrence 2+ -> `TOPCOAT2`

Do đó hai raw Operation Code Primer khác nhau vẫn được phân biệt đúng theo thứ tự xuất hiện trong routing.

## Xác định support operation

Với Current Main của Job:

- lower boundary = `planning_job_operation.previous_source_seq_snapshot`
- upper boundary = `planning_job_operation.source_seq`
- chỉ đọc `md_routing_detailed` có `source_seq` nằm giữa hai boundary.

Trong đoạn này:

- chỉ raw `operation_code` có `MSKG` mới là support;
- `UNMSKG*` -> UNMASKING;
- các `*MSKG*` còn lại -> MASKING;
- source có `operation_type = PLANNING_OPERATION` bị loại, tránh nhận nhầm Main như `FMSKG-CM`;
- planner nhìn `operation_detail_code` để biết detail cụ thể/lần cụ thể.

Support luôn thuộc Current Main phía sau.

Ví dụ:

`BSAUNSLD -> INSAND-B -> MSKG-TC -> PPRSLVT`

`MSKG-TC` thuộc Masking của occurrence Main chứa PPRSLVT. Nếu đây là Primer occurrence đầu tiên, UI nhóm dưới `PRIMER1`.

## Theo ngày điều độ

View mặc định `Theo ngày điều độ`:

- chọn `planning_schedule.schedule_date`;
- chỉ Batch Main scheduled trong đúng ngày đó xuất hiện;
- Start = `planning_schedule.planned_start`;
- End = `planning_schedule.planned_end`;
- Resource = `planning_schedule.resource_code`.

Khi Schedule Main chuyển ngày, Job support tự chuyển sang ngày mới. Khi Start/End/Resource đổi, tab đọc giá trị mới; không cần cập nhật support riêng.

View `Chưa điều độ`:

- Batch Main đã có;
- chưa có active `planning_schedule`;
- hiển thị Batch No. và Job nhưng Start/End = Chưa điều độ.

## Layout

Thứ tự hiển thị:

`Ngày điều độ -> Main Planning Order -> Main Operation -> Masking / Unmasking -> Job`

Tất cả Main Planning được giữ trên màn hình theo Master Order, kể cả nhóm không có Job.

Mỗi Job có:

- Job
- Part / Revision
- Part Description
- Qty
- Surface
- LastLaborOp
- NextOperation
- Priority
- operation_detail_code Masking/Unmasking
- Recipe
- Batch No.
- Start Time
- End Time
- Resource
- Process Time

## Không ảnh hưởng

Tab này không thay đổi:

- Sequential READY / WAIT
- Recipe Resolver
- Batch Compatibility
- Process Time resolver
- Main Planning Order
- Next Op Sort
- Scheduling Engine
