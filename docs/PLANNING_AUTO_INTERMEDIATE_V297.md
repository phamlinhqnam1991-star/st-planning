# v297 — Auto Intermediate from Main Planning + ST Routing

## Source of truth

Planner no longer marks raw operations as `INTERMEDIATE`.

The system knows Main Planning operations from the existing Source → Main mapping
and `md_planning_operation_scope`. It rebuilds **ST Routing Chain · Standardized**
using the full raw routing span between the first and last Main Planning occurrence.

For each `routing_code`, rows are ordered by `seq`. Between each pair of consecutive
Main Planning occurrences, every raw `operation_code` is inferred as Intermediate,
except:

- `PIONBL` (skip rule),
- explicit `ST_SCOPE_ONLY`.

## Segment identity

A bridge variant is unique by:

`Previous Main + ordered Intermediate Operations + Next Main`.

Repeated operations are preserved. The same operation code may belong to multiple
segments.

## UI

ST Operation Flow now configures only:

- `PLANNING_OPERATION`,
- `ST_SCOPE_ONLY`.

Auto-inferred Intermediate rows are read-only and shown as `AUTO INTERMEDIATE`.
The button **Rebuild Auto Bridge Segments** rebuilds ST Routing, Bridge Segments and
Planning Chain without deleting Batch/Schedule history.
