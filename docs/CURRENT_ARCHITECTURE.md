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
9. Dashboard V396 is the ST workload control view: unique open ST totals plus WAIT / READY / PLANNED-UNSCHEDULED / SCHEDULED / HOLD workload by Main Planning Operation, stacked dm² chart, and full CAT3/CAT5 planning + schedule lists. The former Dashboard KPI/AI layout is no longer rendered.
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

## Dashboard V396 · ST Workload architecture

`Open ST Jobs + Planning Chain + Batch + Schedule -> ST Workload Summary -> Main Planning table -> stacked dm² chart -> CAT3/CAT5 detail`

- `/dashboard` no longer renders the previous control-tower/AI layout.
- ST TOTAL counts each open ST Job once. Status workload is counted as Job × Main Planning, using the same active Planning Chain / Batch / Schedule data model as Planning Board.
- Display buckets are WAIT, READY, PLANNED, PLANNED-UNSCHEDULED, SCHEDULED and HOLD.
- Main Planning table shows Jobs / pcs / dm² for every bucket and Area/Main combination.
- The stacked chart uses dm², X = Main Planning and Y = dm², stacked by the same status buckets.
- CAT3 and CAT5 sections list every open priority Job with Part, Qty, dm², Next Operation, current Planning Main/status, latest Batch and latest active Schedule.
- No Dashboard write path exists; all content is read-only.

### AI provider backend retained

The existing Groq/OpenRouter read-only AI endpoints and controlled DB tools remain in source for possible later reuse, but they are not rendered on the V396 Dashboard.
- AI providers are **Read / Analyze / Recommend** only. They do not create/delete Batch, change Recipe, move Schedule, change READY/WAIT, edit configuration, or update Production Execution.
- Provider order is fixed: **Groq primary → OpenRouter fallback**. OpenRouter is used only when Groq is not configured for the request, is rate-limited, times out, or returns a provider/model request failure.
- Provider secrets stay server-side in Vercel Environment Variables: `GROQ_API_KEY` and `OPENROUTER_API_KEY`.
- Groq default model is `openai/gpt-oss-20b`. OpenRouter default model is `openrouter/free`, so the fallback can remain zero-token-price while available.
- The retained AI endpoint still has its legacy structured analysis snapshot plus ST business-logic knowledge and controlled read-only database tools. It is not part of the V396 Dashboard UI. No provider receives a write tool.
- AI provider availability has no effect on the V396 Dashboard because the current Dashboard is fully deterministic/read-only SQL and renders no AI panel.
- The retained endpoint `GET /api/dashboard/ai` can still report Groq/OpenRouter state if reused later; it is not called by the V396 Dashboard page.
- If the retained AI endpoint is reused later, it may call server-side read-only tools to discover/read application table/view data in PostgreSQL `public`, inspect schema, aggregate data, or retrieve Job/Batch/day context.
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

## V397 — Dashboard Recipe-level workload
`Main Planning Workload Summary` is hierarchical: Main Planning total → Recipe No./Recipe Name detail. Every Recipe detail retains WAIT / READY / PLANNED-UNSCHEDULED / SCHEDULED / HOLD with Job / pcs / dm². Batched work uses the Batch Recipe; unbatched work uses the current live Planning Recipe resolver. No-Recipe workload is retained explicitly so Main totals reconcile.

## V398 — RAW NextOperation ST population gate

Dashboard và Planning Board Workload Summary có population khác nhau. Dashboard dùng canonical Dashboard ST scope đã chốt. Planning Board Workload Summary là read-only mirror của Route Matrix/active Planning Chain: bắt đầu từ `planning_job_operation` của mọi `open_job_current` đang open, không dùng Dashboard ST-scope gate hoặc RAW NextOperation gate để loại Job.

`open_job_current.next_operation (RAW) -> Visible ST RAW scope -> Planning Chain / Batch / Schedule aggregation`

