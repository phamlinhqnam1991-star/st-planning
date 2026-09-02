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
9. Operations Dashboard reads deterministic KPI/risks from operational data; AI uses Groq as primary and OpenRouter as automatic fallback, with the same structured snapshot and controlled read-only database tools for evidence-backed analysis.
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

## Dashboard / AI Provider architecture

`Operational sources -> Deterministic Dashboard KPI -> Initial Snapshot -> Groq primary -> OpenRouter fallback -> Read-only Database Tools -> Evidence-backed Insight`

- Deterministic Dashboard KPI remain source-of-truth calculations from application/SQL logic.
- AI providers are **Read / Analyze / Recommend** only. They do not create/delete Batch, change Recipe, move Schedule, change READY/WAIT, edit configuration, or update Production Execution.
- Provider order is fixed: **Groq primary → OpenRouter fallback**. OpenRouter is used only when Groq is not configured for the request, is rate-limited, times out, or returns a provider/model request failure.
- Provider secrets stay server-side in Vercel Environment Variables: `GROQ_API_KEY` and `OPENROUTER_API_KEY`.
- Groq default model is `openai/gpt-oss-20b`. OpenRouter default model is `openrouter/free`, so the fallback can remain zero-token-price while available.
- Both providers use the same structured Dashboard snapshot, ST business-logic knowledge, and controlled read-only database tools. No provider receives a write tool.
- If both AI providers are unavailable or not configured, the Dashboard still renders normal KPI, workload, risk, resource, READY queue, and trend data.
- Dashboard exposes one connection test (`GET /api/dashboard/ai`) that reports Groq and OpenRouter separately without exposing either API key.
- The Dashboard snapshot is sent first. For **Ask AI**, the active provider may call server-side read-only tools to discover and read application table/view data in PostgreSQL `public`, inspect schema, aggregate data, or retrieve Job/Batch/day context.
- AI does **not** receive arbitrary SQL execution. Generic reads use validated table/column/filter arguments with bounded row limits; write operations are not exposed.
- Canonical ST Planning business logic is supplied to the agent as versioned knowledge (`V371`): Planning Chain, NextOperation ordering, ST Scope, Recipe/Batch, Chemical/Paint, Masking/Unmasking, Scheduling and Production Execution boundaries.
- Each AI answer returns a data-access audit showing which read-only tools/tables were used and how many rows were inspected. The UI also shows which provider actually produced the answer and whether OpenRouter fallback was used.
- Ask AI supports recent multi-turn conversation. Conversation history carries intent/context only; database facts must come from the current snapshot or current-request tool results.
- To protect free quotas, database access is on-demand rather than dumping the entire database into every prompt. `AI_MAX_TOOL_ROUNDS` controls the maximum tool rounds per question (default 4); the old `GROQ_AI_MAX_TOOL_ROUNDS` remains a backward-compatible fallback setting.
- If a provider returns text that does not match the structured analysis schema, the server attempts structured-output normalization; text fallback remains available rather than misreporting a connection failure.
