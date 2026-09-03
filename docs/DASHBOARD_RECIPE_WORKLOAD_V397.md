# Dashboard Recipe Workload V397

> V399 layout note: Recipe detail remains unchanged, but it is now displayed inside separate Area sections with Area KPI cards. See `DASHBOARD_AREA_WORKLOAD_V399.md`.

Dashboard hierarchy:

ST TOTAL / status KPI
→ Main Planning workload
→ Recipe No. + Recipe Name workload
→ dm² stacked chart by Main Planning
→ CAT3
→ CAT5

For every Recipe group, the Dashboard exposes Job / pcs / dm² for WAIT, READY, PLANNED, PLANNED-UNSCHEDULED, SCHEDULED and HOLD.

Recipe selection does not create a separate Dashboard rule. It reuses the live Planning Recipe engine for unbatched work and the actual Batch Recipe for planned/scheduled work.
