# V434 — Unscheduled pool follows Batch selection / unschedule state

## Scope
Scheduling Board only. No Planning Chain/Candidate/Dashboard/Chemical proposal formula changes.

## Behavior
- A Batch in **Unscheduled Batches** disappears immediately when it is picked into any draft scheduling row.
- The same Batch cannot be picked into another row/lane while already loaded in a draft row.
- **Xóa nhập** clears the draft row and immediately returns that Batch to **Unscheduled Batches**.
- After Save/Schedule, the Batch remains hidden because it owns an active Schedule.
- Added **Bỏ điều độ** on scheduled rows: cancels only the Schedule, keeps the Batch + Batch Jobs, clears Batch planned time when no active Schedule remains, recomputes Job planning status, and returns the Batch to **Unscheduled Batches**.
- Existing **Delete Batch** remains a separate destructive action.
- `/api/schedule/rows` now returns active scheduled Batch IDs across all dates so local refresh never shows a Batch as Unscheduled merely because its Schedule is on another date.

## Chemical Line
No change to proposal, FB selection, loading/process/NDT/unloading, capacity, continuation, or predecessor guard. Unschedule is schedule-state management only.
