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


## All Open Job incremental planning sync

`Import All Open Job -> NEW/CHANGED only -> targeted Planning Chain sync`

- `open_job_current.NextOperation` remains the RAW source of truth from the imported Excel.
- NEW and CHANGED Jobs are the only open Jobs rebuilt in `planning_job_operation` after a normal All Open Job import.
- UNCHANGED Jobs do not re-run Planning Chain / Recipe resolution.
- CLOSED Jobs only deactivate their live Planning Chain rows; historical Batch/Schedule records are preserved.
- Incremental sync also limits Part/Revision master, paint recipe, Process Requirement and Batch-history reads to the affected Jobs/Parts.
- A RAW `NextOperation` reached by NEW/CHANGED Jobs that has neither active ST Scope nor active Intermediate Bridge is returned as **Operation mới / chưa cấu hình**. It is never auto-classified into a Main Operation.
- The ST Operation Flow page already exposes raw NextOperation codes from `open_job_current`. When a newly detected code is configured for the first time, its live Planning Chain rebuild is targeted to open Jobs using that raw code; edits to an already-configured code keep the full rebuild for safety because shared Main/ST Group changes may affect other mappings.
- Explicit Rebuild Chain, Master changes and existing-operation architecture changes still support FULL rebuild.

## Planning Board Area focus context

`Selected Area -> Previous Main + all Main Operations mapped to that Area`

- This behavior applies to every configured Area; Painting is only an example.
- When the planner loads Candidates with an Area selected and no single Main Operation filter, Candidate rows remain scoped by the server to that Area.
- Every Area uses the same Candidate context baseline before the matrix: **Job, PartDescription, CurrentGoodWIPQty, TotalSurface, LastLaborOp, NextOperation, Priority, OpenDMR** when those source fields exist. Legacy/sparse Area presets may add extra columns but cannot remove this operational baseline from Area focus.
- The physical Route Matrix shows **all configured Main Operations belonging to the selected Area** in Main Planning Order. Upstream/downstream Main columns from other Areas are not rendered in Area focus.
- One virtual **Previous Main** column is inserted before the Area Main columns. For each Candidate row it resolves the immediate Main occurrence before that exact Candidate (`standard_operation + source_seq`) and shows status, Batch No, schedule time, and Resource when available.
- Repeated Main occurrences remain occurrence-safe because Previous Main is anchored by `source_seq`, not by Main name alone.
- Selecting a READY cell still switches to the narrower Batch Selection context (`Previous Main + Selected Main + Next Main Planning`) and keeps Recipe Compatibility Lock unchanged.

## Planning Board READY focus context

`READY Main selection -> Previous Main + Selected Main + Next Main Planning`

- When the first READY cell establishes Batch Selection Mode, the matrix still narrows to Jobs compatible with that Main Operation.
- **Previous Main** is one virtual read-only column. Each row independently resolves that Job's immediate upstream Main occurrence and shows Main name, compact status badge (D/R/W/U/S/P/RN/H), Batch No, schedule time and Resource when available. Example: five PRIMER Jobs from BSASLD and five from BSAUNSLD remain in one Previous Main column; each row shows its own upstream handoff.
- The **selected Main** stays as its own physical column (for example `PRIMER`) and shows only the current planning status/READY interaction. Its Recipe is not rendered in this column. Recipe Compatibility Lock still uses the selected Main's Recipe internally when deciding which READY Jobs may enter the same Batch.
- **Next Main Planning** is one virtual read-only column. Each row resolves the immediate Main after the selected Main. The cell shows that next Main name and the Recipe of that next Main when one exists; if the next Main has no Recipe, no Recipe text is shown.
- All unrelated physical Main Planning columns remain hidden during Batch Selection Mode and return after Clear Selection.
- Compact density uses smaller rows. Matrix zoom is a presentation-only control (70%..130%, persisted locally) and does not change data, filters, Planning Chain, Batch, or Schedule.

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


## Process Requirement storage

`Part/Revision Gate -> Active MD:REQ Recipe Rules + Manual Keep -> Requirement-only streaming rebuild -> md_process_requirement`

- V375 adds configurable **Part/Revision Gate Rules** before Requirement-row import. Default migration 070 seeds `ST = NO`.
- If any active Gate Rule matches a Master row, that Part/Revision stores **zero** `md_process_requirement` rows. For example `ST = NO` removes/skips all 38 Process Requirements for that Part/Revision, including the ST row itself.
- Gate evaluation runs even for UNCHANGED Part/Revision source hashes. Re-import removes old Process Requirement rows belonging to a newly blocked Part/Revision.
- Parts that pass the Gate use the V374 second-level filter: only supported Requirement codes referenced by an active `md_main_operation_recipe.selection_rule` (`MD:REQ:*`) or marked in `md_process_requirement_keep` are imported; blank values are skipped.
- Requirement extraction runs even for UNCHANGED source hashes so a one-time TRUNCATE followed by re-import of the same Master Excel rebuilds only the small required subset.
- Planning Chain derives the active MD:REQ code set first and queries only those Requirement codes; it no longer scans all active Process Requirement rows.
- Recipe & Batch Rules still expose all 38 supported Master Requirement fields for configuration even when the filtered table currently contains no rows for a code.
- V376 adds a dedicated **Requirement-only Rebuild** path for oversized databases. It reads only `PartNum`, `RevisionNum`, active Gate columns, and effective Requirement columns from the Master workbook. It does **not** run Part/Material/Routing/Recipe rebuild, Auto Bridge, or Planning Chain.
- The V376 rebuild validates a usable Master row before clearing data, then commits `TRUNCATE md_process_requirement` immediately so the old large table/index files can be released before small chunk inserts begin. If a later insert fails, rerun the same rebuild; no other Master dataset is modified.
- Requirement-only rebuild uploads are removed from Storage after processing to avoid accumulating temporary files.

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

