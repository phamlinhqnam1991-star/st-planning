# v289 — Batch creation must not make Candidate Jobs disappear

## Symptom

After creating an UNSCHEDULED/PLANNED Batch from Planning Board, selected Jobs appeared to disappear from the current Candidate page even though the Batch and `planning_batch_job` rows existed.

## Root causes

1. Candidate anchor selection gave the exact raw `open_job_current.next_operation` row priority only while the Planning row was `ELIGIBLE`. Creating a Batch changes that row to `PLANNED`, so another `ELIGIBLE` Main of the same Job could become the representative Candidate row.
2. Server pagination sorted all `ELIGIBLE` rows before all `PLANNED` rows. With hundreds of Candidates, a Job changed from `ELIGIBLE` to `PLANNED` was moved to a later page and looked deleted.

## Canonical behaviour

- Creating a Batch changes only the selected Planning occurrence from `ELIGIBLE` to `PLANNED`.
- It does **not** unlock the next Main. Schedule remains the handoff gate.
- If a Planning occurrence exactly matches raw `NextOperation`, it remains the representative Candidate whether it is `ELIGIBLE` or `PLANNED`.
- Candidate server pagination must use keys that do not change when Batch membership changes:
  1. raw NextOperation planning order;
  2. raw NextOperation;
  3. Job priority;
  4. Job number / source sequence / row id for stability.
- Planning status is display/state data, not a leading pagination sort key.

## No database migration

v289 changes Candidate selection/order only. Batch, Schedule, Planning Chain and Recipe data models are unchanged.
