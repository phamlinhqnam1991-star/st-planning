# V418 · Bridge Role + explicit ST Scope for Intermediate

## Decision

Bridge resolution and ST Scope membership are two independent layers.

1. Resolve each open Job first with the existing position logic: `LastOperation → RAW NextOperation → Current Main`.
2. Active `md_intermediate_bridge_segment` + `md_intermediate_bridge_operation` determines whether the RAW operation is a Bridge `INTERMEDIATE` and which Main it belongs to.
3. `md_st_operation_scope` determines whether the RAW operation is actually in Surface Treatment scope.

An Immediate operation is counted by the Dashboard chart only when both are true:

- Bridge Role = `INTERMEDIATE` in the resolved active Bridge context; and
- ST Scope Type = `INTERMEDIATE`.

`INTERMEDIATE` in ST Scope is a membership tag only. It does not create a Main Planning row, Source → Main mapping, Batch or Schedule, and it does not define Previous/Next Main.

## ST Operation Flow UI

The Operation list now shows all Bridge Intermediate operations and distinguishes:

- `Bridge Intermediate` — inferred by Bridge, not yet marked as ST.
- `Intermediate · ST` — inferred by Bridge and explicitly tagged `INTERMEDIATE` in ST Scope.

The configuration form now supports three explicit ST Scope types:

- `PLANNING_OPERATION`
- `INTERMEDIATE`
- `ST_SCOPE_ONLY`

For a Bridge Intermediate, `Đánh dấu ST` stores only `md_st_operation_scope.operation_type='INTERMEDIATE'`. Removing that tag leaves Auto/Manual Bridge and Planning Chain untouched.

## Dashboard audit

`Chart Calculation Audit · Job Detail` now exposes both independent dimensions:

- `Bridge Role`
- `ST Scope Type`

This makes it possible to verify that the resolver result is correct before the ST Scope gate is applied.

## Unchanged

Planning Board Candidate logic, Planning Chain resolver, Auto/Manual Bridge generation, Batch, Recipe and Schedule are not redesigned by V418.
