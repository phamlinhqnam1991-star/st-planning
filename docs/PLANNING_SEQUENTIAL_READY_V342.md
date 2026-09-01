# Planning Sequential READY v342

Planning Board no longer opens every future Main Planning operation as READY.

Rules:

1. The first unplanned Main in the active physical chain is ELIGIBLE / READY.
2. Later unplanned Main operations are LOCKED / WAIT.
3. A non-cancelled Batch is a valid handoff whether it is still unscheduled or already scheduled.
4. After a READY Main is added to a Batch, only the immediate next unplanned Main becomes READY.
5. Physical progress (LastOperation / NextOperation) moves the chain anchor. Main operations before the anchor display DONE when there is no stronger Batch/Schedule history.
6. Existing historical PLANNED rows are preserved, but old out-of-sequence plan-ahead history cannot unlock additional future Main operations across an earlier unplanned gap.

Expected sequence:

READY -> WAIT -> WAIT
PLANNED/UNSCHEDULED -> READY -> WAIT
PLANNED/SCHEDULED -> PLANNED/UNSCHEDULED -> READY
