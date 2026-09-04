# V453 · Combined Preparation Job view

## Scope
- Masking / Unmasking Planning: one row per Job + Batch + Main Operation.
- Production Execution report: same combined Job presentation.
- Display order inside one Job: Unmasking first, then Masking.

## Data / business logic
- No Batch, Recipe, READY/WAIT, Schedule or Auto Planning logic change.
- Strict Main support configuration from V452 remains unchanged.
- Underlying Masking and Unmasking operations are not merged or deleted; only presentation is grouped.
- Production Execution still stores status / Actual Start / Actual End / Remark independently for each support type and Job.

## UI
- Preparation Jobs count = unique Job per Batch/Main, not Masking count + Unmasking count.
- Each preparation row lists 1..n support operations in physical execution order: UNMASKING → MASKING.
- Production report shows one Job row with two (or more) step lines and independent reporting controls per support step.
