# V381 — Restore Recipe Compatibility Lock

## Scope
Fix only Planning Board Batch Compatibility recipe resolution. V380 Previous Main columns, compact density, matrix zoom, Planning Chain, Batch, Schedule and Production Execution logic are unchanged.

## Problem
When a READY target was selected before Route Matrix recipe enrichment had completed (common for plan-ahead READY occurrences), the client could send an empty `effective_recipe_key` to `/api/planning/batch-compatibility`. The API interpreted the empty key as "this Main Operation does not use Recipe" and therefore unlocked every READY Job in that Main.

## Fix
`/api/planning/batch-compatibility` now treats a missing client recipe as incomplete presentation metadata, not as proof that the Main has no Recipe.

For candidate Planning Operation IDs whose Recipe key is missing, the server resolves the exact live Recipe from:

`planning_job_operation → open_job_current → current Recipe Rules`

using the existing `bestRecipeMatch()` source of truth. Only missing Recipe values are hydrated. Existing client-resolved Recipe values remain unchanged.

## Result
- Selecting the first READY Job establishes the Main Operation + Recipe as before.
- READY Jobs with another Recipe are locked/dimmed and cannot be selected into the same Batch.
- Recipe selection conditions continue to be applied by the existing Batch Compatibility engine.
- A Main Operation that genuinely has no Recipe still allows all READY Jobs of that same Main.
- V380 Previous Main columns remain read-only and do not participate in Batch selection.

## Database
No migration required.
