# V397 — Dashboard Main Planning Recipe Workload

## Scope
Dashboard only. Planning / Recipe resolution / Batch / Schedule business logic is unchanged.

## Main Planning Workload Summary
Each Main Planning row now has a second detail level by Recipe:

- Recipe No.
- Recipe Name
- WAIT: Job / pcs / dm²
- READY: Job / pcs / dm²
- PLANNED: Job / pcs / dm²
- PLANNED-UNSCHEDULED: Job / pcs / dm²
- SCHEDULED: Job / pcs / dm²
- HOLD: Job / pcs / dm²
- Total: Job / pcs / dm²

The parent `MAIN TOTAL` row is kept so the planner can compare the total Main workload with its Recipe breakdown.

## Recipe source
- If a Job/Main already belongs to a non-cancelled Batch, Dashboard uses the Batch Recipe.
- Otherwise Dashboard resolves the current live Recipe using the same `bestRecipeMatch()` runtime logic used by Planning.
- `planning_job_operation.recipe_key` is only a fallback when no live result exists.
- Main Operations with no Recipe remain visible under `No Recipe` so workload totals do not disappear.

## Reconciliation
The Recipe level uses the same unique `Job + Main Planning + Status` population as the parent Main row, so Recipe totals reconcile to Main totals.
