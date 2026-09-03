# V414 — Dashboard chart counts Immediate + ST_SCOPE_ONLY

## Problem
`Surface + Qty by Main Planning / Immediate Operation` still missed two valid ST current-position classes:

1. **Auto Intermediate** operations. Since v297, Intermediate is inferred from `md_intermediate_bridge_segment` + `md_intermediate_bridge_operation`; legacy `md_st_operation_scope.operation_type='INTERMEDIATE'` rows are deactivated. V411 added a pre-gate that expected an active scope row, so valid auto Bridge Intermediate Jobs were removed before the resolver could classify them.
2. **ST_SCOPE_ONLY** was intentionally excluded from the Planning workload population, therefore it never appeared in the chart even though it is a valid ST-visible current RAW operation.

## New chart logic
Chart 2 now has a dedicated read-only current-position population and counts each open Job once from `open_job_current`:

- `PLANNING_OPERATION` -> group as `Current Main / RAW NextOperation [MAIN]`.
- `INTERMEDIATE` -> resolve with the canonical active Bridge rule `LastOperation -> RAW NextOperation -> Current Main`, then group as `Current Main / RAW NextOperation [IMMEDIATE]`.
- `ST_SCOPE_ONLY` -> group as `ST_SCOPE_ONLY / RAW NextOperation [ST ONLY]` without requiring or creating a Planning Main.

The final `TOTAL / ALL ST` point uses this same chart population, so its Surface / Qty / Job total includes Main + Immediate + ST_SCOPE_ONLY exactly once per open Job.

## Audit
`Chart Calculation Audit · Job Detail` now uses the exact same population as chart 2 and adds `ST Type` so each row can be verified as `MAIN`, `IMMEDIATE`, or `ST ONLY`.

## Unchanged
- Planning Board Workload Summary
- Main/Recipe Planning workload tables and status buckets
- Planning Chain / READY / WAIT / HOLD
- Batch / Recipe / Schedule
- ST_SCOPE_ONLY remains display-only and never enters Planning Chain/Batch/Schedule
- Surface axis remains fixed at 50,000 dm²; Qty axis remains fixed at 10,000 pcs
- No database migration
