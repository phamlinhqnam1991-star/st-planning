# Planning ERP Matrix — Current

## Route

- `/planning`: Planning ERP canonical route.
- `/planning-old`: removed.

## Architecture

Planning ERP keeps the existing Candidate loading, Route Matrix status calculation, Recipe/Batch Compatibility, selection, Batch mutation and Schedule data. The ERP layer changes presentation only.

## Matrix default

Frozen identity block:
- Job
- Part / Rev
- Qty
- Surface
- Priority

Then dynamic Main Operation columns ordered from the canonical Planning mapping/order logic.

## Compact status

- `R` Ready — blue.
- `W` Wait.
- `U` Planned / unscheduled.
- `S` Scheduled.
- `P` Planned.
- `D` Done — green.
- `RN` Running.
- `H` Hold.

If a Batch has been scheduled, the secondary text in the Main Operation cell shows scheduled end as `HH:MM DD`. If it has not been scheduled, the cell keeps the Batch No.

## Batch focus mode

After the planner selects the first READY cell:
- Matrix focuses on the selected Main Operation.
- Unrelated Main Operation columns/rows are hidden for the active Batch selection.
- READY jobs in the same Main but incompatible Recipe/selected conditions remain visible in a dimmed/locked state.
- Clearing the selection or completing the Batch restores the full Matrix.

## Business logic

No separate ERP Planning engine exists. The UI continues to use canonical Planning Candidate/Route/Recipe/Batch/Schedule logic and APIs.
