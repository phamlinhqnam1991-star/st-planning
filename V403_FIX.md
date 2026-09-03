> **Superseded by V404 for Immediate workload:** Immediate Operation is now RAW `open_job_current.next_operation` grouped under the Planning Board-resolved Current Main; it is no longer derived from `planning_job_operation.source_operation_code`. Chart placement/fit improvements remain.

# V403 — Dashboard charts fit + Surface/Qty dual axis

## Scope
Dashboard charts only. No Planning Chain, Recipe, Batch, Schedule, Hold or RAW ST population logic changes.

## 1. Surface Workload by Main Planning
- Keeps the existing stacked dm² workload by Planning status.
- Removes the fixed per-column width/min-content behavior that created a horizontal scrollbar.
- Every Main Planning bar now shares the available Dashboard width and compresses to the viewport.

## 2. Surface + Qty by Main Planning / Immediate Operation
Adds a second Dashboard chart:

`Main Planning -> Immediate Operation (planning_job_operation.source_operation_code)`

- X axis: `Main Planning / Immediate Operation` grouped label.
- Column: total Surface workload in dm².
- Left Y axis: dm².
- Line: total Qty workload in pcs.
- Right Y axis: pcs.
- Uses the same V400 strict RAW NextOperation ST-only population and the same workload rows as the Dashboard summary.
- No horizontal chart scroller; the SVG scales to the Dashboard width.

## Data rule
`Immediate Operation` is the concrete `source_operation_code` of the Planning Chain occurrence mapped to the Main Planning Operation. If missing, it falls back to the Main Planning code so workload is not dropped.

No migration is required.
