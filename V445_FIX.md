# V445 — Canonical Production Day 06:00 → 06:00

## Chốt nghiệp vụ
Mọi kế hoạch có `planned_start` trong khoảng `06:00 ngày D` đến trước `06:00 ngày D+1` đều thuộc **ngày sản xuất D**.

Ví dụ production date `2026-09-02` gồm mọi Schedule có Start từ `2026-09-02 06:00` đến `2026-09-03 05:59:59...`. Start `2026-09-03 00:30` vẫn thuộc ngày `2026-09-02`. Nếu Batch Start trong cửa sổ này nhưng End qua `06:00` tiếp theo, Batch vẫn thuộc ngày D vì ownership theo Start.

## Đồng bộ phạm vi
- Board Điều Độ: Schedule Table + Timeline + `/api/schedule/rows`.
- Trial Shift: giữ logic MOVE ±1 ngày theo production day.
- Masking / Unmasking: scheduled view dùng Main Schedule Start 06:00→06:00.
- Production Execution: worklist dùng đúng cùng boundary.
- Daily Dashboard operational metrics/trend và AI day operations dùng cùng boundary.
- Default “Today” của Schedule / Masking / Production hiểu 00:00–05:59 là production date hôm trước.

## schedule_date
Từ V445, `planning_schedule.schedule_date` là production date, không còn là calendar date của Start. Công thức: Vietnam local `planned_start - 6 hours`, lấy DATE. Migration `073_canonical_production_day_0600.sql` backfill lịch hiện có.

## Không đổi
Planning Chain READY/WAIT, Candidate, Batch membership, Recipe, Previous Main Schedule Lock, Chemical Line proposal/capacity, Loading/Process/NDT/Unloading và Production WAITING/ON-GOING/DONE không thay đổi.
