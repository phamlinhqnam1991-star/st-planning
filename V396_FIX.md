# V396 — Rebuilt ST Workload Dashboard

- Cleared the previous `/dashboard` visual layout and rebuilt it around ST Planning workload.
- Added unique open ST total: Jobs / pcs / dm².
- Added status workload: WAIT, READY, PLANNED, PLANNED-UNSCHEDULED, SCHEDULED, HOLD.
- Added Main Planning summary table with Jobs / pcs / dm² by status.
- Added stacked column chart based on dm²: X = Main Planning, Y = dm².
- Added complete CAT3 list followed by CAT5 list with Part, current Planning, latest Batch and latest active Schedule.
- Dashboard is read-only and uses Planning Chain + Batch + Schedule as source of truth.
- No migration. No Planning/Batch/Schedule write logic changed.
