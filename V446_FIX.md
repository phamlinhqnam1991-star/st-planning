# V446 — Production Execution Job-level / Shift / Day Reload

- Keep canonical production day: 06:00 selected date through before 06:00 next date.
- Previous / Next / Today remount Production Execution dataset immediately; no F5.
- Show Job details for every Area, including Chemical Line and Painting.
- Remove parent Status/Report column; report WAITING / ON-GOING / DONE on each Job.
- Add Job Shift: Shift 1 06:00-13:59, Shift 2 14:00-21:59, Shift 3 22:00-05:59.
- Move planned Target immediately before Actual Start/End.
- Remove inner vertical max-height scrolling from Production area tables; use page vertical scroll.
- Add production_execution_job via migration 074; keep production_execution as aggregate compatibility summary.
- No changes to Planning Chain, Batch, Recipe, Schedule, Previous Main lock, Chemical Line proposal/capacity, or production-day ownership.
