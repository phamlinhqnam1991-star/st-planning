# V385 — Selected Main + Next Main Planning Recipe

## Scope
Planning Matrix presentation only. No Planning Chain, Batch, Recipe resolver, Scheduling, Production Execution, or database schema change.

## Change
When Batch Selection Mode is active for a READY Main (example: PRIMER), the matrix context is:

`Previous Main | PRIMER | Next Main Planning`

- `Previous Main`: same V384 behavior (upstream Main + status + Batch/Schedule/Resource).
- `PRIMER`: selected/current Main; status and READY selection only. The PRIMER Recipe is not rendered in this cell.
- `Next Main Planning`: virtual downstream context per Job. It resolves the immediate Main after PRIMER and displays that Main name plus its own effective Recipe No/Name when available.
- If the downstream Main has no Recipe, the Recipe line remains empty.
- Selected-Main Recipe Compatibility Lock remains unchanged and still protects Batch composition.