- Visible ST RAW scope dùng cùng quy tắc với Planning Board: active `PLANNING_OPERATION` trong `md_st_operation_scope` + active Auto Bridge intermediate operation.
- `ST_SCOPE_ONLY` bị loại khỏi Planning Board/Dashboard planning workload vì loại này chỉ hiển thị ở All Open Jobs và không tham gia Planning Chain/Batch/Board.
- Chỉ sau khi Job vượt RAW ST gate mới được đọc các Main Planning/status trong `planning_job_operation` để tính READY / WAIT / HOLD / PLANNED / PLANNED-UNSCHEDULED / SCHEDULED.
- Job có RAW NextOperation ngoài ST không được xuất hiện trong Workload/Dashboard chỉ vì Planning Chain của nó có future ST operations.
- CAT3/CAT5 Dashboard dùng cùng RAW ST gate, vì vậy danh sách priority và KPI/Main/Recipe summary dùng cùng một population.
- Source chuẩn được gom trong `src/lib/planning/raw-st-visible-sql.ts` để Dashboard và Planning Board không lệch logic về sau.

## V399 — Dashboard Area sections

Dashboard presentation is grouped `Area -> Main Planning -> Recipe` after the existing V398 RAW NextOperation ST population gate.

- The former single Main Planning Workload table that mixed all Areas is replaced by one independent table per Area.
- Each Area renders its own KPI cards: Area TOTAL unique Jobs plus WAIT / READY / PLANNED-UNSCHEDULED / SCHEDULED / HOLD in Job / pcs / dm².
- Area TOTAL deduplicates the same Job inside that Area. Status cards remain Job × Main Planning workload and therefore reconcile with the Main rows for that Area.
- Each Area table retains V397 Recipe No. / Recipe Name breakdown and the same status columns.
- Dashboard Main/Recipe and CAT3/CAT5 tables render all rows without vertical table scroll containers; horizontal scrolling remains for wide tables.
- This is a read/display aggregation change only. Planning Chain, Recipe resolver, Batch, Schedule, Hold and Production Execution remain unchanged; ST population follows the latest V404 Current Main resolver rule below.
## V404 — Current Main resolver là nguồn chuẩn cho ST population

V400 strict `PLANNING_OPERATION-only` gate đã được thay thế. Dashboard và Planning Board dùng đúng kết quả Current Main đã được `syncPlanningChains` materialize từ `LastOperation + RAW NextOperation` theo thứ tự resolver hiện hành: Bridge → AllOperation fallback → direct Next Main rescue. Một Job thuộc ST workload khi RAW NextOperation là `PLANNING_OPERATION` **hoặc** Intermediate Operation thuộc active Bridge và Job có live Current Main trong Planning Chain. `ST_SCOPE_ONLY` vẫn bị loại hoàn toàn khỏi Planning Chain/Batch/Board. Saved ST View chỉ là subset selector của catalog ST gồm Planning Operation + active Bridge Intermediate; nó không tự tạo Current Main.

Immediate workload dùng `Immediate Operation = open_job_current.next_operation` và `Main Planning = Current Main` (first active planning occurrence ordered by planning_seq/source_seq/id). Vì vậy route `BSAUNSLD → INS-AND → MSKG-TC → PPRSLVT(PRIMER)` sẽ nhóm `INS-AND`, `MSKG-TC`, `PPRSLVT` dưới Current Main `PRIMER` tùy vị trí RAW NextOperation hiện tại của từng Job.



## V401 — Dashboard bỏ trạng thái PLANNED riêng

Dashboard không còn hiển thị `PLANNED` như một bucket/card riêng. Trong flow hiện tại, `planning_job_operation.status='PLANNED'` là trạng thái nội bộ của occurrence đã có lịch sử Batch và trên Dashboard được chuẩn hóa vào `PLANNED-UNSCHEDULED` khi chưa có Schedule. Các lớp hiển thị Dashboard hiện chỉ dùng `WAIT / READY / PLANNED-UNSCHEDULED / SCHEDULED / HOLD`; ST TOTAL vẫn là unique open Jobs sau RAW NextOperation ST gate. Thay đổi này chỉ thuộc Dashboard presentation/aggregation, không đổi trạng thái nội bộ của Planning Chain, Batch hay Schedule.

## V402 — ERP navigation visibility
- Dashboard is a standalone first-level WORK CENTER, not a child of Vận hành.
- All functional sub-tabs are permanently visible under their work-center headings: Vận hành, Theo dõi, Master Data and Quản trị.
- Both legacy/migrated `AppTabs` pages and the native `ErpAppShell` Planning pages use the same visible navigation hierarchy.
- This is presentation/navigation only; no planning or scheduling business rule changes.

