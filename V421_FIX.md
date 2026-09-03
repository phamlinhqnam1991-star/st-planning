# V421 — Canonical Dashboard ST population for all cards / tables / charts

## User-approved scope
Apply the same Dashboard ST population used by the corrected Main / Immediate / ST Only chart to **every component on `/dashboard` only**. Do not change Planning Chain, Candidate, Batch, Recipe, Schedule, Auto Planning, All Open Jobs visibility, or Planning Board Workload Summary.

## Canonical pipeline
1. Start from each open Job.
2. Read `Current Main` from the live Planning Chain suffix already positioned by the canonical `LastOperation + RAW NextOperation` resolver.
3. Calculate Bridge Role only for audit/diagnostic display.
4. After resolution, join the physical `RAW NextOperation` to active Dashboard ST Scope.
5. Classify:
   - `PLANNING_OPERATION` -> `MAIN`
   - `INTERMEDIATE` -> `IMMEDIATE`
   - `ST_SCOPE_ONLY` -> `ST ONLY`
6. Use this same one-row-per-open-Job result everywhere on Dashboard.

## Dashboard components now sharing the same population
- Global ST Total card.
- WAIT / READY / PLANNED-UNSCHEDULED / SCHEDULED / HOLD cards.
- New Dashboard-only `ST ONLY` status card so totals reconcile exactly.
- Surface workload stacked chart.
- Surface + Qty Main / Immediate / ST Only chart.
- Chart Calculation Audit table.
- Area KPI cards.
- Area -> Current Main / ST Only -> Recipe workload tables.
- CAT3 and CAT5 priority tables.

## Aggregation behavior
- MAIN Job -> grouped under its resolved Current Main.
- IMMEDIATE Dashboard-ST Job -> grouped under its resolved Current Main for Main/Area/Recipe summaries, while Chart 2 keeps the RAW Immediate Operation split.
- ST_SCOPE_ONLY Job -> grouped under `ST Scope Only` Area and `ST ONLY / <RAW NextOperation>`, with Dashboard status `ST ONLY`; it still never enters Planning Chain/Batch/Schedule.
- Each visible open Job contributes Qty/Surface exactly once to global Dashboard totals.

## Cleanup
Removed the old Dashboard-only population paths that pre-filtered RAW NextOperation or re-used Planning Board `rawStJobMatchSql`. The Dashboard now has one source of truth instead of parallel population queries.
