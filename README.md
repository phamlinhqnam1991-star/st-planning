# ST Planning Web App

Surface Treatment planning application built with Next.js 16, TypeScript, PostgreSQL/Supabase and Vercel.

## Runtime modules

- Master Data / Import Master
- All Open Jobs / Import All Open Jobs
- Configuration: ST Scope, ST Operation Flow, Source → Main Mapping, Main Operation, ST Group, Physical Area, Schedule Area, Planner assignment
- Recipe & Rules / Loading-Unloading Time / Process Time / Open Job Column Values
- Planning Board Matrix / Candidate Jobs / Batch Detail / Recent Batches
- Masking / Unmasking Planning
- Board Điều Độ (gồm Trial Day Shift: MOVE toàn bộ lịch ngày đang xem ±1 ngày, không clone và ngày nguồn rỗng sau commit)
- Part Tracker / Job Tracker
- Logic & Hướng dẫn
- Login/Auth

## Canonical Planning flow

`All Open Job -> ST Scope -> ST Operation Mapping -> Main Operation -> Planning Chain -> Candidate -> Batch -> Schedule`

For Candidate presentation when sorting by NextOperation:

`RAW NextOperation -> ST Operation Mapping -> Main Operation -> Main Planning Order`

Operation Code Order (`md_operation.planning_sort_order`) is only an optional tie-breaker inside the same Main. READY/WAIT, Batch and Schedule remain controlled by their canonical models and are not changed by presentation sorting.

Dashboard and Planning Board Workload intentionally use different read populations. Dashboard uses its canonical Dashboard ST Scope (`PLANNING_OPERATION + Dashboard INTERMEDIATE + ST_SCOPE_ONLY`). Planning Board Workload Summary mirrors the Planning Board Candidate population: Open Job + live Current Main + RAW `NextOperation` inside the resolved Planning ST View, then aggregates READY / WAIT / HOLD from active Planning Chain rows of those Candidate Jobs only.


## All Open Job incremental sync

V377 updates `open_job_current` from every import but rebuilds `planning_job_operation` only for NEW/CHANGED Jobs; UNCHANGED Jobs are skipped and CLOSED Jobs only deactivate live chain rows. Unknown RAW `NextOperation` codes are reported after import and remain unclassified until the planner configures them in ST Operation Flow. No database migration is required for V377.

## Candidate loading

The current board uses progressive Candidate requests (200 rows/page), progressive DOM rendering, lazy Route Matrix, and lazy All Open Source values. The Candidate API still supports explicit `all` mode for diagnostics/compatibility.

## Planning snapshot cache

The v316/v317 snapshot experiment is not part of the current runtime read path. Historical migrations 058/059 are kept; migration `066_drop_unused_planning_snapshot_cache.sql` removes the unused snapshot tables/functions/dirty triggers safely.

## Environment

Copy `.env.example` to `.env.local` and set the required values. Never commit `.env.local`.

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_DB_URL`

Optional:

- `DB_CONNECTION_STRING`
- `DB_POOL_MAX`
- `DB_CONNECT_TIMEOUT_MS`
- `ADMIN_EMAILS`

## Commands

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm run dev
```

`npm run clean:delivery` removes local/generated delivery artifacts.

## Database

Apply Supabase migrations in numeric order through migration 071. Do not delete or rewrite already-applied historical migrations.

See `docs/CURRENT_ARCHITECTURE.md` for the current architecture and `AUDIT_CLEANUP.md` for the latest cleanup audit.

## ERP Standard V7

Toàn bộ production UI dùng ERP Standard V7. Nguồn chuẩn hiện tại:

- `ERP_STANDARD_V7.md`
- `src/lib/erp/st-navigation.ts`
- `src/components/app-tabs.tsx`
- `src/components/erp/erp-kit.css`

Navigation đã chuyển từ 10 tab ngang hàng sang kiến trúc ERP 2 tầng: **Business Module → Workspace**. Bốn Work Center chuẩn là **Vận hành / Theo dõi / Master Data / Quản trị**. Planning và các page dùng shell cũ đều đọc cùng một nguồn navigation. Master Data sidebar tiếp tục chia theo domain Sản phẩm / Operation & Routing / ST Model.

V6 kế thừa toàn bộ interaction V5: Configuration split workspace, sticky action, ERP dialog/toast, field states, schedule workspace, tracker fact-sheet. Business logic/API/DB không đổi trong vòng UI này.

Trang `/erp-kit` là showcase/reference component, không phải nguồn business logic.

## Configuration ERP Work Center V1

Tab Cấu hình đã được tổ chức lại theo ERP Work Center: Health Dashboard + 5 domain (Operation Architecture, Organization & Resource, Recipe & Batch, Time & Scheduling, Automation). Xem `CONFIGURATION_ERP_WORK_CENTER_V1.md`.

