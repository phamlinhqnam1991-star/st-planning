# v295 — Intermediate Operation Bridge

## Mục tiêu

RAW `NextOperation` có thể là công đoạn trung gian giữa hai Main Planning và không tồn tại trong `AllOperation`. Không tạo chain giả cho công đoạn trung gian.

## Nguồn chuẩn

```text
VIEW ST → open_job_current.NextOperation
AllOperation → canonical Planning Chain
INTERMEDIATE config → Previous Main → Next Main
```

## Trạng thái

```text
Previous Main có active Schedule → Next Main READY
Previous Main chưa Schedule       → Next Main WAIT PREV
```

INTERMEDIATE không có `planning_job_operation_id` riêng. Khi planner chọn Job, Batch Builder luôn nhận ID của Next Main Planning occurrence thật.

## Cấu hình

Tại **ST Operation Flow** chọn loại `INTERMEDIATE`, sau đó chọn `Previous Main` và `Next Main`. Hai Main phải đang active trong `md_planning_operation_scope`.

## Database

Migration `050_intermediate_operation_bridge.sql`:

- thêm `INTERMEDIATE` vào `md_st_operation_scope.operation_type`;
- thêm `previous_main_operation`;
- thêm `next_main_operation`;
- cleanup mapping/live Planning row cũ của raw intermediate;
- thêm index lookup bridge.
