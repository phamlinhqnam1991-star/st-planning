# V400 — Strict RAW NextOperation ST-only gate

## Problem
V398 correctly started Dashboard/Planning workload from `open_job_current.next_operation`, but the canonical visible RAW set still admitted Auto-Bridge/intermediate operation codes. Legacy saved Planning Board views could also retain unrelated RAW NextOperations. This allowed Jobs whose current RAW NextOperation was not an explicit ST planning operation to appear.

## Canonical rule
A Job enters Dashboard or Planning Board only when:

`open_job_current.next_operation (RAW) -> md_st_operation_scope active PLANNING_OPERATION`

Explicit exclusions:
- `ST_SCOPE_ONLY` does not enter Planning Board/Dashboard.
- Auto-Bridge / `INTERMEDIATE` operations do not enter Planning Board/Dashboard population.
- RAW NextOperations from non-ST areas do not enter even when the Job has future ST Planning Chain rows.

Auto-Bridge remains available inside Planning Chain/navigation logic; v400 changes only population membership/filtering.

## Planning Board
- Server-side `resolvePlanningView()` now intersects every persisted `stView` with the canonical ST list.
- Legacy saved outside-ST/intermediate codes cannot widen Candidate membership.
- Client ST View selector lists explicit ST `PLANNING_OPERATION` codes only.
- Legacy preset NextOperation filters outside the canonical ST set are cleared when applied.

## Dashboard / Workload Summary
Both already use the shared `RAW_ST_VISIBLE_CTE_SQL`; v400 tightens that shared CTE to explicit ST `PLANNING_OPERATION` only. Therefore global Dashboard, Area blocks, Main/Recipe workload, chart, CAT3/CAT5 and Planning Board Workload Summary all use the same ST-only RAW gate.

No database migration is required.