## UI languages · EN / VI

The application now has one shared bilingual UI architecture. **EN is the default**; users can switch EN / VI from the ERP header. This changes presentation text only and does not translate or mutate database/business data. See `UI_I18N_ARCHITECTURE.md`.

For every future UI text change, update EN and VI together and run `npm run i18n:check`.

## Production Execution

Added `/production-execution` for Production department work reporting. Data comes from Scheduling + Masking/Unmasking; execution status is stored separately in migration `068_production_execution.sql`. Status flow: `WAITING → ON-GOING → DONE`. See `PRODUCTION_EXECUTION.md`.

## Process Requirement storage

`md_process_requirement` uses the V375 two-level filter: Part/Revision Gate first (default `ST = NO`), then Active `MD:REQ:*` Recipe Rules + Manual Keep with blank values skipped. V376 adds a lightweight Requirement-only rebuild from the Master Excel. It truncates and reconstructs only `md_process_requirement` in small chunks and does not rebuild Routing, Recipe, Auto Bridge or Planning Chain. Use this path when reducing database size; use full Master Import only when other Master data also changed.

## V380 · Planning Matrix Previous Main + Zoom
- READY Batch focus keeps the selected Main plus each visible Job's immediate Previous Main Planning column.
- PREV cells are read-only and show prior Batch No + scheduled start when available.
- Compact rows are denser; matrix-only zoom supports 70%..130% and persists locally.
- No change to Planning Chain, Batch, Recipe, Schedule, or Production Execution logic.

## V381 · Recipe Compatibility Lock Restore
- Batch Compatibility no longer treats a temporarily missing Route Matrix `effective_recipe_key` as "no Recipe".
- Missing target Recipe metadata is resolved server-side from the exact Planning Operation + Open Job + current Recipe Rules before compatibility is calculated.
- Different-Recipe READY Jobs are locked again; V380 Previous Main/compact/zoom behavior is unchanged.

## Database backup / restore (V383)

For a compressed backup of the ST Planning `public` PostgreSQL schema, install PostgreSQL client tools and run:

```bash
npm run db:backup
```

Windows: double-click `scripts/backup-database.cmd`.

Restore is destructive and requires an explicit token:

```bash
npm run db:restore -- backups/st-planning_YYYYMMDD_HHMMSS.dump --confirm=RESTORE
```

See `docs/DATABASE_BACKUP_V383.md` for details.

## V385 · Selected Main + Next Main Planning Recipe
- READY focus now keeps three context positions: virtual Previous Main, the selected physical Main (for example PRIMER), and virtual Next Main Planning.
- The selected Main shows status/READY only; its Recipe is no longer displayed inside the selected Main cell.
- Next Main Planning resolves the immediate downstream Main independently per Job and shows that downstream Main's Recipe when available.
- Recipe Compatibility Lock for the selected Batch Main is unchanged.



## V387/V389 · Job/Main Hold

Run `supabase/migrations/071_job_main_operation_hold.sql`. Planning Matrix READY/WAIT cells can be held at the exact Job + Main occurrence. V389 removes the old inline `H` button: right-click a holdable Main cell and choose `Hold`; right-click a held cell and choose `Unhold`. Held Jobs remain visible in Candidate Jobs, the held Main cell displays `HOLD`, and Batch selection stays disabled for that exact occurrence. Hold reason/note/user/time survive All Open Job imports. Job Hold remains separate from Schedule/Batch HOLD.

## V390 · Planning Board instant save sync

Normal Planning Board saves no longer reload the page. Create/Add Batch and Job/Main Hold/Unhold update only the affected Jobs. Hold/Unhold patches the visible cell immediately after the server commit, then reconciles that Job with the canonical Candidate + Route Matrix delta in the background. Full Candidate loads clear Route Matrix cache first so stale statuses cannot survive a manual refresh. Scroll/filter/zoom/density/column layout remain mounted during normal saves. No migration is required.

### V391 Logic & Guide live DB
`/logic-guide` now reads each live Mapping table independently. One query error no longer makes the entire live Mapping section appear empty; healthy production tables continue to render and the affected table shows its own DB error.

## V395 · Planning Workload Summary

Planning Board adds a read-only ERP Workload Summary above the Matrix. It aggregates active Planning Chain rows by Area + Main Operation and shows READY / WAIT / HOLD as Jobs, pcs and dm², plus total load. Clicking a status metric hydrates route state if necessary and filters the Candidate Matrix to that exact Main + status. Summary refreshes after Batch create/add, Hold/Unhold, Rebuild Chain and scope changes. No migration is required.


## V396 · Rebuilt ST Workload Dashboard

