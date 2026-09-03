# V436 — Immediate Schedule Status Sync (no page refresh)

## Scope
Scheduling Board client-state synchronization only. Based on V434; the V435 red styling experiment is not included.

## Behavior
- After `Save/Schedule` succeeds, the Batch changes to scheduled state immediately in the browser without a page reload.
- The Batch is removed from every Unscheduled pool immediately and appears in the saved schedule table immediately using the POST response.
- `ST Workload Summary · By Area` receives the schedule-changed event immediately and refreshes its SCHEDULED / PLANNED-UNSCHEDULED metrics without requiring browser refresh.
- The legacy Planning Batches panel and Manual Schedule Grid synchronize through one `st-batch-schedule-state` client event.
- `Bỏ điều độ` performs the inverse immediately: removes the Schedule row locally, returns the Batch to Unscheduled, and broadcasts the state change before server reconciliation.
- `/api/schedule/rows` is fetched with `cache: no-store` and remains the server-truth reconciliation step after the optimistic UI update.

## Data model
No database migration and no change to `planning_batch.status`. Batch scheduling state remains derived from active `planning_schedule` because `planning_batch.status` has a different lifecycle (`PLANNED/RELEASED/COMPLETED/CANCELLED`).

## Not changed
Chemical Line proposal/capacity/NDT logic, predecessor lock, Planning Chain, Candidate, Batch membership, Recipe rules, Dashboard, Trial day shift.