## V404 — Dashboard charts + canonical Immediate Operation

Hai chart được đặt ở đầu Dashboard. Chart Surface dm² theo Main Planning vẫn fit theo viewport và không có horizontal scrollbar. Chart combo dùng nguồn chuẩn `Current Main + RAW NextOperation`: cột = dm² theo trục trái cố định max 50,000 dm², line = pcs theo trục phải cố định max 10,000 pcs. Mỗi cột và mỗi line point hiển thị giá trị trực tiếp; cuối chart có nhóm `TOTAL / ALL ST` cho tổng dm² và pcs. Không dùng `planning_job_operation.source_operation_code` để xác định Immediate Operation nữa.

## V406 — Surface-first workload presentation

Workload UI priority is now `Surface dm² -> pcs -> Job count`. This applies to Dashboard global/Area KPI cards, Dashboard Main Planning -> Recipe status/total cells, CAT3/CAT5 workload summary headers, and Planning Board Workload Summary KPI/drill/total cells. Job remains the row identifier in Job/Candidate lists; only workload metric emphasis/order changed. No SQL population, Current Main resolver, Bridge, Recipe, Batch, Schedule or status logic changed.

## V407 — Dashboard chart calculation audit

Before changing the `Surface + Qty by Main Planning / Immediate Operation` aggregation again, Dashboard exposes a read-only one-row-per-Job audit table using the exact same ST population and materialized Current Main resolver as the chart. The table shows RAW LastOperation/NextOperation, `route_resolution_mode`, Previous/Current/Next Main, Current Main source operation/status/sequence, Qty inputs and selected Qty, Surface/Part, source TotalSurface, calculated Qty×Surface, selected Surface, and AllOperation. The `Chart Group` column is exactly `Current Main / RAW NextOperation`. This is diagnostic only; chart aggregation and Planning/Bridge/Batch/Recipe/Schedule logic remain unchanged in V407.

## V408 — Dashboard validation gate = strict physical RAW NextOperation
For Dashboard validation, population is intentionally narrower than the V404 Planning Board resolver population. Dashboard starts from `open_job_current` and keeps an Open Job only when its physical RAW `next_operation` directly matches active `md_st_operation_scope.operation_type='PLANNING_OPERATION'`. Bridge Intermediate and `ST_SCOPE_ONLY` do not widen Dashboard population in this version. `ST TOTAL` is calculated directly from this unique RAW-filtered Open Job set, even if a Planning Chain row is missing. Only after the RAW gate passes are Planning Chain, Batch, Schedule and Recipe data used for status/Main/Recipe display. Planning Board V404 behavior is not changed. Chart formula/grouping remains unchanged pending validation of the filtered rows.


## V409 — Dashboard population = all RAW NextOperation + Planning Board resolver
Dashboard population now starts from every Open Job RAW `next_operation`; there is no direct-code prefilter to `PLANNING_OPERATION`. For each Job, use the same context-aware Planning Board membership rule: `LastOperation + RAW NextOperation + live Current Main`. Keep the Job when the RAW operation is either a direct active ST Planning Operation resolving to that Current Main or a valid ordered Intermediate in an Active Bridge leading to that Current Main. Exclude unrelated non-ST flow and `ST_SCOPE_ONLY`. This population drives ST TOTAL, status/Area/Main/Recipe summaries, CAT3/CAT5 and Dashboard audit. V408 strict direct-only gate is superseded. Chart formula/grouping is unchanged in V409 pending user validation.

## V411 — Dashboard Immediate Operation must be ST-visible
Dashboard no longer starts from every RAW NextOperation. Before the Current Main resolver runs, the physical `open_job_current.next_operation` must be active in `md_st_operation_scope` with type `PLANNING_OPERATION` or `INTERMEDIATE`. Then the existing context-aware resolver validates the Job against the live Current Main. `ST_SCOPE_ONLY` and unrelated non-ST RAW operations are excluded before workload/chart aggregation. `LastOperation` remains resolver context only and is not an ST visibility condition, so a valid first ST operation after a non-ST predecessor is still counted. This change is Dashboard-only and does not alter Planning Chain/Batch/Recipe/Schedule logic.

## V418 — Bridge Role and ST Scope are independent

