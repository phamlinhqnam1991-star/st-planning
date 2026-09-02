# Production Execution / Báo cáo sản xuất

## Purpose
Production Execution is the execution/reporting layer after Planning and Scheduling.
It tells Production what to do and records only execution facts.

## Sources
- Scheduled production work: `planning_batch` + active `planning_schedule`.
- Support work: existing Masking / Unmasking derived routing.

## Status flow
`WAITING -> ON-GOING -> DONE`

- `WAITING`: default when no report exists.
- `ON-GOING`: records Actual Start if not already present.
- `DONE`: records Actual End and keeps the first Actual Start.

Changing back to `WAITING` clears Actual Start/End so an incorrect report can be corrected.

## Separation of concerns
Production status does **not** modify:
- Schedule status;
- Batch status;
- READY / WAIT;
- Planning Chain;
- Recipe / Batch rules.

Planned Batch/Recipe/Qty/Surface/Resource/Time are not duplicated. They are always read from their existing sources.

## Data model
Migration: `068_production_execution.sql`

`production_execution` stores only:
- source identity (`BATCH`, `MASKING`, `UNMASKING`);
- execution status;
- Actual Start / Actual End;
- optional remark;
- audit timestamps.

## UI languages
The same page supports EN/VI through the existing UI-only i18n layer. EN remains the default locale.
