# V475 — Fix Planning Board READY drill-down after V473 DONE-progress classification

## Problem
Planning Board Workload Summary correctly counted current READY Jobs whose immediate Previous Main was already behind physical progress/DONE, even when that previous Main had no historical Batch/Schedule. However, clicking `READY · Previous Main Scheduled / Done` could show an empty Candidate list.

## Root cause
The server workload engine (V473) classified a current READY occurrence as `READY_PREV_SCHEDULED` when either:
1. Previous Main had a real Schedule; or
2. the READY occurrence was the canonical current Main, meaning the Previous Main was already behind physical progress/DONE.

The client drill-down filter only checked `previous.schedule_id && previous.planned_start`, so case (2) was counted in the summary but then filtered out from the Candidate table.

## Fix
`planning-board-client.tsx` now mirrors the canonical V473 rule exactly:
- no Previous Main => `UNSCHEDULED / START`
- Previous Main has Schedule => `SCHEDULED / Done`
- otherwise, if the READY Route occurrence's `planning_job_operation_id` equals the current Candidate row `id`, classify it as `SCHEDULED / Done` because previous physical progress is already behind the current Main
- all remaining plan-ahead READY rows => `UNSCHEDULED / START`

No Planning Chain, Batch, Recipe, Scheduling, Production, or database logic was changed.
