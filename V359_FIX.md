# v359 - Masking / Unmasking Planning by Schedule Date

- Main grouping uses canonical `planning_job_operation` occurrence; no duplicate PRIMER/TOPCOAT occurrence logic.
- PRIMER UI: PRIMER1 / PRIMER2 / PRIMER3; TOPCOAT: TOPCOAT1 / TOPCOAT2 even when raw source codes differ.
- Support boundary: strictly after Previous Main source seq and before Current Main source seq.
- Only raw operation codes containing `MSKG` are support operations.
- `UNMSKG*` = Unmasking; other `*MSKG*` = Masking.
- Planning Operation source rows are excluded from support classification.
- Planner-facing support value uses `operation_detail_code`.
- Default view is selected `planning_schedule.schedule_date`.
- Separate Unscheduled view for Main Batch without active schedule.
- Batch/Recipe/Process/Start/End/Resource all come from Current Main Batch/Schedule.
- No new database table or migration.
