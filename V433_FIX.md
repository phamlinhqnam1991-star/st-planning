# V433 · Previous Main DONE without Batch

## Problem
Scheduling Board unscheduled Batch cards treated every Previous Main with no Batch as `UNSCHEDULED / Chưa điều độ`. That is wrong when the Job has already physically passed the Previous Main and the Planning Route status is DONE even though no Batch was ever created.

## Fix
- Resolve the exact immediate Previous Main from the durable Current Batch planning snapshot, with live-chain fallback only when needed.
- Previous Main display states are now:
  - `DONE`: physical progress already passed the Previous Main and no historical Batch exists.
  - `SCHEDULED`: exact Previous Main Batch has an active Schedule.
  - `UNSCHEDULED`: exact Previous Main Batch exists but has no active Schedule.
  - `NOT_PLANNED`: Previous Main is still active/not done and has no Batch.
- Previous Batch lookup is constrained to the exact immediate predecessor instead of any older Batch.
- Add-only schedule guard accepts `DONE + no Batch` as completed handoff.
- If a Previous Main Batch exists but is UNSCHEDULED, it still must be scheduled first.
- Scheduled predecessor time lock remains `Current Start >= Previous End`.

## Boundaries
No change to Chemical Line proposal/capacity logic, Schedule PATCH/Edit, Trial Day Shift, Planning Chain READY/WAIT, Dashboard, Batch membership, or Recipe logic. No database migration.
