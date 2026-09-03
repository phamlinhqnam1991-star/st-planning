# V428 — Dashboard CAT3/CAT5 sorted by NextOperation Order

## Scope
Dashboard priority tables only. No Dashboard population, Current Main resolver, Planning Chain, Candidate, Workload Summary, Batch, Recipe or Scheduling logic is changed.

## Change
CAT3 and CAT5 now use the same canonical NextOperation presentation order as Planning Board:

1. Resolved Main Planning Order (`md_operation_master.planning_sort_order`).
2. Resolved Main name as deterministic grouping when order is equal.
3. RAW Operation Code Order (`md_operation.planning_sort_order`) as the tie-break inside the same Main.
4. RAW `NextOperation`.
5. Job number as the final stable tie-break.

`ST_SCOPE_ONLY` has no Main Planning parent, so its rows remain grouped at the end and are ordered by RAW Operation Code Order / RAW NextOperation.

The Dashboard query reads Operation Code Order with a deterministic `LATERAL ... LIMIT 1`, so historical duplicate `md_operation` rows cannot multiply CAT3/CAT5 Jobs.
