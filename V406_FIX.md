# V406 — Surface-first workload presentation

## Agreed change
Where workload UI previously emphasized Job count, emphasize Surface dm² instead.

## Dashboard
- KPI cards: primary = Surface dm²; secondary = pcs, Job.
- Area KPI cards: same order.
- Main Planning -> Recipe metric cells: same order.
- CAT3/CAT5 header summary: dm² first, then pcs, Jobs.
- CAT3/CAT5 table metric columns: dm² before Qty; Job remains the identity column.

## Planning Board
- Workload Summary READY / WAIT / HOLD / TOTAL KPI: Surface dm² first.
- Workload drill cells and Main totals: Surface dm² first; pcs and Job secondary.

## Unchanged
No workload SQL, Current Main / Bridge resolver, status, Recipe, Batch, Schedule or Production logic changed. No migration required.
