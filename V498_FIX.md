# V498 — Scheduling Operation Card Recipe Picker

## Phạm vi
Chỉ Tab **Điều độ / Scheduling Board** — phần **ST Workload Summary · By Area**.

## Thay đổi
Tại dòng **MAIN TOTAL** của từng Main Operation, mỗi workload card giờ có thêm các Recipe con có workload thật trong chính bucket đó.

Áp dụng cho:
- READY · Previous Main Scheduled / Done
- READY · Previous Main Not Yet Scheduled
- WAIT · Next Main
- WAIT · Future Mains
- HOLD

Mỗi Recipe con hiển thị Recipe No + Job + pcs + dm². Click Recipe sẽ mở Planning Board Quick View đã lọc theo **Area + Main Operation + Recipe + Bucket**.

## Giữ nguyên
- Các Recipe row hiện hữu
- WAIT · Next Main breakdown theo Previous Main
- READY breakdown theo Recipe của Main đang READY (V497)
- Canonical workload population
- READY / WAIT gating
- Recipe resolver
- Batch / Schedule
- Auto Planning

Không có migration SQL mới.
