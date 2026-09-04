# Production Execution / Báo cáo sản xuất

## Purpose
Production Execution is the execution/reporting layer after Planning and Scheduling.
It tells Production what to do and records only execution facts.

## Sources
- Scheduled production work: `planning_batch` + active `planning_schedule`.
- Support work: existing Masking / Unmasking derived routing.

## Status flow · V446 Job-level
`WAITING -> ON-GOING -> DONE` is reported independently for every Job in the work item.

- `WAITING`: default when no Job report exists.
- `ON-GOING`: records that Job's Actual Start if not already present.
- `DONE`: records that Job's Actual End and keeps the first Actual Start.
- Changing a Job back to `WAITING` clears that Job's Actual Start/End so an incorrect report can be corrected.

The parent `production_execution` status is only an aggregate compatibility summary for existing Dashboard/AI reads; Production users report at Job rows.

## Separation of concerns
Production status does **not** modify:
- Schedule status;
- Batch status;
- READY / WAIT;
- Planning Chain;
- Recipe / Batch rules.

Planned Batch/Recipe/Qty/Surface/Resource/Time are not duplicated. They are always read from their existing sources.

## Data model
Migrations: `068_production_execution.sql` + `074_production_execution_job_level.sql`.

`production_execution_job` stores each Job report using source identity + `planning_job_operation_id`, with status, Actual Start/End, optional remark and audit timestamps. `production_execution` remains the work-item aggregate summary.

## Production day and Shift
- Production date D owns every plan with `06:00 D <= planned_start < 06:00 D+1`.
- Shift 1: 06:00-13:59.
- Shift 2: 14:00-21:59.
- Shift 3: 22:00-05:59 next day.
- Date navigation reloads the selected production day immediately; no browser F5 is required.
- Every Area shows Job detail rows; page-level vertical scrolling replaces per-table inner vertical scrolling.

## UI languages
The same page supports EN/VI through the existing UI-only i18n layer. EN remains the default locale.
