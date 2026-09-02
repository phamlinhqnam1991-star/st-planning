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

## ERP Standard V6

Toàn bộ production UI dùng ERP Standard V6. Nguồn chuẩn hiện tại:

- `ERP_STANDARD_V6.md`
- `src/lib/erp/st-navigation.ts`
- `src/components/app-tabs.tsx`
- `src/components/erp/erp-kit.css`

Navigation đã chuyển từ 10 tab ngang hàng sang kiến trúc ERP 2 tầng: **Business Module → Workspace**. Bốn Work Center chuẩn là **Vận hành / Theo dõi / Master Data / Quản trị**. Planning và các page dùng shell cũ đều đọc cùng một nguồn navigation. Master Data sidebar tiếp tục chia theo domain Sản phẩm / Operation & Routing / ST Model.

V6 kế thừa toàn bộ interaction V5: Configuration split workspace, sticky action, ERP dialog/toast, field states, schedule workspace, tracker fact-sheet. Business logic/API/DB không đổi trong vòng UI này.

Trang `/erp-kit` là showcase/reference component, không phải nguồn business logic.
