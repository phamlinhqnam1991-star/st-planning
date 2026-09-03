# V408 — Dashboard strict RAW NextOperation ST validation

## Scope
Dashboard only. Planning Board population/resolver logic from V404 is not changed in this version.

## Dashboard population source
Dashboard now starts from `open_job_current` and accepts an Open Job only when its physical RAW `next_operation` directly matches:

`md_st_operation_scope.is_active = true AND operation_type = 'PLANNING_OPERATION'`

This is evaluated before reading Planning Chain, Batch, Schedule, Recipe, Area or Main Planning context.

### Explicit exclusions from Dashboard population
- Active Bridge Intermediate operation codes do not widen Dashboard population in V408.
- `ST_SCOPE_ONLY` is excluded.
- A future ST Main inside `planning_job_operation` cannot pull a Job into Dashboard when the current RAW NextOperation is outside the explicit ST Planning Operation set.

## ST TOTAL
`ST TOTAL` is now a pure unique Open Job total after the strict RAW NextOperation gate. It no longer requires a live `planning_job_operation` Current Main row just to count the Job.

## Status/Main/Recipe
After a Job passes the strict RAW gate, existing Planning Chain / Batch / Schedule data is still used to provide WAIT/READY/PLANNED-UNSCHEDULED/SCHEDULED/HOLD, Main Planning and Recipe context. These business-state rules were not changed.

## Chart
No new chart grouping/formula change is introduced in V408. The chart receives the stricter Dashboard population; its Current Main / RAW NextOperation grouping will be reviewed separately after the user validates the filtered rows.

No database migration is required.
