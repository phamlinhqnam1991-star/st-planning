# V388 — Consistent Area Candidate Columns

## Scope
Planning Board Candidate presentation only. No Planning Chain, Recipe, Batch, Scheduling, Production Execution, Chemical Line Flybar, or database schema change.

## Fix
When an Area is loaded with `Main Operation = All`, every Area now guarantees the same operational Candidate context before the Area matrix:

`Job | PartDescription | CurrentGoodWIPQty | TotalSurface | LastLaborOp | NextOperation | Priority | OpenDMR | Previous Main | <Area Main Operations...>`

- Painting was only an example; the behavior applies to Chemical Line and every other configured Area.
- Main Operation columns are still derived from the existing Area -> Main mapping and Main Planning Order.
- Existing custom/saved columns remain available and are appended; a sparse legacy Area preset cannot remove the operational baseline from Area focus.
- READY focus remains `Previous Main | Selected Main | Next Main Planning` and Recipe Lock is unchanged.
