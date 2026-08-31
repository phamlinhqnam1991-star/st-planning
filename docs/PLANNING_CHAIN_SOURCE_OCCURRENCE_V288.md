# Planning Chain Source Occurrence — v288

## Root cause fixed

v287 could rebuild a wrong live chain because `syncPlanningChains()` used
`md_routing_detailed` joined to every open Job of the same Part/Revision. When
2+ open Jobs shared one Part/Revision, routing rows could be multiplied before
`source_seq` was reconstructed. Rebuild then recreated duplicate Main
occurrences and Schedule handoff remained inconsistent.

## Canonical rules in v288

1. `open_job_current.all_operation` of the **same Job** is the only source of
   source occurrence identity.
2. `source_seq = index in AllOperation + 1` before mapping/filtering.
3. Mapping winner is deterministic: DIRECT → SEQUENCE/FALLBACK → other,
   `sort_order`, newest `updated_at`, newest `created_at`, highest `id`.
4. One source occurrence is standardized once.
5. `PIONBL` remains in AllOperation/trace but never becomes an active
   `planning_job_operation`.
6. Dedupe key is source occurrence (`source_seq + source_operation_code`), not
   Standard Operation.
7. `planning_seq` is assigned after mapping + Planning Scope + dedupe on the
   **full Planning route**, and does not restart at current NextOperation.
8. Rebuild deactivates the old live chain for open Jobs, rebuilds canonical rows,
   and reconciles existing Batch/Schedule history. Batch/Schedule history is not
   deleted.
9. Route Matrix uses the same Job AllOperation `source_seq` system as Planning
   Chain.
10. Batch membership alone does not unlock the next Main. A non-cancelled
    `planning_schedule` with `planned_start` does.
11. Adding a Job to an already Scheduled Batch performs immediate next-Main
    handoff for the newly added Job.

## Expected example

AllOperation:

`CPBILP | PIONBL | BSAUNSLD | PPRSLV2C | PTCSLVT | V_VRNS | FINSST`

With PIONBL skipped from Planning:

- CPBILP: `source_seq=1`, `planning_seq=1`, `operation_instance_key=CPBILP#1`
- BSAUNSLD: `source_seq=3`, `planning_seq=2`, `operation_instance_key=BSAUNSLD#1`

If CPBILP has an actual active Schedule, BSAUNSLD becomes `ELIGIBLE`.

## Migration

Run `049_planning_chain_source_occurrence.sql`, then press **Rebuild Chain** once.
Migration 049 keeps Batch/Schedule history, deactivates exact duplicate live
source occurrences if present, and adds the unique live occurrence guard/indexes.

## Acceptance query

```sql
select
  standard_operation,
  source_operation_code,
  source_seq,
  planning_seq,
  operation_instance_key,
  status,
  previous_standard_operation_snapshot,
  previous_source_seq_snapshot
from planning_job_operation
where job_num='0198949-R'
  and is_active=true
order by planning_seq,source_seq;
```

For the example route, there must not be duplicate active `CPBILP#2/#3/...` or
`BSAUNSLD#2/#3/...` created from a multiplied Part/Revision join.