`/dashboard` has been rebuilt from a blank visual surface. It now shows unique open ST Job / pcs / dm² totals; WAIT / READY / PLANNED / PLANNED-UNSCHEDULED / SCHEDULED / HOLD workload; a Main Planning summary table; a stacked dm² chart by Main Planning; and complete CAT3 then CAT5 Job lists with Part, Planning, Batch and Schedule context. The previous Dashboard control-tower/AI panels are no longer rendered. No migration is required.

## V397
Dashboard `Main Planning Workload Summary` now expands every Main Planning into Recipe No. + Recipe Name workload rows, with WAIT / READY / PLANNED / PLANNED-UNSCHEDULED / SCHEDULED / HOLD metrics in Job / pcs / dm².

## V399 · Dashboard split by Area

Dashboard `Main Planning Workload Summary` is now rendered as one section per Area instead of one table mixing all Areas. Every Area has the same KPI-card family as the global Dashboard (`UNIQUE JOBS`, WAIT, READY, PLANNED, PLANNED-UNSCHEDULED, SCHEDULED, HOLD), followed by that Area's Main Planning → Recipe No./Recipe Name workload table. Main/Recipe and CAT3/CAT5 tables no longer use vertical max-height scrollers; all rows render in the page while horizontal scrolling remains available for wide ERP tables. V398 RAW NextOperation ST filtering and all Planning/Recipe/Batch/Schedule business logic are unchanged.
## V404 — Current Main resolver ST population

V400 strict Planning-Operation-only gate is superseded. Dashboard and Planning Board use the synced Current Main resolver result: RAW NextOperation may be a Planning Operation or an active Bridge Intermediate, but the Job must have a live Current Main row in the Planning Chain. ST_SCOPE_ONLY remains excluded. Immediate Operation is the RAW All Open Job NextOperation grouped under that Current Main.



## V401 · Dashboard bỏ PLANNED riêng

Dashboard bỏ hoàn toàn card/cột/series `PLANNED`. Nếu `planning_job_operation.status='PLANNED'` xuất hiện trong dữ liệu nội bộ nhưng chưa có Schedule, Dashboard chuẩn hóa nó vào `PLANNED-UNSCHEDULED`. Vì vậy global KPI, KPI từng Area, Main Planning → Recipe table và stacked dm² chart chỉ còn `WAIT / READY / PLANNED-UNSCHEDULED / SCHEDULED / HOLD`. Không thay Planning Chain/Batch/Schedule state model.

### V402 — Navigation
Dashboard is now a standalone top-level WORK CENTER and all sub-tabs remain visible in the left navigation for every work center. Planning/Batch/Recipe/Schedule logic is unchanged.

## V404 · Dashboard charts at top + canonical Immediate workload

Both charts are moved to the top of Dashboard. The Surface dm² stacked chart still fits the viewport without horizontal scrolling. The combo chart now groups `Current Main / RAW NextOperation`, uses Surface dm² columns on the left axis and Qty pcs line on the right axis fixed at 10,000 pcs, prints dm²/pcs labels at each bar/point, and appends a `TOTAL / ALL ST` group.

## V405 - Build fix
- Fixed TS7006 implicit `any` for `code` in `planning-view-server.ts`. No business logic changes.

## V406 · Surface-first workload presentation

Dashboard and Planning Board Workload Summary now treat **Surface dm² as the primary workload metric** everywhere a workload metric was previously led by Job count. KPI cards, Main Planning / Recipe status cells, Planning Board READY/WAIT/HOLD workload cells and totals show `dm²` first and largest, with `pcs` and `Job` as secondary context. CAT3/CAT5 summary headers also lead with total dm², and their metric columns place dm² before Qty. This is presentation-only; workload population, Current Main/Bridge resolver, status buckets and aggregation formulas are unchanged.

## V407 · Dashboard chart calculation audit

Dashboard adds a read-only per-Job audit table directly below the `Current Main / RAW NextOperation` combo chart. It exposes LastOperation, RAW NextOperation/Immediate Operation, Planning Board resolver mode, Previous/Current/Next Main, Qty source fields, Surface source/calculation fields and AllOperation. `Chart Group` is the exact `Current Main / RAW NextOperation` aggregation key. V407 does not change the chart formula; it makes the source rows visible first so the formula can be validated Job-by-Job.

## V409 · Dashboard all RAW NextOperation + canonical ST resolver
Dashboard no longer pre-filters RAW `open_job_current.next_operation` to direct `PLANNING_OPERATION`. It starts from every Open Job RAW NextOperation, resolves the live Current Main with the same context-aware Planning Board rule (`LastOperation + RAW NextOperation`), then keeps only ST membership: direct ST Planning Operation resolving to Current Main or a valid Active Bridge Intermediate pair leading to that Current Main. Unrelated non-ST flows and `ST_SCOPE_ONLY` are excluded. `ST TOTAL`, status workload, Area/Main/Recipe summary, CAT3/CAT5 and audit rows use this same population. Chart grouping/formula is not redesigned in V409; only its input population is corrected.

