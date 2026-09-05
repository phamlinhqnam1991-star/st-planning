# V497 — Scheduling READY uses READY Main Recipe

## Scope

Tab **Điều độ / Scheduling Board** only.

## Change

In these two columns:

- `READY · Previous Main Scheduled / Done`
- `READY · Previous Main Not Yet Scheduled`

The small breakdown shown inside each Recipe row now displays the **Recipe of the Main Planning operation currently READY**, instead of the Recipe of Previous Main.

Example display:

`→ BSAUNSLD · 005   7 Job · 102 pcs · 1,224.6 dm²`

The two READY columns are still classified by the scheduling state of the immediate Previous Main.

## Unchanged

- READY / WAIT chain logic
- Previous Main Scheduled / Done classification
- Dashboard workload totals
- Batch / Schedule
- Recipe resolver
- Auto Planning
- MAIN TOTAL compact display
