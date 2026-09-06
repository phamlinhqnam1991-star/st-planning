# V511 · Shift Accept & Remove moved to Production Execution

## Production Execution
- Downstream `REMOVE_JOB` impacts created by `PRODUCTION_REMOVE_BEFORE_START` are loaded for the visible scheduled Batch population.
- Each affected Batch shows `Upstream Impact · Shift Action` directly in Production Report.
- Shift Supervisor with `production.add_job` and matching Production Area scope can use `Accept & Remove Job` there.
- After acceptance, the existing downstream-remove transaction removes the Job, recomputes Batch Job/Qty/Surface/Process Time, preserves audit, emits Internal Chat notification and realtime invalidation.
- `NEW` impact continues to block first Start.
- If the affected Batch already started, Production Report shows `CRITICAL · BATCH ALREADY STARTED`; automatic removal remains blocked.
- Impact-panel read is fail-open: an impact query failure must not take down the Production Report.

## Scheduling Board
- `UPSTREAM JOB REMOVED` remains visible for Planner awareness.
- Scheduling no longer provides `Shift Accept & Remove`.
- It shows `WAITING SHIFT ACCEPT`, `ACCEPTED`, or `CRITICAL` and links to the correct Production Report date.

## Permission
- Accept & Remove now requires `production.add_job` + matching Production Area scope.
- `schedule.edit` alone no longer authorizes this production decision.

## Unchanged
- Source Remove Before Start logic.
- READY/WAIT and Planning Chain.
- Recipe and Batch compatibility.
- Schedule dependency/capacity rules.
- V509 Global Realtime No-Supabase.
- V510 Internal Chat realtime/direct/unread.

No new database migration is required for V511.