Dashboard chart classification is now explicitly three-stage: (1) resolve `LastOperation → RAW NextOperation → Current Main`, (2) determine Bridge Role from active `md_intermediate_bridge_segment` / `md_intermediate_bridge_operation`, then (3) filter the RAW operation by explicit `md_st_operation_scope` membership. A Bridge Intermediate enters the ST chart only when its ST Scope Type is also `INTERMEDIATE`.

`md_st_operation_scope.operation_type='INTERMEDIATE'` is an ST-membership tag only. It never defines Previous/Next Main and never creates its own Main Planning occurrence, Source → Main mapping, Batch or Schedule. ST Operation Flow therefore shows both all inferred Bridge Intermediate operations and the subset explicitly tagged `Intermediate · ST`. Removing an Intermediate ST tag does not deactivate or rebuild the Bridge/Planning Chain.

## V421 — One canonical Dashboard ST population everywhere
Dashboard no longer keeps separate population logic for KPI/Main/Recipe/CAT3/CAT5 versus Chart 2/Audit. Every Dashboard card, table and chart is derived from one one-row-per-open-Job dataset using the same order: (1) read Current Main already positioned by the canonical Planning Chain resolver from LastOperation + RAW NextOperation, (2) calculate Bridge Role for diagnostics only, (3) join the physical RAW NextOperation to active `md_st_operation_scope`, and (4) keep `PLANNING_OPERATION`, Dashboard-only `INTERMEDIATE`, or `ST_SCOPE_ONLY`. `PLANNING_OPERATION -> MAIN`, `INTERMEDIATE -> IMMEDIATE`, `ST_SCOPE_ONLY -> ST ONLY`.

- Global ST Total and status cards use this exact population.
- Surface chart uses the same rows; IMMEDIATE contributes to its resolved Current Main and ST Only is a separate workload group.
- Surface + Qty chart uses the same canonical rows without a second population query.
- Area -> Current Main / ST Only -> Recipe tables use the same rows exactly once per open Job.
- CAT3/CAT5 tables are filtered from the same rows and expose MAIN / IMMEDIATE / ST ONLY scope.
- `ST_SCOPE_ONLY` has a Dashboard-only `ST ONLY` status bucket so status cards/tables reconcile with ST TOTAL without pretending that it participates in Planning status.
- `INTERMEDIATE` remains Dashboard-only classification. It does not sync or modify All Open Jobs, Planning Chain, Candidate, Batch, Recipe, Schedule, Auto Planning, or Planning Board Workload Summary.


## V422 — Remove Dashboard Calculation Audit table
The `Dashboard Calculation Audit · Job Detail` table has been removed from `/dashboard`. Its dedicated UI component, `StDashboardAuditJob` type, `auditJobs` accumulation/sort/return path, audit-only CSS, and obsolete i18n phrases were removed as dead code. The canonical Dashboard ST population is unchanged and continues to feed KPI cards, both charts, Area/Main/Recipe tables, CAT3 and CAT5. No Planning Chain, Candidate, Batch, Recipe, Schedule, Auto Planning, All Open Jobs, or Planning Board Workload Summary behavior changes.


## V424 — Planning Board Workload Summary mirrors active Planning Chain

Planning Board Workload Summary is intentionally independent from Dashboard canonical ST population. It aggregates every open Job's active `planning_job_operation` rows and maps `ELIGIBLE -> READY`, `LOCKED -> WAIT`, hold -> HOLD, de-duplicated per Job + Main + bucket. This makes the summary reconcile with the Route Matrix below, including Jobs whose physical RAW `NextOperation` is currently outside ST but whose ST Main is already `ELIGIBLE`/`LOCKED` in the active Planning Chain. Dashboard ST Scope remains Dashboard-only.

## V427 — Dashboard Main Planning chart roll-up
The Dashboard `Surface + Qty` combo chart now renders at resolved Main Planning grain. Current-position MAIN and Dashboard-ST INTERMEDIATE rows are summed under the same resolved Main Planning operation. `ST_SCOPE_ONLY` stays as one standalone `ST ONLY` bucket and `TOTAL / ALL ST` stays separate. This is presentation-only; the canonical Dashboard population and all planning/scheduling logic are unchanged.

