# v287 — Planning Schedule Handoff consistency

> **Superseded by v288 for live-chain generation.** v288 fixes the source occurrence at `AllOperation` per Job and no longer runs the v287 global handoff repair after Rebuild. See `PLANNING_CHAIN_SOURCE_OCCURRENCE_V288.md`.

## Problem
A previous Main Operation could be visibly `SCHEDULED` in Route Matrix while the
immediate next Main still remained `LOCKED / WAIT PREV`.

The old Rebuild Chain history check depended on:

`standard_operation + source_seq_snapshot`

`source_seq` can change when Routing Detail / ST Mapping is rebuilt, even though
the historical Batch/Schedule is still valid. The old Schedule was therefore
missed by Rebuild Chain.

## Fix

1. Rebuild Chain now matches Batch/Schedule history in this order:
   - `operation_instance_key_snapshot`
   - Standard Operation + source sequence
   - Standard Operation + source Operation Code only when unique in the route
2. Schedule write unlocks only the immediate next active Main.
3. It never skips an already PLANNED/ELIGIBLE immediate Main to unlock a later one.
4. Global historical heal was removed from normal Schedule writes.
5. Explicit `Rebuild Chain` performs the historical handoff repair.
6. Migration `048_schedule_handoff_identity_repair.sql` repairs existing stale
   rows once and adds the history identity indexes.
7. Planning Board distinguishes a stale handoff as `WAIT SYNC` instead of
   incorrectly telling the planner that the previous Main has not been scheduled.

No READY/Batch/Schedule business rule was changed: Batch creation alone does not
unlock the next Main; an actual non-cancelled Schedule is still required.
