# V417 · Dashboard post-resolver ST Scope filter

## Scope
Only Dashboard chart 2 + Chart Calculation Audit classification is changed. Planning Board Workload Summary, Planning Chain, Batch, Recipe and Schedule are unchanged.

## Logic
The chart now follows two separate stages in this exact order:

1. Resolve Job position first: `LastOperation -> RAW NextOperation -> Current Main` from the live Planning Chain / active Bridge context. This stage does not decide ST visibility.
2. Filter the resolved list by explicit active `md_st_operation_scope` membership of the RAW `NextOperation`. Accepted scope types are `PLANNING_OPERATION`, `INTERMEDIATE`, and `ST_SCOPE_ONLY`.

For `INTERMEDIATE`, the scope row is only the ST-membership tag. The actual Previous/Next Main still has to match the active `md_intermediate_bridge_segment` + ordered `md_intermediate_bridge_operation`.

Result: generic routing steps that happen to sit between two ST Main operations are not treated as ST unless their RAW operation is explicitly in ST Scope.
