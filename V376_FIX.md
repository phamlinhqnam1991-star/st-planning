# V376 — Lightweight Process Requirement-only Rebuild

## Why

Full Master Import remained too heavy when the only goal was shrinking `md_process_requirement`. It still hashes Part/Revision rows, updates master tables, rebuilds ST Routing, may start Auto Bridge work, and syncs Planning Chain.

## New flow

`Master Excel -> PartNum/RevisionNum + active Gate columns + effective Requirement columns -> Gate -> blank filter -> chunk insert -> md_process_requirement`

- Keeps V375 Part/Revision Gate behavior, including the default `ST = NO`.
- Keeps V374 second-level filter: Active `MD:REQ:*` Recipe Rule OR Manual Keep; blank values are skipped.
- New API: `POST /api/import/process-requirement-rebuild`.
- New server importer: `src/lib/import/process-requirement-rebuild.ts`.
- UI is in Configuration -> Process Requirement Import Filter -> Lightweight Process Requirement rebuild.
- Confirmation text is `REBUILD`.

## Database behavior

The route first verifies a worksheet containing `PartNum` and `RevisionNum`, validates active Gate columns, and waits until the first valid Part/Revision row is found. Only then does it `TRUNCATE public.md_process_requirement`. The truncate is intentionally not held inside a long transaction so PostgreSQL can release the old oversized relation/index files before rebuilding the much smaller filtered set. Inserts are performed in small batches and the final table is analyzed.

If a later insert fails after the truncate, rerun the same Requirement-only rebuild. No Part, Routing, Material Finish, Recipe, Auto Bridge, Planning Chain, Batch, Schedule, or Production Execution data is changed.

Temporary Master files uploaded for this rebuild are removed from Storage when processing finishes.

## Existing full Master Import

Unchanged. Use it only when other Master data also needs synchronization.
