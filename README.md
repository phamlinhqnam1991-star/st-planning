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

Apply Supabase migrations in numeric order through migration 067. Do not delete or rewrite already-applied historical migrations.

See `docs/CURRENT_ARCHITECTURE.md` for the current architecture and `AUDIT_CLEANUP.md` for the latest cleanup audit.

## ERP Standard V5

Toàn bộ production tabs dùng ERP Standard V5. Nguồn chuẩn UI hiện tại:

- `ERP_STANDARD_V5.md`
- `src/components/erp/erp-kit.css`
- `src/components/erp/erp-app-header.tsx`
- `src/lib/erp/st-navigation.ts`

`/planning` là Planning Board ERP canonical; `/planning-old` đã bị loại.

V5 deep thêm interaction/workspace bên trong toàn bộ production UI: Configuration split editor + data grid, sticky action column, ERP confirm dialog, ERP toast trực tiếp, field-state/focus chuẩn, Schedule command row, Tracker fact-sheet và responsive interaction. Source production không còn `alert()`, `confirm()` hoặc `prompt()` native. Business logic/API/DB không thay đổi trong vòng UI này.

Trang `/erp-kit` chỉ còn là showcase/reference component, không phải nguồn business logic.
