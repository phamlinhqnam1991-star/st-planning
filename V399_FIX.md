# V399 — Dashboard Workload split by Area

## Scope
Dashboard presentation/read aggregation only. No change to Planning Chain, RAW NextOperation ST gate, Recipe resolution, Batch, Schedule, Hold, or Production Execution.

## Main Planning Workload Summary
- The previous single table containing all Areas is removed.
- Dashboard now renders one workload block per Area, ordered by Area sort order.
- Each Area block contains its own KPI cards followed by that Area's Main Planning → Recipe table.
- Area table rows keep the V397 detail structure: Main total → Recipe No. / Recipe Name, with WAIT / READY / PLANNED / PLANNED-UNSCHEDULED / SCHEDULED / HOLD and Total, all in Job / pcs / dm².

## Area KPI cards
Each Area shows the same card family as the overall Dashboard:
- Area TOTAL · UNIQUE JOBS
- WAIT
- READY
- PLANNED
- PLANNED-UNSCHEDULED
- SCHEDULED
- HOLD

Area TOTAL counts each Job once within that Area's planning workload. Status cards remain Job × Main Planning workload inside the Area, matching the Dashboard status semantics.

## Scrolling
- Main Planning/Recipe tables have no vertical max-height and no vertical table scrollbar; all rows render in the page.
- CAT3 and CAT5 tables also have no vertical max-height/vertical table scrollbar, so all priority Jobs remain visible.
- Horizontal scrolling is retained where a wide ERP table needs it.

## Population
V398 RAW NextOperation ST gate is unchanged and remains upstream of all Dashboard aggregation.
