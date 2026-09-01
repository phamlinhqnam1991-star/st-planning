# v361 · Masking / Unmasking Physical Main Occurrence Fix

- Fix case `MSKG-AND -> BSAUNSLD` and similar support steps still showing `Masking 0` in v360.
- Root cause: Planning Chain `source_seq` comes from Job AllOperation, while Routing Detail contains additional Intermediate/Masking/Unmasking operations. Even normalizing 10/20/30 to 1/2/3 cannot make the two sequences equivalent.
- The Masking/Unmasking resolver now rebuilds Main Planning occurrences directly on `md_routing_detailed` using the same active ST Operation Mapping, Planning Scope, PRIMER/TOPCOAT occurrence rules, and HE-BAKE contextual rule as Planning Chain.
- Each Routing Main gets the same `operation_instance_key` shape (`BSAUNSLD#1`, `PRIMER#1`, `PRIMER2#1`, `TOPCOAT1#1`, ...).
- Batch Job `planning_job_operation.operation_instance_key` is joined to that exact physical Routing Main.
- Support operations are then selected strictly between the previous physical Routing Main and current physical Routing Main.
- Only actual raw `operation_code` containing `MSKG` is support: `UNMSKG*` = Unmasking; other `*MSKG*` = Masking. A Main Planning row such as `FMSKG-CM` is excluded because it is itself a Routing Main.
- No DB migration required. READY/WAIT, Recipe, Batch Compatibility, Process Time and Scheduling logic are unchanged.
