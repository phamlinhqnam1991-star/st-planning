# v309 — Manual Intermediate Bridge Segments

## Mục tiêu

Giữ Auto Bridge hiện tại làm nguồn mặc định, đồng thời cho phép planner tạo Manual Bridge cho ngoại lệ.

Runtime dùng chung một data model:

- `AUTO_ROUTING`: tự suy ra từ ST Routing Chain · Standardized.
- `MANUAL`: nhập tay.

Ưu tiên resolver:

1. Manual segment phù hợp với `LastLaborOp + NextOperation`.
2. Nếu nhiều Manual cùng match, priority cao hơn thắng.
3. Nếu không có Manual phù hợp, dùng Auto segment.
4. Nếu rule thắng vẫn định vị được nhiều Main occurrence, trả `SEQUENCE_CHECK`; không dùng Schedule history để đoán vị trí.

## Manual Segment fields

- Previous Main
- Ordered Intermediate Operations (1..N)
- Next Main
- Priority (default 100; số lớn hơn ưu tiên hơn)
- Note
- Active / Inactive

Intermediate Operations có thể thêm/bớt và di chuyển ↑/↓ để giữ đúng thứ tự vật lý.

## Rebuild Auto

Auto Rebuild/Finalize chỉ thay dữ liệu `source='AUTO_ROUTING'`.
Manual rows không bị xóa, deactivate hoặc overwrite bởi Auto rebuild.

## Planning Chain

Sau khi thêm/sửa/ngưng Manual Segment, cần `Rebuild Chain` để live `planning_job_operation` được định vị lại theo bridge snapshot mới.

Vị trí Job vẫn chỉ dùng đúng cặp All Open Job:

`LastLaborOp + NextOperation`

Manual Bridge chỉ thay đổi cách map pair đó sang Previous Main / Next Main; không dùng Schedule history để chọn vị trí.
