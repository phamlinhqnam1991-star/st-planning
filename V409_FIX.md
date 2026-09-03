# V409 — Dashboard all RAW NextOperation + canonical ST resolver

## Corrected population
Dashboard now starts from **all** `open_job_current.is_open=true` Jobs and reads each physical RAW `next_operation`. It no longer requires RAW NextOperation to directly be `md_st_operation_scope.operation_type=PLANNING_OPERATION`.

For each Job, Dashboard uses the same context-aware membership rule already used by Planning Board Workload Summary:

`LastOperation + RAW NextOperation + live Current Main`

Keep the Job when either:
- RAW NextOperation is a direct active ST Planning Operation that resolves to the live Current Main; or
- RAW NextOperation is a valid ordered Intermediate in an Active Bridge whose target Main equals the live Current Main.

Exclude:
- unrelated/non-ST flows;
- `ST_SCOPE_ONLY`;
- Bridge codes that do not match the Job's actual LastOperation -> NextOperation pair / Current Main context.

## Applied to
- ST TOTAL unique Jobs / pcs / dm²
- WAIT / READY / PLANNED-UNSCHEDULED / SCHEDULED / HOLD workload
- Area -> Main -> Recipe summary
- CAT3 / CAT5 lists
- Chart audit Job table
- Chart input population (chart formula itself is unchanged)

No database migration. Planning Chain/Batch/Recipe/Schedule logic is unchanged.
