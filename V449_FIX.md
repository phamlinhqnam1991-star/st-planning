# V449 — Production Report canonical date ownership hardening

Production Execution now assigns every scheduled row by one canonical predicate only:

`(((planned_start AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '6 hours')::date) = selected production date`

Therefore a local start at `04/09 05:50` belongs to production date `03/09`, while `05/09 05:50` belongs to production date `04/09`.

The same predicate is applied to the scheduled Masking / Unmasking resolver used by Production Execution.

The Target column now shows the calendar date when the planned timestamp falls on the next calendar day (for example `05/09 05:50`) so an after-midnight row cannot be mistaken for `04/09 05:50`.

No Planning Chain, Batch, Recipe, Schedule, Chemical Line proposal/capacity, execution status, or report grouping logic changed.
