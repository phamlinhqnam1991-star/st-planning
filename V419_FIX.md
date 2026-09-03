# V419 · INTERMEDIATE ST membership is Dashboard-only

## Scope correction

V418 introduced explicit ST membership for Bridge Intermediate operations, but its save path still contained legacy cleanup/sync behavior that could touch Planning data. V419 removes that coupling.

## Final logic

Dashboard Chart/Audit uses three independent stages:

1. Resolve Job position with `LastOperation -> RAW NextOperation -> Current Main`.
2. Resolve Bridge Role from active Auto/Manual Bridge data.
3. Apply Dashboard ST membership to the already-resolved RAW NextOperation.

A row is counted as Dashboard Immediate only when:

- `Bridge Role = INTERMEDIATE`; and
- `md_st_operation_scope.operation_type = 'INTERMEDIATE'` is active for that RAW operation.

## Dashboard-only guarantee for INTERMEDIATE

Saving or removing `INTERMEDIATE` now only changes the explicit Dashboard membership row in `md_st_operation_scope`.

It does **not**:

- create/deactivate Source -> Main Mapping;
- create/deactivate `planning_job_operation` rows;
- run Planning Chain sync;
- change Candidate logic;
- make a Job appear in All Open Jobs;
- change Batch, Recipe or Schedule;
- invalidate/rebuild Auto Bridge because of the Dashboard tag itself.

The API rejects `INTERMEDIATE` tagging when the Operation is not present in an active Bridge or is currently an active Planning/ST_SCOPE_ONLY source.

## Operational ST visibility

All Open Jobs continues to use only:

- `PLANNING_OPERATION`;
- `ST_SCOPE_ONLY`.

`INTERMEDIATE` is excluded from operational All Open Jobs visibility. Import diagnostics likewise treat active Bridge membership separately and do not treat Dashboard INTERMEDIATE as an operational ST scope row.

## UI

ST Operation Flow now labels this classification explicitly as `INTERMEDIATE Dashboard ST` / `Dashboard ST: ON/OFF` and states that it affects only Dashboard Chart/Audit.

## Unchanged

Planning Chain, Candidate, Workload Summary, Auto/Manual Bridge resolver, Batch, Recipe and Scheduling behavior remain unchanged.
