# v291 - VIEW ST + Dynamic Main Operation Columns

## Logic

- `VIEW CÔNG ĐOẠN ST` only filters Candidate rows by `open_job_current.next_operation` (RAW NextOperation).
- Main Operation / Route Matrix columns are derived from `AllOperation` of the Candidate Jobs currently loaded and matching the VIEW.
- AllOperation is standardized with the same deterministic source-operation mapping winner used by `syncPlanningChains()`.
- `PIONBL` remains source trace only and is not rendered as a Main Planning column.
- PRIMER / TOPCOAT occurrence and HE-BAKE special standardization follow the Planning Chain rules.
- Dynamic Main Operation columns are unique and ordered by Main Planning Order (fallback to planning scope order).
- Main Operation columns are automatic; the `Columns` picker only manages Planning/info and All Open Job columns. Saved views no longer persist dynamic Route/Main columns.

## No business logic changes

No changes to Planning Chain status, Recipe, Batch, Schedule, READY handoff, Candidate SQL, or database schema.

## Database

No migration is required for v291.
