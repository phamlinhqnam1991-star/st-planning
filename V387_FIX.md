# V387 — Job/Main Hold / Release Hold

## Scope

Adds planner-controlled Hold at the exact Job + Main Planning occurrence. It does not change Batch/Schedule Hold semantics.

## Database

Run `supabase/migrations/071_job_main_operation_hold.sql`.

Fields added to `planning_job_operation`:

- `is_hold`
- `hold_reason`
- `hold_note`
- `held_at`
- `held_by`

## Planning Board

READY/WAIT unbatched cells have a small `H` action. Held cells show status `H` and a release action. The HOLD filter helps find current held Candidate Jobs.

## Safety

Held Job/Main operations cannot be added to a Batch. The server validates `is_hold` again inside the Batch transaction. Hold survives All Open Job incremental imports because chain upsert does not overwrite Hold metadata. Release runs `syncPlanningChains` for that Job only.
