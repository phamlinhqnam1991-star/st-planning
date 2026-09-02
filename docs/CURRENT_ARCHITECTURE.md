# ST Planning — Current Architecture

## Canonical flow

1. Import Master Data.
2. Import All Open Job snapshot.
3. `NextOperation` is filtered by ST Scope.
4. Planning Operations resolve through ST Operation Mapping to Main Operation.
5. Planning Chain controls READY / WAIT / PLANNED handoff.
6. Planning Board selects Jobs and creates/updates Batch.
7. Board Điều Độ assigns existing Batch to Resource / Date / Start / Duration.
8. Production Execution reads scheduled Batch plus Masking/Unmasking support work and stores WAITING / ON-GOING / DONE separately from Planning/Schedule state.
9. Operations Dashboard reads deterministic KPI/risks from operational data; Groq AI starts from a structured snapshot and may use controlled read-only database tools for deeper evidence-backed analysis.
10. Job Tracker and Part Tracker are read-only trace views.

## Candidate presentation order

When Sort Priority contains `NextOperation`:

`RAW NextOperation -> ST Operation Mapping -> Main Operation -> Main Planning Order`

`md_operation.planning_sort_order` is only an optional Operation Code tie-breaker inside the same Main. The canonical default sort remains:

1. NextOperation ASC
2. Priority DESC
3. Job ASC

This presentation order does not change READY / WAIT, Batch, Schedule, or Auto Planning.

## Recipe / Batch architecture

- Runtime Recipe proposal: `md_main_operation_recipe` + active `md_process_recipe` + Job/Part data.
- `md_operation_recipe_mapping` is retained as legacy/reference data and is edited only from section ③ of `/recipe-operation-map`.
- Batch and Schedule remain separate: Planning creates Batch; Scheduling assigns an existing Batch.
- Manual and future Auto Planning share the same Batch/Schedule model.

## Database cleanup

Migrations are append-only. Historical migrations 058/059 are preserved. Migration 066 removes the abandoned Planning snapshot cache and dirty triggers because current Candidate reads are canonical-only.

## Dashboard / Groq AI architecture

`Operational sources -> Deterministic Dashboard KPI -> Initial Snapshot -> Groq AI Agent -> Read-only Database Tools -> Evidence-backed Insight`

- Deterministic Dashboard KPI remain source-of-truth calculations from application/SQL logic.
- Groq is a **Read / Analyze / Recommend** agent. It does not create/delete Batch, change Recipe, move Schedule, change READY/WAIT, edit configuration, or update Production Execution.
- Provider secret is server-side only: `GROQ_API_KEY` in Vercel Environment Variables.
- Default model is configured by `GROQ_MODEL` (current default: `openai/gpt-oss-20b`) and can be changed without changing Dashboard business logic.
- If Groq is unavailable or not configured, the Dashboard still renders normal KPI, workload, risk, resource, READY queue, and trend data.
- Dashboard exposes a Groq connection test (`GET /api/dashboard/ai`) and shows configured/connected/model-available state without exposing the API key.
- The Dashboard snapshot is sent first. For **Ask AI**, Groq may call server-side read-only tools to discover and read any application table/view in PostgreSQL `public` schema, inspect schema, aggregate data, or retrieve Job/Batch/day context.
- AI does **not** receive arbitrary SQL execution. Generic reads use validated table/column/filter arguments with bounded row limits; write operations are not exposed.
- Canonical ST Planning business logic is supplied to the agent as versioned knowledge (`V371`): Planning Chain, NextOperation ordering, ST Scope, Recipe/Batch, Chemical/Paint, Masking/Unmasking, Scheduling and Production Execution boundaries.
- Each AI answer returns a data-access audit showing which read-only tools/tables were used and how many rows were inspected. If no tool was needed, the UI states that only the Dashboard snapshot was used.
- Ask AI supports recent multi-turn conversation. Conversation history carries intent/context only; database facts must come from the current snapshot or current-request tool results.
- To protect free Groq quota, database access is on-demand rather than dumping the entire database into every prompt. `GROQ_AI_MAX_TOOL_ROUNDS` controls the maximum tool rounds per question (default 4).
- If Groq returns text that does not match the structured analysis schema, the server attempts a structured-output normalization; text fallback remains available rather than misreporting a connection failure.
