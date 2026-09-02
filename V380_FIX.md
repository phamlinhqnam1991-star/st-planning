# V380 — Planning Matrix Previous Main + Compact Rows + Zoom

## Scope
Only Planning Board matrix presentation and its read-only previous-route context were changed. No Planning Chain, Batch, Recipe, Schedule, Production Execution, or database write logic changed.

## Changes
- Batch Selection Mode keeps the selected READY Main Operation and the union of immediate Previous Main Planning operations for visible Jobs.
- Previous Main columns are marked `PREV`, are read-only, and show Batch No plus scheduled start in `HH:MM DD-MMM` when available.
- Unrelated Main Planning columns remain hidden while the Batch scope is active.
- Compact density row height is reduced.
- Added matrix-only zoom controls from 70% to 130%, persisted in localStorage; 100% resets the table zoom.
- Freeze Pane offset calculation compensates for table zoom.

## Example
If 10 Jobs are READY at PRIMER and their immediate previous Main Planning is BSASLD for 5 Jobs and BSAUNSLD for 5 Jobs, the focused matrix shows `BSASLD PREV`, `BSAUNSLD PREV`, and `PRIMER`. Each PREV cell can show the prior Batch and scheduled start.
