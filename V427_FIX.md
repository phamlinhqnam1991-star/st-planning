# V427 — Dashboard combo chart grouped by Main Planning

## Scope
Dashboard chart presentation only. No resolver, Dashboard population, Planning Chain, Candidate, Batch, Recipe, Scheduling Board or Workload Summary logic is changed.

## Change
`Surface + Qty by Main Planning / Immediate Operation / ST Only` is simplified to one chart bucket per resolved Main Planning operation (globally, not split again by Area):

- `PLANNING_OPERATION` current-position rows are added to their resolved `standardOperation`.
- Dashboard-only `INTERMEDIATE` current-position rows are added to that same resolved `standardOperation`.
- All `ST_SCOPE_ONLY` current-position rows remain one standalone `ST ONLY` bucket because they intentionally have no Main Planning parent.
- `TOTAL / ALL ST` remains separate and unchanged.

The aggregation is done only inside `SurfaceQtyComboChart`, using the existing canonical `immediateRows` data. Therefore chart totals remain identical while duplicate Main/Immediate labels disappear.

## Expected result
Instead of labels such as:

- `CMSA / ABC [MAIN]`
- `CMSA / XYZ [IMMEDIATE]`

there is a single:

- `CMSA`

whose Surface, Qty and Job count are the sum of all current-position MAIN + ST Intermediate Jobs resolved to CMSA.
