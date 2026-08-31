# v298 — Auto Intermediate Bridge rebuild without Vercel timeout

## Goal

`Rebuild Auto Bridge Segments` no longer scans every standardized routing inside one HTTP request.
The discovery logic itself is unchanged: Main Planning occurrences come from active Planning Scope and raw operations between two consecutive Mains form the ordered Intermediate Segment (excluding PIONBL and ST_SCOPE_ONLY).

## Full rebuild flow

1. Start creates a durable `run_id` and snapshots:
   - active `routing_code` list;
   - Main Planning lookup;
   - excluded operations;
   - source fingerprint.
2. Client calls `process` repeatedly, default 150 routings/request.
3. Each chunk reads `md_st_routing` once for the routing list and discovers Segments in memory.
4. Results are accumulated in staging tables by `run_id`.
5. If the browser/network stops, the run remains resumable from unprocessed routing indexes.
6. Finalize publishes the staged set in one DB transaction. Existing ACTIVE Bridge data remains visible until commit.

## Safety

- No active Segment is deleted at Start.
- A failed/partial run never becomes visible to Planning Board.
- If ST Routing/Main Planning changes while a run is in progress, fingerprint validation blocks Finalize and requires `Hủy & làm lại`.
- Cancel removes staging only; ACTIVE Bridge remains unchanged.

## Incremental import

Master Import compares active deterministic routing codes before/after standardized routing rebuild.
Only routing signatures that became NEW or INACTIVE are queued into an `INCREMENTAL` Bridge run. The Import UI processes the short chunks using the same API.

## Database migration

Run `053_intermediate_bridge_chunked_rebuild.sql`.

It adds rebuild-run + staging tables and the active `(routing_code, seq)` index.

## Important runtime change

`syncPlanningChains()` no longer executes full Auto Bridge discovery. It only consumes the last ACTIVE Bridge snapshot. This prevents normal Rebuild Chain / config writes from reintroducing the old long-running Bridge query.
