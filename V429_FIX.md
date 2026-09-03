# V429 — CAT3/CAT5 sort directly by RAW NextOperation Order

## Scope
Dashboard CAT3 and CAT5 tables only. No change to Dashboard population, Current Main resolver, Planning Chain, Candidate, Batch, Recipe, or Scheduling.

## Logic
Priority table presentation order is now:

1. RAW NextOperation Order = `md_operation.planning_sort_order`
2. Main Planning Order only when the RAW operation has no explicit order
3. RAW NextOperation code
4. Job number

Operations with an explicit NextOperation Order always appear before operations with no configured order.

## Reason
CAT3/CAT5 are current-position lists. The planner requested the rows to follow the actual RAW NextOperation Order directly rather than grouping by resolved Main first.
