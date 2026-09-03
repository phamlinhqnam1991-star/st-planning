# V416 · Dashboard Immediate RAW NextOperation ST gate

## Scope
Only Dashboard chart 2 + its Chart Calculation Audit classification is changed. Planning Board Workload Summary and the canonical Planning-chain population remain unchanged.

## Fix
An operation is shown as `INTERMEDIATE` on Dashboard chart 2 only when BOTH are true:

1. `LastOperation -> RAW NextOperation -> Current Main` matches an active auto Intermediate Bridge segment.
2. The same RAW `NextOperation` exists in active `md_st_operation_scope` (explicit ST membership).

This removes non-ST raw routing steps such as generic DEBUR / INSMA / MRKG-LA-style steps when they merely happen to sit physically between two ST Main operations.

`PLANNING_OPERATION` and `ST_SCOPE_ONLY` behavior is unchanged. No Batch, Recipe, Planning Chain, Schedule, Workload Summary, schema, or migration change.
