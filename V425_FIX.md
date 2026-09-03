# V425 — Planning Workload Summary mirrors Candidate / Route Matrix population

## Problem
V424 removed the RAW/Candidate gate completely and aggregated every active `planning_job_operation` row for every open Job. That made Workload Summary too broad. Example: CMSA READY could show 96 Jobs while clicking CMSA READY on the same Planning Board showed only 10 Candidate Jobs in the Route Matrix.

## Root cause
The Planning Board is not the set of every active Planning Chain row in the database. Candidate membership is resolved first:

`open_job_current (open) -> live Current Main exists -> RAW NextOperation belongs to the resolved ST View`

Only those Candidate Jobs are rendered in the matrix. V424 skipped that first population stage.

## Fix
`/api/planning/workload-summary` now resolves the same `stViewParams` as the Candidate API and builds `candidate_jobs` with the same representative Current Main / Area / Main filters. It then aggregates active Planning Chain rows only for those Candidate Jobs.

Status logic remains unchanged:
- Job/Main hold -> HOLD
- `ELIGIBLE` -> READY
- `LOCKED` -> WAIT
- repeated occurrences in the same Job + Main + bucket count once

Area lookup now uses the same deterministic active Area ordering used by Candidate rows instead of `min(area_id)`.

## Expected reconciliation
If clicking `CMSA · READY` hydrates Route Matrix state and the Board displays 10 matching Candidate Jobs, Workload Summary CMSA READY must also count those 10 Jobs. The Summary must not include open Jobs that are outside the Board Candidate population.

## Scope
Planning Board Workload Summary only. Dashboard MAIN / Dashboard INTERMEDIATE / ST_SCOPE_ONLY population, Planning Chain, Candidate resolver, Batch, Recipe, Schedule, Auto Planning and Production Execution are unchanged. No migration required.
