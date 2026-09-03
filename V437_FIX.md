# V437 — Audit & optimize Masking/Unmasking + Production Execution load

## Audit findings

### 1. Masking / Unmasking
The dominant cost was `loadMaskingUnmaskingPlan()`: its routing CTE started from **all active rows of `md_routing_detailed`**, calculated `lag/lead`, ST mapping, PRIMER/TOPCOAT occurrence numbering and Main identity for the entire routing master, and only near the end filtered to the requested scheduled day / unscheduled view.

That means page cost grew with the full Master Routing size, not with the number of Jobs being viewed.

### 2. Production Execution
Production Execution calls the same Masking/Unmasking resolver, so it paid the same whole-routing-master cost. It also aggregated Batch Job numbers once in a per-Batch lateral query and then loaded Batch Job detail again, duplicating work.

### 3. Secondary costs observed (not changed in V437)
Both pages are `force-dynamic`, which is correct for live operational data but means every navigation executes fresh server queries. Production Execution can also render many Job-detail rows for non-Chemical/non-Paint areas. These are secondary to the routing-master scan; V437 deliberately fixes the shared database bottleneck first without changing the current UI behavior.

## V437 changes
- Filter candidate Batch/Job rows by `scheduled/unscheduled + schedule_date` before routing reconstruction.
- Build the candidate Part/Revision set from those rows.
- Run the existing physical Routing Main + occurrence resolver only for those Part/Revision pairs.
- Replace correlated Previous Main max lookup with `lag(source_seq)` over the already narrowed Routing Main set.
- Production Execution removes the duplicate `jobinfo array_agg` and derives `jobNumbers` from the already loaded Batch Job detail list.
- Add migration 072 indexes for normalized active Routing Detail Part/Revision/source_seq and Batch Job read patterns.

## Business logic deliberately unchanged
- Previous Main → Current Main physical boundary.
- PRIMER1/2/3 and TOPCOAT1/2 occurrence logic.
- MSKG / UNMSKG classification.
- Planning Chain / READY / WAIT.
- Batch / Recipe / Schedule logic.
- Production WAITING / ON-GOING / DONE semantics.
