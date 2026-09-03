# V407 · Dashboard Chart Calculation Audit

## Scope
Read-only diagnostic UI for the Dashboard combo chart. No Planning/Bridge/Batch/Recipe/Schedule business rule changes.

## Added
Dashboard now renders **Chart Calculation Audit · Job Detail** directly below `Surface + Qty by Main Planning / Immediate Operation`.

The table has exactly one row per open Job admitted to the same ST population as the chart and exposes both RAW source fields and the materialized Planning Board resolver result:

- Job / Part / Revision / Priority
- Last Operation
- RAW NextOperation = Immediate Operation
- `route_resolution_mode`
- Previous Main snapshot
- Current Main + Current Main source operation + status + planning/source sequence
- Immediate Next Main + source operation + planning sequence
- CurrentGoodWIPQty / ProdQty / Qty Used
- Surface per part
- source `TotalSurface`
- calculated `Qty Used × Surface/Part`
- final Surface Used by Dashboard
- AllOperation

The `Chart Group` column displays the exact aggregation key used by chart 2: `Current Main / RAW NextOperation`.

## Purpose
This version intentionally does **not** change the chart formula. The table is added first so each Job can be checked against All Open Job + Planning Board resolver before changing aggregation rules.

## Database
No migration required.