## V408 · Dashboard strict RAW NextOperation ST validation
Dashboard population is temporarily made deliberately strict for validation: an Open Job is included only when its physical RAW `open_job_current.next_operation` directly matches an active `md_st_operation_scope` row with `operation_type='PLANNING_OPERATION'`. Bridge Intermediate and `ST_SCOPE_ONLY` codes do not widen Dashboard population. `ST TOTAL` is a pure unique Open Job total after this RAW gate; Planning Chain/Batch/Schedule are read only afterward for status/Main/Recipe context. Planning Board V404 resolver behavior is unchanged. Chart grouping is intentionally not redesigned in V408 and will be reviewed after the filtered Dashboard numbers are validated.

## V410 build isolation
Build now removes/excludes nested stale version source folders (`st_v###`, `work_v###`) before Next.js type-check. This prevents copied legacy source trees from being compiled together with the current `src/`.

## V418 · Explicit ST Scope for Bridge Intermediate

Bridge discovery and ST membership are now independent. ST Operation Flow lists every active Bridge Intermediate and allows the planner to mark only the real Surface Treatment subset as `INTERMEDIATE` in `md_st_operation_scope`. Dashboard resolves `LastOperation → RAW NextOperation → Current Main` first, then counts Immediate only when the resolved Bridge Role is `INTERMEDIATE` and the explicit ST Scope Type is also `INTERMEDIATE`. This tag does not create a Main/Batch/Schedule and removing it does not modify the Auto/Manual Bridge.

## V419 · Dashboard-only ST membership for Intermediate

`INTERMEDIATE` in ST Operation Flow is now an explicit Dashboard-only membership flag. Bridge resolution still determines the Intermediate role and Current Main. Saving/removing this flag does not sync or mutate Planning Chain, All Open Jobs, Candidate, Batch, Recipe or Schedule. All Open Jobs operational visibility continues to use only `PLANNING_OPERATION` and `ST_SCOPE_ONLY`.

- V423: Dashboard WAIT restored by expanding only canonical Dashboard ST Jobs to their active Planning Chain occurrences; Dashboard ST Scope logic remains unchanged.

- V424: superseded by V425. Directly scanning every active Planning Chain row was too broad and could count Jobs not present on the Planning Board Candidate matrix.

- V425: Planning Board Workload Summary now uses the exact Candidate Job membership gate first (Open Job + live Current Main + RAW NextOperation in the resolved Planning ST View), then aggregates READY/WAIT/HOLD only for those Jobs. Workload drill-down and Route Matrix therefore reconcile by Job count; Dashboard ST Scope remains Dashboard-only.


- V426: Planning Board Workload Summary keeps V425 Candidate reconciliation but splits READY into `Previous Main Scheduled` and `Previous Main Unscheduled / START` (their sum is the original READY). Dashboard Surface+Qty combo chart now consumes the full panel width. Scheduling Board adds `ST Workload Summary · By Area` above each top-level schedule area, reusing the canonical Dashboard workload engine and filtering only by that area's mapped Main Operation pool.

- V428: Dashboard CAT3/CAT5 tables are sorted by canonical NextOperation Order: Main Planning Order → Operation Code Order inside the same Main → RAW NextOperation → Job. This is presentation-only and does not change Dashboard population or planning logic.
- V429: Dashboard CAT3/CAT5 tables now sort primarily by RAW NextOperation Order (`md_operation.planning_sort_order`). Main Planning Order is only a fallback for RAW operations without an explicit order; population/calculation logic is unchanged.

- V430: Board Điều Độ có Trial Day Shift để MOVE toàn bộ lịch ngày đang xem ±1 ngày trong một transaction; không clone Batch/Schedule và ngày nguồn rỗng sau commit.
- V431: Recipe dropdown trên Board Điều Độ được lọc theo Schedule Area/Main Operation mapping. Mỗi lane chỉ hiện Recipe có active `md_main_operation_recipe.standard_operation` thuộc Main Operation pool của area; khu gộp dùng union operation pool. Existing schedule giữ Recipe hiện tại nếu mapping đã đổi; Create Empty Batch lọc theo Main Operation đã chọn; manual-grid server revalidate Recipe → Main trước khi tạo Batch/Schedule.

- V432: Board Điều Độ thêm server-side Previous Main lock chỉ khi ADD existing Planning Batch vào Schedule. Mọi Job có Previous Main phải có active Schedule với planned_end, và Current planned_start phải >= Previous planned_end. Main đầu tiên được bypass. Chemical Line proposal/capacity logic giữ nguyên; guard chỉ kiểm tra final effectiveStart trước INSERT. PATCH/Edit, Trial Day Shift và Planning Chain READY/WAIT không đổi.