## V430 — Trial Schedule Day Shift = MOVE, không clone
Board Điều Độ có control trial để chuyển toàn bộ lịch của ngày đang xem sang ngày kế tiếp (`+1`) hoặc lùi lại một ngày (`-1`). Đây là thao tác **Schedule-only MOVE in-place** trên các `planning_schedule` hiện hữu; không tạo Batch mới và không clone Schedule.

- Population nguồn dùng đúng ngày Board đang xem: active Schedule có `schedule_date = selected date` hoặc `planned_start` local date = selected date.
- Toàn bộ `planned_start/planned_end` và các mốc Chemical Line `loading/process/ndt/unloading start/end` được dịch đồng bộ đúng ±1 ngày; Resource, Recipe, Duration, Sequence và status giữ nguyên.
- `planning_batch.planned_start/planned_end` được đồng bộ theo Schedule sau khi move; Batch identity/membership/Recipe không đổi.
- Sau commit, ngày nguồn bắt buộc rỗng theo cùng population Board. Đây là MOVE, không phải COPY.
- Trial one-day invariant: ngày đích phải không có active Schedule độc lập. Hệ thống không tự xóa ngày đích và không merge hai ngày.
- RUNNING/COMPLETED không được move. Nếu có lịch ngoài population nguồn chạy xuyên khoảng đích hoặc bất kỳ invariant nào không đạt, transaction rollback toàn bộ.
- Không recompute Planning Chain/READY/WAIT; Candidate, Batch membership, Recipe, Dashboard population và Production Execution không bị thay đổi bởi thao tác dời ngày.

## V431 — Scheduling Recipe selector follows Schedule Area
Board Điều Độ no longer exposes the full Process Recipe catalog in every lane. The server sends each Recipe with its active mapped Main Operations from `md_main_operation_recipe.standard_operation`. Each Schedule Area/lane filters the Recipe selector by the Main Operations mapped in `md_schedule_area_operation`; a grouped hub such as Painting uses the union operation pool shared by its child lanes.

- New manual rows show only Recipes belonging to that Schedule Area operation pool.
- Editing an existing Schedule keeps the current Recipe visible even if configuration changed later, while unrelated out-of-area Recipes remain hidden.
- Create Empty Batch filters Recipe by the selected Main Operation.
- Manual-grid Batch creation derives Main from `md_main_operation_recipe.standard_operation` first and revalidates Recipe → Main on the server.
- This is a Scheduling selector/validation change only. Planning Board Recipe resolver, Batch membership, Planning Chain, Dashboard population and stored Recipes on existing Batches are unchanged.


## V432 — Add-only Previous Main scheduling lock

Board Điều Độ adds a server-side physical handoff guard only when an existing Planning Batch is first added to `planning_schedule` through `POST /api/schedule`. For every Job in that Batch, the immediate Previous Main identity comes from the durable Planning occurrence snapshot (with live-chain fallback). First Main has no predecessor and passes. Otherwise the matching Previous Main Batch must have a non-cancelled Schedule with `planned_end`, and Current Main `planned_start` must be greater than or equal to that Previous Main `planned_end`. Any failing Job rejects the whole add transaction.

This is deliberately stricter than Planning Chain READY: Sequential READY may open after the Previous Main has a non-cancelled Batch even while that Batch is still unscheduled. The new rule does not rewrite READY/WAIT and is not applied to Schedule PATCH/Edit or Trial Day Shift. Chemical Line simulation/proposal remains unchanged; its existing FB/Loading/Process/NDT/Unloading capacity search runs first and only the final `effectiveStart` is checked before INSERT, so the proposal algorithm is not modified.

## V433 — Previous Main DONE without Batch on Scheduling Board
Scheduling Board no longer labels every Previous Main without a Batch as `UNSCHEDULED`. For each Job in an unscheduled Current Batch, Previous Main identity comes from the durable immediate predecessor snapshot, with the active Planning Chain only as fallback. The card status is now `DONE`, `SCHEDULED`, `UNSCHEDULED`, or `NOT_PLANNED`.

