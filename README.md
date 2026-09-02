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

Apply Supabase migrations in numeric order through migration 066. Do not delete or rewrite already-applied historical migrations.

See `docs/CURRENT_ARCHITECTURE.md` for the current architecture and `AUDIT_DEEP.md` for the latest cleanup audit.

## ERP Template Kit

Trang preview UI mới: `http://localhost:3000/erp-kit`

Template kit nằm tại:

- `src/components/erp/*` — App Shell, Page Header, Toolbar, Data Grid, Form, Status, KPI, Tabs, Section.
- `src/lib/erp/*` — design tokens, status config, table presets, UI config.
- `src/components/erp/erp-kit.css` — style namespace riêng `erpkit-*`, chưa thay CSS các màn hình nghiệp vụ hiện tại.

Giai đoạn này chỉ thêm Design System + Showcase. Planning / Batch / Schedule / Database chưa được migrate hoặc thay đổi logic.

### ERP All Tabs Demo

Mở `/erp-kit` để duyệt mock UI cho toàn bộ tab hiện có trước khi áp style vào màn hình production. Demo gồm Master Data, Cấu hình, Part Tracker, Job Tracker, All Open Jobs, Planning Board, Masking / Unmasking, Board Điều Độ, Import Master và Logic & Hướng dẫn. Demo không đọc/ghi database.

## Planning ERP dual route

Trong giai đoạn migrate giao diện Planning:

- `/planning` = ERP version mới, dùng logic/runtime Planning hiện tại.
- `/planning-old` = baseline UI cũ để regression và đối chiếu.

Xem `PLANNING_ERP_DUAL_ROUTE.md` trước khi xóa baseline.

## ERP UI toàn hệ thống

Bản hiện tại đã áp ERP Template Kit cho toàn bộ các tab production còn lại. Planning Board ERP giữ nguyên logic đã chốt; `/planning-old` tiếp tục là baseline cũ để so sánh. Xem `ERP_FULL_UI.md` để biết phạm vi và nguyên tắc migration.