## V383 — Database backup/restore safety layer

Administrative PostgreSQL backups are created outside Vercel with `pg_dump` against the ST Planning `public` schema. The application runtime remains unchanged. The backup layer is intentionally read-only during backup and uses a separate explicit destructive restore command with `RESTORE` confirmation. Supabase-managed schemas are excluded from the ST Planning business backup.


## V387 — Job/Main Hold

`Planning Job Operation -> Job Hold Gate -> READY/WAIT display -> Batch selection`

- Job Hold is stored on the exact `planning_job_operation` occurrence (`is_hold`, `hold_reason`, `hold_note`, `held_at`, `held_by`).
- Job Hold is independent from `planning_schedule.status = HOLD`; one held Job must never hold every Job in a shared Batch/Schedule.
- An unbatched READY or WAIT Main can be placed on Hold from the Planning Matrix. V389 uses a right-click context action instead of a permanent inline Hold button. Held Jobs remain in Candidate Jobs; the exact held Main cell displays `HOLD`, is not batch-selectable, and the Batch API rejects it server-side as a race-safety check.
- Hold metadata is not overwritten by `syncPlanningChains`, so Hold survives incremental All Open Job imports and normal chain rebuilds while the same operation occurrence remains active.
- Release Hold clears only the Hold metadata and runs an incremental chain sync for that Job, returning the operation to the correct READY/WAIT state.
- Right-click a READY/WAIT Main cell to choose `Hold`; right-click a `HOLD` cell to choose `Unhold`. Hold still opens the existing reason/note dialog; Unhold releases directly and incrementally recalculates the Job.
- Planning Board exposes a HOLD filter and Job Tracker shows Hold reason/user information.


## V390 — Planning Board mutation synchronization

`Save mutation -> DB commit -> immediate visible patch (when state is returned) -> affected-Job Candidate delta -> affected-Job Route Matrix refresh`

- Normal Planning Board mutations must not reload/remount the page. Create/Add Batch and Job/Main Hold/Unhold use the same affected-Job delta refresh path.
- Hold/Unhold uses the committed `planning_job_operation` state returned by the API to patch the visible cell immediately, then the canonical Candidate/Route resolver reconciles that Job only.
- A full Candidate load explicitly clears Route Matrix cache before fetching, so a stale READY/WAIT/HOLD value cannot survive a manual Apply.
- Structural Rebuild Planning Chain may still reload Candidate data inside the mounted shell, but it does not reload the browser page.
- Business rules for Planning Chain, Recipe Lock, Batch, Schedule and Job Hold are unchanged.

## V391 — Logic & Guide live database resilience

`/logic-guide -> 12 independent read-only live queries -> render each Mapping table from current production DB`

- The `Mapping đang chạy` section remains read-only and `force-dynamic`.
- Live Mapping queries are isolated: one missing/invalid optional table can no longer blank every Mapping table.
- Each section reports its own query error while healthy sections continue to show production data.
- This is a diagnostic/documentation read-path change only; it does not alter Mapping, Planning Chain, Recipe, Batch, Schedule or Production Execution data.

## V395 — Planning Workload Summary

Planning Board có thêm lớp tổng hợp read-only theo `Area -> Main Operation` để planner nhìn workload READY / WAIT / HOLD bằng `Jobs / pcs / dm²` trước khi thao tác trên Matrix.

Nguồn chuẩn vẫn là `planning_job_operation` + `open_job_current`; Summary không tạo trạng thái riêng và không can thiệp Planning Chain. Qty/Surface dùng cùng quy tắc Candidate hiện hành. Một Job được deduplicate trong cùng `Main Operation + status bucket` để không nhân đôi số lượng khi routing có occurrence lặp.

UI gồm KPI tổng và bảng ERP compact. Click READY / WAIT / HOLD của một Main sẽ hydrate Route Matrix nếu cần rồi drill-down Candidate Matrix bằng đúng Main + route status. Khi đang có Batch Selection, drill-down bị khóa để bảo toàn ngữ cảnh gom lô. Summary refresh sau Batch mutation, Hold/Unhold, Rebuild Chain và khi thay scope Area/Main.