`DONE` is used when the durable immediate Previous Main exists but that predecessor is no longer in the active physical Current/Future Planning Chain and there is no historical Batch for it. This represents a Main already passed by Job progress even though no Batch was created. The V432 add-only scheduling guard is therefore refined: `DONE + no Batch` satisfies the predecessor requirement; an existing Previous Main Batch that is still unscheduled does not. Scheduled predecessors still require `Current planned_start >= Previous planned_end`. Chemical proposal/capacity, Schedule PATCH/Edit, Trial Day Shift, Planning READY/WAIT, Dashboard and Batch membership are unchanged.


## V438 — Aiven PostgreSQL canonical database

ST Planning moves its operational PostgreSQL database from Supabase to Aiven. The first cutover intentionally copies the full current `public` schema and full current `public` data (~600 MB) before any cleanup. Runtime database access is provider-neutral through `DATABASE_URL` + `pg`; Supabase/Supavisor-specific DNS/port auto-selection is removed. Aiven Free has `max_connections=20` and no built-in pooling, so Vercel-local `DB_POOL_MAX` defaults to `1`. Supabase is retained only as a temporary Storage/Auth provider during migration; no Master/Open Job/Planning/Batch/Schedule/Dashboard database query should use Supabase REST after V438. Database reduction/history/index cleanup is a separate post-cutover phase and must not be mixed into the first migration. Business logic is unchanged.


## V439 — Aiven TLS compatibility

Aiven remains the canonical PostgreSQL provider from V438. V439 changes only the Node `pg` TLS connection adapter: when `DATABASE_URL` uses `sslmode=require`, TLS remains enabled but Node uses libpq-compatible `require` semantics to avoid `SELF_SIGNED_CERT_IN_CHAIN`. If `DATABASE_CA_CERT` is configured, strict CA verification is enabled. No Planning, Batch, Schedule, Chemical Line, Masking/Unmasking, Production or data-model logic changes.

## V441 — Runtime database identity endpoint

Add read-only `GET /api/system/db-info` so deployment can confirm which PostgreSQL provider the running Vercel instance is actually using. The endpoint opens the canonical `DATABASE_URL` connection through `src/lib/db.ts` and returns provider, host, port, current database/user, PostgreSQL version, server address/port and latency. It never returns the connection URI or password and disables response caching. This is diagnostics only; no Planning/Batch/Schedule/Recipe/Chemical/Production logic changes.


## V442 — Aiven single-connection Planning safety
Aiven remains the canonical operational PostgreSQL provider and Vercel keeps `DB_POOL_MAX=1` by default to protect the Aiven Free 20-connection budget. Planning Board must therefore never reserve one pool client and then wait for a second client from the same pool. V442 makes initial Planning static data complete before the page acquires its live client, reuses that client for metadata, and makes Candidate side reads reuse the existing client when the configured pool max is one. If `DB_POOL_MAX>1` is explicitly configured later, the historical two-connection Candidate parallel path remains available. Business logic and data populations are unchanged.

## V444 — Trial Schedule Day Shift dùng Production Day 06:00 → 06:00

- `Dời toàn bộ lịch ±1 ngày` xác định population theo **planned_start trong ngày sản xuất 06:00 ngày chọn → 06:00 ngày kế tiếp**, không còn dùng calendar `schedule_date` làm population.
- Lô bắt đầu `00:00–05:59` ở ngày lịch kế tiếp vẫn thuộc production day nguồn và được MOVE cùng toàn bộ ngày.
- Destination guard cũng dùng cùng production-day window, nên các lô after-midnight của nguồn không bị báo nhầm là “lịch ngày đích”.
- Khi MOVE, `schedule_date` được tính lại từ **shifted planned_start theo Asia/Ho_Chi_Minh**, giữ nhất quán với semantics của Schedule API.
- MOVE vẫn in-place/all-or-nothing; không clone Batch/Schedule; giữ Resource/Recipe/Duration/Sequence/status và dịch đồng bộ Loading/Process/NDT/Unloading.
- Không thay đổi Planning Chain, Candidate, Batch membership, Recipe hay Chemical Line proposal/capacity logic.


## V445 — Canonical Production Day 06:00 → 06:00 toàn app

