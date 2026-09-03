# Dashboard ST Workload V396

> V399 layout note: the workload logic below remains valid, but Main Planning workload is now rendered as one KPI + table section per Area and Dashboard tables no longer use vertical max-height scrollers. See `DASHBOARD_AREA_WORKLOAD_V399.md`.

## Flow

`open_job_current + planning_job_operation + planning_batch_job + planning_batch + planning_schedule`
`→ unique ST total`
`→ status workload`
`→ Main Planning summary`
`→ stacked dm² chart`
`→ CAT3 / CAT5 detailed lists`

## Status buckets

1. HOLD: exact Job/Main is held and has no active Batch.
2. SCHEDULED: active non-cancelled Schedule exists for the active Batch.
3. PLANNED-UNSCHEDULED: active Batch exists but no active Schedule.
4. PLANNED: Planning Chain row is PLANNED but no active Batch is found (legacy/recovery visibility).
5. READY: Planning Chain row is ELIGIBLE.
6. WAIT: Planning Chain row is LOCKED.

The precedence above prevents one Job/Main occurrence from being classified into two buckets.

## Counting

ST TOTAL counts each open ST Job once. Main/status metrics de-duplicate the same Job within the same Main + status bucket, matching the Planning Workload Summary behavior. Repeated Main occurrences do not multiply pcs/dm² inside the same bucket.

## Priority lists

CAT3 then CAT5 list all open Jobs in that priority class. Each row includes Job, Part/Revision, description, Qty, dm², Next Operation, current/focus Planning Main, latest Batch Main/No/status and latest active Schedule resource/start/end.

No write operation is exposed from this Dashboard.

## V403 chart note

- `Surface Workload by Main Planning` remains a status-stacked dm² chart but now fits the viewport without a horizontal scrollbar.
- Added `Surface + Qty by Main Planning / Immediate Operation`:
  - X = Main Planning + `planning_job_operation.source_operation_code` (Immediate Operation)
  - Column / left Y = total dm²
  - Line / right Y = total pcs
- This is a read-only presentation/aggregation extension over the same strict RAW ST population.
