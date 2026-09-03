# V404 — Current Main resolver + Immediate Operation Dashboard

## Logic
- Dashboard and Planning Board use the same Current Main already materialized by `syncPlanningChains`.
- Resolver input remains `LastOperation + RAW NextOperation`; Bridge is evaluated before AllOperation fallback/direct Next Main rescue.
- A RAW NextOperation can be an active Planning Operation or an active Bridge Intermediate, but the Job must have a live Current Main row.
- `ST_SCOPE_ONLY` remains excluded.
- Dashboard Immediate Operation is exactly `open_job_current.next_operation` and is grouped under the resolved Current Main.

Example: `BSAUNSLD -> INS-AND -> MSKG-TC -> PPRSLVT(PRIMER)` means Jobs currently at `INS-AND`, `MSKG-TC`, or `PPRSLVT` are shown as `PRIMER / <RAW NextOperation>` when the canonical Current Main is PRIMER.

## Dashboard charts
- Both charts moved to the top of Dashboard.
- Surface workload chart remains viewport-fit without horizontal scroll.
- Surface + Qty combo: left axis dm², right axis pcs fixed max 10,000.
- dm² and pcs labels render directly at every bar/line point.
- Final `TOTAL / ALL ST` bar/point shows total dm² and pcs.

No migration. Planning Chain/Batch/Recipe/Schedule business state is unchanged.
