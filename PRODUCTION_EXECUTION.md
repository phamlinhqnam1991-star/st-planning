# Production Execution / Báo cáo sản xuất

## Purpose
Production Execution is the execution/reporting layer after Planning and Scheduling. It tells Production what to do and records only execution facts.

## Sources
- Scheduled production work: `planning_batch` + active `planning_schedule`.
- Support work: existing Masking / Unmasking derived routing.

## Production Day
Production date D owns every plan with:

`06:00 D <= planned_start < 06:00 D+1`

Start 00:00-05:59 on the next calendar date still belongs to Production Date D. Ownership is based on planned start; planned end may extend later without changing the production date.

## V447 report groups
The Production Execution page has sub-tabs for:
- Chemical Line.
- Shot Peening: Automatic + Manual.
- Masking & Unmasking.
- Painting.
- Sirius Cleaning.
- Blasting: Manual + Auto.
- Plating: Plating + He-Bake.
- Passivation / Brightening.

An All view is retained. Other appears only when an unmapped production work item exists, so no work is silently hidden. Each physical area panel has a distinct header accent color.

## Reporting granularity
### LINE mode — Chemical Line + Painting
Chemical Line and Painting report `WAITING -> ON-GOING -> DONE` directly on each scheduled Batch row. Job detail is not loaded/rendered for these two report groups. Status and Actual Start/End live in the existing parent `production_execution` row.

### JOB mode — all other production groups
Each Job has independent `WAITING -> ON-GOING -> DONE` in `production_execution_job`.
- `WAITING`: default when no Job report exists.
- `ON-GOING`: records that Job's Actual Start if not already present.
- `DONE`: records that Job's Actual End and keeps the first Actual Start.
- Changing a Job back to `WAITING` clears that Job's Actual Start/End so an incorrect report can be corrected.

The parent `production_execution` row remains the aggregate compatibility summary for existing Dashboard/AI reads.

## Shift
Job-level rows show:
- Shift 1: 06:00-13:59.
- Shift 2: 14:00-21:59.
- Shift 3: 22:00-05:59 next day.

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

V447 requires no new SQL migration. It reuses `production_execution` for LINE reporting and `production_execution_job` for JOB reporting.

## Page behavior
- Previous / Next / Today reload the selected production date without browser F5.
- Page-level vertical scrolling is used; area tables do not get inner vertical scrollbars.
- Horizontal scrolling remains available for wide tables.
- The same page supports EN/VI through the existing UI-only i18n layer.
