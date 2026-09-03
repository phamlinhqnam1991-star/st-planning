# V424 — Planning Board Workload Summary count reconciliation

## Root cause
The Planning Board Workload Summary had inherited a RAW-ST/current-main eligibility gate from earlier Dashboard work. That gate excluded open Jobs whose RAW `NextOperation` was outside the ST-visible set even when their active Planning Chain already showed a Main such as CMSA as `ELIGIBLE`/READY. The Route Matrix therefore showed more READY Jobs than the summary.

## Fix
- Workload Summary now reads the same active Planning Chain population represented by the Route Matrix: `open_job_current (is_open) + planning_job_operation (is_active)`.
- Removed `RAW_ST_VISIBLE_CTE_SQL`, `rawStJobMatchSql`, and the `eligible_jobs` gate from `/api/planning/workload-summary`.
- Status mapping is unchanged: hold -> HOLD, `ELIGIBLE` -> READY, `LOCKED` -> WAIT.
- One physical Job is still counted once per Main + bucket.
- Area/Main filters are unchanged.

## Scope
Planning Board Workload Summary only. Dashboard canonical ST population (MAIN + Dashboard INTERMEDIATE + ST_SCOPE_ONLY), Planning Chain, Candidate, Batch, Recipe, Schedule, Auto Planning, and Production Execution are unchanged.
