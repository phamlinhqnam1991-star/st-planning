# V412 — Restore Planning Board Workload Summary

## Scope
Bug fix only for `Planning Board -> Workload Summary`.

## Root cause
`rawStJobMatchSql(j,current_main)` needs `current_main.standard_operation` and
`current_main.source_operation_code`, but the Workload Summary `eligible_jobs`
lateral query returned only `current_main.id`. PostgreSQL therefore failed with
`column current_main.source_operation_code does not exist`, causing the summary
to return 0 and show the API error.

## Fix
The Workload Summary Current Main lateral query now returns exactly the resolver
fields it needs:

- `p0.id`
- `p0.standard_operation`
- `p0.source_operation_code`

No Dashboard population logic, RAW ST membership, Planning Chain, Candidate,
Batch, Recipe, Schedule, status or UI logic was changed.
