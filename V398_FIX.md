# V398 — RAW NextOperation ST Population Fix

## Problem
V395/V397 workload queries started from `planning_job_operation`. That could include a Job whose current RAW `open_job_current.next_operation` is outside ST merely because the Job has current/future ST Planning Chain rows.

## Canonical population
Dashboard and Planning Board Workload now use:

`open_job_current.next_operation (RAW) -> visible ST RAW operations -> planning_job_operation`

Visible ST RAW operations match the Planning Board:
- active `PLANNING_OPERATION` from `md_st_operation_scope`;
- active Auto Bridge intermediate operation;
- explicit `ST_SCOPE_ONLY` excluded.

## Applied to
- Planning Board Workload Summary READY / WAIT / HOLD.
- Dashboard ST TOTAL population.
- Dashboard WAIT / READY / PLANNED / PLANNED-UNSCHEDULED / SCHEDULED / HOLD.
- Dashboard Main Planning + Recipe breakdown.
- Dashboard CAT3 and CAT5 lists.

## Not changed
Planning Chain generation, READY/WAIT engine, Recipe resolution, Batch, Schedule, Hold and Production Execution logic are unchanged.

No migration is required.
