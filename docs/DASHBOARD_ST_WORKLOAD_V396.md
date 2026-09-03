# Dashboard ST Workload V396

> Latest V404 note: Dashboard population and Immediate workload now follow the Planning Board Current Main resolver. RAW NextOperation may be a Planning Operation or an active Bridge Intermediate, but the Job must have a live Current Main row. ST_SCOPE_ONLY remains excluded. Main Planning workload is rendered per Area without vertical table scrollers.

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
4. READY: Planning Chain row is ELIGIBLE.
5. WAIT: Planning Chain row is LOCKED.

Internal `planning_job_operation.status=PLANNED` without an active Schedule is normalized into the Dashboard `PLANNED-UNSCHEDULED` bucket; PLANNED is not a separate Dashboard status.

The precedence above prevents one Job/Main occurrence from being classified into two buckets.

## Counting

ST TOTAL counts each open ST Job once. Main/status metrics de-duplicate the same Job within the same Main + status bucket, matching the Planning Workload Summary behavior. Repeated Main occurrences do not multiply pcs/dm² inside the same bucket.

## Priority lists

CAT3 then CAT5 list all open Jobs in that priority class. Each row includes Job, Part/Revision, description, Qty, dm², Next Operation, current/focus Planning Main, latest Batch Main/No/status and latest active Schedule resource/start/end.

No write operation is exposed from this Dashboard.

## V404 chart note

- Both charts render at the top of Dashboard.
- `Surface Workload by Main Planning` remains status-stacked dm² and fits the viewport without horizontal scrolling.
- `Surface + Qty by Main Planning / Immediate Operation` uses `Current Main / RAW NextOperation`:
  - Immediate Operation = `open_job_current.next_operation`
  - Main Planning = first active Planning Chain row already resolved by Planning Board
  - Column / left Y = dm²
  - Line / right Y = pcs, fixed max 10,000
  - dm²/pcs value labels render at every bar/point
  - final `TOTAL / ALL ST` group shows total dm² and pcs
- `planning_job_operation.source_operation_code` is no longer used to identify Immediate Operation.
