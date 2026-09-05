# V469 — Production-added Job persists after report reload

## Fixed issue
For Painting and Chemical Line, Production Execution reports by Batch/line. In V468 the server loaded Job details only for Job-report areas. Therefore a Job added from Production was visible immediately from client state, but disappeared after the page was server-loaded again (for example after creating another PRIMER Batch in Scheduling and returning to Production Execution).

## Fix
- Load `planning_batch_job` detail for all scheduled Batches, including LINE-report areas.
- Keep `reportMode=LINE` unchanged for Painting/Chemical Line.
- Use loaded Job membership only to persistently render `Job thêm mới trong sản xuất` beneath the Batch row.
- No change to Planning, Scheduling, Recipe, Batch Size, Carry Over, Next Main Attention, or approval logic.
- No SQL migration required.
