# V411 — Dashboard ST-visible RAW NextOperation gate

## Problem
V409 intentionally started Dashboard from every physical RAW `NextOperation` and then let the Planning Board resolver decide ST membership. In practice this could admit a RAW operation that was present in Bridge/mapping context even though that physical operation was not part of the active ST operation scope. The combo chart and audit table therefore showed non-ST Immediate Operations.

## Corrected logic
Dashboard population now uses two gates in this order:

1. `open_job_current.next_operation` must exist in active `md_st_operation_scope` with `operation_type` = `PLANNING_OPERATION` or `INTERMEDIATE`.
2. The existing Planning Board context resolver validates that RAW operation against the live Current Main.

`ST_SCOPE_ONLY` remains excluded.

`LastOperation` is retained only as resolver context for ordered Intermediate Bridge validation. It is deliberately **not** required to be ST, because the first ST operation can legitimately follow a non-ST predecessor.

## Applied to
- ST TOTAL
- status / Area / Main / Recipe workload
- `Surface + Qty by Main Planning / Immediate Operation`
- chart audit Job detail
- CAT3 / CAT5 Dashboard lists

No Planning Chain, Batch, Recipe, Schedule, Bridge master or database migration is changed.
