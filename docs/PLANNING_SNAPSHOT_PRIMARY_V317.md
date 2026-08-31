# Planning Snapshot Primary Board — v317

- `/planning` / Candidate Jobs is now Snapshot-first.
- Canonical business logic remains `resolvePlanningView()` + `loadPlanningCandidates()`.
- CACHE HIT reads the saved payload and skips the heavy resolver.
- CACHE MISS runs canonical logic, stores the payload, then returns it.
- All Open Job / Chain / Batch / Schedule / Recipe / Mapping / Planning View changes invalidate the snapshot through `source_version`.
- Snapshot DB objects missing during upgrade/rollback => automatic canonical fallback; Planning Board stays usable.
- Separate `Snapshot TEST` tab is removed. Old `/planning/snapshot` redirects to `/planning`.
- Migration: `059_planning_snapshot_primary_board.sql`.
