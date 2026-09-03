# V423 — Restore Dashboard WAIT without reverting Dashboard ST Scope

## Root cause
V421/V422 changed every Dashboard aggregation to one current row per open Job. The current Planning Chain row is normally `ELIGIBLE`, so future active `LOCKED` Planning Chain rows were no longer aggregated and WAIT dropped to zero.

## Fix
- Keep V420–V422 canonical Dashboard inclusion logic exactly as approved:
  1. Resolve Current Main from LastOperation + RAW NextOperation.
  2. Filter RAW NextOperation by Dashboard ST Scope.
  3. PLANNING_OPERATION = MAIN; INTERMEDIATE = Dashboard IMMEDIATE; ST_SCOPE_ONLY = ST ONLY.
- From that included Job set only, expand active `planning_job_operation` occurrences for workload aggregation.
- Status mapping remains:
  - LOCKED -> WAIT
  - ELIGIBLE -> READY
  - PLANNED/no schedule -> PLANNED-UNSCHEDULED
  - active schedule -> SCHEDULED
  - hold/no batch -> HOLD
- ST_SCOPE_ONLY remains standalone and does not enter Planning Chain.
- Current-position combo chart and CAT3/CAT5 remain one row per open Job.

## Scope
Dashboard only. No changes to Planning Chain, Candidate, All Open Jobs, Batch, Recipe, Schedule, Auto Planning, or Planning Board Workload Summary.
