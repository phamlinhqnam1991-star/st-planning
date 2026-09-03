# V420 — Dashboard Intermediate ST visibility

## Scope
Dashboard Chart 2 + Chart Calculation Audit only. No Planning Chain / Candidate / Batch / Recipe / Schedule behavior is changed.

## Root cause
V419 resolved Current Main from the live Planning Chain, then re-required an exact Bridge match before accepting an ST Scope `INTERMEDIATE`. That duplicated part of the resolver and could hide valid Intermediate Dashboard-ST jobs even though Current Main had already been positioned by `syncPlanningChains`.

## Final logic
1. Read open Job and the first active live Planning Chain row (`Current Main`). The chain suffix has already been positioned by the canonical `LastOperation + RAW NextOperation` resolver.
2. Compute `Bridge Role` only for audit/diagnostics against the resolved Current Main. For Intermediate, match RAW NextOperation to any active Bridge whose `next_main_operation = Current Main`; do not re-check exact LastOperation adjacency.
3. Join RAW NextOperation to active `md_st_operation_scope`.
4. Chart type is determined by ST Scope after resolution:
   - `PLANNING_OPERATION` -> MAIN
   - `INTERMEDIATE` -> IMMEDIATE
   - `ST_SCOPE_ONLY` -> ST ONLY
5. `INTERMEDIATE` remains Dashboard-only classification and never triggers Planning Chain sync.

## Result
An operation explicitly marked `INTERMEDIATE Dashboard ST` now appears in Chart 2 / Audit whenever an open Job currently has that RAW NextOperation and Current Main has been resolved.
