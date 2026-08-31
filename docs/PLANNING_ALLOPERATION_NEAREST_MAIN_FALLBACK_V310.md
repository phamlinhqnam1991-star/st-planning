# v310 — Segment → AllOperation nearest-Main fallback → NO CHAIN

## Logic chốt

Vị trí Planning của Job vẫn chỉ lấy từ hai trường All Open Job:

- `LastLaborOp`
- `NextOperation`

Không dùng Batch/Schedule history để đoán vị trí vật lý.

Resolver chạy đúng thứ tự:

1. `MANUAL` Intermediate Bridge Segment match đúng `LastLaborOp → NextOperation`.
2. Nếu không có Manual phù hợp, `AUTO_ROUTING` Segment.
3. Nếu **không Segment nào match**, xem `AllOperation` của chính Job và lấy **Main Planning gần nhất phía trước theo hướng sản xuất / upcoming Main** từ vị trí xác định bởi `LastLaborOp + NextOperation`.
4. Nếu AllOperation vẫn không xác định duy nhất được Main Planning → `NO CHAIN`.

## AllOperation fallback

Ưu tiên định vị trong AllOperation:

1. Cặp `LastLaborOp → NextOperation` liền nhau.
2. Nếu cả hai cùng có trong route nhưng không liền nhau, dùng cặp có khoảng cách theo thứ tự nhỏ nhất (`LastLaborOp` đứng trước `NextOperation`).
3. Nếu một operation là Intermediate và không có trong AllOperation, dùng occurrence duy nhất của operation còn lại trong chính cặp `LastLaborOp + NextOperation` làm anchor.
4. Từ anchor lấy Main Planning **upcoming gần nhất** trong canonical Planning route.
5. Nếu có nhiều occurrence dẫn tới nhiều Current Main khác nhau, không đoán → `NO CHAIN`.

## READY / WAIT

- Nếu `NextOperation` chính là source code của Current Main → Current Main có thể `ELIGIBLE` trực tiếp.
- Nếu fallback đặt Job ở giữa hai Main → Current Main chỉ `ELIGIBLE` khi Immediate Previous Main đã có Schedule thật.
- Batch creation đơn thuần không unlock Main kế tiếp.

## Candidate Board

Candidate không resolve lại vị trí. `syncPlanningChains()` đã tạo live chain suffix:

`Current Main → Next Main 1 → Next Main 2 → ...`

Nếu resolver trả `NO CHAIN`, Job không có live `planning_job_operation` và Candidate hiển thị `NO CHAIN`.

## Migration

Không có migration mới cho v310.
