# Planning Board v344 — Remove Current Main / hide planning-order fields

## UI changes
- Removed the synthetic `Current Main` column from Candidate Jobs.
- Removed Current Main header/cell/filter/freeze-pane integration and obsolete CSS.
- Hidden source columns named `Main Planning Order`, `Planning Order`, or `Planning Sort Order` from Planning Board column selection/display.
- Saved presets containing the old `__current_main` filter are sanitized when loaded.

## What is intentionally unchanged
- `md_operation_master.planning_sort_order` remains in configuration/internal planning logic because sequential Previous Main -> READY/WAIT and route-chain ordering still depend on it.
- RAW `NextOperation` sorting continues to use the Operation Code sort order already returned as `next_operation_planning_sort_order`.

No database migration is required.
