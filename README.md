# ST Planning Web App

Surface Treatment planning application built with Next.js 16, TypeScript, PostgreSQL/Supabase and Vercel.

## Runtime modules

- Master Data / Import Master
- All Open Jobs / Import All Open Jobs
- Configuration: ST Scope, ST Operation Flow, Source → Main Mapping, Main Operation, ST Group, Physical Area, Schedule Area, Planner assignment
- Recipe & Rules / Loading-Unloading Time / Process Time / Open Job Column Values
- Planning Board Matrix / Candidate Jobs / Batch Detail / Recent Batches
- Masking / Unmasking Planning
- Board Điều Độ
- Part Tracker / Job Tracker
- Logic & Hướng dẫn
- Login/Auth

## Canonical Planning flow

`All Open Job -> ST Scope -> ST Operation Mapping -> Main Operation -> Planning Chain -> Candidate -> Batch -> Schedule`

For Candidate presentation when sorting by NextOperation:

`RAW NextOperation -> ST Operation Mapping -> Main Operation -> Main Planning Order`

Operation Code Order (`md_operation.planning_sort_order`) is only an optional tie-breaker inside the same Main. READY/WAIT, Batch and Schedule remain controlled by their canonical models and are not changed by presentation sorting.

Dashboard and Planning Board Workload use the same ST population gate: RAW `open_job_current.next_operation` must belong to the visible ST Planning scope before any Planning Chain status is aggregated. Future ST chain rows do not pull a Job into ST workload when its current RAW NextOperation is outside ST.


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
## V400 — Strict RAW NextOperation ST-only gate

Dashboard và Planning Board chỉ nhận Job khi RAW `open_job_current.next_operation` là `PLANNING_OPERATION` active được khai báo trực tiếp trong `md_st_operation_scope`. `ST_SCOPE_ONLY`, Auto-Bridge/INTERMEDIATE và RAW operation ngoài ST không được dùng để đưa Job vào Board/Dashboard. Bridge vẫn giữ vai trò nội bộ trong Planning Chain sau khi Job đã thuộc population hợp lệ. Saved ST View chỉ được phép là tập con của danh sách ST canonical này.



## V401 · Dashboard bỏ PLANNED riêng

Dashboard bỏ hoàn toàn card/cột/series `PLANNED`. Nếu `planning_job_operation.status='PLANNED'` xuất hiện trong dữ liệu nội bộ nhưng chưa có Schedule, Dashboard chuẩn hóa nó vào `PLANNED-UNSCHEDULED`. Vì vậy global KPI, KPI từng Area, Main Planning → Recipe table và stacked dm² chart chỉ còn `WAIT / READY / PLANNED-UNSCHEDULED / SCHEDULED / HOLD`. Không thay Planning Chain/Batch/Schedule state model.
