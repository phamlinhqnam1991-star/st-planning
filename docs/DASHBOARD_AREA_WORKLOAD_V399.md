# Dashboard Area Workload · V399

Canonical flow:

`All Open Job RAW NextOperation -> Visible ST RAW gate -> Planning Chain / Batch / Schedule -> Area -> Main Planning -> Recipe -> status workload`

Dashboard keeps the global ST summary at the top, then splits Main Planning Workload Summary into independent Area sections.

For every Area:
1. Area TOTAL card counts each represented open Job once.
2. WAIT / READY / PLANNED / PLANNED-UNSCHEDULED / SCHEDULED / HOLD cards aggregate Job × Main Planning workload in that Area.
3. The table lists only Main Planning Operations mapped to that Area.
4. Each Main Planning row expands to Recipe No. + Recipe Name rows using the existing V397 Recipe resolution.
5. Table rows are fully rendered without a vertical table viewport.

CAT3/CAT5 also render all rows without a vertical table viewport. Horizontal scrolling is still allowed for wide tables.

No database migration is required.
