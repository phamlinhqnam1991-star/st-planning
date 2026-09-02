# V377 — All Open Job Incremental Planning Sync

## Scope
Only the All Open Job -> Planning Chain synchronization path and first-time raw Operation configuration path are changed. Batch, Schedule, Recipe rules, Production Execution and Master import logic are unchanged.

## Import behavior

- All Open Job Excel remains the source of truth for `LastLaborOp`, `NextOperation`, `AllOperation`, and `source_data`.
- NEW / CHANGED Jobs are collected during streaming import and only those open Jobs are sent to `syncPlanningChains()`.
- UNCHANGED Jobs skip live-chain rebuild.
- CLOSED Jobs only deactivate active `planning_job_operation` rows.
- Existing Batch/Schedule history is still reconciled for the affected Jobs and is never deleted by import.
- Incremental sync limits open-job, planning-row, batch-history, Part/Material/paint-recipe and MD:REQ reads to affected Jobs/Parts.

## New raw Operation detection

After import, RAW `NextOperation` codes belonging to NEW/CHANGED Jobs are reported when they have neither an active ST Scope row nor an active Intermediate Bridge. The UI lists code + affected Job count and links to ST Operation Flow. No automatic Main classification is performed.

## First-time configuration

When a previously unconfigured raw Operation is saved for the first time in ST Operation Flow, the live chain rebuild targets only open Jobs whose `NextOperation`, `LastOperation`, or exact `AllOperation` occurrence uses that raw code. Edits to an already configured Operation keep FULL sync for safety.

## Migration

No new SQL migration is required.
