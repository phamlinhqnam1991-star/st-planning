# v296 — Auto Intermediate Bridge Segments

`INTERMEDIATE` is now only a raw-operation classification. Previous/Next Main are no longer entered per Operation Code.

The system scans `md_st_routing` (`ST Routing Chain · Standardized`) by `routing_code, seq`, identifies consecutive Planning Mains, and collects all ordered `INTERMEDIATE` operations between them.

Example:

`CPBILP -> UNMSKG -> MSKG-SP -> PIONBL -> V_A-SHPN`

becomes:

`CPBILP -> [UNMSKG > MSKG-SP] -> V_A-SHPN`

`PIONBL` and `ST_SCOPE_ONLY` are trace-only and are excluded from the segment.

Identity is `Previous Main + ordered Intermediate signature + Next Main`. The same Intermediate code may belong to more than one segment, and repeated occurrences inside one segment are preserved.

Runtime Planning uses the auto segment to anchor an Intermediate `NextOperation` to the real canonical `planning_job_operation` of its Next Main. No Planning row / Batch / Schedule is created for Intermediate operations.
