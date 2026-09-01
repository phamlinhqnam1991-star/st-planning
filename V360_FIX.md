# v360 · Masking / Unmasking Routing Position Fix

- Fixed Masking/Unmasking rows showing `0 Job` even when the linked Main batch is scheduled.
- Root cause: `planning_job_operation.source_seq` is a 1-based AllOperation position (1,2,3...), while `md_routing_detailed.source_seq` is usually 10,20,30... . v359 compared the two raw values directly.
- Routing Detail is now normalized with `dense_rank()` into `route_pos` before applying the Previous Main → Current Main boundary.
- Main groups are now sourced from active `md_planning_operation_scope` and ordered by Main Planning Order, instead of listing every active `md_operation_master` row.
- No database migration is required.
