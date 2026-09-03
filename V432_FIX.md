# V432 · Schedule Previous Main physical lock

## Scope
Only when an existing Planning Batch is **added** to Board Điều Độ (`POST /api/schedule`).

## Rule
For every Job in the Batch:

1. If there is no immediate Previous Main, this is the first Main and scheduling is allowed.
2. If there is an immediate Previous Main, that exact predecessor occurrence must already have a non-cancelled `planning_schedule` row with `planned_end`.
3. Current Main `planned_start` must be **>= Previous Main `planned_end`**.
4. Any failing Job rejects the whole schedule insert transaction.

Occurrence matching prefers durable `previous_*_snapshot` / `source_seq_snapshot` identity and falls back to the live Planning Chain only when the snapshot is missing.

## Boundaries
- Planning Chain READY/WAIT is unchanged. READY may still open when Previous Main has a Batch but is unscheduled.
- `PATCH /api/schedule` Edit/Move is unchanged because the approved scope is add-only.
- Trial Day Shift is unchanged.
- Manual empty-grid Batch with no Jobs has no Planning predecessor to validate.
- Chemical Line proposal/simulation is unchanged. Existing Chemical capacity/proposal logic runs first; V432 validates only the final `effectiveStart` before schedule INSERT.
- No database migration.
