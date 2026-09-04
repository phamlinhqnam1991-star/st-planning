# V450 — Production Report compact layout + Note

## Scope
Only Production Execution report UI and execution note entry are changed.

## Changes
- Remove Batch-level `Operation` column.
- Remove Job-detail `Previous Operation` and `Next Operation` columns.
- Add stronger separators/alternating Batch rows for long report lists.
- Add `Note / Ghi chú` field. Chemical Line/Painting notes are line-level; other areas are Job-level.
- Reuse existing `remark` columns; **no SQL migration is required**.

## Not changed
Planning Chain, READY/WAIT, Batch membership, Recipe, Schedule, Previous Main lock, Chemical Line proposal/capacity, canonical Production Day 06:00→05:59 and V448 area/cabin grouping.
