# V515 · Masking Time Column source fix

## Scope
Fix only the empty Masking Time Column dropdown in `/masking-time-estimate-config`.

## Root cause
V514 sourced the dropdown only from `md_open_job_column_value`. A real All Open Job header could therefore be absent when the dictionary had not been rebuilt yet or when that header had no current non-empty unique values.

## Fix
- Source columns = union of current All Open Job `source_data` headers + normalized `open_job_current` columns + active Open Job Column Values.
- Read current source headers from one most-recent open-job snapshot row to avoid scanning every Job on each config load.
- Sort `MASKING_TIME`, `MSKG`, `MASK` columns first.
- Default search is empty so the dropdown always exposes the full list.
- Save Mapping validates against the same real All Open Job sources.
- No migration required.

## Unchanged
Masking Estimate formula, manpower logic, READY/WAIT, Planning Chain, Batch, Scheduling, Production, Internal Chat and Global Realtime.