- Production Date D là cửa sổ `06:00 D <= planned_start < 06:00 D+1` theo `Asia/Ho_Chi_Minh`.
- Ownership dựa trên **planned_start**, không dựa ngày lịch của End. Vì vậy Start 00:00–05:59 ngày D+1 vẫn thuộc D; End có thể kéo qua 06:00 tiếp theo nhưng vẫn thuộc D.
- Cùng một boundary được dùng cho Board Điều Độ (table + timeline + live rows), Masking/Unmasking, Production Execution, daily Dashboard metrics/trend và AI day operations.
- `planning_schedule.schedule_date` từ V445 mang nghĩa **production date**, được tính bằng Vietnam local `planned_start - 6 hours`; migration `073_canonical_production_day_0600.sql` backfill dữ liệu cũ.
- Trial Shift V444 tiếp tục MOVE toàn production day ±1 ngày; Chemical Line Loading/Process/NDT/Unloading dịch cùng.
- Không thay đổi Planning Chain READY/WAIT, Batch membership, Recipe, Previous Main Schedule Lock, Chemical Line proposal/capacity hay Production WAITING/ON-GOING/DONE.

## V446 — Production Execution Job-level + Shift + live date navigation

- Production day remains canonical: `06:00 D <= planned_start < 06:00 D+1` (`Asia/Ho_Chi_Minh`), equivalent to 06:00 through 05:59 next calendar day.
- Date navigation on `/production-execution` remounts the client dataset by production date, so Previous / Next / Today reload immediately without browser F5.
- Every Production work item exposes Job details in every Area, including Chemical Line and Painting. The old work-item Status column/report control is removed.
- Execution reporting is stored per Job in `production_execution_job` using `(source_type, source_key, planning_job_operation_id)` identity. `production_execution` remains a derived aggregate compatibility summary for existing Dashboard/AI reads.
- Job rows show Shift derived from planned target: Shift 1 `06:00-13:59`, Shift 2 `14:00-21:59`, Shift 3 `22:00-05:59` next day. Planned Target is positioned immediately before Job Actual Start/End.
- Production tables no longer use inner vertical max-height scrolling; page-level vertical scrolling shows every row. Horizontal scrolling remains for wide tables.
- Migration `074_production_execution_job_level.sql` creates only the Job execution table/indexes. Planning Chain, Batch, Recipe, Schedule, Previous Main lock, Chemical Line proposal/capacity and canonical production-day ownership are unchanged.


## V447 — Production Execution area sub-tabs + mixed report granularity

- `/production-execution` adds sub-tabs for Chemical Line; Shot Peening (Automatic + Manual); Masking & Unmasking; Painting; Sirius Cleaning; Blasting (Manual + Auto); Plating (Plating + He-Bake); and Passivation / Brightening. `All` remains a safe overview and `Other` appears only if a work item cannot be mapped to a configured production group.
- Chemical Line and Painting use **LINE reporting**: one WAITING / ON-GOING / DONE control per scheduled Batch row. Their Job detail rows are not loaded for the report UI, reducing payload and matching shop-floor reporting granularity.
- All other groups use **JOB reporting** in `production_execution_job` exactly as V446. Their parent `production_execution` record remains the aggregate compatibility summary.
- The API validates LINE reporting server-side and permits it only for Chemical Line/Painting resources. Existing Job-level rows from prior testing are not deleted; they are simply ignored for LINE-mode ownership.
- Each physical area panel gets its own header accent color for quick recognition. No inner vertical table scroll is reintroduced.
- Canonical Production Day remains `06:00 D <= planned_start < 06:00 D+1`. Planning Chain, READY/WAIT, Batch membership, Recipe, Schedule status, Previous Main lock and Chemical Line proposal/capacity are unchanged.


## V448 — Production report Main grouping + Painting cabin panels

- Production report panels use stronger visual separation (accent border, tinted header, panel spacing) without changing data ownership or execution state.
- Masking/Unmasking report items are grouped by `linkedMainOperation` and ordered by Main Planning sequence. One panel can therefore contain both support sides for the same Main, e.g. `BSAUNSLD (Unmasking & Masking)`.
- Painting is rendered as four explicit panels in report order: `CAB1`, `CAB2`, `CAB3`, `Powercoating`. Any Painting resource not CAB1/CAB2/CAB3 falls into Powercoating to preserve all scheduled rows.
- Chemical Line/Painting remain LINE reporting; all other areas remain JOB reporting. Production Day 06:00→05:59, Planning Chain, Batch, Recipe, Schedule and Chemical Line proposal/capacity are unchanged.
