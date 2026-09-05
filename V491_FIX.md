# V491 — Scheduling Workload Compact READY / WAIT Presentation

## Scope
Only the **ST Workload Summary · By Area** presentation on the Scheduling Board is changed. Planning chain, READY/WAIT classifier, Batch, Recipe, Schedule and Production logic are not changed.

## Changes

1. READY cards use the same flat card form as `WAIT · Next Main`.
   - `READY · Previous Main Scheduled / Done`: darker green tone.
   - `READY · Previous Main Not Yet Scheduled`: lighter green tone.
   - Removed the heavy dark header / left accent-bar look.

2. Scheduling workload columns are reduced to:
   - Main Operation
   - Recipe No
   - Recipe Name
   - READY · Previous Main Scheduled / Done
   - READY · Previous Main Not Yet Scheduled
   - WAIT · Next Main
   - WAIT · Future Mains
   - HOLD

   `PLANNED-UNSCHEDULED`, `SCHEDULED`, and `Total` are hidden from this Scheduling summary only. Their underlying data and scheduling behavior are unchanged.

3. `WAIT · Next Main` breakdown now shows:
   - nearest Previous Main
   - Job count
   - pcs
   - dm²

   Example: `← BSAUNSLD   53 Job · 397 pcs · 8,285.39 dm²`.

4. Chemical Line / Flybar keeps recipe-only rows and now also shows the same `WAIT · Next Main` breakdown.

5. Logic & Guide and New User Training are synchronized to V491.

## Database
No SQL migration.
