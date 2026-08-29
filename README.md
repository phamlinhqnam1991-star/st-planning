# ST Planning — Master Data

Baseline đầu tiên cho ST Planning theo **Next.js + Supabase PostgreSQL + Vercel**. Project này chỉ triển khai **Master Data + Import Master Excel**, chưa triển khai Planning/Waiting/Eligible/Capacity.

## File nguồn được hỗ trợ

`Partinfo_Used for Surface Treatment - *.xlsx`, sheet `Part_Masterlist`, với cấu trúc 108 cột đã xác nhận:
- Part: `Program`, `PartCluster`, `PartDescription`, `PartNum`, `RevisionNum`, `Surface (dm2)`
- Routing: `OpCode_OP10` ... `OpCode_OP500`
- Finish: `PRIMER1..ANTIABRATION`, tên Primer/Topcoat/AntiAbrasion/Varnish, Alloy/Temper/TSA/Chemicalconv Airbus
- 38 Process Requirement columns

Mỗi lần import là **full snapshot sync**: dữ liệu có trong file được thêm/cập nhật và active; dữ liệu cũ không còn trong file chuyển `is_active=false`, không xóa lịch sử.

## Master Data được cập nhật

- `md_part`
- `md_part_revision`
- `md_operation`
- `md_routing_detailed`
- `md_material_finish`
- `md_process_requirement`
- `md_st_operation_scope`
- `md_st_routing_summary`
- `md_st_routing`
- `md_part_routing`
- `master_import_batch`

ST Routing giữ logic baseline: chỉ lấy operation thuộc scope 125 mã đã chốt; giữ thứ tự nguồn; operation lặp dùng `*_BEFORE_*`; `UNMSKG` luôn dùng `*_BEFORE_*`; trường hợp cùng detail lặp lại dùng `_01`, `_02`; không tự chọn revision mới nhất và không tự loại BOM. 1,060 routing signature cũ được seed để cố gắng giữ nguyên `RT_ST_0001...RT_ST_1060`; signature mới được cấp mã tiếp theo.

# Cài từ tài khoản mới hoàn toàn

## 1. Supabase
1. Tạo project mới trong Supabase.
2. Vào **SQL Editor** → chạy lần lượt:
   - `supabase/migrations/001_schema.sql`
   - `supabase/migrations/002_rebuild_st_routing.sql`
3. Vào **Authentication → Users** → tạo user đầu tiên bằng email/password.
4. Vào **Project → Connect** lấy:
   - Project URL
   - Publishable key
   - Database connection string. Với Vercel nên dùng pooler URL trong Connect panel.
5. Vào API keys lấy **secret key**. Key này chỉ đặt ở Vercel/server, tuyệt đối không đưa vào biến `NEXT_PUBLIC_*`.

## 2. GitHub
1. Tạo repository mới, ví dụ `st-planning`.
2. Khi tạo repo để trống README/.gitignore nếu bạn sẽ push nguyên project này.
3. Giải nén ZIP, mở Terminal tại thư mục project:

```bash
git init
git add .
git commit -m "Initial ST Planning master data"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/st-planning.git
git push -u origin main
```

## 3. Vercel
1. Login Vercel bằng GitHub.
2. **Add New → Project** → Import repo `st-planning`.
3. Framework tự nhận **Next.js 16** (project dùng `src/proxy.ts`, không dùng convention middleware cũ).
4. Thêm Environment Variables từ `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `SUPABASE_DB_URL`
   - `ADMIN_EMAILS` = email được phép import, có thể nhiều email ngăn cách bằng dấu phẩy.
5. Deploy.

## 4. Chạy local

```bash
cp .env.example .env.local
npm install
npm run dev
```

Mở `http://localhost:3000`.

## 5. Import
1. Login.
2. Chọn file `.xlsx` master.
3. File được upload **trực tiếp từ browser → Supabase Storage**. Không upload file 13 MB qua Vercel Function.
4. API chỉ nhận `storagePath`, tải file server-side và stream Excel vào PostgreSQL.
5. Sau khi base master cập nhật xong, PostgreSQL rebuild ST Routing và Part → Routing.
6. Các ô thống kê trên Dashboard có thể bấm vào để duyệt/tìm kiếm từng Master Data (50 dòng/trang).

## Lưu ý Vercel
File master hiện tại khoảng 13 MB, lớn hơn giới hạn request body 4.5 MB của Vercel Functions. Vì vậy project cố ý dùng direct upload vào Supabase Storage. Route import dùng Node runtime và `maxDuration=300` giây. Nếu dữ liệu sau này tăng quá nhiều và import vượt thời gian này, kiến trúc tiếp theo nên tách worker/import service; chưa cần đổi ở baseline hiện tại.

## Bảo mật
- RLS bật cho toàn bộ bảng master; user authenticated chỉ có quyền đọc.
- Ghi master chỉ qua server bằng secret-key/Postgres connection.
- Storage bucket private, chỉ authenticated user được upload/read.
- `ADMIN_EMAILS` chặn user không được phép chạy import.
- Không commit `.env.local` lên GitHub.


## Incremental Import + Reset All
- Chạy thêm `supabase/migrations/003_incremental_import_reset.sql`
   - `supabase/migrations/004_st_operation_mapping.sql` trên database hiện tại.
- Lần đầu Full; lần sau SHA-256 theo Part+Revision, chỉ NEW/CHANGED xử lý master nặng.
- Reset All có xác nhận kép; giữ ST Operation Scope/system config.


### ST Operation Mapping
Migration `004_st_operation_mapping.sql` adds the approved Planning Operation Master, 49 mapping rows, occurrence normalization for PRIMER/TOPCOAT, sequence normalization for HE-BAKE, and standardized fields in ST Routing Chain while preserving source routing.


## Area Master (Migration 005)
- Chạy `supabase/migrations/005_area_master.sql` sau migration 004.
- Seed sẵn 14 Area đã chốt: Chemical line, NDT, Automatic shot peening, Manual Shot peening, Masking, Unmasking, Painting, Plating, Sirius cleaning, Manual Blasting, Auto Blasting, Passivation, Powder coating, He-bake Oven.
- Area là danh mục động: có thể Add/Edit/Activate/Deactivate trên web.
- Người dùng tự gán ST Group vào Area; không hard-code mapping nhóm → khu vực.
- Một ST Group chỉ thuộc một Area tại một thời điểm.


## Migration 006 – ST Operation Mapping Admin
Nếu database đã chạy 001→005, chạy thêm `supabase/migrations/006_operation_mapping_admin.sql`. Tab ST Operation Mapping cho phép Add, Edit/Move và Remove (inactive) Operation Code; sau mỗi thay đổi hệ thống refresh mapping của ST Routing, không sửa Routing Detail nguồn.


## Migration 007 – ST Group Master
Nếu database đã chạy 001→006, chạy thêm `supabase/migrations/007_st_group_master.sql`. ST Group trở thành Master động: có thể Add/Edit/Deactivate trên web. Operation Mapping và Area Assignment lấy danh sách từ ST Group Master. Không hard-code danh sách nhóm.


## UI v7 – Tabs + Part Tracker
Không thay schema/database và không cần migration mới nếu đã chạy `001` → `007`.

Navigation toàn app:
- **Master Data**: Part, Revision, Source Operation, Routing Detail, Material Finish, Process Requirement, ST Routing Master/Chain, Part → Routing.
- **Cấu hình**: Operation Master, ST Operation Mapping, ST Group Master, Area Master.
- **Part Tracker**: tìm PartNum/Description và hiển thị toàn bộ dữ liệu liên quan theo từng Revision, gồm Finish, Requirements, Routing Detail, ST Routing, Standard Operation, ST Group, Area và Time Rule.
- **Import Master**: Incremental Import, Reset All và Import History.


## Fix v8 – Dashboard / Vercel / Git
- Dashboard không còn biến toàn bộ Master Data thành `0` khi chỉ một bảng Supabase bị lỗi.
- Lỗi Supabase hiển thị `message / details / hint / code`, không còn `[object Object]`.
- `.env.local`, `.env*`, `.vercel`, `tsconfig.tsbuildinfo` không được đưa lên GitHub.
- Nếu `.env.local` đã từng được Git track, chạy `git rm --cached .env.local` rồi commit lại.
- Không cần migration SQL mới; database vẫn dùng `001` → `007`.


## v9 – No Login
Đã bỏ màn hình đăng nhập và auth gate của các page/API trong web app theo yêu cầu. `/login` tự chuyển về `/master-data`. Supabase vẫn dùng server-side secret key cho truy cập dữ liệu.


## Fix v10 – No Login Import Build
- Sửa TypeScript `TS2339: Property 'id' does not exist on type '{ email: string; }'`.
- Khi app chạy No Login, `master_import_batch.started_by` được ghi `NULL` thay vì `user.id`.
- Không thay đổi logic Import Master, Incremental Import hoặc Routing.


## UI v11 – ERP Layout
- Bỏ dashboard statistic cards ở Master Data và Cấu hình.
- Chuyển sang bố cục ERP: dark system header → module tabs → sidebar module → work area.
- Master Data/Cấu hình hiển thị dạng table overview với Record count và Open action.
- Các bảng chi tiết dùng layout ERP thống nhất, mật độ dữ liệu cao hơn, border vuông và không dùng shadow card.
- Không thay đổi database schema, Import logic, Routing, Mapping, ST Group, Area hoặc Part Tracker data logic.


## UI v13 – Part Tracker ERP
- Part Tracker dùng cùng ERP header/module navigation với các tab còn lại.
- Bỏ toàn bộ card dashboard/summary bo tròn trong Part Tracker.
- Search result, Part Summary, Process Requirement, Routing Detail và ST Planning Chain hiển thị dạng ERP panel/table.
- Logic tra cứu Part và dữ liệu không thay đổi.


## UI v14 – Auto Responsive Mobile
- Tự nhận kích thước màn hình, không cần nút Mobile/Desktop.
- Desktop giữ nguyên ERP layout.
- Tablet/mobile: sidebar tự chuyển thành tab ngang cuộn được.
- Module tabs cuộn ngang bằng touch.
- Data table giữ độ rộng đọc được và tự scroll ngang.
- Form, Import, Area, ST Group, Operation Mapping tự xếp 1–2 cột.
- Part Tracker tự chuyển summary về 1 cột.
- Input mobile dùng font-size 16px để tránh iPhone tự zoom.
- Không thay database, routing hay business logic.


## Performance v15 – Master Search
Nếu database đã chạy `001` → `007`, chạy thêm:
`supabase/migrations/008_master_search_indexes.sql`

Thay đổi:
- Part Revision, Routing Detail, Material Finish, Process Requirement và Part → Routing tìm theo `part_num = ...` thay vì `ILIKE '%...%'`.
- Các bảng lớn có composite index theo `part_num + is_active + revision`.
- Process Requirement (~2M+ rows) không còn full scan khi tìm Part.
- Nếu query database lỗi, trang hiển thị lỗi trong ERP workspace thay vì Next.js Runtime Error.


## Process Recipe v16 – Phase 1 Paint
Nếu database đã chạy tới `008`, chạy thêm:
`supabase/migrations/009_process_recipe_paint.sql`

Kiến trúc mới dùng chung cho tất cả process:
- `md_process_recipe`: Recipe catalog dùng chung.
- `md_operation_recipe_mapping`: Standard Operation → Recipe được phép chạy.
- `md_part_process_recipe`: Part + Revision + Standard Operation → Recipe thực tế.

Phase 1 chỉ tự động sinh Paint Recipe từ Master List:
- `PRIMER1/2/3` + `Primer1Name`
- `TOPCOAT1/2` + `TopcoatName`
- `ANTIABRATION` + `AntiAbrasionName`
- `VarinishName` (name-based khi source chưa có recipe no trong Material Finish hiện tại)

Tab `Cấu hình → Process Recipe` hỗ trợ:
- xem/thêm/sửa recipe,
- quản lý Operation → Recipe,
- tra cứu Part → Recipe,
- `Batch Key` làm khóa tương thích để gom lô Planning sau này.

Các process ngoài Painting chưa tự sinh recipe cho đến khi rule tương ứng được chốt.


## Fix v16.1 – Process Recipe duplicate UPSERT
- Sửa lỗi SQLSTATE `21000: ON CONFLICT DO UPDATE command cannot affect row a second time`.
- Trước khi UPSERT `md_part_process_recipe`, hệ thống deduplicate theo `(part_num, revision_num, standard_operation)`.
- Nếu `009` đã chạy dở và lỗi, có thể chạy riêng `009A_fix_process_recipe_duplicate.sql`.


## Fix v17 – Complete Process Recipe Migration
`009_process_recipe_paint.sql` đã được viết lại đầy đủ, idempotent và theo đúng thứ tự:
1. Tạo đủ 3 bảng.
2. Tạo index + RLS.
3. Chuẩn hóa source Paint vào temporary table.
4. Backfill Process Recipe.
5. Backfill Operation → Recipe.
6. Backfill Part + Revision + Operation → Recipe.
7. Trả về counts để xác nhận.

**Phải chạy toàn bộ file 009**, không highlight/chạy riêng phần cuối.
Sau khi 009 chạy thành công có thể chạy `009_verify_process_recipe.sql` để kiểm tra.


## v19 - ANTI_ABRASION Recipe Name + Batch Key
Run `supabase/migrations/010_fix_anti_abrasion_recipe_batch_key.sql` after migration 009.

Final Paint rules:
- PRIMER / PRIMER2 / PRIMER3: Recipe No=`Primer 1`, Recipe Name=`Primer1Name`
- TOPCOAT1 / TOPCOAT2: Recipe No=`Top Coat`, Recipe Name=`TopcoatName`
- ANTI-ABRASION: Recipe No=`Anti Abrasion Paint`; Recipe Group remains `ANTI_ABRASION`.
  If source `AntiAbrasionName` is blank, fallback:
  - 004 = 23-T3-10 White Resistant Polyurethane Coating
  - 005 = 23-T3-105 Gray Resistant Polyurethane Coating
  - 014 = CA 8100 Gray Abrasion Resistant Topcoat
  - 015 = CA 8100 White Abrasion Resistant Topcoat
  - 020 = CA 8101 Gray Series Anti-Chafe Topcoat
  - 019 = CA 8101 White Series Anti-Chafe Topcoat
  - 160 = CA8100F12197BMG43K base component Orange
- VARNISH: Recipe No=`Clear Coat`, Recipe Name=`VarinishName`

Batch Key is now:
`Process Family | Recipe Group | Recipe Name`

Recipe No is not included in Batch Key.


## v20 - Recipe No 3-digit normalization
Run `supabase/migrations/011_normalize_recipe_no_3_digits.sql` after migration 010.

Numeric-only Recipe No is canonicalized to at least 3 digits:
- `1` -> `001`
- `4` -> `004`
- `12` -> `012`
- `19` -> `019`
- `160` -> `160`

Non-numeric recipe codes are unchanged.
Future imports and manually-added recipes use the same normalization.
Batch Key still excludes Recipe No.


## v21 - Process Recipe Master is Recipe Name source of truth

Run:
`supabase/migrations/012_process_recipe_master_lookup.sql`

Final architecture:
- Master List supplies Recipe No only.
- Numeric Recipe No is normalized (`1 -> 001`, `12 -> 012`).
- Recipe Name is resolved only from `md_process_recipe`.
- Lookup key = `process_family + recipe_group + recipe_no`.
- One active Process Recipe Master row is allowed per lookup key.
- `md_part_process_recipe.source_recipe_name` is no longer used for Recipe Name.
- Part -> Process Recipe UI joins `md_process_recipe` and returns `recipe_name` from the master.
- Unknown Recipe No is auto-discovered with Recipe Name blank; maintain the name in Process Recipe Master.
- Batch Key remains `Family | Recipe Group | Recipe Name`, without Recipe No.

- Reset All now preserves `md_process_recipe` and `md_operation_recipe_mapping`; only `md_part_process_recipe` is regenerated from imported Part data.


## v22 - Chemical Line Recipe Configuration

Run:
`supabase/migrations/013_chemical_line_recipe_mapping.sql`

Chemical Line is intentionally different from Paint:

### Paint
`Master List Recipe No -> Process Recipe Master -> Recipe Name`

### Chemical Line
`Source Operation Code -> configured Recipe -> Process Recipe Master`

New table:
- `md_operation_code_recipe`
  - one active Chemical Line Recipe per source Operation Code.

Process Recipe page now includes:
- Chemical Line Recipe catalog seeded from the approved Recipe No / Recipe Name list.
- `Chemical Line · Operation Code -> Recipe` configuration.
- Add/Edit/Remove mapping without changing source Master data.

Numeric Recipe No is stored in 3-digit format:
`1 -> 001`, `14 -> 014`, `29 -> 029`.
Non-numeric `29A` remains `29A`.

Batch Key remains:
`Process Family | Recipe Group | Recipe Name`
and does not include Recipe No.


## v23 - Chemical Line: one Operation Code -> multiple Recipes

Run:
`supabase/migrations/014_chemical_operation_multi_recipe.sql`

New Chemical Line mapping model:
- Primary key = `operation_code + recipe_key`
- One Operation Code can have many active Recipes.
- Fields reserved for future All Open Job auto-selection:
  - `priority` (lower number = higher preference)
  - `selection_rule` (currently optional text)
  - `is_default`
  - `note`
- Only one active Default Recipe is allowed per Operation Code.
- No automatic Recipe selection is implemented yet.
- Future flow:
  `All Open Job -> Operation Code -> allowed Recipes -> Selection Rule/Priority -> selected Recipe -> Batch Key`.


## v24 - Process Time by Recipe

Run:
`supabase/migrations/015_process_time_by_recipe.sql`

New master:
`md_recipe_time_rule`

### Chemical Line
- Calc Type is fixed to `FIXED_HOURS`.
- Configure `Fixed Hours` independently for each Recipe.
- One Recipe may have multiple rules if needed, controlled by Priority.

### Paint
- Calc Type is fixed to `QTY_SURFACE`.
- Configure time rules per Paint Recipe with:
  - Qty Min / Qty Max
  - Surface Min dm2 / Surface Max dm2
  - Standard Hours
  - Priority
  - Note
- Multiple ranges can be added for the same Recipe.

Example:
- Recipe 012
- Qty 0–100
- Surface >= 5000 dm2
- Standard Hours = 7

Planning calculation is not implemented yet; this version provides the configuration/master data only.


## v26 - All Open Jobs / Planning Input

Run:
`supabase/migrations/016_all_open_jobs.sql`

New module:
`All Open Jobs`

All Open Job is a dynamic Planning Input, not Master Data.

Every import is treated as a full open-job snapshot and compared by `JobNum`:
- `NEW`: JobNum did not exist before.
- `CHANGED`: Job exists but any source planning field changed, or a previously closed Job reappears.
- `UNCHANGED`: source row is identical to previous import.
- `CLOSED`: previously open Job is missing from the new full snapshot.

New tables:
- `open_job_import_batch`
- `open_job_current`
- `open_job_history`

`open_job_current` normalizes the main Planning fields:
- JobNum
- EpicorPart / RevisionNum
- Program / PartCluster / PartDescription
- ProdQty / CurrentGoodWIPQty / LastLaborQty
- LastLaborOp / NextOperation / AllOperation
- TotalSurface / Part_Masterlist.Surface (dm2)
- OpenDMR / ST / STWIParea / WIPSequence
- Priority / CAT transit / Impact sale value

All source columns from the Excel row are also preserved in `source_data JSONB`.
The Excel `NEWJOB` formula column is intentionally ignored; PostgreSQL determines NEW/CHANGED itself.

History only stores meaningful transitions:
`NEW / CHANGED / CLOSED`.
UNCHANGED does not create history rows.

Future Planning can consume:
`Job -> Part/Revision -> Last/Next Operation -> ST Mapping -> Recipe -> Process Time -> Batch`.


## v27 - Manual Batch Planning Board

Run:
`supabase/migrations/017_planning_board.sql`

The confirmed Planning scope contains exactly these 35 Standard Operations:

`CMSA, CHEMMILL, CPBILP, CPBILP-A, PIONBL, RWK, V_A-SHPN, MANUALSP, CLASP,
BSAUNSLD, TSAUNSL, BSASLD, TSASLD, CCNV-IM, CCNV-IA, V_PASS/BRTG, FMSKG-CM,
SIPC, SI-SEAL, STRIP, HE-BAKE after plating, HE-BAKE before blasting,
A-DBLST, M-DBLST, PLA-ZiNi, HE-BAKE, PLA-CC, PRIMER, PRIMER2, PRIMER3,
TOPCOAT1, TOPCOAT2, ANTI-ABRASION, PAINT MARKING, VARNISH`.

`ANOD/CCNV FB` is not in the current Planning scope because it was not included
in the latest confirmed list.

### Planning Chain
- Source sequence = `All Open Jobs.AllOperation`.
- Source Operation Codes are standardized through `md_st_operation_mapping`.
- PRIMER occurrence: PRIMER -> PRIMER2 -> PRIMER3.
- TOPCOAT occurrence: TOPCOAT1 -> TOPCOAT2.
- HE-BAKE uses sequence context.
- Operations before the current Last/Next position are outside the future Planning horizon.
- First future Planning Operation = `ELIGIBLE`.
- Later operations = `LOCKED`.
- Adding an ELIGIBLE Job/Operation to a Batch sets it to `PLANNED`.
- Its next Planning Operation immediately becomes `ELIGIBLE`.

### Candidate Jobs / Batch
Planning Board filters:
- Area
- Standard Operation
- Recipe

Candidate jobs are only active `ELIGIBLE` Job + Operation instances.
One Batch contains multiple Job + Operation rows.

Chemical Line:
- if Operation Code has multiple valid Recipes, select Recipe before batching.

Paint:
- Part/Revision Recipe is resolved from Process Recipe Master.

Batch summary calculates:
- Total Jobs
- Total Qty (`CurrentGoodWIPQty`, fallback `ProdQty`)
- Total Surface (`TotalSurface`, fallback Qty × Surface/Part)
- Process Time from Recipe Time Rules
- Planned Start / End

### New tables
- `md_planning_operation_scope`
- `planning_job_operation`
- `planning_batch`
- `planning_batch_job`

After migration 017, either:
1. import All Open Job again; or
2. open Planning Board and use `Rebuild Chain`.

All future All Open Job imports automatically rebuild Planning Chains while
preserving already PLANNED operation state.


## v28 - NextOperation is the Planning start position

Planning Chain start logic is now:

1. `NextOperation` is the PRIMARY current-position marker.
2. Find that exact operation inside `AllOperation`.
3. Planning starts from that `NextOperation` position.
4. `AllOperation` is standardized in full BEFORE cutting the future chain, so
   PRIMER/TOPCOAT occurrence numbers remain correct.
5. If the same NextOperation code appears multiple times, `LastLaborOp` is used
   only to disambiguate which occurrence of NextOperation is current.
6. Only if NextOperation cannot be found, fallback to the operation immediately
   after `LastLaborOp`.
7. If neither position can be resolved, the Job becomes `SEQUENCE_CHECK` logic:
   no ELIGIBLE Planning Candidate is generated automatically.

Example:
`AllOperation = CNC | CMSA | QA | CHEMMILL | PPRSLVT | PTCSLVT`
`NextOperation = CHEMMILL`

Planning future chain:
`CHEMMILL -> PRIMER -> TOPCOAT1`

Initial state:
`CHEMMILL = ELIGIBLE`
`PRIMER = LOCKED`
`TOPCOAT1 = LOCKED`


## v29 - View / Add / Remove Jobs in an existing Planning Batch

No new database migration is required after v28/v17.

### Batch Detail
Recent Planning Batches now have a `View` action:
`Planning Board -> Recent Planning Batches -> View`.

Batch Detail shows:
- Batch Operation / Recipe
- Total Jobs / Qty / Surface
- Process Time
- all Jobs currently in the Batch

### Add Job
An existing Batch can receive more `ELIGIBLE` Jobs when:
- same Standard Operation
- Job is still Open
- operation is still ELIGIBLE
- Recipe matches the Batch, or the Batch Recipe is valid for the Chemical Line source Operation Code

After adding:
- current Job + Operation becomes `PLANNED`
- the next main Planning Operation becomes `ELIGIBLE`
- Batch Qty / Surface / Process Time / Planned End are recalculated

### Remove Job
A Job can be removed from a Batch while the Batch is PLANNED/RELEASED.
The system blocks removal if a later main Planning Operation for that Job is already PLANNED.

After removal:
- removed current operation returns to `ELIGIBLE`
- later unplanned operations return to the proper `LOCKED` sequence
- Batch totals and time are recalculated

### Next Main Plan Operation
Candidate Jobs and Jobs inside a Batch now show:
`Next Main Plan Op`

This is the next Standard Operation in that Job's Planning Chain after the current Batch operation.

The Add Jobs section can filter by `Next Main Plan Operation`, so the planner can group
Jobs that not only share the current batch condition but also have a compatible downstream
planning path.


## v26 - Fix Batch Detail PostgreSQL parameter type error

Fixed `src/app/planning/batches/[id]/page.tsx`:
- Candidate query previously passed `[batchId, recipe_key, standard_operation]` but did not reference `$1`.
- PostgreSQL therefore could not infer the data type of parameter `$1`.
- Removed unused `batchId` from that query.
- Renumbered parameters and explicitly cast:
  - `$1::text` = `recipe_key`
  - `$2::text` = `standard_operation`
- No Planning business logic changed.


## v27 - Candidate Jobs shows full All Open Job source columns

Batch Detail -> Candidate Jobs now keeps the existing Planning columns and appends every original column from `open_job_current.source_data`.

Why:
- `source_data` preserves the full imported All Open Job row.
- Columns are built dynamically from JSONB keys.
- If future All Open Job files add source columns, Candidate Jobs displays them automatically without another schema/UI change.
- Search also matches values inside `source_data`.
- Checkbox and Job columns stay sticky while horizontally scrolling.
- Batch selection/business logic is unchanged.

## v28 - Fix Planning hydration mismatch
- Replaced locale-dependent `Number.toLocaleString()` in Planning client/server render paths.
- Added deterministic number formatting shared by Planning Board, Candidate Jobs and Batch Detail.
- Decimal separator is `,` and thousands separator is `.` consistently on SSR and browser.
- Example: `146.94` -> `146,94`; `1234.5` -> `1.234,5`.
- Planning business logic is unchanged.


## v29 - Full All Open Job columns in main Candidate Jobs

Planning Board -> Candidate Jobs now appends every original Excel column preserved in
`open_job_current.source_data`, while keeping Planning columns first:
Job, Part/Rev, Qty, Surface, Source Op, Previous Plan Op, Next Main Plan Op, Recipe, Priority.

The source columns are dynamic; no hard-coded Excel column list is required.
No Planning/Batch business logic changed.


## v30 - Candidate Jobs column picker

Planning Board -> Candidate Jobs now has a `Columns` control.

Features:
- Tick/untick any Planning or All Open Job column.
- Search columns by name.
- `Select All`.
- `Planning Only`.
- `Clear`.
- Selection is persisted in browser `localStorage`.
- Saved selection is loaded only after hydration, preventing SSR/client hydration mismatch.
- Newly imported All Open Job source columns are automatically available in the picker.
- Checkbox selection column always remains visible.


## v31 - Candidate Job planning/status visibility

Planning Board -> Candidate Jobs now shows both `ELIGIBLE` and already `PLANNED`
operations for the selected Standard Operation.

New selectable Planning columns:
- `Status`
  - `ELIGIBLE` = can be added to a batch.
  - `PLANNED` = already assigned/planned; checkbox is disabled.
- `Batch No`
  - shows the Planning Batch containing the Job operation and the Batch status.
- `Previous Plan Status`
  - shows the previous main Planning Operation and its current Planning status.
  - `START / FIRST PLAN OP` when there is no prior main planning operation.
- `Actual Progress`
  - shows current All Open Job physical progress as `Last Operation -> Next Operation`.

Important:
`PLANNED` means planning state, not shop-floor completion.
The current system does not yet have execution/reporting completion state, so it does
not falsely label a previous operation as physically completed. Actual position is
shown separately from All Open Job.

Column picker preference migrates from v30 and automatically adds the four new
status columns once; users can hide them afterwards.


## v32 - Previous Batch No in Candidate Jobs

Added selectable Planning column `Previous Batch No`.
For each Candidate Job it resolves the immediately preceding main Planning Operation,
then shows the active Planning Batch containing that previous operation.
If there is no previous Planning Operation or it was never added to a Batch, the value is `—`.
No Planning eligibility or Batch creation logic changed.


## v33 - Previous Batch from durable Batch history

`Previous Batch No` no longer depends on `Previous Plan Status`.

For each Candidate operation, the system finds the nearest historical Planning Batch
for the same Job whose original `source_seq` is before the current operation's `source_seq`.

This remains valid after a new All Open Job import moves `NextOperation` forward and
the current future Planning Chain starts again at `START`.

Candidate Jobs now shows:
- Previous Batch No
- Previous Batch Operation
- Previous Batch Status

Planning Board also adds filter:
`Previous Batch No`

This enables workflow:
`Previous Batch -> jobs now ready for next operation -> new Batch`.

No Batch history is deleted and no eligibility rule was changed.


## v34 - Skip PIONBL from Planning

Run:
`supabase/migrations/018_skip_pionbl_planning.sql`

Final rule:
- `PIONBL` remains in All Open Job `AllOperation` source routing.
- `PIONBL` is not part of Planning Scope.
- No Candidate Job is created for `PIONBL`.
- No new Planning Batch is created for `PIONBL`.
- Sequence skips through it.

Example:
`CPBILP -> PIONBL -> BSAUNSLD`
becomes Planning sequence:
`CPBILP -> BSAUNSLD`.

If All Open Job currently has `NextOperation=PIONBL`, the chain anchor still uses the
real source position of PIONBL, but because PIONBL is excluded from Planning Scope,
the first Planning candidate after that position is `BSAUNSLD`.

Old PIONBL Batch records are preserved as history, but PIONBL is ignored when resolving
the previous Planning operation / previous Planning Batch for new Candidate planning.


## v35 - Durable Previous Batch history snapshot

Run:
`supabase/migrations/019_batch_job_sequence_snapshot.sql`

Why this is required:
`planning_job_operation` is a live planning chain and is rebuilt after every
All Open Job import. Historical Batch relationships must not depend only on
that live row.

`planning_batch_job` now snapshots:
- `source_seq_snapshot`
- `planning_seq_snapshot`
- `operation_instance_key_snapshot`

Existing Batch Jobs are backfilled from their currently linked Planning Job Operation.

Future Batch creation writes these snapshot values immediately.

Previous Batch lookup now uses:
`planning_batch_job.source_seq_snapshot`
first, with the linked live operation only as fallback for older data.

Example:
`CPBILP -> PIONBL -> BSAUNSLD`
with PIONBL skipped from Planning.

If CPBILP was previously placed in `PB-000123`, then after All Open Job advances
to BSAUNSLD, Candidate BSAUNSLD can still show:
- Previous Plan Status = START
- Previous Batch No = PB-000123
- Previous Batch Operation = CPBILP

This remains stable across later All Open Job imports/rebuilds.


## v36 - Previous Planning Operation from full route

Run:
`supabase/migrations/020_previous_planning_operation_snapshot.sql`

Then click `Rebuild Chain`.

The current future chain may start at BSAUNSLD after a new All Open Job import, but
the system now snapshots the immediately preceding Planning Operation from the FULL
standardized AllOperation route.

Example:
`CPBILP -> PIONBL -> BSAUNSLD`
with PIONBL skipped becomes:
`CPBILP -> BSAUNSLD`.

For Candidate BSAUNSLD:
- Previous Plan Op = CPBILP
- If the exact same Job has a historical CPBILP Batch:
  - Previous Plan Status shows the historical Batch status
  - Previous Batch No shows that Batch
- If no CPBILP Batch exists for that exact Job:
  - Previous Plan Op still shows CPBILP
  - Previous Plan Status = NO BATCH
  - Previous Batch No = —

`START` is now reserved for a true first Planning Operation in the full route.


## v37 - Plan Ahead across all Planning Operations

Plan-ahead logic is now generic for the complete Planning route.

For every Job:
1. All Open Job `NextOperation` identifies the actual production anchor.
2. The standardized Planning route is built from full `AllOperation`.
3. Skipped operations such as `PIONBL` do not participate in Planning.
4. A Planning operation already belonging to any non-cancelled Batch is `PLANNED`.
5. The first actual-ready future Planning operation is `ELIGIBLE`.
6. Any subsequent Planning operation becomes `ELIGIBLE` immediately when its
   immediately preceding Planning operation is `PLANNED`.
7. No wait for All Open Job `NextOperation` to advance is required for plan-ahead.

Example:
Source:
`CPBILP -> PIONBL -> BSAUNSLD -> PRIMER -> TOPCOAT1`

Planning:
`CPBILP -> BSAUNSLD -> PRIMER -> TOPCOAT1`

If All Open Job still says:
`NextOperation = CPBILP`

then after CPBILP is added to a Batch:
- CPBILP = PLANNED
- BSAUNSLD = ELIGIBLE
- PRIMER = LOCKED
- TOPCOAT1 = LOCKED

After BSAUNSLD is added to a Batch:
- BSAUNSLD = PLANNED
- PRIMER = ELIGIBLE

The same rule continues through every Planning operation.

Rebuild stability:
`syncPlanningChains()` now reads durable `planning_batch_job` + `planning_batch`
history, not only the currently active planning chain row. Therefore Batch planning
state survives repeated All Open Job imports and Rebuild Chain.


## v38 - Scheduling Board

Run migration:
`supabase/migrations/021_schedule_board.sql`

New module:
`/schedule`

Resources:
- Passivation / Brightening
- ManualSP
- AutoSHP
- Chemical Line: FB-01 ... FB-07
- Painting: CAB1, CAB2, CAB3
- Paint Powder

Chemical Line rules:
- 7 physical Flybars.
- Maximum 3 Flybars may run on the line simultaneously.
- Flybar launches are normally at least 60 minutes apart.
- One physical Flybar cannot overlap itself.

Painting:
- CAB1/CAB2/CAB3 are independent resources and can run simultaneously.

Recipe No / Recipe Description always come from the scheduled Planning Batch,
therefore they are operation-specific; resources do not share one global recipe.

Schedule duration uses `planning_batch.process_minutes`.


## v39
Fixed Scheduling Board compatibility with the existing `planning_batch` schema. The board no longer queries a non-existent `planning_batch.area_name` column. No database migration is required for this fix.


## v40 - Scheduling Board Recipe Master join fix

Fixed Scheduling Board compatibility with the existing `planning_batch` schema.

`planning_batch` stores only `recipe_key`.
The Scheduling Board now resolves:
- `recipe_no`
- `recipe_name`

by LEFT JOIN to `md_process_recipe`.

No Recipe fields are duplicated into `planning_batch`.
No database migration is required for this fix.


## v41 - Scheduling resources update

Run:
`supabase/migrations/022_schedule_resources_6fb_4cab.sql`

Updated resources:
- Chemical Line: `FB-01` .. `FB-06`
  - 6 physical Flybars
  - maximum 3 running concurrently
  - 60-minute normal launch interval
- Painting: `CAB1` .. `CAB4`
  - 4 independent painting cabins

Timeline:
- Chemical Line Timeline: all 6 Flybars
- Painting Timeline: CAB1..CAB4
- Other Operations Timeline:
  - Passivation / Brightening
  - ManualSP
  - AutoSHP
  - Paint Powder
  - and any future active non-Chemical/non-Painting schedule resource automatically

FB-07 is deactivated for new scheduling, but historical schedule records are preserved.


## v42 - Complete Scheduling Board resource columns

Run:
`supabase/migrations/023_schedule_resources_missing_groups.sql`

Added missing resource groups:
- SPX Clean
- Manual DBL
- Auto DBL
- Plating
- He-Bake

Schedule Table order now includes:
SPX Clean → Manual DBL → Auto DBL → Plating → He-Bake →
Passivation/Brightening → ManualSP → AutoSHP →
Chemical Line Flybar → Painting CAB1 → CAB2 → CAB3 → CAB4 →
Paint Powder → Resource No → Recipe → Jobs/pcs/dm2 → Time.

The existing Other Operations Timeline automatically includes all five newly added resources.

Existing rules remain unchanged:
- Chemical Line: 6 Flybars, max 3 concurrent, 60-minute launch spacing.
- Painting: CAB1..CAB4 independent.


## v43 - Unified Production Timeline

Scheduling Board now uses one Production Timeline instead of separate
Chemical / Painting / Other timelines.

Display order:
1. SPX Clean
2. Manual DBL
3. Auto DBL
4. Plating
5. He-Bake
6. Passivation / Brightening
7. ManualSP
8. AutoSHP
9. Chemical Line FB-01 .. FB-06
10. Painting CAB1 .. CAB4
11. Paint Powder

Important:
This is a Board display/resource order only.
It does NOT replace each Job's real AllOperation / Planning route.
Every timeline chip still displays its actual Standard Operation and Recipe.
Future resources not present in the explicit order are appended automatically.

No database migration is required for v43 if 021, 022 and 023 are already applied.


## v45 - Fix cross-operation PLANNED status

Critical Planning fix:
- A Candidate operation is now `PLANNED` only when actual Batch history matches:
  `Job + Standard Operation + source_seq`.
- A stale `planning_job_operation.status='PLANNED'` is no longer trusted by itself.
- A CPBILP Batch can only appear as Previous Batch for BSAUNSLD.
- BSAUNSLD becomes `ELIGIBLE` after CPBILP is planned, but is not `PLANNED`
  until BSAUNSLD itself is added to a BSAUNSLD Batch.
- Rebuild Chain now corrects old stale PLANNED statuses.

After replacing the code, click `Rebuild Chain` once.
No SQL migration is required.


## v46 - Candidate Jobs status sorting

Candidate Jobs are automatically sorted for the selected Standard Operation:

1. Not yet added to a Batch (`ELIGIBLE`) -> top
2. Already added to a Batch (`PLANNED`) -> bottom

Within each status group the existing Priority rule is preserved,
then Job number is used as the final stable sort key.

No Planning/Batch eligibility logic changed.


## v47 - Group PLANNED Candidate Jobs by Batch

Candidate sorting:
1. ELIGIBLE / not yet batched -> top.
2. PLANNED -> bottom.
3. PLANNED rows are grouped by current Batch No:
   PB-000008 together, PB-000009 together, etc.
4. ELIGIBLE rows retain the existing priority rule.
5. Job number is used as the stable order inside each group.

No Planning/Batch logic changed.


## v48 - Batch management

Recent Planning Batches now supports:
- `Edit Recipe`
  - loads Recipe options only when requested
  - validates that the selected Recipe is valid for every Job in the Batch
  - updates Batch Recipe and Job-operation Recipe
  - recalculates Process Time and Planned End
  - blocks Recipe edit while the Batch has an active schedule
- `Delete`
  - implemented as Batch `CANCELLED` for audit safety
  - deletes active `planning_batch_job` membership so the Job operation can be batched again
  - cancels non-running schedule rows
  - restores affected Job operations to unbatched Planning state
  - recomputes the Planning sequence for all affected Jobs
  - protects chain integrity by blocking deletion when a later operation of the same Job is already in another active Batch
  - blocks deletion for RUNNING/COMPLETED schedules

Cancelled Batches are hidden from Recent Planning Batches.

No SQL migration is required.


## v51 - 24-hour Production Timeline frame

Production Timeline now uses a fixed production-day window:
- Start: 06:00 on the selected Board date
- End: 06:00 on the following day
- Total: 24 hours

Schedule rows are loaded by time overlap with this window, so a Batch starting
after midnight and before 06:00 next day remains visible on the selected production day.

Timeline features:
- Hour grid from 06:00 -> 06:00 next day
- Batch blocks positioned by actual Planned Start / Planned End
- Blocks are clipped to the production-day frame when they cross 06:00 boundaries
- Resource labels stay on the left
- Existing Planning / Batch / resource-capacity rules are unchanged

No SQL migration is required.


## v53 - Editable Schedule Duration

Add Schedule now proposes Duration from `planning_batch.process_minutes`, but the planner may override it manually.

Input format:
`HH:MM`

Examples:
- `02:30`
- `07:00`
- `12:45`

Behavior:
- selecting a Batch auto-fills its configured Process Time;
- planner can replace the proposed value;
- the entered Duration is stored in `planning_schedule.duration_minutes`;
- Planned End is calculated from Start Time + entered Duration;
- configured `planning_batch.process_minutes` is not overwritten by the manual schedule override.

No SQL migration is required.


## v54 - Scheduled Batch annotation in Add Schedule

Planning Batch dropdown now contains all active Planning Batches.

Sorting:
1. Batches not yet scheduled -> top
2. Batches already scheduled on any date -> bottom

Already scheduled Batches show:
`SCHEDULED <date> · <resource>`

Example:
`PB-000003 · CPBILP · 001 · SCHEDULED 22/08/2026 · FB-01`

Already scheduled options are disabled to prevent duplicate scheduling.
This check is independent of the date currently being viewed on the Board.

No SQL migration is required.


## v55 - Schedule Table sort by operation/resource first

Schedule Table order is now:
1. Resource / process order (`md_schedule_resource.sort_order`)
2. Standard Operation
3. Planned Start
4. Batch No

This keeps batches of the same process/resource together instead of mixing
different operations only because they start earlier/later.

Production Timeline remains unchanged.
No SQL migration is required.


## v56 - Schedule Table complete daily list

Fixed a mismatch where the Schedule Table used the same 06:00 -> 06:00 overlap
window as the Production Timeline.

Now:
- Schedule Table = every non-cancelled schedule whose `schedule_date` equals the selected date.
- Production Timeline = schedules overlapping 06:00 selected date -> 06:00 next day.

This means if CAB2 has two Batches scheduled on the selected date, both rows are
shown in Schedule Table, even if one lies outside the production-timeline window.

No SQL migration is required.


## v57 - Full Schedule Board repair

Fixed:
- TypeScript build error caused by SQL-style `--` comments outside query strings.
- Schedule Table now treats `planning_schedule` as the authoritative source.
- Schedule rows cannot disappear because Recipe/Resource master data is missing:
  supporting tables are LEFT JOINed.
- Schedule Table includes rows when either:
  - `schedule_date` matches the selected date, or
  - local Vietnam Planned Start date matches the selected date.
- Production Timeline remains 06:00 selected date -> 06:00 next day.
- Existing Duration override, scheduled-batch annotation, 6 Flybars / max 3 concurrent,
  4 Painting CABs, Edit Recipe, Delete Batch, and Candidate planning logic are unchanged.

Validation performed:
- Scanned TS/TSX files for invalid external SQL-style comments.
- Syntax-focused TypeScript parse checks passed for:
  schedule page, schedule client, schedule API, batch actions,
  batch-management API, and planning page.

A full dependency-aware build was not available in this isolated package because
`node_modules` is not included; run `npm install` / `npm run build` in the normal project environment.


## v60 - NextOperation intermediate -> nearest main Planning operation

Planning Candidate selection now explicitly follows the main-operation rule.

Planning only keeps operations in `PLANNING_SCOPE`.

If `NextOperation` is an intermediate source operation such as:
- Masking
- Unmasking
- preparation
- inspection
- or any other operation that is not a main Planning operation

the engine uses its position in `AllOperation` and scans FORWARD to the nearest
main Planning operation.

Example:

`CPBILP -> MASKING -> UNMASKING -> BSAUNSLD -> PRIMER`

- NextOperation = `CPBILP` -> Candidate main op = `CPBILP`
- NextOperation = `MASKING` -> Candidate main op = `BSAUNSLD`
- NextOperation = `UNMASKING` -> Candidate main op = `BSAUNSLD`
- NextOperation = `BSAUNSLD` -> Candidate main op = `BSAUNSLD`

The engine never jumps backward to a completed/previous main operation.

This applies generically to all intermediate operations; no hard-coded Masking
list is required.

No SQL migration is required. Run Rebuild Chain once after deploying v60.


## v61 - Candidate Job Display Rules

Candidate Jobs now has `Sort / Filter`.

Filter fields:
- Next Main Plan Op
- NextOperation
- Part Master PRIMER1
- Part Master PRIMER2
- Part Master PRIMER3

PRIMER1/2/3 are loaded from `md_material_finish` by:
`part_num + revision_num`.

Multi-level sorting supports up to 4 levels:
- Next Main Plan Op
- NextOperation
- PRIMER1 / PRIMER2 / PRIMER3
- Recipe No
- Previous Batch No
- Priority
- Part Num
- Program
- Qty
- Surface
- Job

Business rules remain fixed:
1. ELIGIBLE rows stay above PLANNED rows.
2. PLANNED rows remain grouped by Batch No.
3. Custom sort rules apply inside those groups.

Three new optional columns were added:
- PRIMER1
- PRIMER2
- PRIMER3

Display rules affect UI only; Planning eligibility and Batch logic are unchanged.
No SQL migration is required.


## v62 - Default Candidate View per Standard Operation

Each Standard Operation can now save its own Candidate Jobs view.

Saved per operation:
- visible Columns
- Next Main Plan Op filter
- NextOperation filter
- PRIMER1 / PRIMER2 / PRIMER3 filters
- up to 4 Sort levels and ASC/DESC

Buttons:
- `Set Default` saves the current view for the selected Standard Operation
- `Load Default` reloads the saved view
- `Delete Default` removes only that operation's saved view
- `Reset` clears the current filter/sort back to the generic defaults

When Standard Operation changes, its saved default view is loaded automatically.

Examples:
- CPBILP can have one view
- BSAUNSLD another view
- PRIMER a paint-focused view
- TOPCOAT1 a different paint-focused view

Storage is browser-local (`localStorage`) and does not change Planning / Batch data.
No SQL migration is required.


## v63 - Sort Priority supports every Candidate column

`Sort Priority` now exposes:
- all calculated Planning fields
- every standard Candidate Jobs column
- every dynamic `All Open Job` column stored in `source_data`

This means any field available through `Columns` can also be selected as a
Sort Priority level.

Existing per-Standard-Operation default views continue to save/load the chosen
sort fields.

Existing business ordering remains:
1. ELIGIBLE above PLANNED
2. PLANNED jobs grouped by Batch
3. user Sort Priority applies within those business groups

No SQL migration is required.


## v65 - Fix sorting for dynamic All Open Job columns

Fixed Sort Priority for dynamic source columns.

Cause:
- Candidate column key = `source:<column>`
- Sort field key = `column:source:<column>`
- Previous sorter incorrectly expected `raw:<column>`, so the sort value was blank.

Now:
- `column:source:*` reads directly from `candidate.source_data`
- numeric values sort numerically
- text values sort naturally
- existing ELIGIBLE-first and PLANNED-by-Batch rules remain unchanged

No SQL migration is required.


## v66 - All Candidate columns fully sortable

Fixed Sort Priority mapping for every Candidate Jobs column.

Planning columns now map exactly:
- Job
- Part / Rev
- Qty
- Surface
- Source Op
- Previous Plan Op
- Next Main Plan Op
- Recipe
- PRIMER1 / PRIMER2 / PRIMER3
- Priority
- Status
- Batch No
- Previous Plan Status
- Previous Batch No
- Actual Progress

Every dynamic All Open Job `source:*` column also sorts from `source_data`.

Numeric source values are sorted numerically instead of as text.

Sort levels increased from 4 to 10.

Existing saved per-Standard-Operation views remain compatible.
ELIGIBLE remains above PLANNED, and PLANNED rows remain grouped by Batch.
No SQL migration is required.


## v67 - Candidate column ordering

Candidate Jobs `Columns` now controls both:
- visibility
- display order

For each visible column:
- `↑` move one position left / earlier
- `↓` move one position right / later
- `⇤` move to first
- `⇥` move to last

The Candidate Jobs table now renders directly from the saved column order.

Column order is stored in the existing `columns` array, therefore it is also
saved/restored by `Set Default` for each Standard Operation.

All Planning and dynamic All Open Job columns can be reordered.

No SQL migration is required.


## v68 - Wide Candidate View + Compact Batch Builder

Removed from Batch Builder:
- Planning Date
- Planned Start
- Priority
- Note

Batch creation now submits only:
- selected Planning Job Operations
- Standard Operation
- Recipe

The Batch API continues to use its existing defaults:
- planning_date = database current date
- priority = 100
- planned_start/end = blank until scheduling
- note = blank

UI changes:
- Planning page uses nearly full browser width
- Batch Builder reduced to 230 px
- Candidate Jobs receives the remaining width
- tighter table font/padding
- numeric columns right aligned
- headers kept compact
- dynamic All Open Job columns use ellipsis when very long

No SQL migration is required.


## v69 - Drag & Drop Planning + Scheduling

Planning Board:
- drag visible Columns to reorder them
- drag Sort Priority rows to change sort level order
- drag an ELIGIBLE Candidate Job onto Batch Builder to select it
- existing checkboxes and arrow buttons remain available

Board Điều Độ:
- draggable Unscheduled Batch cards
- draggable Scheduled Batch cards for moving
- drop a Batch onto any Resource
- current Start Time and Duration fields are used for the drop
- dropping an already scheduled Batch moves its schedule through PATCH
- all existing resource overlap / Chemical Line max-3 / launch-spacing validation remains active
- RUNNING / COMPLETED schedules cannot be moved

The normal select controls and Add/Move Schedule button remain available as non-drag alternatives.

No SQL migration is required.


## v70 - Rename Standard Operation

Configuration -> Operation Master now supports `Edit Name`.

Rename behavior:
- edits `md_operation_master.standard_operation`
- preserves all other Operation Master settings
- updates exact linked Standard Operation references in:
  - `md_st_operation_mapping.standard_operation_rule`
  - `md_st_routing.standard_operation`
  - `md_operation_recipe_mapping.standard_operation`
  - `md_part_process_recipe.standard_operation`
  - `md_planning_operation_scope.standard_operation`
  - `planning_job_operation.standard_operation`
  - `planning_job_operation.previous_standard_operation_snapshot`
  - `planning_batch.standard_operation`
  - `planning_batch_job.standard_operation`

The existing `st_group` is not renamed automatically.

The API inserts the new Operation Master key before moving references, then
deletes the old key in one database transaction.

No SQL migration is required.


## v71 - Fix TSAUNSLD Next Main Plan Op

Fixed a Planning Scope typo:

- wrong: `TSAUNSL`
- correct: `TSAUNSLD`

Because `standardize()` filters operations through `PLANNING_SCOPE`,
the typo caused TSAUNSLD to be removed from the standardized Planning route.

Example before:
`CPBILP-A | TSAUNSLD`
-> CPBILP-A
-> END

After v71:
`CPBILP-A | TSAUNSLD`
-> CPBILP-A
-> TSAUNSLD

Run `Rebuild Chain` once after deploying so current Candidate Jobs are rebuilt.

No SQL migration is required.


## v72 - Global Candidate Priority Highlight

Fixed business priority for all main Planning Operations:
1. CAT3
2. CAT5
3. Sales / Sale
4. Current month (dynamic from Planning date, e.g. AUG-26)
5. Other priorities

Priority is applied before custom Sort Priority inside the ELIGIBLE/PLANNED groups.
Rows and the Priority cell are highlighted by level.

No SQL migration is required.


## v73 - Priority highlight only

CAT3 / CAT5 / Sales / current-month values are highlighted only.

They no longer change Candidate Jobs sorting order.
Candidate Jobs order remains controlled by the existing per-view Sort Priority settings.

No SQL migration is required.


## v75 - Auto Planning Rule Master

Added Configuration -> Auto Planning Rules.

One independent rule can be configured for every Standard Operation.

Configurable groups:
1. Enable / Mode / Run Order
2. Eligibility:
   - first Planning operation
   - Actual WIP without Previous Batch
   - from Previous Batch
   - Plan Ahead
   - require Previous Completed
   - require Recipe
   - exclude Open DMR
3. Batch compatibility:
   - same Recipe
   - group by Previous Batch
   - same Part / Revision / Program
   - same PRIMER1 / PRIMER2 / PRIMER3
4. Min/Max:
   - Jobs
   - Qty
   - Surface dm2
5. Split conditions:
   - Recipe / Previous Batch
   - Part / Revision / Program
   - PRIMER1 / PRIMER2 / PRIMER3
6. Up to 10 configurable Priority fields.
   Priority can use core Candidate fields or dynamic All Open Job source_data keys.
7. Per-operation Note.

Eligibility design:
- ACTUAL WIP may enter the current main Planning Operation without historical Previous Batch when enabled.
- Future operations may enter from the immediately previous main Planning Batch when enabled.
- Plan Ahead and Previous Completed are separately configurable.

This version adds the Rule Master and UI/API only.
It does NOT silently turn on automatic Batch creation; all operations default to OFF.

Migration required:
`supabase/migrations/025_auto_planning_rule_master.sql`


## v76 - Batch No rule for ALL Main Planning Operations

Fixed the actual Batch creation API. The previous source still generated:
`PB-000001`, `PB-000002`, ...

Every newly created Batch now uses:

`XXX_DDMMM_NNN`

Examples on 23 AUG:
- CPBILP / BSAUNSLD / TSAUNSLD / Chemical Line operations -> `CHM_23AUG_001`
- PRIMER -> `PRI_23AUG_001`
- PRIMER2 -> `PRI_23AUG_...` (shared PRI daily sequence)
- PRIMER3 -> `PRI_23AUG_...` (shared PRI daily sequence)
- TOPCOAT1 -> `TOP_23AUG_001`
- TOPCOAT2 -> `TOP_23AUG_...` (shared TOP daily sequence)
- ANTI-ABRASION -> `AAB_23AUG_001`
- MANUALSP -> `MSP_23AUG_001`
- V_A-SHPN -> `ASP_23AUG_001`

Rules:
- Prefix is read only from `md_operation_master.batch_prefix`.
- API refuses to create a Batch if the operation has no valid 3-character Prefix.
- NNN is allocated per Prefix + Planning Date.
- Operations sharing one Prefix share the same daily NNN sequence.
- PostgreSQL transaction advisory lock prevents duplicate numbers when multiple planners create Batches concurrently.
- Daily sequence restarts at 001 for a new DDMMM.
- Existing historical `PB-...` Batches are not renamed automatically.

Operation Master now shows `batch_prefix` and lets the user edit it directly.

Migration required:
`supabase/migrations/026_batch_no_all_main_operations.sql`


## v77 - Add Jobs to Batch uses the Standard Operation Candidate View

Batch Detail -> Add Jobs to Batch no longer uses its own fixed table layout.

It now reads the same browser-saved view used by Planning Board:
`st-planning:candidate-view-by-operation:v1`

For the Batch Standard Operation it automatically applies:
- saved visible columns
- saved column order
- Next Main Plan Op filter
- NextOperation filter
- PRIMER1 / PRIMER2 / PRIMER3 filters
- saved Sort Priority levels and ASC/DESC
- dynamic All Open Job `source_data` columns
- Candidate Priority highlighting

Example:
A PRIMER Batch opens with the same Candidate View previously saved for PRIMER.
A BSAUNSLD Batch uses the BSAUNSLD view.

The Batch Detail candidate query was also expanded to supply the same supporting
fields used by Planning Board:
- previous Planning Operation / status
- Previous Batch No / status
- PRIMER1 / PRIMER2 / PRIMER3
- Recipe Required
- Actual Progress
- dynamic All Open Job source_data

The Search box remains available as an extra temporary filter and does not alter
the saved Standard Operation view.

No SQL migration is required.


## v78 - Paint Type Selection Lock

Painting Candidate selection is now protected against mixing different paint materials.

Operation -> lock field:
- PRIMER -> `md_material_finish.primer1`
- PRIMER2 -> `md_material_finish.primer2`
- PRIMER3 -> `md_material_finish.primer3`
- TOPCOAT1 -> `md_material_finish.topcoat1`
- TOPCOAT2 -> `md_material_finish.topcoat2`
- ANTI-ABRASION -> `md_material_finish.antiabration`
- VARNISH -> `md_material_finish.varinish_name`

Behavior in Planning Board:
1. Before selection, all candidates with a valid paint type are selectable.
2. The first selected Job becomes the Paint Selection Lock.
3. Candidates with another paint type become dim and their checkbox is disabled.
4. Candidates missing the required paint type are also disabled.
5. Removing all selected Jobs releases the lock.
6. Select All selects only compatible Jobs.

Behavior in Batch Detail -> Add Jobs to Batch:
- if the Batch already contains Jobs, its existing paint type is the lock immediately;
- otherwise the first newly selected Job sets the lock;
- incompatible candidates are dim and cannot be selected.

Server protection was added to both:
- Create Batch API
- Add Jobs to existing Batch API

Therefore different paint types cannot be mixed even if the UI is bypassed.

No SQL migration is required.


## v79 - Show scheduled Batches inside Resource drop boxes

Board Điều Độ Resource boxes now display every scheduled Batch assigned to that
Resource for the selected calendar date.

Each Batch item shows:
- Batch No
- Start -> End time
- Standard Operation
- Recipe No

If several Batches are assigned to the same Resource, all are listed in time order
and the Resource header shows the Batch count.

Clicking a Batch in a Resource box loads it into the Schedule form.
The Batch item remains draggable, so it can still be moved to another Resource.

Dropping an unscheduled Batch continues to use the existing scheduling logic/API.
After the schedule is saved and the page reloads, the Batch appears immediately
inside its Resource box.

No SQL migration is required.
\n\n## v80 - Resource box Batch details\n\nEach scheduled Batch shown inside a Resource box now includes:\n- Next Main Plan Operation (aggregated from Jobs in that Batch)\n- Total Qty\n- Total Surface dm2\n\nIf Jobs inside one Batch have different next main operations, all distinct next operations are shown separated by `/`.\n\nNo SQL migration is required.\n

## v81 - Next Paint Material on Scheduling Resource Cards

When `Next Main Plan Op` is a paint operation, Resource Batch cards also display
the corresponding paint material from Part Master:

- PRIMER -> PRIMER1
- PRIMER2 -> PRIMER2
- PRIMER3 -> PRIMER3
- TOPCOAT1 -> TOPCOAT1
- TOPCOAT2 -> TOPCOAT2
- ANTI-ABRASION -> ANTIABRATION
- VARNISH -> VarinishName

Examples:
`Next: PRIMER`
`Paint: PRIMER: 10P4-2NF`

`Next: TOPCOAT1`
`Paint: TOPCOAT1: 017`

If Jobs inside the Batch have several distinct next paint requirements, all
distinct values are displayed. Non-paint next operations remain unchanged.

No SQL migration is required.


## v82 - Move Batch details to Unscheduled list

Board Dieu Do display simplified:

Unscheduled cards now show:
- Batch No
- current Standard Operation / Recipe
- Next Main Plan Op
- next paint material when the next operation is paint
- total Qty
- total Surface dm2

Resource boxes (FB-01..FB-06, CAB1..CAB4, etc.) now show only Batch No
for each scheduled Batch. The existing count badge and drag/move behavior remain.

No SQL migration is required.


## v83 - Batch Breakdown by Next Main Operation

Board Dieu Do:
- removed the Resource drop-box grid entirely;
- kept the scheduling form (Batch / Resource / Start / Duration);
- grouped both Unscheduled and Scheduled Batch lists by current Standard Operation.

Each Unscheduled Batch displays:
- Total Qty
- Total Surface
- one breakdown row per Next Main Plan Operation
- Qty subtotal for that next operation
- Surface subtotal for that next operation
- paint material if the next operation is a paint operation

Breakdown values are calculated from planning_batch_job snapshots, so subtotal
Qty/Surface rows add up to the Batch totals.

No SQL migration is required.


## v84 - Color coding by Standard Operation

Board Dieu Do now assigns a distinct soft color family to every confirmed main
Standard Operation.

The color is applied to:
- the operation group header
- all Batch cards belonging to that operation
- the left border of the next-operation breakdown rows

This is visual only. No Planning, Batch or Scheduling business logic changed.

No SQL migration is required.


## v85 - Open Batch Job Detail from Board Dieu Do

Clicking any Batch card on Board Dieu Do now opens that Batch Detail page.

Batch Detail:
- `Jobs in Batch` uses the same saved Candidate View for that Standard Operation:
  - same visible columns
  - same column order
  - same Sort Priority
  - same dynamic All Open Job columns
  - same Priority highlighting
- each existing Job has a `Remove` action
- `Add Jobs to Batch` remains available below with the same Candidate View
- Paint Selection Lock remains active when adding Jobs to paint Batches

The Batch card also includes a small `Schedule` or `Move` button. Use that button
when the intent is to load the Batch into the scheduling form instead of opening
Job Detail.

When Batch Detail was opened from Board Dieu Do, the Back button returns to
Board Dieu Do and preserves the selected date.

No SQL migration is required.


## v86 - Empty Batch -> Schedule -> Fill Jobs

New primary plan-ahead workflow:
1. Board Dieu Do -> Create Empty Batch.
2. Select Standard Operation and optional Recipe.
3. Batch is created with Jobs=0 / Qty=0 / Surface=0 using the normal
   `XXX_DDMMM_NNN` numbering rule from Operation Master.
4. Schedule the empty Batch to Resource / Start / Duration.
5. Click the Batch card to open Batch Detail.
6. Fill Jobs later through the existing Add Jobs to Batch Candidate Engine.

Fill Jobs intentionally reuses the existing Candidate View and rules:
- saved columns/order per Standard Operation
- Sort Priority
- Next Main Plan Op / NextOperation filters
- Part Master paint fields
- Recipe compatibility
- Paint Selection Lock
- server-side ELIGIBLE / operation / recipe / paint validation

The existing workflow `Candidate Jobs -> Create Batch` remains available.
No SQL migration is required.


## v87 - Auto Plan / Empty Batch Future Foundation

The current two manual Batch workflows remain unchanged:
1. Candidate Jobs -> Create Batch on Planning Board.
2. Create Empty Batch -> Schedule -> Fill Jobs later.

Added per-Standard-Operation configuration for the future automation engine:
- AllowEmptyBatch
- AllowScheduleEmptyBatch
- AutoCreateEmptyBatch
- AutoFillScheduledBatch
- RequireRecipeBeforeSchedule
- RequirePaintTypeBeforeSchedule
- BatchLockBeforeStartMinutes

Important:
- `AutoCreateEmptyBatch` and `AutoFillScheduledBatch` are configuration only in v87.
- No automatic planning/scheduling job is started by this version.
- Defaults preserve the current manual behavior.
- Candidate/Fill Jobs continues to use the existing Planning Candidate Engine.

Migration required:
`supabase/migrations/027_auto_planning_empty_batch_rules.sql`


## v88 - Two Planner Views on Board Dieu Do

Scheduling Board now has two fixed Planner Views.

Planner 1:
CMSA, CHEMMILL, CPBILP, CPBILP-A, RWK, V_A-SHPN, MANUALSP, CLASP,
BSAUNSLD, TSAUNSLD, BSASLD, TSASLD, CCNV-IM, CCNV-IA, V_PASS/BRTG.

Planner 2:
FMSKG-CM, SIPC, SI-SEAL, STRIP, HE-BAKE after plating,
HE-BAKE before blasting, A-DBLST, M-DBLST, PLA-ZiNi, HE-BAKE, PLA-CC,
PRIMER, PRIMER2, PRIMER3, TOPCOAT1, TOPCOAT2, ANTI-ABRASION,
PAINT MARKING, VARNISH.

Each view filters:
- Planning Batch list
- Create Empty Batch Standard Operation choices
- Scheduled / Unscheduled groups
- Schedule Table
- Production Timeline

Date changes preserve the selected Planner View.

Note:
`TSAUNSL` from the request is normalized to the existing canonical system code
`TSAUNSLD`.

No SQL migration is required.


## v89 - Cross Planner Handover Change Impact Alerts

When a Job is added to or removed from a Batch:
1. The system finds the Job's next Main Planning Operation.
2. It resolves the owner Planner for source and next operation.
3. If ownership crosses Planner 1 <-> Planner 2, a Change Impact Event is created.
4. The affected Planner Board shows the alert automatically.

Alert data includes:
- Source Batch / Source Operation
- changed Job
- ADD_JOB / REMOVE_JOB
- Next Main Plan Operation
- Batch Qty before -> after
- Batch Surface before -> after
- changed Job Qty / Surface
- affected downstream Batch, if one already exists
- affected Schedule / Resource / Start, if already scheduled
- Impact Level:
  - INFO: no downstream Batch yet
  - WARNING: downstream Batch exists but is not scheduled
  - IMPACTED: downstream Batch is scheduled
  - CRITICAL: affected scheduled Batch starts within 60 minutes
- NEW / ACKNOWLEDGED

Board Dieu Do:
- Handover Alerts panel is shown for the current Planner View.
- It polls every 15 seconds.
- Open Source Batch / Review My Batch actions.
- Acknowledge action.
- Affected Batch cards show `⚠ N` until alerts are acknowledged.

Planner ownership uses the same Planner 1 / Planner 2 operation mapping as the
Scheduling views.

Migration required:
`supabase/migrations/028_planner_handover_change_event.sql`


## v90 - Combined Schedule Table for Both Planners

Board Dieu Do now shows two schedule tables:

1. `Schedule Table · Tổng Hợp Planner 1 + Planner 2`
   - all scheduled Batches for the selected date
   - Planner owner column
   - current Standard Operation
   - Resource / Recipe / Jobs / Qty / Surface / Start / End / Duration
   - Planner 1 and Planner 2 rows are visually differentiated

2. `Schedule Table · Planner N`
   - keeps the existing filtered table for the currently selected Planner View

The combined table uses the same date and live schedule data already loaded by
the Board. No scheduling logic changed.

No SQL migration is required.

## v91 - Direct Schedule Grid + Auto-Ready Unified Architecture

Board Điều Độ now has a direct scheduling grid for each Planner View.

For every Standard Operation owned by the selected Planner:
- existing scheduled Batches for the selected date are shown first;
- 20 blank UI input rows are always available;
- the 20 blank rows are NOT database records;
- a real Batch/Schedule is created only after Save.

Each blank row allows direct entry of:
- Recipe / Paint Recipe
- Resource
- Date
- Start Time
- Duration HH:MM

Save performs one atomic transaction:
1. auto-generates the Batch No using the existing `XXX_DDMMM_NNN` rule;
2. creates an EMPTY `planning_batch`;
3. creates its `planning_schedule` immediately;
4. preserves Chemical Line overlap / 3-Flybar / 60-minute launch checks;
5. existing Batch Detail / Fill Jobs Candidate Engine is used later.

Unified source architecture:
- `MANUAL_GRID` = direct Schedule Grid;
- `PLANNING_BOARD` = Candidate Jobs -> Create Batch;
- `AUTO_PLAN` = reserved for future Auto Plan -> Auto Batch -> Auto Schedule.

All three paths use the same core tables:
- `planning_batch`
- `planning_schedule`
- `planning_batch_job`

Existing Planning Board and existing scheduling controls remain available.

Migration required:
`supabase/migrations/029_manual_schedule_grid_plan_source.sql`


## v92 - Direct Schedule Grid by ST Group

Direct Schedule Grid is now organized by ST Group, not by Standard Operation.

- 20 empty UI rows per ST Group.
- Standard Operation is selected inside each row.
- Only Standard Operations belonging to that ST Group and current Planner View appear.
- Existing scheduled Batches display under their ST Group.
- API validates ST Group -> Standard Operation before creating Batch/Schedule.
- Exact Standard Operation is still stored on Batch for Candidate Fill, Recipe/Paint,
  Batch Prefix and future Auto Plan / Auto Schedule.

No new SQL migration is required beyond migrations already included in v91.


## v93 - Schedule Area planning grid
- Board direct planning is grouped by configurable Schedule Area, matching the operational Excel layout.
- Seed areas: SPX Clean, Manual DBL, Auto DBL, Plating, He-Bake, Passivation/Brightening, ManualSP, AutoSHP, Flybar, CAB1, CAB2, CAB3, Paint Powder.
- No guessed Standard Operation mapping is seeded. Configure it at Configuration > Schedule Area Mapping.
- Each area defaults to 20 UI rows; + Row and - Row change the current view row count.
- `default_rows` is configurable per area for future sessions.
- Manual and future Auto planning share the same `planning_batch` / `planning_schedule` output.


## v94 - Planner Work Assignment
- Added Configuration > Phân chia Planner.
- Schedule Area ownership is now separated from process/routing configuration.
- Any area can be moved between Planner 1, Planner 2, or Unassigned without changing Standard Operation mapping, Routing, Batch logic, or historical schedules.
- Board Điều Độ reads the current assignment dynamically.


## v95 - Planner Assignment API robustness
- Fixed `Unexpected end of JSON input` in Planner Work Assignment.
- Client now safely reads empty/non-JSON responses instead of crashing.
- Assignment API always returns JSON on success/error.
- API self-checks and creates/backfills `md_planner_work_assignment` if migration 031 has not yet been applied.
- Existing Planner/Schedule Area logic is unchanged.


## v96 - Persist Schedule Area row count
- `+ Row` and `- Row` now persist the resulting row count to `md_schedule_area.default_rows`.
- Reopening Schedule / refreshing the browser restores the saved row count per Schedule Area.
- Row count remains independent for each Schedule Area.
- Range remains 1..200 rows.
- Adding/removing UI rows still does not create planning batches.


## v97 - Unscheduled Planning Batches by Schedule Area
- Planning Batches > Unscheduled is grouped by configured Schedule Area instead of Standard Operation.
- Example: CHEMICAL_LINE displays every unscheduled Batch whose Standard Operation is mapped to CHEMICAL_LINE.
- Each Batch card still shows its exact Standard Operation.
- Batches without a Schedule Area mapping are visible under UNMAPPED.
- Planner Batch scope now follows current Planner Work Assignment + Schedule Area Operation mapping when configured.
- Fixed legacy Planner operation lists remain only as fallback while no area-operation mappings exist.


## v98 - Unscheduled Batch inside Schedule Area
- Unscheduled Planning Batches are now rendered directly inside the corresponding Schedule Area block, immediately below the area header and above its planning rows.
- Example: all unscheduled batches mapped to CHEMICAL_LINE appear inside Flybar#/Chemical Line area.
- Batch cards show Batch No, exact Standard Operation, Recipe, Qty, Surface and EMPTY state.
- Clicking a batch opens Fill / Jobs.
- The previous duplicate Planning Batches pool below the area grids is hidden.
- Assignment continues to follow Schedule Area Mapping and Planner Work Assignment.


## v99 - Schedule Batch controls
- Scheduled Batch rows inside each Schedule Area now have Up / Down / Edit / Fill Jobs / Delete.
- Up / Down persists order through `planning_schedule.sequence_no`.
- Edit supports Recipe, Resource, Date, Start and Duration.
- Standard Operation is intentionally read-only to protect Planning Chain integrity.
- Delete reuses the existing safe Batch deletion logic: active Schedule is cancelled and Jobs are returned to Candidate/Eligible when downstream-chain rules allow.


## v100 - Fix ST Group Runtime Error
- `/st-groups` no longer uses the old Supabase admin client; it now reads `md_st_group` through the current PostgreSQL `getPool()` architecture.
- ST Group Deactivate no longer queries obsolete/optional `md_area_operation_group`.
- No ST Group planning logic or mappings were changed.


## v101 - Fix Area Master
- `/api/area` migrated from the obsolete Supabase admin client to the current PostgreSQL `getPool()` layer.
- `/api/area/groups` also migrated to PostgreSQL and keeps the existing rule: one ST Group belongs to one Area.
- Area Add/Edit/Activate/Deactivate and ST Group assignment are preserved.
- Area Manager now renders server errors as readable text instead of `[object Object]`.


## v102 - Fix ST Operation Mapping
- `/master/operationmapping` migrated from the obsolete Supabase admin client to PostgreSQL `getPool()`.
- Reads `md_st_operation_mapping`, `md_st_group`, and `md_operation` directly from the current database.
- Existing Add / Remove / Move mapping API remains unchanged because it already uses PostgreSQL.
- No mapping rules, ST Group logic, Area logic, Planning or Schedule logic changed.


## v105 - Fix Operation Master Unregistered API key
- `/master/operation` now reads `md_operation_master` directly through PostgreSQL `getPool()`.
- Search, pagination and active-record filtering are preserved.
- Operation rename / batch-prefix APIs already use PostgreSQL and are unchanged.
- Other Master Data pages are intentionally left unchanged in this fix.


## v106 - Operation Code -> ST Group -> Operation Master synchronization
- Active `DIRECT` mappings in `md_st_operation_mapping` now automatically upsert their concrete Standard Operation into `md_operation_master`.
- Existing time-rule columns in Operation Master are preserved; only `st_group`, `is_active`, and `updated_at` are synchronized.
- Add/Edit/Move Operation Code automatically refreshes Operation Master before rebuilding routing mapping.
- Schedule Area GET performs a defensive backfill so mappings created before v106 (for example POWERCOATING -> SIPOC/SIPT) appear immediately.
- Schedule Area Mapping now shows Operation Code count/list and resulting Standard Operation count per ST Group.
- No Planning Board, routing-detail source, Batch, or Schedule logic changed.

## 2026-08-24 - Schedule existing UNSCHEDULED Batch
- Click an Unscheduled Batch card in its Schedule Area to load the existing Planning Board Batch into the first empty schedule row.
- Existing Batch keeps the same `planning_batch.id` and Batch No.; Standard Operation is locked and existing Recipe is preserved/locked.
- Planner only assigns Resource / Date / Start / Duration and clicks `Schedule`.
- Scheduling uses the shared `/api/schedule` engine; it does not recreate the Batch.
- Manual new empty Batch remains available through `NEW` rows and `/api/schedule/manual-grid`.
- Architecture intentionally keeps Manual and future Auto Schedule on the same scheduling engine/API contract.


## v108 - Global Popup / Toast Notifications
- Added one global popup/toast system for operational notifications across the app.
- Validation, success, warning and error messages from Planning Board, Board Điều Độ, Schedule Area, Planner Assignment, Area, Operation Master, Batch detail/import/reset are shown as popup notifications instead of inline banners.
- Existing `alert()` calls are routed into the same popup UI.
- Static instructional/configuration notes remain inline because they are page content, not transient notifications.
- Popup types: Success, Warning, Error, Info; auto-dismiss with manual close button.
- No Planning, Batch, Schedule, Mapping or Auto-ready business logic changed.


## v109 - Single Batch# Schedule Table
- Combined Planner 1 + Planner 2 Schedule Table now uses one `Batch#` column.
- Planner-specific Schedule Table also uses one `Batch#` column.
- Removed resource-specific Batch columns from these summary tables.
- Summary columns are now: Planner (combined only), Batch#, Standard Operation, Resource, Recipe#, Recipe description, Jobs, pcs, dm², Start, End, Duration.
- Schedule Area boards and all Planning/Batch/Schedule/Auto logic are unchanged.


## v110 - Unscheduled Batch Previous Main details
Applied to every Schedule Area unscheduled Batch card:
- Current Batch Recipe Name is displayed when available.
- All distinct Previous Main dependencies found across Jobs in the Batch are displayed.
- Each dependency shows Previous Batch No, Previous Main Standard Operation, SCHEDULED/UNSCHEDULED status.
- If scheduled, Resource and planned completion time are shown.
- Multiple Previous Main Batches/Operations are all rendered; they are not collapsed into one.
- Historical lookup uses `planning_batch_job` sequence snapshots so it remains compatible with rebuilt Planning Job chains.
- Scheduling, Planning Board, Batch creation, and future Auto Schedule logic are unchanged.


## v111 - CAB/Flybar Schedule Area exact-resource fix
- Fixed scheduled Batch duplication across CAB1/CAB2/CAB3 and other Schedule Areas that have a concrete `resource_code`.
- If a Schedule Area has `resource_code`, its scheduled list now contains only schedules on that exact resource.
- Example: a Batch scheduled on CAB1 is shown only in CAB1, never CAB2/CAB3.
- Unscheduled Batch candidates remain visible in all compatible CAB areas so the Planner can choose where to schedule them.
- Resource-group areas still require both matching `resource_group` and mapped Standard Operation.
- No change to Batch, Recipe, Previous Main, Planning Board, or future Auto Schedule architecture.


## v112 - Planning Board Area -> Operation dynamic filter
- Planning Board `Standard Operation` dropdown is now filtered dynamically by selected `Area`.
- Example: selecting Chemical line immediately shows only Standard Operations mapped to Chemical line.
- Applies to every Area using `md_operation_master -> md_area_operation_group -> md_area`; no hard-coded Area list.
- Changing Area automatically clears a previously selected Operation if that Operation does not belong to the new Area.
- `All Areas` continues to show all active Planning operations.
- Candidate/Batch/Recipe/Auto planning logic is unchanged.


## v114 - Candidate Job Route Status Matrix
- Candidate Jobs now include dynamic route columns built from each Job's mapped AllOperation sequence.
- Each route cell shows status: DONE, READY, WAITING, PLANNED-UNSCHEDULED, SCHEDULED, RUNNING, COMPLETED, HOLD.
- If a Job operation already belongs to a Batch, the cell also shows Batch No.
- If that Batch is scheduled, the cell also shows Resource and planned End time.
- Historical operations before the current Planning source sequence display DONE.
- PIONBL is included as a route-visibility column even though it remains intentionally excluded from Planning Batch creation.
- Repeated source operation codes use separate columns (`CODE`, `CODE #2`, ...).
- Matrix columns are dynamic for the loaded Candidate set and remain compatible with Columns / Sort Priority / saved views.
- Existing Candidate selection, same-Standard-Operation Batch lock, Recipe/Paint lock, Planning Board, and future Auto Plan architecture are unchanged.


## v115 - One Main Standard Operation per Route Status column
- Candidate Route Status Matrix now creates columns by Main / Standard Operation, not raw Operation Code.
- Example: source code `PPRSLVT` mapped to `PRIMER` is displayed in the `PRIMER` column.
- Repeated paint stages remain separate when Planning mapping already resolves them as `PRIMER`, `PRIMER2`, `PRIMER3`, `TOPCOAT1`, `TOPCOAT2`.
- `PIONBL` remains visible as its own route-status column for progress visibility.
- If legacy data contains duplicate identical Main Operations, they are shown inside one Main Operation cell rather than creating duplicate columns.
- Batch No, Schedule status, Resource and End time remain visible in the Main Operation cell.
- Column settings / Sort Priority remain supported. Candidate selection and Batch logic are unchanged.


## v116 - Separate fixed Main Operation columns
- Candidate Jobs now gets route matrix columns from active Planning Operation Scope / Operation Master, not only from operations found in loaded Jobs.
- Every Main / Standard Operation is a separate physical table column.
- Selecting an Area displays every Main Operation column belonging to that Area.
- All Areas displays all configured Main Operation columns.
- If a Job does not contain an operation, its cell is `—`; otherwise it displays route status and Batch/Schedule information.
- PIONBL remains a dedicated progress-only column when present.
- Existing Candidate selection, Recipe lock, Batch logic, Schedule logic and future Auto architecture are unchanged.

## v118 - Fix empty Main Operation status cells
- Candidate route-status standardization now mirrors Planning Chain rules for PRIMER/PRIMER2/PRIMER3, TOPCOAT1/TOPCOAT2, HE-BAKE variants, DIRECT/OCCURRENCE/SEQUENCE mappings.
- Added current-operation fallback so READY or PLANNED-UNSCHEDULED is never blank for the Job's current Main Operation.
- UI columns and Batch/Schedule/Auto logic are unchanged.


## v119 - Full Route Status Matrix
- Fixed Candidate route matrix showing only READY.
- Every mapped Main Operation in a Job route now receives a status.
- Source sequence before current = DONE.
- Current source sequence = READY, or PLANNED-UNSCHEDULED/SCHEDULED/RUNNING/HOLD when Batch/Schedule exists.
- Future source sequence = WAITING unless a future Batch/Schedule already exists.
- Historical/future Batch lookup uses `planning_batch_job.source_seq_snapshot` first, with Standard Operation fallback for legacy rows.
- Existing Planning Chain rows are preferred to preserve PRIMER2/PRIMER3/TOPCOAT2 and other occurrence/sequence mapping.
- Candidate selection, Batch creation, Schedule and Auto architecture are unchanged.


## v123 - Default View by Operation / Area / System
- `Set Default`, `Load Default`, and `Delete Default` now work in Area mode; Standard Operation is no longer required.
- Exact save scope:
  - selected Standard Operation -> `OP:<operation>`
  - Area selected without Operation -> `AREA:<area_id>`
  - All Areas without Operation -> `SYSTEM`
- Load precedence: Operation Default -> Area Default -> System Default.
- Backward compatible with old Operation presets stored under the raw operation name.
- Default View now also stores Density (`Normal/Compact/Ultra`) and Route Focus state in addition to Columns, Filters and Sort Priority.
- Planning, Candidate, Batch, Route Status and Auto logic are unchanged.


## v124 - Narrow Main Operation columns
- Candidate route/Main Operation columns reduced aggressively to save horizontal space.
- Normal: 64px.
- Compact: 58px.
- Ultra Compact: 52px.
- Header and status text wrap inside the narrow cell.
- No Planning/Batch/Route logic changed.


## v126 - Next Operation follows actual production routing
- Candidate `Next Operation` sort no longer uses A-Z text order.
- It now reads each Job's existing `all_operation` routing and sorts by the actual position of `next_operation` in that route.
- Example: `CPBILP | PIONBL | BSAUNSLD | PPRSLVT` sorts as sequence 1 -> 2 -> 3 -> 4.
- Unknown/unmatched operations are placed after operations with a valid routing position.
- No hard-coded ST process order was introduced.
- Planning, Batch, Schedule, Route Status and Auto logic remain unchanged.
- The sequence helper is isolated so it can be reused by future Auto Planning.


## v127 - Planning Order schema self-heal
- Fixed PostgreSQL `42703 planning_sort_order does not exist`.
- `/planning`, Operation Master, and Planning Order save API now call one shared schema guard before using the field.
- The guard only performs an additive `ADD COLUMN IF NOT EXISTS`, initializes blank values from existing `sort_order`, and creates an index.
- Migration `032_operation_planning_sort_order.sql` remains included for normal production deployment.
- No routing, Candidate, Batch, Schedule, Route Status, or Auto logic changed.
- `planning_sort_order` remains the shared configuration seam for manual sort now and Auto Planning later.


## v128 - Remove md_operation_master.sort_order dependency
- Fixed Operation Master error `column "sort_order" does not exist`.
- `planning_sort_order` is now fully independent; no attempt is made to initialize it from `sort_order`.
- Runtime schema guard only adds `planning_sort_order` and its index.
- Migration 032 now matches the real `md_operation_master` schema.
- Baseline schema includes `planning_sort_order` for clean installations.
- Existing ST Group / Mapping / Area `sort_order` fields are untouched.
- Planning/Batch/Schedule/Route/Auto logic is unchanged.


## v129 - Global Planning Order by raw Operation Code
- Planning Order moved to the raw Operation Code layer (`md_operation.operation_code`) for Candidate `NextOperation`.
- New Configuration page: `Operation Code Order`.
- Planner assigns values such as CPBILP=10, PIONBL=20, BSAUNSLD=30.
- Candidate `NextOperation ASC` reads `open_job_current.next_operation` and its matching `md_operation.planning_sort_order`.
- This order is global and does not depend on each Job routing.
- Same-order/unassigned values are grouped by Operation Code so NextOperation does not jump randomly between rows.
- Existing Standard Operation `planning_sort_order` is left untouched for compatibility; Candidate NextOperation no longer uses it.
- Schema guard + migration 033 safely add the raw Operation Code order column.
- Auto Planning can reuse the same `md_operation.planning_sort_order` later; no Auto logic is implemented/changed now.
- Batch, Schedule, Route Status, Recipe and Planning Chain logic are unchanged.


## v130 - Candidate duplicate-key + Settings performance fix
- Fixed React warnings such as duplicate keys `1197` / `1124`.
- Root cause fixed in SQL: current Batch lookup now uses a single latest active Batch via LATERAL LIMIT 1 instead of a one-to-many join.
- Candidate row React key is also composite as a defensive fallback.
- `/settings` no longer calls the heavy global `getStats()` workflow.
- Settings now loads only its required configuration counts in one PostgreSQL round-trip.
- This removes the repeated 17–28 second `/settings` load pattern that could lead to `destination stream closed early`.
- No Candidate eligibility, Planning Order, Batch, Schedule, Route Status, Recipe or Auto Planning business logic changed.


## v131 - Click READY/WAITING cells + schedule handoff
- Cell selection identifies exact Job + Main Planning Operation.
- READY can be selected/deselected directly.
- WAITING click explains that predecessor must be Scheduled.
- Batch creation no longer unlocks next Main.
- Scheduling a Batch unlocks the immediate next Main as ELIGIBLE/READY.
- Existing checkbox remains available for current Candidate.
- Same-operation and paint lock rules are preserved.
- Shared unlock helper is reusable by future Auto Schedule.


## v132 - Batch Builder Target Batch
- Batch Builder now offers `Target Batch`.
- Default is `Create New Batch`.
- Existing Batch list is filtered to the selected Main / Standard Operation.
- Unscheduled batches are shown first; scheduled batches include Resource information.
- Choosing an existing Batch changes the action to `Add Selected to Existing Batch`.
- Existing Batch membership validates Standard Operation, Recipe, duplicate membership, and paint compatibility.
- After add, Batch Jobs/Qty/Surface/Process Time are recalculated.
- If the Batch is already Scheduled, its existing schedule slot/duration is preserved; only Batch totals/process estimate are updated.
- This membership path is reusable by future Auto Batch without a second data model.


## v133 - Target Batch schedule date/time
- Scheduled Target Batch dropdown now shows Resource + scheduled date + start/end time.
- Example: `BSA_25AUG_003 · SCHEDULED · FB-01 · 25/08/2026, 07:00–09:30 · 5 jobs`.
- Unscheduled Batch display is unchanged.


## v134 - Clear selected Route Matrix cell
- Selected READY cell now uses a solid blue background with white text.
- Added a visible check mark in the selected cell.
- Added stronger border/glow and a small pressed effect.
- Hover and selected states are visually distinct.
- Selection/Batch/Planning logic is unchanged.


## v137 - Route Matrix state machine
- Route cells are normalized per Job using the actual READY source position.
- Cells entirely before READY render DONE.
- The current READY position renders READY.
- Cells after READY render WAITING.
- Batch/Schedule states remain authoritative: PLANNED-UNSCHEDULED, SCHEDULED, RUNNING, COMPLETED, HOLD.
- Handles duplicate/legacy Main Operation occurrences that previously caused a later WAITING occurrence to override an earlier DONE occurrence.
- Planning/Batch/Schedule/Auto architecture is unchanged.


## v138 - DONE / READY / WAITING driven by source_seq
- `ready_source_seq` is resolved per Job from the exact AllOperation occurrence matching `open_job_current.next_operation`.
- Fallback order: Job NextOperation occurrence -> current Planning Chain `p.source_seq` -> first ELIGIBLE planning operation source_seq.
- Route state is now deterministic:
  - `source_seq < ready_source_seq` => DONE
  - `source_seq = ready_source_seq` => READY or current Batch/Schedule status
  - `source_seq > ready_source_seq` => WAITING, unless future plan-ahead Batch/Schedule/ELIGIBLE already exists.
- `planning_sort_order` is NOT used for route status.
- Client Route Matrix trusts the SQL occurrence states and resolves duplicate Main-operation occurrences nearest to `ready_source_seq`.
- Existing Batch, Schedule, Target Batch, click-cell selection, and Auto architecture are unchanged.


## v140 - Source sequence verification + Schedule gate
- Route Matrix visibly shows `S<source_seq> / R<ready_source_seq>` in each populated Main cell.
- This makes DONE/READY/WAITING auditable directly from each Job routing.
- Chain rebuild no longer unlocks next Main when previous Main is merely PLANNED/in Batch.
- Next Main becomes ELIGIBLE only when immediate previous Main has a real non-cancelled `planning_schedule`.
- Existing Batch remains PLANNED but does not open the next Main until scheduled.
- Same schedule-gate rule remains reusable for future Auto Planning/Schedule.
- No change to Batch Builder, Target Batch, Recipe, Area, or Operation ordering.


## v141 - Full Routing Detail source_seq
- Route Matrix no longer treats `open_job_current.all_operation` as the primary full routing.
- Authoritative route is now `md_routing_detailed` for the Job Part + Revision.
- Original `md_routing_detailed.source_seq` is preserved, including operations before current NextOperation.
- Standard/Main Operation is resolved from `md_part_routing -> md_st_routing`; this preserves PRIMER2/PRIMER3/TOPCOAT2 and sequence mappings.
- `ready_source_seq` is resolved from the current Planning Main in the full master route; intermediate NextOperation falls forward to the first mapped Main.
- DONE / READY / WAITING remains:
  - source_seq < ready_source_seq => DONE
  - source_seq = ready_source_seq => READY/current real Batch/Schedule state
  - source_seq > ready_source_seq => WAITING unless explicit plan-ahead exists
- `AllOperation` parsing is retained only as a legacy fallback when no master Routing Detail exists.
- Existing Batch Builder, Target Batch, Schedule Gate and Auto extension path are unchanged.

## v142
- Removed visible S/R diagnostics only. Internal source_seq and ready_source_seq logic is unchanged.


## v143 - Logic & Hướng dẫn tab
- Added top-level `Logic & Hướng dẫn` tab at `/logic-guide`.
- Consolidates latest ST Planning architecture, route-state rules, mapping rules, Batch/Schedule handoff, Recipe rules, sorting, and planner workflow.
- Live sections query current DB configuration for Operation Mapping, Area -> ST Group, Schedule Area -> Standard Operations, Operation Code Planning Order, Recipe groups and active Auto rules.
- Documentation does not change Planning/Batch/Schedule business logic.


## v144 - Candidate Jobs Freeze Pane
- Freeze Candidate header row.
- Freeze left pane through Priority.
- Candidate rows scroll vertically/horizontally inside the table viewport.
- Full View uses the same freeze behavior.
- No Planning/Batch/Schedule/status logic changed.


## v145 - Schedule Gate immediate-next fix
- Scheduled Batch now unlocks exactly the immediate next active Main Planning Operation for each Job.
- Unlock helper no longer relies primarily on stale `planning_seq_snapshot`; it resolves the exact planning operation first.
- `/planning` self-heals historical Schedule handoffs so already-SCHEDULED previous Main operations immediately expose the next Main as READY.
- Self-heal uses immediate previous active Main only; it does not unlock later future Main operations.
- Batch without Schedule still does not unlock next Main.
- Freeze Pane and all other Planning/Batch/Schedule logic are unchanged.


## v146 - Waiting reason labels
- Internal route status remains `WAITING`.
- The earliest future WAITING Main for each Job is displayed as `WAIT PREV` with amber highlight.
- `WAIT PREV` means: Waiting for Previous Main Schedule.
- Later future Main operations display `WAIT` with neutral gray styling.
- Tooltip shows the waiting reason.
- No Batch/Schedule/Auto logic changed.
- Removed any remaining visible S/R fallback diagnostic.


## v147 - Unified READY UI
- All READY cells now use the same blue border, light-blue background and bold centered text.
- Applies to normal READY, Schedule-Gate READY, self-healed READY and fallback READY.
- Selected READY keeps the stronger blue selected state.
- UI/CSS only; no DONE/READY/WAIT/SCHEDULED, Batch, Schedule or Auto Planning logic changed.

## v148 - Force READY visual
- Adds `route-ready-force` directly from READY status in JSX.
- Uses a cell overlay so freeze/table/background rules cannot hide READY color.
- Applies to normal, Schedule-Gate, self-healed and fallback READY.
- UI only; no business logic changed.


## v150 - Single-source READY renderer/UI
- Removed READY patch layers from v147/v148/v149.
- Removed `route-ready-force` and related overlay/opacity workarounds.
- All READY states now render through one class only: `route-status-ready`.
- Normal READY, Schedule-Gate READY, self-healed READY and fallback READY share identical UI.
- Route Focus explicitly keeps READY at full opacity.
- UI only; Planning/Batch/Schedule/Auto logic unchanged.


## v152 TEMP - Route Debug
- Adds temporary `Debug Route` button next to Route Focus.
- When enabled, route cells show raw/final status, source_seq, ready_source_seq and current/not-current.
- Hover tooltip includes planning/batch/schedule/resource/selectable/CSS diagnostic data.
- Diagnostic UI only; no route/planning/batch/schedule logic changed.
- IMPORTANT: remove this debug feature after the READY issue is confirmed/fixed.


## v153 - Occurrence-first CURRENT/READY fix
- Route Matrix no longer derives CURRENT from another occurrence in the same Main column.
- Each route occurrence uses its own `source_seq`, `ready_source_seq`, and `route_status`.
- Hard invariant: `route_status=READY` + `source_seq=ready_source_seq` => CURRENT + READY + selectable.
- Duplicate mapped Main operations can no longer make a valid READY display as NOT-CURRENT.
- Existing SCHEDULED/RUNNING/PLANNED/HOLD/COMPLETED states remain authoritative.
- Debug Route is intentionally kept for one more verification round.
- No Batch/Schedule/Auto logic changed.


## v154 - Clean Area Candidate UI
- READY occurrence-first fix from v153 retained as official logic.
- Temporary Debug Route state/button/tooltips/notes/CSS removed after verification.
- Candidate rows are no longer visually dimmed when Area/Load Candidates selection rules apply.
- Filtering/selection behavior remains unchanged; only dimming presentation was removed.
- No Planning/Batch/Schedule/Auto logic changed.


## v155 - Freeze Pane overlap fix
- Frozen Candidate cells are now fully opaque instead of `background: inherit`.
- Horizontal scrolling columns can no longer bleed/text-overlap beneath the frozen pane.
- Header and frozen body cells use explicit z-index layers.
- Priority business colors are preserved inside the frozen pane.
- Added a solid visual divider after Priority.
- Route/status columns remain below the frozen layer while scrolling.
- No Planning/Batch/Schedule/Route logic changed.


## v156 - READY target is selectable even when row is PLANNED
- Removed the old row-level rule `planning_status must be ELIGIBLE` for checkbox/drag selection.
- Selection now resolves the actual occurrence-level READY Planning Operation (`route_status=READY` and `source_seq=ready_source_seq`).
- A row may show a previous Main as PLANNED/SCHEDULED while its immediate next Main is READY; the checkbox now selects that READY operation ID.
- Header Select All, row checkbox, drag-to-Batch and operation compatibility use the same `selectableTargetFor()` source of truth.
- Removed obsolete `planning-row-planned` and `paint-selection-disabled` dimming styles.
- Paint compatibility remains enforced only when the selected READY target is a Paint operation.
- No Batch/Schedule/Route-state logic changed.


## v157 TEMP - Selection Debug
- Adds temporary `Selection Debug` beside Route Focus.
- Each Candidate checkbox shows diagnostic reason: SELECTABLE / NO READY TARGET / OPERATION LOCK / PAINT LOCK.
- Hover checkbox shows row planning status, READY target op/id, route status, source_seq, ready_source_seq and lock flags.
- Temporarily forces Candidate row/cell opacity=1 and filter=none to expose any remaining dimming source.
- Diagnostic only; no Planning/Batch/Schedule/Route business logic changed.
- Remove after root cause is confirmed.


## v158 - READY selection source unified
- Fixed root cause found by Selection Debug: Route Matrix could display READY while checkbox lookup returned NO READY TARGET because it required a duplicated `planning_job_operation_id` in `route_status`.
- Selection now follows the same sources used by Route rendering:
  1. persisted READY occurrence ID when available;
  2. Candidate fallback READY uses `row.id`;
  3. computed READY matching the Candidate Main also uses `row.id`.
- Removed the obsolete `source_seq === ready_source_seq` requirement from checkbox target discovery.
- Removed all temporary Selection Debug UI/CSS after diagnosis.
- Existing READY occurrence-first route display logic remains unchanged.
- No Batch/Schedule/Auto Planning business logic changed.


## v159 - READY cell click uses displayed occurrence
- Route Matrix `displayItem` is now the exact interaction target; removed secondary READY re-resolution during click.
- A displayed READY cell is clickable directly.
- If a computed READY occurrence lacks `planning_job_operation_id`, click falls back to `candidate.id` when its Main matches the Candidate Main.
- Selected highlight uses the same fallback ID.
- WAITING remains clickable only to explain the gate; non-READY states cannot be added.
- No Schedule/Batch/Auto Planning state transition logic changed.


## v160 - Candidate NextOperation production-order sort
- Removed old Candidate positioning by ELIGIBLE/PLANNED and Batch No.
- Candidate order now starts from next_operation_planning_sort_order configured in Operation Master.
- Same order keeps identical RAW NextOperation codes together.
- Within one NextOperation: CAT3 > CAT5 > Sale > current month > normal.
- User Sort/Filter is lower-level tie breaking.
- No READY/Batch/Schedule/Auto Planning logic changed.


## v161 - Operation Code inherits Main Operation production order
- Candidate sorting source of truth:
  `RAW NextOperation -> ST Operation Mapping -> Main Operation -> md_operation_master.planning_sort_order`.
- Adding/moving an Operation Code into a Main Operation automatically places its Jobs at that Main's production position.
- RAW Operation Code `planning_sort_order` is no longer required; it is optional tie-breaker inside the same Main.
- Within one RAW NextOperation: Job Priority -> user tie-breakers -> Job No.
- Logic & Guide updated to document the inherited Main Order rule.
- Existing READY/Batch/Schedule/Auto Planning state logic unchanged.


## v162 - Operation Code Order restored as Candidate sort source
- Removed v161 inherited Main Planning Order logic.
- Main Operation is used only for membership/scope:
  Operation Code mapped into a Main => its Jobs belong to that Main/Area view.
- Candidate production order uses only `next_operation_planning_sort_order`
  from Operation Code Order (`md_operation.planning_sort_order`).
- Sort sequence:
  Operation Code Order -> RAW NextOperation -> Job Priority -> lower tie-break rules -> Job No.
- Operation Code without Planning Order sorts to the end.
- READY/Batch/Schedule/Auto Planning logic unchanged.


## v163 - Mapping immediately updates Planning Candidate membership
- ST Operation Mapping remains the source for Main Operation membership.
- ADD / MOVE / REMOVE mapping now runs `syncPlanningChains()` in the same transaction.
- Example: mapping `MSKG-PC -> CPBILP` immediately rebuilds future/unplanned chain rows, so an open Job whose NextOperation is `MSKG-PC` can appear under CPBILP without manually pressing Rebuild Chain.
- Existing actual Batch/PLANNED history remains preserved by `syncPlanningChains`.
- Candidate order is NOT inherited from Main Operation.
- Candidate sort source remains RAW NextOperation -> Operation Code Order.
- READY / Batch / Schedule status logic is otherwise unchanged.


## v164 TEMP Mapping/Candidate Debug
- Adds a temporary `Mapping Debug` button on Candidate Jobs.
- Default debug search is `MSKG-PC`.
- Traces Open Job NextOperation -> active ST Operation Mapping -> Operation Code Order -> active Planning Chain row.
- Reasons shown: MAPPING_NOT_FOUND, CHAIN_MISSING, CHAIN_MAIN_MISMATCH, CHAIN_INACTIVE, CHAIN_STATUS_*, CANDIDATE_SOURCE_OK.
- This diagnostic UI/query is intentionally temporary and should be removed after the MSKG-PC membership defect is identified and fixed.


## v164b - Fix Mapping Debug server scope
- Fixed `ReferenceError: mappingDebugQ is not defined`.
- Mapping debug query is now declared exactly once in the same `Page` try-scope before `candidatesQ` and before rendering `PlanningBoardClient`.
- Debug still defaults to MSKG-PC tracing.
- No Planning/Batch/Schedule business logic changed.


## v165 - Fix CHAIN_MISSING for newly mapped current NextOperation
- Root cause confirmed by Mapping Debug: MSKG-PC mapping and Operation Code Order existed, but no planning_job_operation row was generated.
- `open_job_current.next_operation` is now authoritative for the current planning position.
- If a mapped current NextOperation is missing from the imported `all_operation` string, sync injects it into an in-memory effective route immediately after LastOperation (or at route start when LastOperation cannot be resolved).
- Source/import data is NOT modified.
- The injected operation is then standardized through the normal ST Operation Mapping, so `MSKG-PC -> CPBILP` creates a real planning_job_operation and can become Candidate.
- Existing exact Batch/Schedule history preservation remains unchanged.
- Operation Code Order remains the Candidate sorting source.
- TEMP Mapping Debug is intentionally retained for one verification cycle; remove after user confirms the fix.


## v166 TEMP - Duplicate Candidate Debug
- Adds `Duplicate Debug` beside Mapping Debug.
- Diagnoses duplicate Candidate rows at `planning_job_operation` source level.
- Shows Job, operation row ID, operation_instance_key, Source Operation, Main Operation, source_seq, planning_seq, status, Batch, Schedule, and duplicate counts.
- Reasons include `DUPLICATE_ACTIVE_CHAIN`, `SAME_MAIN_DIFFERENT_SOURCE`, and `PLANNED_HISTORY_PLUS_NEW_ACTIVE`.
- Existing Mapping Debug is retained while MSKG-PC chain fix is being verified.
- Diagnostic only; no Candidate/Batch/Schedule business logic changed in this version.
- Remove all temporary debug UI/query after duplicate root cause is fixed.


## v167 TEMP - Duplicate Trace
- Replaces the ineffective active-chain Duplicate Debug with a Candidate JOIN trace.
- For each suspicious planning operation it counts matches in Material Finish, NextOperation Master, Area Group, Recipe, Batch History, Previous Chain and Previous Batch.
- `Est.Final` estimates multiplication caused by direct Candidate joins.
- Rows with direct join count > 1 are highlighted and reason identifies the likely multiplying table.
- No production planning/candidate logic is changed in this diagnostic build.
- Remove this temporary trace after the root cause is confirmed and fixed.


## v168 - Fix duplicate Candidate rows
- Root cause confirmed by v167 trace: multiple active `md_operation` rows matched the same `open_job_current.next_operation`.
- Candidate lookup of Operation Code Order now uses `LEFT JOIN LATERAL ... ORDER BY planning_sort_order, id LIMIT 1`.
- This preserves Operation Code Order as the Candidate sorting source and does not change Main Operation mapping.
- Removed the temporary Duplicate Trace query/UI after the root cause was confirmed.
- Existing Mapping Debug is retained because it is separate from this duplicate investigation.


## v168b - Fix md_operation primary key assumption
- Fixed runtime error `column mo.id does not exist`.
- `md_operation` uses `operation_code` as its key; it has no `id` column.
- Candidate lateral lookup now orders by planning_sort_order, updated_at, created_at, operation_code before LIMIT 1.
- Duplicate Candidate fix remains intact.
- No Planning/Batch/Schedule business logic changed.


## v169 - Enforce one Candidate row per planning operation
- v168 fixed the `md_operation` multiplier, but Candidate rows could still be multiplied by other ordinary master joins.
- `md_area_operation_group` is now a deterministic LATERAL lookup because one ST Group can have multiple active Area mappings.
- `md_material_finish` and `md_process_recipe` enrichment lookups are also LATERAL + LIMIT 1.
- No `DISTINCT` is used.
- Candidate identity remains `planning_job_operation.id`; master data may enrich it but may not create extra Candidate rows.
- Operation Code Order and Main Operation mapping logic are unchanged.


## v169b - Production schema compatibility
- Fixed runtime error `column m.created_at does not exist`.
- Removed new Candidate LATERAL dependencies on optional `created_at/updated_at` columns.
- md_operation lookup now uses only planning_sort_order + operation_code.
- md_material_finish and md_process_recipe lookups use LIMIT 1 without timestamp ordering.
- One planning_job_operation -> one Candidate row invariant remains unchanged.
- No Planning/Batch/Schedule/Operation Code Order business logic changed.


## v171 - One Candidate row per Job without changing Planning Chain
- Root cause clarified: multiple active `planning_job_operation` rows for a Job are normally different Main Operations in its Planning Chain, not duplicates.
- Candidate Board now chooses one representative Planning Operation per open Job:
  1. earliest `ELIGIBLE` Main Operation;
  2. if no ELIGIBLE exists, latest `PLANNED` Main Operation.
- Full planning_job_operation chain is preserved unchanged, so scheduling a Main can still unlock the next Main normally.
- Candidate enrichment joins remain one-row lookups.
- Operation Code Order remains the production sort source.
- Removed temporary Mapping Debug and Duplicate Debug UI/queries after diagnosis.


## v171b - Vercel TS2339 build fix
- Added the missing explicit `source_seq: number | null` field to the `Candidate` type.
- Server Candidate SQL already returns `p.source_seq`; this change aligns the client type with the actual payload.
- Fixes Vercel error: `Property 'source_seq' does not exist on type 'Candidate'`.
- No Planning Chain, Candidate selection, READY, Batch, Schedule, Main Operation, or Operation Code Order logic changed.


## v172 - Operation Code Add / Remove + Remap All
- Operation Code Order screen now supports Add Operation, Remove Operation and Set Order.
- Every Add / Remove / Set Order runs `refresh_st_operation_mapping(null)` and `syncPlanningChains()`.
- Add reactivates an existing inactive code or inserts a new md_operation row.
- Remove is soft-delete only: md_operation becomes inactive and Planning Order clears.
- Remove also deactivates active ST Operation Mapping rows for that source code and writes mapping history.
- Existing Batch/Schedule history is never deleted; syncPlanningChains preserves actual PLANNED history.
- A brand-new Operation Code still needs an active ST Operation Mapping to belong to a Main Operation.


## v173 - CMSA READY representative fix
- CMSA Debug confirmed Mapping and Planning Chain were correct: CMSA was active ELIGIBLE.
- Root cause was Candidate representative selection: another ELIGIBLE Main could be selected instead of the exact open_job_current.NextOperation row.
- Candidate lateral selection now prioritizes an ELIGIBLE planning_job_operation whose source_operation_code exactly matches open_job_current.next_operation.
- Therefore NextOperation=CMSA selects the CMSA planning row; existing route-cell fallback renders CMSA as READY even when route_status does not contain a CMSA item.
- Full Planning Chain remains unchanged; future Main Operations remain intact.
- CMSA Debug is intentionally retained for one verification cycle.


## v176 - NextOperation source trace (no logic change)
Confirmed data lineage for raw NextOperation shown in Candidate Jobs:

`All Open Job Excel.NextOperation`
→ `src/lib/import/open-job-import.ts`
→ `public.open_job_current.next_operation`
→ `src/app/planning/page.tsx` (`j.next_operation`)
→ Candidate payload `next_operation`
→ `src/components/planning-board-client.tsx` (`x.next_operation`).

Important:
- ST Operation Mapping is NOT the source of the raw NextOperation text.
- Therefore a code such as `MSKG-AND` can be displayed in Candidate Jobs even when it has no active ST Operation Mapping.
- ST Operation Mapping is used later to determine Main Operation / Planning Chain / READY behavior.
- This version only adds source-of-truth comments/documentation; no Planning logic changed.


## TEMP v177 - All Open Job NextOperation Debug
- Added a temporary expandable debug panel to `/all-open-jobs`.
- It enumerates every distinct active `open_job_current.next_operation`.
- It compares each code against `md_operation` and active `md_st_operation_mapping`.
- States:
  - `RAW_NEXTOP_ONLY`: present in All Open Job/current DB only; no Operation Master and no active Mapping.
  - `MASTER_ONLY_NO_MAPPING`: active Operation Master exists, but no active ST Mapping.
  - `MAPPED`: active ST Operation Mapping exists.
- This is diagnostic only. No import, All Open Job display, Mapping, Candidate, or Planning Chain logic changed.

## v178 - Unified ST Operation Flow architecture

The configuration architecture is now canonical and directional:

`Raw Operation (md_operation)`
→ `ST Scope (md_st_operation_scope)`
→ `Source → Main Mapping (md_st_operation_mapping)`
→ `Main Operation (md_operation_master + md_planning_operation_scope)`
→ `ST Group (md_st_group)`
→ `Physical Area (md_area_operation_group → md_area)`
→ `Schedule Area (md_schedule_area_operation → md_schedule_area)`
→ `Planning Chain (planning_job_operation)`
→ `Planning Board`
→ `Board Điều Độ`.

Key changes:
- `/st-operation-flow` is the one-step configuration screen. One Save writes Source Operation, ST Scope, Source→Main Mapping, Main Operation, ST Group, Physical Area and Schedule Area in one database transaction.
- After Save/Remove, all derived ST Routing is rebuilt from the current ST Scope, `refresh_st_operation_mapping(null)` runs, then future Planning Chains are synchronized. Existing actual Batch/Schedule history is preserved by `syncPlanningChains()`.
- `syncPlanningChains()` no longer contains a hard-coded Main Operation list. Active `md_planning_operation_scope` is the runtime planning scope.
- All Open Jobs in the ST application are filtered by `md_st_operation_scope`, NOT by ST Mapping. Therefore an ST intermediate code such as `MSKG-AND` is visible even before it is mapped to a Main Operation.
- Operation Code Order now represents only ST Scope source operations. Removing a code removes it from ST Scope but does not delete/deactivate it from the global raw Operation catalog.
- Master import no longer reactivates an ST Scope code that a planner explicitly disabled; it only seeds missing legacy scope codes.
- Planning Board route matrix recognizes the canonical ST Scope and Source→Main mapping.

- Board Điều Độ planner ownership is dynamic through `Schedule Area → Planner Assignment → Main Operation`; hard-coded Planner 1/2 Main Operation lists are no longer the runtime source.
- Cross-planner handover events resolve planner ownership from the same Schedule Area mapping instead of a hard-coded list.
- Supabase runtime connection architecture remains `Next.js/Vercel → Supavisor Transaction Pooler :6543 → PostgreSQL`, with a small Node pg pool.

Configuration responsibility:
1. **ST Operation Flow** – primary screen for adding/moving an Operation through the complete chain.
2. **Main Operation Master** – advanced Main Operation properties, batch prefix and process-time settings.
3. **ST Scope & Operation Order** – ST membership and raw NextOperation production order.
4. **Source → Main Mapping** – advanced mapping rule maintenance (DIRECT/OCCURRENCE/SEQUENCE).
5. **ST Group Master** – group catalog.
6. **Physical Area Master** – ST Group → physical production area.
7. **Schedule Area Mapping** – Main Operation → scheduling lane/resources.
8. **Planner Work Assignment** – Schedule Area → Planner 1/2.

## v179 - ST_SCOPE_ONLY vs Planning Operation

Migration: `supabase/migrations/035_st_scope_only_operation_type.sql`

`md_st_operation_scope.operation_type` is now the canonical Operation classification:

- `ST_SCOPE_ONLY`: requires only Operation Code + active ST Scope; raw Planning Order is optional. Main Operation, Main Planning Order, ST Group, Physical Area, Schedule Area and Planner Owner may remain blank.
- `PLANNING_OPERATION`: requires the full Main Operation → ST Group → Physical Area → Schedule Area → Planner chain.

An active `ST_SCOPE_ONLY` Operation continues to appear in All Open Jobs when it is the current `NextOperation`, because All Open Jobs is filtered only by active ST Scope. It is excluded from standardized Planning Chain rows, Candidate Jobs, Batch membership candidates, Planning Board and Board Điều Độ. Changing an existing Planning Operation to `ST_SCOPE_ONLY` deactivates its Source → Main mapping and active Planning rows while preserving actual Batch/Schedule history.

## v180 - Normalize duplicate Operation Code rows in ST Flow

Production data may contain more than one active `md_operation` or ST Scope row whose codes differ only by case/spacing, for example `UNMSKG-S` and `unmskg-s`. ST Operation Flow and ST Scope Order now normalize by `upper(trim(operation_code))`, select one deterministic Operation Master record, and calculate Open Job counts through a single lateral aggregate. The UI therefore receives exactly one row per normalized Operation Code instead of duplicate React rows/keys.

## v181 - Stabilize PostgreSQL pool for Planning

The Node PostgreSQL pool is now stored on `globalThis`, so Next.js/Turbopack module reloads reuse the same pool instead of leaving multiple stale pools connected to Supavisor. The default local capacity increases from 2 to 5 lightweight slots so one slow Planning query does not starve concurrent Server Component requests. Runtime remains `Next.js/Vercel → Supavisor Transaction Pooler :6543 → PostgreSQL`; no Planning logic or database migration changed. Optional `DB_POOL_MAX` and `DB_CONNECT_TIMEOUT_MS` environment variables allow bounded server-side tuning.

## v182 - Remove request-time schema DDL

Application requests no longer execute `ALTER TABLE`, `CREATE TABLE` or `CREATE INDEX`. Those self-heal guards could wait for an exclusive PostgreSQL table lock and hit Supabase `statement_timeout` while loading `/planning`. Migrations 031, 032 and 033 remain the single schema source of truth. Planning, Operation Order, Main Operation Order and Planner Assignment now perform only their normal data reads/writes; no Planning/ST Scope behavior changed and no new migration was added.

## v183 - Planning Candidate React keys

The Candidate table now assigns stable keys to the keyed fragments that insert `Priority + Current Main` headers and cells. The `Current Main` cell also carries its own stable key. Column drag/reorder behavior is unchanged, while React no longer emits repeated `Each child in a list should have a unique key` warnings from `PlanningBoardClient` and its table rows.

## v184 - Separate Recent Planning Batches tab

Planning now has two dedicated views: `/planning` for Candidate Jobs and `/planning/batches` for Recent Planning Batches. The Candidate page no longer renders the batch-history table below the board, so its scrollable table expands to the available viewport height while retaining the Batch Builder on the right. Both views use one shared active-batch query, and Batch Detail returns to the Recent Planning Batches tab by default. Batch creation, editing, deletion, reset, scheduling and Planning/ST Scope logic are unchanged.

## v185 - Calculated End column on every Scheduling table

Every Scheduling table now places `End` immediately after `Start` and uses one canonical formula: `End = Start + Duration`. Direct Schedule Grid rows show a live End preview while adding or editing Start/Duration. The combined Planner 1+2 table and each individual Planner table calculate End from the same source instead of independently displaying a stored end value. Scheduling API persistence, overlap validation and the shared Manual/Auto scheduling engine remain unchanged.

## v188 - Batch Key / Recipe Rules cho MỌI công đoạn chính + sửa lỗi đổi tên bảng

Migration mới: `supabase/migrations/038_batch_key_column.sql` (chạy sau 037).

### Sửa lỗi nghiêm trọng
- Migration 037 đổi tên `md_operation_code_recipe` → `md_main_operation_recipe`; toàn bộ 8 chỗ trong code đã chuyển sang tên mới. Trước đây nếu chạy 037, trang Planning / tạo Batch / Process Recipe sẽ báo lỗi "relation does not exist".

### Tính năng mới (theo đề xuất đã chốt)
1. **Open Job Column Values** (`/open-job-column-values`): quét mọi cột All Open Job, liệt kê giá trị unique; thêm/sửa display name/bật tắt; tự quét lại sau mỗi lần import All Open Job.
2. **Batch Key / Recipe Rules** (`/batch-key-recipe-rules`): rule = Main Operation + điều kiện (cột All Open Job + toán tử + giá trị) → đề xuất Recipe + Batch Key + Batch No Prefix. Hỗ trợ ALL/ANY, Priority, template Batch Key với `{COT}` lấy giá trị thật của Job.
3. **Planning Board nối rule**: bấm READY / chọn Job → hệ thống đề xuất Recipe + Batch Key + Prefix ngay trên Batch Builder; tạo Batch dùng đúng Recipe/Batch Key của rule; prefix rule ưu tiên hơn Operation Master; chặn gom lô khi các Job thuộc Batch Key khác nhau; nhiều rule cùng ưu tiên khớp → báo để planner chọn tay; chưa có rule → chọn Recipe tay + link tạo rule.
4. **syncPlanningChains** ưu tiên rule khi gán Recipe cho chuỗi planning (fallback Paint/Chemical như cũ).
5. **Process Time + Recipe Mapping cho mọi công đoạn**: không còn khóa FIXED_HOURS cho Chemical / QTY_SURFACE cho Paint; Operation Code → Recipe mở rộng mọi Operation + Standard Operation (đổi tên màn hình thành Main Operation · Operation Code → Recipe).
6. **Chemical Line**: nhập Loading Start (vùng Chemical, chưa chọn FB) → tự đề xuất FB trống sớm nhất (debounce 500ms), không cần bấm từng dòng.
7. **Timeline mở rộng**: nếu Batch/NDT/Unloading kéo dài qua 06:00 hôm sau, Timeline tự kéo dài tới khi xong (tối đa 48h) để thấy Resource còn bận.
8. Batch Detail hiển thị **Batch Key** của lô.

### Sửa 6 lỗi trong migration 037 (quan trọng — phải dùng file 037 mới)
File 037 gốc chạy bị lỗi "syntax error at or near insert". Đã sửa:
1. `rebuild_open_job_column_values()` dùng `$$` lồng `$$` → đổi delimiter ngoài thành `$rebuild$`.
2. Hàm `get_production_day(p_timestamp)` thân hàm gọi biến `t` không tồn tại → sửa thành `p_timestamp`.
3. `return query next` (cú pháp sai) → `return query select`.
4. Hàm `suggest_recipe_and_batch_key()` thiếu `r.match_mode` trong CTE `ranked_rules`.
5. `on conflict (source_column, source_value)` trùng tên OUT parameter → dùng tên constraint.
6. Câu thống kê `where source_column = col_name` bị ambiguous → thêm alias bảng.
- Đã kiểm chứng bằng cách chạy thật 037 + 038 trên PostgreSQL 14 (database sạch): 0 lỗi; hàm suggest + rebuild + production_day đều trả kết quả đúng.
- `rename to md_main_operation_recipe` thêm `IF EXISTS` để không vỡ nếu DB đã chạy một phần trước đó.

### Triển khai
1. Chạy lại `supabase/migrations/037_production_day_recipe_routing.sql` (file MỚI, đã sửa) rồi `supabase/migrations/038_batch_key_column.sql`.
2. Deploy code lên Vercel.
3. Bấm **Rebuild Planning Chain** một lần trên Planning Board (hoặc import lại All Open Job).
4. Vào Cấu hình → Open Job Column Values → bấm **Scan / Rebuild**, rồi tạo rule tại Batch Key / Recipe Rules.

## v189 - Open Job Column Values lấy TẤT CẢ cột All Open Job (140+ cột)

Migration mới: `supabase/migrations/039_open_job_column_values_all_columns.sql`.

- Trước đây hàm `rebuild_open_job_column_values()` chỉ quét ~25 cột chuẩn hoá của `open_job_current`, bỏ sót phần lớn cột nguồn (mặc dù toàn bộ 140+ cột đã được lưu đầy đủ trong `source_data` JSONB).
- Hàm mới quét **mọi key trong `source_data` của mọi Job** (một câu lệnh duy nhất) + bổ sung cột chuẩn hoá → Open Job Column Values hiển thị đủ 140+ cột.
- Đã kiểm chứng trên PostgreSQL 14 với job mô phỏng 150 cột: quét được 155 cột, tất cả giá trị đều active.
- Trang **All Open Jobs** thêm nút **"Xem tất cả cột"**: hiển thị toàn bộ cột của file All Open Job (cuộn ngang, 2 cột đầu cố định), nút **"Xem gọn"** để về chế độ 12 cột như cũ.
- Cài mới: file 037 đã được cập nhật hàm mới luôn; DB đang chạy chỉ cần chạy thêm 039.

## v190 - Chemical Line Timeline + Flybar logic chốt (không cần migration mới)

Logic đã chốt và xác nhận trong code:
- **Pre-cleaning (Recipe 001/009/016/025):** Loading → Process → NDT → Unloading → Flybar Available.
- **Mọi Recipe khác:** Loading → Process → Unloading → Flybar Available.
- Công thức: Loading End = Loading Start + Loading Duration; Process Start = Loading End; Process End = Process Start + Process Duration; Preclean: NDT Start = MAX(Process End, NDT Start trước + 01:30), NDT End = NDT Start + 05:00, Unloading Start = NDT End; còn lại: Unloading Start = Process End; Unloading End = Unloading Start + Unloading Duration. **Flybar bận toàn bộ Loading → Unloading End**, chỉ available sau đó.
- Loading/Unloading Duration lấy từ `md_chemical_handling_time_rule` theo khoảng Qty/Surface (ưu tiên nhỏ chạy trước); Process Duration từ Process Time của Recipe.

Cải tiến giao diện/API:
- **Timeline Chemical Line luôn hiển thị đủ 6 dòng FB-01..FB-06** (kể cả khi chưa có lịch hoặc resource chưa active trong DB).
- Mỗi Batch trên Flybar hiển thị **4 đoạn màu**: Loading (xanh), Process (teal), NDT (vàng, chỉ recipe preclean), Unloading (tím); rê chuột thấy Batch No + Recipe + giờ từng đoạn.
- **Xung đột được đánh dấu đỏ** (viền đỏ + ⚠ XUNG ĐỘT trong tooltip) khi hai lịch cùng Flybar chồng thời gian.
- **Chặn Schedule khi bị cấn** kèm thông báo chi tiết: Flybar nào bị trùng với lịch nào (Batch No + khoảng giờ Loading→Unloading), gợi ý đổi Flybar hoặc đổi Loading Start.
- Tự đề xuất FB kiểm tra **toàn bộ chuỗi Loading→Unloading** (không chỉ Process); nếu không FB nào trống tại giờ mong muốn → đề xuất FB + Loading Start sớm nhất (quét từng 15 phút, tối đa 7 ngày).
- Kiểm chứng: unit test công thức thời gian (preclean có/không có NDT trước, recipe thường, rule Qty/Surface) đều đúng; TypeScript + build sạch.

## v191 - Nhập Loading Start + xem/chỉnh giờ từng đoạn Chemical Line (không cần migration)

Khắc phục: trước đây 4 ô Loading/Process/NDT/Unloading chỉ hiện "Auto after Save" khiến planner tưởng không nhập được Loading Start.

- Cột **"Start"** ở vùng Chemical Line đổi tên thành **"Loading Start"** — đây là ô nhập giờ bắt đầu (nhập Date + Loading Start + Duration + Recipe).
- Ngay khi nhập đủ thông tin, **4 ô hiển thị ngay kết quả tính trước khi Save** (không còn "Auto after Save"):
  - **Loading:** Start–End (tự động, theo cấu hình Loading Time Qty/Surface).
  - **Process / NDT / Unloading:** ô **chỉnh giờ được** (mặc định = giá trị tự tính; đổi được nếu cần), kèm End + Duration.
  - NDT chỉ hiện với Recipe Pre-cleaning 001/009/016/025; recipe khác hiện "—".
- Khi Save, các giờ đã chỉnh được gửi lên server; server **kiểm tra ràng buộc**:
  - Process Start ≥ Loading End; NDT Start ≥ Process End và cách NDT trước ≥ 01:30; Unloading Start ≥ NDT/Process End.
  - Nếu vi phạm → báo lỗi rõ ràng kèm giờ tối thiểu, không cho Save.
- Tự đề xuất Flybar (nhập Loading Start → tự chọn FB) vẫn chạy và **tính luôn các giờ đã chỉnh**.
- Áp dụng cho cả 3 đường: lưới điều độ thủ công (manual-grid), schedule Batch có sẵn, và di chuyển lịch (PATCH).
- Kiểm tra: TypeScript + build sạch.

## v192 - Fix lỗi "FOR UPDATE cannot be applied to the nullable side of an outer join"

- Khi Schedule một Batch có Recipe, API `/api/schedule` dùng `for update` trên câu query có `LEFT JOIN` sang bảng recipe → PostgreSQL báo lỗi trên.
- Sửa: khóa đúng bảng chủ `for update of b` (chỉ khóa `planning_batch`, không khóa phía nullable của LEFT JOIN).
- Đã xác nhận trên PostgreSQL thật: query cũ lỗi đúng thông báo, query mới chạy bình thường. Các query `for update` khác đều single-table nên an toàn.
- Không cần migration; chỉ deploy lại code.

## v193 - Tự động điều chỉnh lịch Chemical Line khi thêm/bớt Job trong Batch đã Schedule

Trước đây: thêm job vào Batch đã Schedule chỉ cập nhật tổng pcs/dm², lịch giữ nguyên (không đổi thời gian).

Giờ đây, khi thêm/bớt Job (cả từ Batch Detail Fill/Jobs lẫn thêm vào Batch từ Planning Board):
1. Tính lại tổng Qty/Surface của Batch.
2. **Loading/Unloading Duration** lấy lại từ cấu hình Qty/Surface Min–Max (`md_chemical_handling_time_rule`).
3. **Process Duration** lấy lại từ Process Time của Recipe.
4. **NDT** (nếu recipe preclean) đặt lại theo queue (cách NDT trước ≥ 01:30).
5. Cập nhật toàn bộ segment Loading→Process→NDT→Unloading trên `planning_schedule`, **giữ nguyên Loading Start**, kéo dãn/may ra Planned End; cập nhật `planning_batch.planned_end`.
6. Nếu window mới **bị cấn** với lịch khác trên cùng Flybar → chặn (rollback) kèm thông báo rõ lịch nào đang chiếm khoảng nào → planner đổi FB/giờ.

Kiểm chứng trên PostgreSQL thật: batch 49 pcs (Loading 30' / Process 120' / Unloading 20', tổng 170') → thêm job thành 150 pcs → tự thành Loading 60' / Process 120' / Unloading 30' (tổng 210'), Loading Start giữ nguyên, DB lưu đúng.
Không cần migration; deploy lại code.

## v194 - Board Chemical Line gọn về 1 view (không cuộn ngang)

Trước đây bảng Chemical Line có 17 cột → phải cuộn ngang, khó nhìn.

Giờ vùng Chemical Line chỉ còn **11 cột** vừa màn hình:
`# · Batch · Std Op · Recipe · Resource · Date · Loading Start · Duration · pcs · dm² · Actions`
- Bỏ các cột thừa: End (đã thấy trong dải pha), Jobs (trùng pcs), và 4 cột Loading/Process/NDT/Unloading riêng.
- Mỗi dòng có **dải thời gian màu ngay bên dưới** (tràn đúng chiều rộng bảng, không cần cuộn):
  - Loading (xanh) · Process (xanh lá) · NDT (vàng, chỉ recipe preclean) · Unloading (tím) — mỗi chip ghi Start–End + Duration.
  - Dòng đã schedule: hiển thị thời gian thực từ DB.
  - Dòng trống: xem trước ngay khi nhập Date + Loading Start + Duration + Recipe; **Process/NDT/Unloading vẫn có ô giờ chỉnh được** ngay trong chip.
- Các vùng không phải Chemical giữ nguyên 13 cột như cũ.
- Kiểm tra: TypeScript + build sạch. Không cần migration.

## v195 - Tự đề xuất Loading cả ngày (Simulation) + chặn Loading trùng giờ

- **Chỉ 1 Flybar được Loading tại 1 thời điểm** trên cả 6 FB (dùng chung trạm Loading). Server chặn cứng: lưu lịch Chemical có Loading trùng giờ lịch khác → báo rõ lịch nào đang chiếm (batch + FB + giờ).
- **Gợi ý từng dòng (nút Áp dụng):** nhập Date + Loading Start + Duration + Recipe → hiện chip gợi ý `FB-XX · Loading HH:MM [Áp dụng]`. Công thức: MAX(giờ mong muốn, Unloading kết thúc của FB đó, thời điểm Loading hoàn thành muộn nhất của mọi FB). Ưu tiên FB trống sớm nhất; FB bận → tự đẩy giờ muộn hơn (kèm ghi chú). Gợi ý tính cả **lịch đã lưu + các dòng đang nhập dở** trong lưới.
- **Simulation cả ngày:** nút "Tự đề xuất cả ngày" trên vùng Flybar# → nhập Ngày + Giờ bắt đầu + danh sách lô (chỉ cần Recipe, mặc định bằng số dòng trống, +/− lô) → bấm "Tự đề xuất" → hệ thống xếp lần lượt FB + giờ (tôn trọng lịch cũ, Loading nối tiếp, NDT ≥ 1:30, tối đa 3 Process cùng lúc) → bấm "Áp dụng vào lưới" → các dòng trống tự điền FB/Loading Start/Duration/Recipe → xem từng dòng rồi Save.
- Kiểm chứng trên PostgreSQL thật: simulation 4 lô (preclean + thường) xếp đúng chuỗi Loading 06:00→06:30→07:00→08:50, NDT cách ≥ 1:30; chặn Loading trùng (06:10 trên FB-02 bị chặn vì FB-01 đang loading 06:00–06:30); cho phép khi không trùng. Build sạch.

## v196 - Save 1 dòng KHÔNG mất các dòng còn lại

Trước đây sau khi Save 1 dòng, trang tự tải lại → toàn bộ các dòng đang nhập dở (ví dụ 24 lô từ Simulation) bị mất hết.

Sửa:
- Bỏ hoàn toàn `location.reload()` sau mọi thao tác: Save, Edit lịch, Xóa lịch, Đổi thứ tự (↑↓).
- Thêm API `GET /api/schedule/rows?date=...`: sau mỗi thao tác chỉ **nạp lại danh sách lịch** (không tải lại trang) → dòng vừa Save hiện ngay trên lưới, **các dòng chưa Save giữ nguyên**.
- Gợi ý FB (chip "Áp dụng") tự tính lại theo danh sách lịch mới nhất — chuỗi Loading nối tiếp không bị đứt khi Save lần lượt từng dòng.
- Thêm/bớt dòng (＋/− Row) vốn đã không reload, giữ nguyên các dòng đang nhập.

## v197 - Save không tạo thêm dòng + Timeline cập nhật ngay

- **Save 1 dòng = "chuyển" dòng đó lên lịch, không sinh dòng trống mới:** sau khi Save, dòng vừa lưu biến thành lịch thật (kèm dải thời gian) và **biến mất khỏi vùng nhập** — các dòng phía dưới tự dồn lên, không còn cảnh "lưu xong lại thấy thêm dòng mới". Số dòng nhập giảm dần theo mỗi lần Save (muốn thêm thì bấm ＋ Row).
- **Production Timeline cập nhật ngay sau mỗi Save/Edit/Xóa/Đổi thứ tự:** chuyển Timeline thành component client, lắng nghe sự kiện "lịch vừa thay đổi" rồi tự nạp lại danh sách lịch qua API mới — **không tải lại trang**, nên Timeline hiện đầy đủ các khối Loading/Process/NDT/Unloading của lịch vừa lưu, đồng thời vẫn giữ nguyên mọi dòng đang nhập dở.
- Batch đã Schedule tự biến mất khỏi danh sách "Batches chưa xếp lịch".
- API `GET /api/schedule/rows` mở rộng: trả cả lịch từ ngày trước kéo dài qua 06:00 của ngày đang xem (khớp cửa sổ Timeline 06:00→06:00). Đã kiểm chứng trên PostgreSQL thật.

## v198 - Chọn trực tiếp trên bảng: kéo-thả lô Unscheduled + bỏ Simulation

- **Bỏ hẳn bảng "Tự đề xuất cả ngày (Simulation)"** — không còn phải đi qua bảng đề xuất nữa.
- **Bỏ dòng hướng dẫn** "Nhập Date + Loading Start + Duration (HH:MM) + Recipe..." dưới mỗi dòng.
- **Kéo-thả trực tiếp:** mỗi thẻ lô trong danh sách "Unscheduled Batches" giờ có thể **kéo thả vào đúng dòng bạn muốn** trên bảng (dòng cần nhập được tô sáng khi kéo qua). Vẫn bấm thẻ để đưa vào dòng trống đầu tiên nếu thích.
- **Chốt Operation khi thả:** nếu dòng đang chọn Operation khác với Operation của lô → **chặn** và báo rõ (ví dụ: "OHM_28AUG_001 thuộc Operation CtrHLI — không khớp dòng 3 (BSASLD)."). Đúng Operation mới được thêm vào dòng; dòng đã có lô cũng bị chặn.
- **Sửa Timeline trống sau khi Save:** nguyên nhân — server lọc lịch theo danh sách Operation hiệu dụng (gồm cả op được gán qua Planner Work Assignment), nhưng Timeline khi tự nạp lại lại lọc theo danh sách op cơ bản → lịch của op được gán bị lọc mất → Timeline trống. Đã sửa cho khớp đúng bộ op của Planner.

## v199 - Đề xuất trực tiếp trên bảng: chọn Recipe → bấm "Đề xuất"

- **Luồng mới đúng ý:** trên vùng Flybar#, bạn **tự chọn Recipe** cho từng dòng (mỗi dòng 1 Recipe, không cần nhập gì khác), rồi bấm nút **"Đề xuất"** ở góc phải tiêu đề vùng → hệ thống tự điền **FB + Loading Start + Duration** cho TẤT CẢ dòng đã chọn Recipe, theo thứ tự từ trên xuống.
- Các dòng chưa chọn Recipe (Set later) giữ nguyên, không bị đụng tới.
- Dòng chưa chọn Standard Operation → tự điền Operation theo mapping Recipe→Main Operation (ưu tiên op thuộc vùng này).
- Dòng đã có giờ bắt đầu riêng → hệ thống tôn trọng giờ đó (đẩy đúng chuỗi Loading không trùng).
- Dòng đã có Duration nhập tay → giữ nguyên; dòng chưa có → tự điền theo Process Time của Recipe.
- Tính năng tôn trọng lịch đã lưu (FB bận thì dùng FB khác / đẩy giờ), Loading chỉ 1 FB tại 1 thời điểm, NDT cách ≥ 1:30, tối đa 3 Process cùng lúc. Kiểm chứng PostgreSQL thật: 4 lô [001,012,001,012] xếp 06:00→06:30→07:00→08:50, không trùng Loading, op tự điền BSASLD.

## v200 - Bỏ cột Std Op + hiển thị Process Time (Start–End · Duration)

- **Bỏ cột Standard Operation** ở tất cả bảng trên trang Điều Độ: bảng nhập lưới, bảng "Schedule Table" và "Schedule Table · Tổng Hợp"; bỏ luôn nhãn Operation trên Timeline. Operation vẫn được hệ thống tự xác định: chọn Recipe → tự điền Operation đúng (theo mapping Recipe → Main Operation, chỉ khi thuộc vùng đó), kéo-thả lô → lấy Operation của lô.
- **Chemical Line:** cột "Duration (Process)" đổi thành **"Process Time (Start–End · Dur)"** — hiển thị **giờ bắt đầu – giờ kết thúc · thời lượng của Process**:
  - Dòng đã lưu: `Process 07:07–09:37 · 02:30`.
  - Dòng đang nhập: ô nhập HH:MM + dự báo `Process 07:07–09:37` cập nhật theo giờ Loading.
  - Timeline: chip Process trên Production Timeline hiện thêm thời lượng, ví dụ `09:37–12:07 · 02:30`.

## v201 - Chemical Line: 3 cột riêng Process Start · Process End · Duration

- Cột "Process Time (Start–End · Dur)" được **chia thành 3 cột riêng**:
  - **Process Start** — giờ bắt đầu Process (dòng đã lưu: thời gian thật; dòng đang nhập: dự báo theo giờ Loading).
  - **Process End** — giờ kết thúc Process.
  - **Duration** — thời lượng Process (ô nhập HH:MM cho dòng mới, hiển thị giờ-phút cho dòng đã lưu).
- Bảng Chemical giờ có: `# · Batch · Recipe · Resource · Date · Loading Start · Process Start · Process End · Duration · pcs · dm² · Actions`.

## v202 - Save không còn lỗi "chọn Standard Operation" sau khi bỏ cột

- Sau khi bỏ cột Std Op, nếu dòng chỉ có Recipe mà chưa có Operation, Save trước đây vẫn bị chặn với cảnh báo "chọn Standard Operation đã mapping" (lỗi logic cũ còn sót).
- Sửa: hệ thống **tự xác định Operation ngay khi Save** — tìm theo mapping Recipe → Main Operation, ưu tiên Operation thuộc đúng vùng (cả phía trình duyệt lẫn phía server, đã kiểm chứng PostgreSQL: Recipe 001 → BSASLD).
- Chỉ khi **không tìm được Operation** (Recipe chưa được map) mới chặn, kèm hướng dẫn rõ: "Recipe chưa map Operation trong vùng này. Vào Cấu hình → Main Operation → Recipe để map" hoặc "chọn Recipe / kéo lô vào dòng".

## v203 - Recipe chưa map Operation: chọn Operation ngay trên dòng

- Khi dòng đã chọn Recipe nhưng chưa có Operation (chưa map trong "Operation Code → Recipe Mapping"), giao diện **tự hiện thêm ô chọn Operation nhỏ (viền cam) ngay dưới ô Recipe** — bạn chọn Operation đúng là Save được ngay, không cần đi cấu hình trước.
- Nếu Recipe đã map sẵn → ô chọn này không hiện (bảng vẫn gọn).
- Sửa thông báo lỗi cho đúng vị trí cấu hình thật: "Cấu hình → Process Recipe → mục Operation Code → Recipe Mapping" (không phải menu "Main Operation → Recipe" như trước).

## v204 - Sửa tra Operation theo cột "Operation Code" (không phải "Standard Op")

- Phát hiện: trong bảng "Operation Code → Recipe Mapping", cột **Standard Op** của bạn đang chứa giá trị nhóm **CHEMICAL_LINE** (còn hàng CLASP để trống) — nhưng Operation thật nằm ở cột **Operation Code** (CPBILP, BSASLD...). Code cũ tra nhầm cột Standard Op nên không tìm ra mapping dù đã có.
- Sửa cả 3 nơi (chọn Recipe tự điền Operation · nút Đề xuất · Save) để ưu tiên **Operation Code**, chỉ dùng Standard Op khi Operation Code rỗng. Kiểm chứng PostgreSQL với đúng dữ liệu thực tế: Recipe 001 → **CPBILP** ✅.

## v205 - Schedule Table xếp theo thứ tự bảng điều độ

- "Schedule Table · Planner 1" và "Schedule Table · Tổng Hợp" trước đây xếp theo Resource (FB-01→06) rồi giờ — giờ đổi sang **đúng thứ tự như bảng điều độ**: theo thứ tự thao tác (sequence_no) rồi theo **giờ Loading Start** (06:00 → 07:00 → ...), cùng lịch trùng giờ thì xếp theo Resource rồi Batch.

## v205 - Schedule Table xếp theo thứ tự lô như bảng điều độ

- "Schedule Table · Planner 1" và "Schedule Table · Tổng Hợp" đổi sang **xếp theo đúng thứ tự các lô như trên bảng điều độ**: lô nào xếp trước (theo thứ tự thao tác ↑↓) thì đứng trước, cùng thứ tự thì theo **giờ Loading Start** (06:00 → 07:00 → 08:00...), trùng giờ thì theo Resource rồi Batch.

## v206 - Redesign bảng Flybar# (theo demo đã chốt)

- **Header 2 tầng**: nhóm 4 cột giờ (Loading Start · Process Start · Process End · Duration) dưới ô **THỜI GIAN**; cột còn lại: # · Lô · Recipe · FB · KL · Tác vụ.
- **Bỏ cột Date** trên vùng Chemical (ngày nằm ở tiêu đề vùng); ngày dòng vẫn lưu theo ngày board, tự cập nhật qua Đề xuất/kéo-thả.
- **Gộp pcs·dm² → 1 cột KL** (vd `58 pcs · 775 dm²`; hiện "—" khi 0).
- **4 dải chip rời → 1 thanh Gantt liền mạch màu pastel** (Loading xanh nhạt · Process xanh lá nhạt · NDT vàng nhạt · Unloading tím nhạt), đoạn màu tỷ lệ đúng thời lượng, có giờ + thời lượng trên từng đoạn, rê chuột xem chi tiết. Kèm chú giải màu dưới bảng.
- **Vẫn giữ chỉnh giờ override**: dòng đang nhập có hàng nhỏ "Process / NDT / Unloading" để tinh chỉnh giờ bắt đầu trước khi Save.
- Bảng không-Chemical giữ nguyên cấu trúc cũ.

## v207 - Nối tiếp cùng FB: lô sau chạy ngay trên chính FB của lô trước, không loading lại

- Với lô thuộc cùng nhóm job có **Previous Main đã điều độ** (ví dụ BSAUNSLD sau CPBILP chạy chung trên FB-01): Đề xuất / gợi ý từng dòng giờ **ưu tiên đúng FB đó** và bắt đầu **ngay khi lô trước unloading xong — không loading lại** (Loading 0 phút, Process chạy luôn).
- Lô không có Previous Main → vẫn chọn FB rảnh sớm nhất như cũ (Loading bình thường).
- Nút "Đề xuất" và chip gợi ý đều áp dụng; chip hiển thị rõ "nối tiếp lô trước HH:MM (không loading)".
- Kiểm chứng PostgreSQL: CPBILP trên FB-01 xong unloading 14:30 → BSAUNSLD đề xuất FB-01, Loading 14:30–14:30 (0'), Process 14:30–16:00 ✅; lô thường không nối tiếp → FB-02 rảnh sớm nhất, loading 30' ✅.

## v208 - Chip gợi ý hiện rõ lô Previous Main (kiểm tra nối tiếp)

- Chip gợi ý khi nối tiếp cùng FB giờ hiện đầy đủ: **"Gợi ý: FB-01 · nối tiếp CHM_CPB_001 (CPBILP) · 14:30 (không loading)"** — bạn nhìn thấy ngay lô BSAUNSLD đang nối tiếp từ lô CPBILP nào.
- Kiểm tra thủ công: thẻ lô trong "Unscheduled Batches" có mục **Previous Main** liệt kê lô trước (batch_no + Operation + trạng thái + FB + giờ xong); nút **Fill / Jobs** trên dòng đã lưu cho xem danh sách job của từng lô để đối chiếu.

## v209 - NDT: tối đa 2 Flybar cùng lúc

- Bổ sung ràng buộc: **chỉ 2 FB được NDT cùng thời điểm** (trước đây chỉ có quy tắc cách nhau ≥ 1:30 giữa các lần NDT).
- Áp dụng ở mọi nơi xếp NDT: nút "Đề xuất", gợi ý từng dòng (chip), và **khi Save** (server tự tính lại, chặn nếu 3 NDT trùng).
- Thuật toán: NDT mới phải ≥ 1:30 sau lần NDT trước VÀ nằm ngoài khoảng thời gian có 2 NDT đang chạy (tự đẩy sang sớm nhất có thể).
- Kiểm chứng PostgreSQL: 3 lô preclean liên tiếp → NDT 08:30–13:30 · 10:00–15:00 · 13:30–18:30, **tối đa 2 NDT cùng lúc** ✅; lưu lô thứ 3 khi đã có 2 NDT chạy → bị đẩy sang 13:30 ✅.

## v210 - Sửa: Loading Start bị bằng Process Start (loading 0 phút sai)

- Nguyên nhân: logic "nối tiếp cùng FB" đặt Loading 0 phút cho MỌI lô có Previous Main đã điều độ — kể cả khi lô trước đã xong từ lâu/hôm trước (đáng lẽ phải Loading bình thường).
- Sửa: chỉ bỏ Loading khi lô mới bắt đầu **NGAY tại** thời điểm lô trước vừa xong (sai lệch ≤ 5 phút). Lô trước xong đã lâu → **Loading bình thường** (30–60 phút trước Process).
- Kiểm chứng PostgreSQL: prev xong hôm trước 14:30, lô mới 06:00 → Loading 06:00–06:30 (30'), Process 06:30 ✅; prev xong ngay 06:00 → Loading 0', Process 06:00 (nối tiếp) ✅.
- Lưu ý: các dòng đã lưu sai (loading 0) cần sửa lại — bấm **Edit** rồi **Save Edit** trên từng dòng (hoặc xóa + Đề xuất lại).

## v211 - Nối tiếp CHỈ khi phát hiện được job chung

- Siết chặt: server **tự kiểm chứng bằng SQL** — chỉ nối tiếp (Loading 0 phút trên cùng FB) khi: lô có **job thật sự** (planning_batch_job), và các job đó nằm trong **lô Previous Main** đã được điều độ **đúng FB + đúng giờ kết thúc** (sai lệch ≤ 5 phút).
- Không phát hiện được (lô không có job / lô trước chưa điều độ / khác FB / khác giờ) → **không nối tiếp** — chọn FB rảnh sớm nhất, Loading bình thường.
- Kiểm chứng PostgreSQL: lô có job J1 (prev CPBILP scheduled FB-01 14:30) → nối tiếp FB-01 14:30 loading 0' ✅; lô **0 job** → FB-02 loading 30' ✅.

## v213 - Liên kết nối tiếp thủ công giữa các dòng (Dòng 8 → Dòng 10)

- **Chọn liên kết trực tiếp trên bảng:** mỗi dòng nhập có ô **"Nối tiếp từ"** (trong hàng chỉnh giờ) — chọn dòng nguồn (ví dụ dòng 10 nối tiếp từ dòng 8). Danh sách chỉ gồm các dòng phía trên.
- **Khi Đề xuất / gợi ý:** dòng 10 sẽ chạy **ngay trên FB của dòng 8** (dùng đúng FB + thời điểm dòng 8 unloading xong, **không loading lại**), không cần phát hiện job (do bạn chỉ định). Lô có liên kết tự động theo Previous Main vẫn giữ nguyên.
- **Nhìn thấy liên kết:** chip gợi ý hiện "nối tiếp Dòng 8 · HH:MM (không loading)"; thanh Gantt có dấu **↳** tại đoạn Loading 0 phút; trên **Production Timeline** có mũi tên **↳** nối đúng điểm chuyển tiếp giữa 2 lô cùng FB (viền cam quanh lô nối tiếp); thông báo Đề xuất đếm số dòng nối tiếp.
- Xóa dòng giữa chừng → liên kết tự dồn theo (hoặc bỏ nếu trỏ tới dòng đã xóa).
- Kiểm chứng PostgreSQL: liên kết thủ công dòng 10 → FB-02 14:30, Loading 0', Process chạy luôn ✅.

## v214 - Ô "Nối tiếp từ" luôn hiện trên mọi dòng nhập

- Trước đây ô "Nối tiếp từ" chỉ hiện khi dòng đã điền Date + Giờ + Duration (có dự báo) — dòng mới trống không thấy ô.
- Giờ ô **"Nối tiếp từ" luôn hiện** ở hàng phụ của mỗi dòng nhập (kể cả dòng trống), ngay cạnh các ô chỉnh giờ Process/NDT/Unloading (các ô giờ vẫn chỉ hiện khi có dự báo).

## v215 - Logic & Hướng dẫn trực quan (trang /logic-guide)

- Viết lại toàn bộ trang **Logic & Hướng dẫn** thành tài liệu vận hành trực quan, cập nhật đúng code hiện tại:
  - **Tổng quan + thống kê sống** (số Recipe, Mapping, Vùng, Resource, Flybar… đọc trực tiếp từ hệ thống).
  - **Luồng dữ liệu tổng thể** (flowchart): Open Jobs → Master Data → All Open Jobs → Planning Board → Điều độ → Batch → Job update; ngày sản xuất 06:00→06:00.
  - **Chuỗi Chemical** (sơ đồ dọc): Loading → Process → NDT → Unloading → FB sẵn sàng, kèm công thức thời gian (handling rule, recipe time rule, NDT 300' / ≥1:30 / ≤2 FB).
  - **Ràng buộc điều độ** (thẻ quy tắc): 1 FB loading 1 lúc, ≤3 Process, NDT queue, FB bận cả chuỗi, chặn trùng, Timeline ⚠.
  - **Nối tiếp** (auto phát hiện job + thủ công "Nối tiếp từ dòng X") + nơi nhìn thấy liên kết (↳).
  - **Thuật toán Đề xuất** 8 bước + cách dùng chip gợi ý.
  - **Hướng dẫn trang Điều độ** 6 thao tác chính.
  - **9 bảng Mapping SỐNG** (Recipe→Op, Operation Code→Recipe, Source→Main, Vùng, Resource, Process Time, Loading/Unloading, Batch Key Rules, Area/ST Group).
  - **Hướng dẫn cấu hình** theo thứ tự 11 bước + **FAQ** 10 câu hỏi thường gặp.

## v216 - Kéo dòng để liên kết + 6 FB 6 màu pastel

- **Kéo 1 dòng thả lên dòng khác** → hệ thống TỰ tạo liên kết nối tiếp (dòng sau nối tiếp dòng trước, không cần vào ô "Nối tiếp từ") — kèm thông báo "Đã liên kết: Dòng X nối tiếp từ Dòng Y".
- **6 Flybar = 6 màu pastel nhạt**: chọn FB nào → ô FB + viền trái thanh Gantt của dòng nhuộm màu FB đó; trên Timeline nhãn FB cũng cùng màu. Dòng nối tiếp cùng FB → cùng màu → nhìn là thấy liên kết.
- Bảng màu (nhạt, không chói): FB-01 xanh dương nhạt · FB-02 xanh lá nhạt · FB-03 vàng nhạt · FB-04 tím nhạt · FB-05 hồng nhạt · FB-06 ngọc nhạt.
- Dòng có liên kết hiện huy hiệu **↳X** (nối tiếp từ dòng X) ngay cạnh số dòng.

## v217 - ✕ xóa liên kết + "↺ Xóa đề xuất"

- **✕ xóa liên kết**: cạnh ô "Nối tiếp từ" có nút **✕** để bỏ liên kết nối tiếp bất kỳ lúc nào.
- **"↺ Xóa đề xuất"** (nút xuất hiện cạnh "Đề xuất" khi có dòng đã được đề xuất): xóa hết **giờ / FB / Duration / override / gợi ý** của các dòng đã đề xuất → quay lại đúng trạng thái **chưa đề xuất** (giữ Recipe + liên kết nối tiếp) — muốn làm lại thì chỉnh/Đề xuất lại từ đầu. Có hộp xác nhận trước khi xóa.

## v217 - ✕ xóa liên kết + "↺ Xóa đề xuất"

- **✕ xóa liên kết**: cạnh ô "Nối tiếp từ" có nút **✕** để bỏ liên kết nối tiếp bất kỳ lúc nào.
- **"↺ Xóa đề xuất"** (nút xuất hiện cạnh "Đề xuất" khi có dòng đã được đề xuất): xóa hết **giờ / FB / Duration / override / gợi ý** của các dòng đã đề xuất → quay lại đúng trạng thái **chưa đề xuất** (giữ Recipe + liên kết nối tiếp) — muốn làm lại thì chỉnh/Đề xuất lại từ đầu. Có hộp xác nhận trước khi xóa.

## v218 - Xóa chip gợi ý từng dòng

- Bỏ chip "Gợi ý: FB-XX · Loading HH:MM [Áp dụng]" ở hàng phụ mỗi dòng (gây rối — còn gợi ý FB khác FB đang chọn). Toàn bộ logic gợi ý vẫn dùng qua nút **"Đề xuất"** (tự điền FB + giờ cho cả bảng) và **kéo-thả liên kết**; gỡ luôn hàm gợi ý không còn dùng.

## v219 - 📌 Giữ dòng (đánh dấu + theo dõi)

- Mỗi dòng nhập có nút **"📌 Giữ"** (cạnh Save): bấm để **giữ/đánh dấu** dòng — dòng có viền cam + nền vàng nhạt nhận diện.
- Dòng đang giữ **không bị "↺ Xóa đề xuất" xóa thời gian** (các dòng khác vẫn xóa bình thường; thông báo nêu rõ số dòng giữ nguyên).
- Bấm lại để bỏ giữ. Dùng khi bạn muốn theo dõi / giữ lại một số dòng đã điền Recipe giữa các lần Đề xuất.

## v220 - Tự động 📌 giữ dòng đã điền Recipe

- Dòng nào **chọn Recipe** → **tự động 📌 Giữ** (viền cam + nền vàng nhạt) — không bị "↺ Xóa đề xuất" xóa thời gian; chọn "Set later" hoặc bấm 📌 lại để bỏ giữ.
- Kéo-thả lô Unscheduled vào dòng → cũng tự giữ.
- **"+ Row" (thêm dòng mới) luôn giữ nguyên** các dòng đã điền Recipe + FB — không reset, không mất gì; dòng mới thêm vào cuối, trống để điền tiếp.

## v220 - Tự động 📌 giữ dòng đã điền Recipe

- Dòng nào **chọn Recipe** → **tự động 📌 Giữ** (viền cam + nền vàng nhạt) — không bị "↺ Xóa đề xuất" xóa thời gian; chọn "Set later" hoặc bấm 📌 lại để bỏ giữ.
- Kéo-thả lô Unscheduled vào dòng → cũng tự giữ.
- **"+ Row" (thêm dòng mới) luôn giữ nguyên** các dòng đã điền Recipe + FB — không reset, không mất gì; dòng mới thêm vào cuối, trống để điền tiếp.

## v221 - Bảng Flybar# theo cột giờ màu + Sửa dữ liệu Loading cũ

- **Bỏ thanh Gantt** dưới mỗi dòng — thay bằng **9 cột giờ theo nhóm màu** (đúng yêu cầu user, dễ phân biệt):
  - **LOADING** (xanh dương nhạt): Loading Start · Loading End
  - **PROCESS TIME** (xanh lá nhạt): Process Start · Process End · **Duration**
  - **NDT** (vàng nhạt): NDT Start · NDT End
  - **UNLOADING** (tím nhạt): Unloading Start · Unloading End
- Dòng nhập (NEW) hiện đủ **dự báo** các cột giờ (Loading End / Process / NDT / Unloading) theo engine hiện tại — nhìn thấy cả chuỗi trước khi Save; vẫn chỉnh giờ override Process/NDT/Unloading ở hàng phụ.
- **Bỏ ô "Nối tiếp từ"** (dropdown) — vì kéo-thả dòng đã tạo liên kết được; dấu **↳X** cạnh số dòng giờ **bấm được để xoá liên kết**.
- **Dấu ↳** hiện ở cột **Loading End** cho lô nối tiếp (Loading 0 phút) — không còn nhầm là lỗi.
- **Nút "🔧 Sửa Loading cũ"** (vùng Flybar#): rà toàn bộ lịch Chemical Line, lô nào Loading = 0 phút mà **KHÔNG phải nối tiếp thật** (lô trước cùng FB vừa xong ±5') → tính lại Loading theo quy tắc Qty/Surface, đẩy Process/NDT/Unloading tương ứng (giữ nguyên Loading Start làm neo); lô nối tiếp thật → giữ nguyên; lô bị cấn giờ → báo rõ để Edit tay. **Lô sớm hơn được ưu tiên giữ vị trí** (`excludeScheduleIds` trong `assertResourceAndChemicalCapacity`).
- Sửa lỗi SQL: truy vấn "nối tiếp thật" dùng `b2.batch_no` (cột nằm ở planning_batch, không phải planning_schedule).
- Logic Guide: cập nhật mô tả nối tiếp (kéo-thả), bỏ chip gợi ý đã gỡ (v218), badge **v221**.
- API mới: `POST /api/schedule/heal-chemical-loading`. Không cần migration SQL.

## v221.1 - Căn đều cột giờ bảng Flybar#

- Căn **giữa** toàn bộ ô giờ (tiêu đề Start/End/Duration + ô dữ liệu Loading/Process/NDT/Unloading) — cột đều, hết lệch trái/phải.
- Cột giờ có độ rộng đồng nhất (Start/End tối thiểu 62px; **Duration 86px**); dấu ↳, dấu "—" hiện cân đối.
- Ô nhập giờ/Duration/FB/Recipe **tự giãn vừa đúng cột** (trước bị lệch do input mặc định rộng hơn cột).
- Cột **#** và **FB** căn giữa; Lô/Recipe giữ căn trái; KL căn phải.
- Thêm đường kẻ dọc nhạt giữa các ô giờ — nhìn thành lưới rõ ràng hơn.
- Chỉ sửa CSS (globals.css) — không cần SQL, không đổi logic.

## v221.2 - Bảng fit 1 màn hình + chỉnh giờ ngay tại cột Start

- **Bảng Flybar# khớp đúng 1 màn hình** (không còn kéo ngang): khóa độ rộng cột theo tỷ lệ % (colgroup + table-layout:fixed), chữ quá dài tự cắt "…", nút Tác vụ tự xuống hàng khi chật.
- **Bỏ hàng phụ chỉnh giờ** (Process/NDT/Unloading ở hàng nhỏ) — đúng yêu cầu "xóa phần ảnh 2".
- **Chỉnh giờ trực tiếp tại cột**: cột **Process Start**, **NDT Start** (chỉ recipe Pre-clean), **Unloading Start** của dòng nhập giờ là ô nhập giờ tại chỗ (có icon đồng hồ); Loading Start vẫn là cột neo. Các cột End (Loading End / Process End / NDT End / Unloading End) hiện kết quả dự báo tự tính.
- Giữ nguyên toàn bộ logic: override giờ vẫn được gửi lên server khi Save, ràng buộc (Process ≥ Loading End, NDT ≥ Process End + cách ≥1:30, Unloading ≥ NDT/Process End) vẫn do server chặn.
- Chỉ sửa giao diện (JSX + CSS) — không cần SQL.

## v221.3 - Highlight màu theo FB sau Đề xuất + cột FB rộng + Đề xuất tránh cấn 3 Process

- **Tự động tô màu dòng theo màu FB**: sau khi bấm **Đề xuất** (hoặc chọn FB bất kỳ), dòng được tô nền nhạt + viền trái đúng màu Flybar đã chọn (FB-01 xanh dương · FB-02 xanh lá · FB-03 vàng · FB-04 tím · FB-05 hồng · FB-06 ngọc). Dòng đã lưu cũng tô màu theo FB → nhìn bảng là biết lô đang ở dây nào.
- **Cột FB rộng hơn** (4.5% → 6.5%) — hiện đủ chữ **FB-01…FB-06**, không bị cắt "FB-0…".
- **Đề xuất tính luôn thời gian tránh cấn 3 FB Process cùng lúc**: engine Đề xuất giờ **đọc cả giờ bạn chỉnh tay** ở cột Process Start / NDT Start / Unloading Start; khi gợi ý FB + giờ Loading sẽ đảm bảo tổng số FB đang Process ≤ 3 (cùng với luật Loading nối tiếp, NDT ≥1:30 & ≤2 FB) → Save không còn báo "tối đa 3 Flybar chạy Process cùng lúc".
- API `POST /api/schedule/chemical-simulation`: mỗi run nhận thêm `overrides` (processStart/ndtStart/unloadingStart ISO).
- Không cần SQL. Đã test engine trên PostgreSQL local: 8 lô đề xuất → max Process đồng thời = 3 ✅; 4 lô chỉnh tay Process Start 19:00–22:00 → vẫn ≤ 3 ✅.

## v221.4 - Số lô hiện đủ + Recipe số & tên + giờ nhập 24h

- **Cột Lô rộng hơn** (8% → 10%): số lô như CHM_27AUG_048 hiện **đầy đủ**, không bị cắt "…".
- **Cột Recipe hiện cả SỐ + TÊN**: dòng đã lưu giờ hiển thị *"001 · Pre-Cleaning Boeing"* (số màu xanh đậm, tên màu xám); cột rộng hơn (10% → 15%) để thấy rõ tên recipe.
- **Giờ nhập hiển thị 24h**: các ô Loading Start / Process Start / NDT Start / Unloading Start (và ô giờ trong Edit) đổi từ input AM/PM ("05:00 CH") sang **nhập HH:MM 24h** ("17:00") — đúng giờ hệ thống, không lẫn sáng/chiều.
- Cột KL/Tác vụ cân lại tỷ lệ — bảng vẫn khớp 1 màn hình, không kéo ngang.
- Chỉ sửa giao diện (JSX + CSS) — không cần SQL.

## v221.5 - SỬA BUG QUAN TRỌNG: Save làm mất thời gian Loading (Loading Start = Process Start)

- **Nguyên nhân gốc**: khi lưu lô, app gửi `loading_minutes_override: null` nghĩa là "tự động tính Loading". Nhưng server parse bằng `Number(null)` → **bằng 0** → tưởng người dùng muốn Loading **0 phút** → **lưu lô nào cũng bị xoá thời gian Loading** → Loading Start trùng Process Start. (Các bản sửa v210–v211 trước đây chỉ sửa phần Đề xuất, không sửa được chỗ đọc dữ liệu này — đây chính là lý do lỗi cứ tái diễn.)
- **Đã sửa**: `parseOverrides` (cả 2 route `/api/schedule` và `/api/schedule/manual-grid`) kiểm tra `null`/chuỗi rỗng TRƯỚC khi ép số — `null` → tự động tính Loading theo quy tắc Qty/Surface; `0` → vẫn giữ 0 (lô nối tiếp). Lô nối tiếp giờ lưu `loading_duration_minutes = 0` (trước lưu NULL do `0||null`).
- **Hệ quả khi deploy**: các lô ĐÃ lưu sai (Loading 0) vẫn bị sai — dùng nút **"🔧 Sửa Loading cũ"** để tự dọn lại toàn bộ.
- Đã test trên PostgreSQL local: gửi `null` → lưu Loading **30 phút** (Process Start ≠ Loading Start ✅); gửi `0` → giữ Loading 0 (nối tiếp ✅).
- Không cần SQL.

## v221.6 - SỬA: Liên kết nối tiếp phải đúng quy tắc "Unloading End dòng trước = Loading Start dòng sau"

- **Quy tắc (user chốt)**: khi 2 dòng liên kết nối tiếp, **Loading Start của dòng sau PHẢI = Unloading End của dòng trước** (cùng FB, không Loading lại).
- **Nguyên nhân lỗi**: khi bấm Đề xuất, lượt 2 (dùng để nối chuỗi) **đọc dữ liệu cũ chưa kịp cập nhật** của dòng nguồn (state React cập nhật sau) → hệ thống không nối được chuỗi → dòng sau bị đặt giờ mặc định (06:00) trùng với dòng trước thay vì bám sau lô nguồn.
- **Đã sửa**:
  1. State draft chuyển sang **ref đồng bộ** → lượt 2 của Đề xuất luôn đọc đúng dữ liệu mới nhất của dòng nguồn.
  2. Sau Đề xuất, hệ thống **tự ép chuỗi**: dòng nào có liên kết → tự đặt FB + **Loading Start = Unloading End dòng nguồn** (loading 0, Process chạy luôn) — không phụ thuộc server có nhận diện hay không.
  3. Engine Đề xuất: lô liên kết **neo đúng điểm kết thúc của lô nguồn** (không bị đẩy bởi giờ Loading của lô khác).
  4. **Kéo-thả tạo liên kết → chỉnh giờ NGAY**: nếu dòng nguồn đã có dự báo, dòng sau tự nhảy đúng giờ (Loading Start = Unloading End nguồn) — nhìn là thấy chuỗi đúng.
- **Đã test engine trên PostgreSQL local**: chuỗi 3 lô L1→L2→L3 — L2.LoadingStart = L1.UnloadingEnd ✅, L3.LoadingStart = L2.UnloadingEnd ✅ (loading 0 phút).
- Không cần SQL.

## v221.7 - SỬA: Lỗi save lô nối tiếp "violates check constraint ck_planning_schedule_segment_durations"

- **Lỗi**: lưu dòng nối tiếp (Loading 0 phút) báo *"new row for relation planning_schedule violates check constraint ck_planning_schedule_segment_durations"*.
- **Nguyên nhân**: ràng buộc DB yêu cầu mọi cột thời lượng > 0 (cho phép NULL, không cho phép 0); bản v221.5 lưu `loading_duration_minutes = 0` cho lô nối tiếp → vi phạm ràng buộc → Save bị chặn.
- **Đã sửa**: lô nối tiếp giờ lưu **Loading Duration = NULL** (đúng quy ước schema — giống NDT lưu NULL khi không áp dụng; `coalesce(NULL,1) > 0` hợp lệ). Hiển thị vẫn ra dấu **↳** ở cột Loading End như trước. Không cần sửa database.
- Đã test trên PostgreSQL local (có bật đúng ràng buộc): lưu lô nối tiếp với `loading_minutes_override=0` → **thành công**, loading_duration = NULL ✅.
- Không cần SQL.

## v221.8 - Sau Đề xuất tự sắp xếp theo giờ + Save bị cấn giờ thì tự đẩy giờ

- **Sắp xếp lại dòng theo thời gian sau Đề xuất**: các dòng được xếp lại theo **giờ Loading Start** (dòng sớm lên trước, dòng chưa có giờ xuống cuối) — nhìn bảng là thấy thứ tự trong ngày; **liên kết nối tiếp được giữ nguyên** (tự remap theo vị trí mới).
- **Save bị cấn giờ → hệ thống TỰ ĐẨY giờ**: khi lưu mà lô trùng FB đang bận (vd *"FB-05 bị cấn: trùng với CHM_28AUG_006 (07:00–16:30)"*) hoặc vượt quá 3 Process cùng lúc — hệ thống **tự tìm giờ trống hợp lệ kế tiếp** (đẩy 15 phút/bước, tối đa 7 ngày), vẫn tuân thủ đầy đủ mọi ràng buộc (chỉ 1 FB Loading cùng lúc, tối đa 3 Process, NDT ≥1:30 & ≤2 FB), rồi lưu thành công kèm thông báo rõ: *"tự đẩy giờ 16:00 → 16:30 do FB-01 bị cấn…"*. Không còn bị chặn khi lịch đã thay đổi sau khi Đề xuất.
- Đã test trên PostgreSQL local: lưu lô 16:00 trên FB bị chiếm tới 16:30 → **tự đẩy sang 16:30**, lưu thành công ✅.
- Không cần SQL.

## v221.9 - SỬA: bỏ "ép cứng" liên kết gây trùng 2 lô trên cùng FB sau khi sắp xếp

- **Lỗi**: sau Đề xuất + sắp xếp theo giờ, xuất hiện 2 lô **trùng sát nhau trên cùng 1 FB** (vd 2 lô FB-01: 13:20–16:30 và 16:00–18:30) và giờ liên kết sai.
- **Nguyên nhân**: bản v221.6 thêm bước **ép cứng** — buộc dòng liên kết về FB nguồn + Loading Start = Unloading End nguồn **mà không kiểm tra cấn với các dòng khác trên cùng FB** → đè lên lịch engine đã xếp đúng → 2 lô đè nhau.
- **Đã sửa**:
  1. **Bỏ ép cứng phía client** — giờ chuỗi liên kết do **engine Đề xuất tự xử lý** (đã sửa bug đọc dữ liệu cũ từ v221.6): lô liên kết vẫn được ưu tiên FB nguồn + bám đúng Unloading End nguồn, **nhưng nếu FB bận → tự đẩy sang giờ trống hợp lệ**, không bao giờ tạo 2 lô đè nhau.
  2. **Kéo-thả liên kết**: chỉ tạo liên kết (dấu ↳X), không ép FB/giờ — bấm **Đề xuất** để xếp giờ đúng.
  3. **Sắp xếp theo giờ an toàn với liên kết**: dòng nguồn luôn đứng trước dòng nối tiếp (dù giờ lệch); liên kết remap đúng vị trí mới.
- **Đã test trên PostgreSQL local**: lô X chiếm FB-01 tới 16:30, lô Y liên kết sau lô nguồn (kết thúc 07:30) → engine tự đặt Y lúc **16:30** (sau khi X trả FB), **không trùng** ✅.
- Không cần SQL.

## v221.10 - SỬA GỐC: Đề xuất 1 lượt duy nhất + hàng đợi NDT đúng (hết "2 lô trùng FB" & giờ bị đẩy đêm khuya)

- **Lỗi còn lại**: sau Đề xuất vẫn xuất hiện 2 lô trùng sát nhau trên cùng FB và giờ liên kết sai.
- **Nguyên nhân sâu (2 lỗi gốc)**:
  1. **Cơ chế "2 lượt" của Đề xuất sai thiết kế**: lượt 2 chỉ chạy lại các dòng liên kết, KHÔNG biết giờ của các dòng khác đã gợi ý ở lượt 1 → dòng liên kết có thể đè lên dòng khác trên cùng FB. → **Bỏ hẳn 2 lượt**: giờ chạy **MỘT lượt duy nhất**, mỗi dòng liên kết trỏ thẳng vào **kết quả thật của dòng nguồn** (chain_from_run) ngay trong cùng lượt — engine tính Loading Start = Unloading End dòng nguồn VÀ kiểm tra ràng buộc với TOÀN BỘ các dòng; dòng liên kết được xử lý **ngay sau dòng nguồn** (không để dòng khác chen FB giữa chừng).
  2. **Hàng đợi NDT sai**: lấy "NDT xa nhất" làm mốc → NDT của lô sắp xếp bị đẩy lên đêm khuya vô lý (vd NDT 18:30 thay vì 10:30) vì có một NDT tương lai đã xếp trước. → **Sửa đúng quy tắc**: NDT chỉ cần cách **NDT lân cận** ≥ 1:30 (trước hoặc sau), áp dụng cả ở engine Đề xuất lẫn đường LƯU.
  3. Lô nối tiếp (Loading 0 phút) không còn chiếm **trạm Loading chung** (chỉ lô có Loading thật mới đẩy chuỗi Loading).
- **Đã test trên PostgreSQL local (13 lô, 3 liên kết 7←1, 9←2, 12←3)**: cả 3 liên kết đều đúng ✅, **không có 2 lô trùng FB** ✅, **max 3 Process đồng thời** ✅, NDT 10:30 đúng thay vì 18:30 ✅.
- Không cần SQL.

## v221.11 - SỬA: lô liên kết phải ĐÚNG FB của lô nguồn (vd dòng 6 liên kết dòng 2 → cùng FB-05)

- **Lỗi**: dòng liên kết ra FB khác lô nguồn (vd dòng 6 liên kết dòng 2 nhưng dòng 2 FB-05, dòng 6 FB-04) — sai quy tắc.
- **Nguyên nhân (2 lỗi)**:
  1. **`chain_from_run` không bao giờ được gửi**: mảng theo dõi run-index của từng dòng khai báo nhưng **quên đẩy dữ liệu** → liên kết bị rớt âm thầm, dòng liên kết bị xếp như lô thường (FB khác, giờ khác).
  2. Khi FB nguồn bị cấn (quá 3 Process), engine **đổi sang FB khác** thay vì giữ FB nguồn.
- **Đã sửa**:
  1. Gửi đúng `chain_from_run` (run index của dòng nguồn).
  2. Lô liên kết **BẮT BUỘC xếp trên đúng FB của dòng nguồn** — nếu FB đó bận/concurrency thì **tự đẩy giờ muộn hơn** cho tới khi hết cấn, KHÔNG đổi FB.
- **Đã test trên PostgreSQL local (12 lô, 4 liên kết 6←2, 9←5, 10←7, 12←8)**: cả 4 đều **cùng FB lô nguồn + Loading Start = Unloading End nguồn** ✅; không 2 lô trùng FB ✅; max 3 Process ✅.
- Không cần SQL.

## v221.12 - SỬA LỖI CUỐI: cửa ngõ API chặn mất thông tin liên kết (chain_from_run)

- **Lỗi**: dòng liên kết vẫn ra FB khác lô nguồn dù engine đã được sửa đúng (v221.11) và test engine trực tiếp đều đạt.
- **Nguyên nhân**: route `POST /api/schedule/chemical-simulation` (cửa ngõ giữa giao diện và engine) khi chuyển danh sách lô xuống engine **chỉ giữ lại một số trường, LỌC BỎ `chain_from_run`** (thông tin dòng liên kết trỏ tới dòng nguồn) — và cả `overrides` (giờ chỉnh tay Process/NDT/Unloading). → Giao diện gửi đúng, engine xử lý đúng, nhưng giữa đường thông tin bị rớt → liên kết không bao giờ được áp dụng.
- **Đã sửa**: route chuyển đủ `chain_from_run` + `overrides` xuống engine.
- **Đã test END-TO-END qua đúng route API** (14 lô, 4 liên kết 4←1, 6←2, 9←5, 11←7): cả 4 đều **cùng FB lô nguồn + Loading Start = Unloading End nguồn** ✅.
- Không cần SQL.

## v221.13 - SỬA QUY TẮC LIÊN KẾT: lô nối tiếp bám **NDT XONG** của lô nguồn preclean

- **Yêu cầu user**: "FB preclean khi NDT hoàn thành, nếu không bận thì giờ NDT xong chính là giờ processing của FB liên kết" — trước đây engine neo vào Unloading End của lô nguồn (muộn hơn 30'), lô liên kết bị kéo muộn.
- **Đã sửa (engine `simulateChemicalDay`)**:
  1. Lô liên kết từ lô nguồn **có NDT** (preclean) → neo Loading/Processing Start = **NDT End** của lô nguồn.
  2. Lô nguồn **không có NDT** → giữ nguyên neo Unloading End.
  3. Nếu FB đích đang bận (còn lô khác) → vẫn tự đẩy giờ cho tới khi hết bận (đúng "nếu điều kiện không bị bận").
- **Cùng FB nguồn**: lô liên kết được xếp NGAY tại NDT End — phần Unloading 30' còn lại của lô nguồn KHÔNG chặn bar (bar đã qua NDT là sẵn sàng cho bước kế); chỉ lô khác trên FB đó mới chặn.
- **Đường Save**: lưu lô liên kết (không Loading) → server TỰ ĐỘNG loại lô nguồn khỏi kiểm tra trùng FB (qua NDT End/Unloading End khớp ±5') → không còn bị "tự đẩy giờ" phá vỡ liên kết khi lưu lô nguồn trước, lô liên kết sau.
- **Đã test PostgreSQL**: lô nguồn preclean NDT xong 19:00 → lô liên kết Loading Start = 19:00 (cùng FB) ✅; nguồn không NDT → bám Unloading End ✅; ≤3 Process ✅; Save lô liên kết giữ nguyên 19:00 (không đẩy) ✅.
- Không cần SQL.

## v221.14 - SOÁT TOÀN BỘ LOGIC: cải tiến danh sách FB lấy từ DB + kiểm tra tổng thể các quy tắc

- **Cải tiến**: danh sách FB trong Đề xuất trước đây **khai báo cứng** ("FB-01".."FB-06") → giờ **đọc từ bảng `md_schedule_resource`** (nhóm CHEMICAL_LINE, đang hoạt động). Nếu có FB mới trong DB sẽ tự dùng được; nếu bảng rỗng thì fallback FB-01..FB-06.
- **Đã soát lại toàn bộ engine theo 6 nhóm quy tắc đã chốt** (test trên PostgreSQL, 15 lô + 5 liên kết đúng dữ liệu thực tế):
  (a) Lô liên kết: cùng FB lô nguồn + Loading/Processing = NDT End nguồn (nguồn có NDT) / Unloading End (không NDT) + không Loading lại — 5/5 ✅
  (b) Chỉ 1 FB Loading cùng lúc (trạm Loading dùng chung, tuần tự) ✅
  (c) Tối đa 3 FB Process cùng lúc ✅
  (d) NDT cách NDT lân cận ≥ 1:30 VÀ tối đa 2 FB NDT cùng lúc — đúng cả ở Đề xuất lẫn khi Save ✅
  (e) Không 2 lô trùng nhau trên cùng FB (trừ cặp liên kết chồng 30' Unloading nguồn là đúng quy tắc) ✅
  (f) Trình tự đoạn hợp lệ: Loading ≤ Process ≤ NDT ≤ Unloading ✅
- Không cần SQL.

## v221.15 - SỬA "NHẢY GIỜ" TRÊN CÙNG FB: NDT bám sát Process End (bỏ hàng đợi NDT)

- **Lỗi user chỉ ra**: 3 lô liên tiếp trên cùng FB (vd FB-04: lô 6 → 7 → 8), lô 8 liên kết lô 7 ra 00:30 trong khi lô 7 NDT xong 22:40 — giờ "nhảy" không theo thứ tự.
- **Nguyên nhân (2 lớp)**:
  1. Engine xếp NDT theo **hàng đợi** (cách lân cận ≥1:30, tối đa 2 NDT cùng lúc) → NDT của lô 7 bị đẩy thành 19:30–00:30 → lô liên kết 8 bám NDT End nguồn = 00:30 (đúng quy tắc nhưng ra giờ muộn).
  2. Màn hình **hiển thị NDT tự tính lại** (bám Process End → 17:40–22:40) → nhìn thấy "NDT xong 22:40 nhưng lô 8 ra 00:30" → nhảy giờ.
- **Đã sửa**: **BỎ hàng đợi NDT** — NDT **bám sát Process End** (cả khi Đề xuất lẫn khi Save). Lô liên kết bám đúng NDT End nguồn → giờ chạy **tuần tự theo đúng thứ tự**, không còn nhảy.
- **Đã test** (15 lô + 5 liên kết, LOADING 60' như sản xuất): NDT = Process End ✅; liên kết 9=14:30, 10=15:30, 12=17:30, 14=18:30, 8=NDT End nguồn ✅; 1 Loading cùng lúc ✅; ≤3 Process ✅; không trùng FB ✅; trình tự đoạn ✅. Save 3 preclean liên tiếp → NDT 09:30, 10:30, 11:30 (không đẩy) ✅.
- Lưu ý: nếu nhà máy giới hạn số NDT cùng lúc (vd tối đa 2), cho biết để thêm lại đúng quy tắc đó.
- Không cần SQL.

## v221.16 - SỬA THỨ TỰ SẮP XẾP: giờ qua 00:00 (ngày tiếp theo) phải xếp SAU 23:59

- **Lỗi user chỉ ra**: dòng có giờ Loading 00:50 (sang ngày tiếp theo) bị xếp lên ĐẦU bảng thay vì sau 23:59.
- **Nguyên nhân**: hàm sắp xếp sau Đề xuất so sánh **chuỗi "HH:MM"** (`localeCompare`) → "00:50" < "06:00" theo chữ → dòng qua nửa đêm bị đẩy lên đầu.
- **Đã sửa**: sắp xếp theo **thời gian TUYỆT ĐỐI** — ngày sản xuất chạy 06:00 → 06:00 hôm sau, nên **giờ < 06:00 thuộc NGÀY TIẾP THEO**; dòng qua nửa đêm được xếp **sau 23:59** của ngày.
- **Áp dụng đồng bộ**: cùng quy tắc "giờ < 06:00 = ngày kế" cho cả **Save** (planned_start đúng ngày, không bị lệch 24h), **Đề xuất lại** (desired_start), **giờ chỉnh tay** (Process/NDT/Unloading Start) và **tính cửa sổ giờ** hiển thị.
- **Đã kiểm tra**: chuỗi 06:00 → 14:30 → 23:50 → 00:50 → 05:00 (2 giờ cuối là ngày kế, xếp sau 23:59) ✅; Save dòng 00:50 → planned_start = ngày hôm sau 00:50 ✅.
- Không cần SQL.

## v221.17 - TỐI ƯU TRẠM LOADING: giảm khoảng trống "loading không làm gì"

- **Lỗi user chỉ ra**: dòng 6 Loading xong 12:00 nhưng dòng kế tiếp phải đợi tới 17:20 mới Loading — trạm Loading rảnh 5 giờ không làm gì.
- **Nguyên nhân**: engine chọn FB đầu tiên trong danh sách mà XẾP ĐƯỢC — kể cả khi FB đó đang bận tới tận 17:20 (vd FB ưu tiên theo lô trước) → chấp nhận Loading muộn, bỏ qua các FB khác đang rảnh.
- **Đã sửa**: FB chưa rảnh tại thời điểm hiện tại thì KHÔNG nhận — hệ thống thử đẩy giờ +15' cho tới khi tìm được FB có thể **Loading NGAY** → trạm Loading được tận dụng tối đa. Lô liên kết thủ công vẫn bám đúng FB nguồn (quy tắc đã chốt).
- **Đã test** (13 lô + 4 liên kết, LOADING 60'): dòng 7 trước ra 17:20 → nay **12:45** (tiết kiệm 4h35); khoảng trống còn lại chỉ do ràng buộc **tối đa 3 Process** (các lô liên kết chiếm khung Process) — không phải do trạm Loading rảnh. Toàn bộ quy tắc khác vẫn đúng: liên kết cùng FB + bám NDT End nguồn ✅, NDT bám Process End ✅, 1 Loading cùng lúc ✅, ≤3 Process ✅, không trùng FB ✅.
- Không cần SQL.

## v221.18 - LIÊN KẾT TỚI LÔ ĐÃ LƯU + KIỂM TRA KHÔNG CẤN 3 FB PROCESS

- **Yêu cầu user**: dòng mới liên kết với dòng đã lưu (vd dòng 16 ← dòng 7) — anchor NDT End nguồn đúng, nhưng hệ thống phải ĐÁNH GIÁ được lúc đó có quá 3 FB Process không, và đề xuất thời gian tốt nhất KHÔNG cấn 3 Process.
- **Đã làm**:
  1. **Tạo liên kết với lô đã lưu**: kéo dòng MỚI lên dòng ĐÃ LƯU → tạo liên kết nối tiếp (badge ↳N hiển thị, bấm để xóa).
  2. **Engine nhận biết lô nguồn đã lưu** (chain_source_schedule_id + FB + giờ NDT End/Unloading End nguồn): neo đúng FB nguồn + đúng giờ nguồn; cửa sổ Unloading của CHÍNH lô nguồn không chặn (bar rảnh tại NDT End); chỉ lô KHÁC trên cùng FB mới chặn.
  3. **Lô nối tiếp LUÔN không loading** (bị cấn FB/≥3 Process thì CHỜ rồi nối tiếp, không hoá thành loading lại) — đúng quy tắc liên kết.
  4. **Kiểm tra đủ ≤3 FB Process** với cả các lô ĐÃ LƯU trong DB: nếu tại thời điểm neo có ≥3 Process cũ → tự đẩy +15' tới giờ tốt nhất không cấn.
- **Đã test E2E qua route API**: lô nguồn đã lưu NDT xong 22:00 + 3 Process cũ chạy 20:30–00:20 → lô liên kết được đề xuất **23:00** (cùng FB-01, không loading, Process chỉ trùng 1 lô cũ → không cấn 3 FB Process) ✅. Audit đầy đủ 6 nhóm quy tắc vẫn ✅.
- Không cần SQL.

## v221.19 - SẮP XẾP THEO GIỜ BẮT ĐẦU PROCESS (không phải Loading Start)

- **Lỗi user chỉ ra**: dòng 13 Process Start 19:50 đứng TRÊN dòng 14 Process Start 19:30 — cột Process đọc "nhảy" không theo thứ tự (dòng 14 là lô nối tiếp nên không Loading, Process bắt đầu sớm hơn dù Loading Start muộn hơn).
- **Nguyên nhân**: hàm sắp xếp sau Đề xuất dùng **Loading Start** làm khóa → dòng 13 (Loading 18:50) đứng trước dòng 14 (Loading 19:30) dù Process của dòng 14 sớm hơn.
- **Đã sửa**: sắp xếp theo **giờ bắt đầu PROCESS** (công việc thật) — lô nối tiếp không Loading nên Process Start = mốc neo, được tính đúng; vẫn giữ quy tắc "dòng nguồn đứng trước dòng nối tiếp" và quy tắc giờ < 06:00 = ngày tiếp theo (xếp sau 23:59).
- **Đã kiểm tra**: dòng 14 (Process 19:30) → đứng trước dòng 13 (Process 19:50) ✅; giờ qua nửa đêm vẫn xếp sau 23:59 ✅.
- Không cần SQL.

## v221.20 - PROCESS START CÁCH NHAU ÍT NHẤT 1 TIẾNG (mọi lô, kể cả lô nối tiếp)

- **Yêu cầu user**: kiểm tra logic "Process Time cách nhau ít nhất 1 tiếng" — vd dòng 13 Process 19:50 sát dòng 14 Process 19:30 (chỉ 20 phút) là sai.
- **Đã sửa (engine)**: thêm ràng buộc **Process Start của MỌI lô cách nhau ≥ 1 giờ** — tính cả lô nối tiếp (liên kết) và cả các lô ĐÃ LƯU trong DB. Lô nào vi phạm → tự đẩy +15' tới giờ thỏa mãn.
- **Đã test**: lô nối tiếp Process 19:30 + lô thường muốn Process 19:50 → lô thường bị đẩy lên **20:35** (cách đúng 1h) ✅; audit đầy đủ: liên kết cùng FB + bám NDT End nguồn ✅, ≤3 Process ✅, Process Start ≥1h ✅ (khoảng cách nhỏ nhất 60'), không trùng FB ✅, trình tự đoạn ✅; E2E liên kết lô đã lưu vẫn ✅.
- Lưu ý: quy tắc áp dụng khi **Đề xuất**; nếu bạn tự gõ giờ tay cách nhau < 1h thì hệ thống chưa chặn (chỉ Đề xuất tự đẩy). Cần chặn luôn ở chỗ nhập tay không?
- Không cần SQL.

## v221.21 - NDT KHÔNG QUÁ 2 FB CÙNG LÚC + hiển thị đúng NDT thật

- **Yêu cầu user**: đánh giá NDT — không quá 2 FB làm NDT cùng lúc (ảnh cho thấy tới 4 NDT chồng nhau: 09:30, 10:30, 12:30, 13:30, 14:30).
- **Đã làm**:
  1. **Engine Đề xuất**: NDT bám Process End, NHƯNG nếu tại đó đã có 2 NDT chạy → đẩy NDT sang lúc chỉ còn ≤1 NDT (giữ nguyên Loading/Process). Lô nối tiếp bám NDT End MỚI này.
  2. **Client hiển thị**: hiển thị ĐÚNG NDT từ kết quả đề xuất (trước đây client tự tính lại → lệch với server — chính là nguồn gốc vụ "nhảy giờ" cũ).
  3. **Đường Save**: kiểm tra lại ≤2 NDT cùng lúc với các lô đã lưu trong DB (có khóa serial chống 2 lưu đồng thời) — lưu lô nào cũng giữ DB không bao giờ quá 2 NDT.
- **Đã test**: 6 lô preclean → NDT 09:30, 10:30, 14:30, 15:30, 19:30, 20:30 (max 2 cùng lúc ✅); lô nối tiếp bám NDT End nguồn ✅; Process Start ≥1h ✅; Save 4 lô preclean → max 2 NDT ✅.
- Không cần SQL.

## v221.22 - NÚT "LƯU TẤT CẢ" đề xuất 1 lần

- **Yêu cầu user**: thêm nút lưu tất cả đề xuất cùng lúc (không phải bấm Save từng dòng).
- **Đã thêm**: nút **💾 Lưu tất cả** cạnh nút "Đề xuất" (chỉ hiện với vùng Chemical Line).
- **Cách hoạt động**:
  - Lưu **tuần tự** từng dòng (mỗi dòng tạo 1 Batch + Schedule như nút Save thường).
  - **Lô nguồn của liên kết lưu TRƯỚC lô nối tiếp** (để lô nối tiếp được loại khỏi kiểm tra trùng FB như quy tắc).
  - Có hộp xác nhận trước khi lưu; sau khi xong: xóa các dòng đã lưu khỏi danh sách nhập, làm mới bảng.
  - **Báo rõ từng dòng lỗi** (vd dòng nào bị cấn giờ/FB) — sửa xong bấm Save từng dòng hoặc Lưu tất cả lại.
- Không cần SQL.

## v221.23 - PHÂN BIỆT RÕ NGÀY: lô chạy qua nửa đêm / mốc 06:00

- **Yêu cầu user**: giờ qua 06:00 / qua 0:00 dễ nhầm ngày hôm nay - hôm sau (vd NDT 01:00-06:00, Unloading 06:30 của 1 lô; lô nối tiếp bắt đầu đúng 06:00).
- **Đã làm**:
  1. **Hiển thị badge ngày trên bảng**: dòng thuộc **ngày tiếp theo** (Loading Start < 06:00, hoặc bắt đầu đúng mốc 06:00 ngày hôm sau) → badge **"＋1 ngày"**; dòng bắt đầu trong ngày nhưng **chạy qua nửa đêm** (các đoạn sau 00:00 thuộc ngày kế) → badge **"qua 0:00"**. Áp dụng cho cả dòng đã lưu lẫn dòng nhập mới.
  2. **Sửa lỗi lệch 24h tiềm ẩn**: sau Đề xuất, dòng có giờ 00:00-05:59 từng bị tính sai ngày khi lưu (cộng 2 lần) → giờ **lưu thời điểm Loading Start TUYỆT ĐỐI** (startIso) — đúng ngày kể cả giờ qua nửa đêm lẫn đúng mốc 06:00.
  3. **Ngày của giờ chỉnh tay** (Process/NDT/Unloading Start): giờ nhỏ hơn giờ bắt đầu Loading của dòng → thuộc **ngày kế của dòng** (đúng quy tắc chạy qua nửa đêm).
- **Đã kiểm tra**: 00:50 ngày kế → lưu đúng ngày kế (không lệch 24h) ✅; mốc 06:00 ngày kế → đúng ✅; NDT 01:00 (lô start 21:00) → ngày kế ✅; Process 22:00 → cùng ngày ✅. TSC 0, build 0.
- Không cần SQL.

## v221.24 - GIAO DIỆN GỌN HƠN: chấm ngày nhỏ gọn + nút hành động 1 dòng

- **Yêu cầu user**: (1) badge ngày hiển thị gọn, chuyên nghiệp hơn (kiểu dấu chấm); (2) đưa nút Delete lên cạnh Edit, tất cả nút hành động trên 1 dòng.
- **Đã làm**:
  1. Thay badge chữ "＋1 ngày" / "qua 0:00" bằng **chấm tròn nhỏ**: **chấm xanh** = dòng thuộc ngày tiếp theo, **chấm hồng** = dòng chạy qua nửa đêm (đưa chuột vào thấy chú thích chi tiết).
  2. Sắp lại nút hành động dòng đã lưu: **↑ ↓ Edit Delete Fill / Jobs** — Delete nằm sát Edit; container nút **không xuống dòng** (1 hàng), nút nhỏ gọn hơn.
- Không cần SQL.

## v221.25 - CHẤM NGÀY NGAY TẠI Ô GIỜ + BẢNG GỌN 1 MÀN HÌNH

- **Yêu cầu user**: (1) đưa dấu chấm vào ĐÚNG ô giờ nào qua 0:00 / +1 ngày cho nhìn rõ hơn; (2) bảng gọn để 1 view.
- **Đã làm**:
  1. **Chấm đỏ nhỏ ngay trong từng ô giờ** thuộc ngày tiếp theo: Loading End, Process Start/End, NDT Start/End, Unloading Start/End — chỉ những ô có giờ qua 0:00 / +1 ngày mới có chấm (đưa chuột vào thấy chú thích). Bỏ chấm ở đầu dòng.
  2. **Bảng gọn hơn**: giảm padding ô + input nhỏ + nút nhỏ → nhiều dòng hiển thị trong 1 màn hình.
- Không cần SQL.

## v221.26 - PHÂN BIỆT 2 LOẠI DẤU NGÀY: CHẤM (•) qua 0:00 / HOA THỊ (✱) +1 ngày

- **Yêu cầu user**: chia ra dấu hoa và dấu chấm cho đẹp — phân biệt 2 kiểu giờ thuộc ngày tiếp theo.
- **Đã làm** (theo ngày sản xuất 06:00 → 06:00):
  - **Dấu CHẤM (•)** — giờ qua 0:00: thuộc 00:00–05:59 ngày tiếp theo (vẫn trong ngày sản xuất hiện tại).
  - **Dấu HOA THỊ (✱)** — giờ từ 06:00 ngày kế trở đi: thuộc ngày sản xuất KẾ TIẾP (+1 ngày).
- **Ví dụ**: NDT End 00:30 → •; Unloading 06:30 → ✱; NDT 05:30–10:30 → bắt đầu •, kết thúc ✱.
- Đưa chuột vào dấu → chú thích rõ từng loại. Không cần SQL.

## v221.27 - SỬA: hoa thị ✱ bị "biến mất" (span rỗng) — thêm ký tự ✱ vào

- **Lỗi user chỉ ra**: các ô giờ +1 ngày (06:30, 07:00, 10:30, 11:00 — gạch chân đỏ trên ảnh) không thấy hoa thị ✱.
- **Nguyên nhân**: span của hoa thị bị **RỖNG** (thiếu ký tự ✱ bên trong) + không có nền màu + width auto → hiển thị 0 pixel → "biến mất". Chấm • có nền màu nên vẫn hiện.
- **Đã sửa**: thêm ký tự "✱" vào span → giờ hiển thị đúng: • = qua 0:00, ✱ = +1 ngày (từ 06:00 ngày kế).
- Không cần SQL.

## v221.28 - CẤU HÌNH THEO LUỒNG CHUẨN (redesign tab Cấu hình)

- **Yêu cầu user**: cải thiện tab Cấu hình — đi từ Operation Code đến mapping hoàn chỉnh theo logic, mỗi tab phải rõ mục đích + hiển thị gì + ảnh hưởng gì, thiết kế lại theo flow chuẩn chỉnh.
- **Đã làm** (toàn bộ theo đề xuất đã chốt):
  1. **Sidebar Cấu hình nhóm theo 4 giai đoạn** (có tiêu đề nhóm):
     - ① Định nghĩa Operation: ST Operation Flow · ST Scope & Operation Order · Source → Main Mapping · Main Operation Master
     - ② Khu vực & Planner: ST Group Master · Physical Area Master · Schedule Area Mapping · Phân chia Planner
     - ③ Công thức & Thời gian: Danh mục Recipe · Operation → Recipe · Thời gian Loading/Unloading · Thời gian xử lý
     - ④ Rule & Tự động: Batch Key / Recipe Rules · Open Job Column Values · Auto Planning Rules
  2. **Trang Tổng quan Cấu hình** (`/settings` — màn hình đầu tiên khi bấm tab Cấu hình): sơ đồ 8 bước từ ST Scope → Mapping → Main Master → Group → Area → Schedule → Planner → Kết quả; mỗi bước là thẻ trạng thái **xanh = đủ / cam = cần bổ sung** (đếm trực tiếp từ DB), bấm vào thẻ đi thẳng tới trang tương ứng. Kèm 2 nhóm thẻ đếm cho Công thức & Rule.
  3. **Header chuẩn mỗi trang cấu hình**: tiêu đề + 1 câu **Mục đích** + 1 câu **Ảnh hưởng** + nút **Bước trước / Bước kế tiếp →** dẫn theo luồng (component `ConfigPageHeader` dùng chung).
  4. **Tách Process Recipe thành 4 mục con** (trước đây 4 công cụ nấp trong 1 trang):
     - `/process-recipes` = Danh mục Recipe + Part search
     - `/recipe-operation-map` = Operation Code → Recipe (md_main_operation_recipe) + Standard Operation → Recipe (md_operation_recipe_mapping)
     - `/recipe-time-loading` = Thời gian Loading/Unloading (md_chemical_handling_time_rule)
     - `/recipe-time-process` = Thời gian xử lý (md_recipe_time_rule)
  5. **Cảnh báo thao tác nặng**: nút lưu ST Operation Flow (loại Planning) giờ có hộp xác nhận giải thích "sẽ dựng lại toàn bộ chuỗi công đoạn, có thể mất vài chục giây".
  6. **Nhãn tiếng Việt dễ hiểu** ở các trang chính: "Mã công đoạn", "Công đoạn chính", "Nhóm ST", "Khu vực vật lý", "Khu vực điều độ", "Planner phụ trách", "Tiền tố số lô", "Thứ tự công đoạn"… (bảng Main Operation Master chuyển toàn bộ tiêu đề cột sang tiếng Việt).
- **Không đổi logic nghiệp vụ** — chỉ tổ chức lại giao diện, điều hướng, nhãn. Không cần SQL migration mới.
- Không cần SQL.

## v222 - THIẾT KẾ LẠI HOÀN TOÀN TAB CẤU HÌNH "THEO LUỒNG" (bỏ lối cũ)

- **Yêu cầu user**: thiết kế lại tab Cấu hình mới hoàn toàn (không dùng lối cũ), theo logic hiện tại, dễ sử dụng nhất cho người không rành kỹ thuật.
- **Đã làm**:
  1. **Sidebar thành bản đồ luồng 14 bước** (2 tầng): Tầng 1 "Định nghĩa công đoạn" (Trợ lý Operation, ST Scope, Source→Main, Công đoạn chính, ST Group, Khu vật lý, Khu điều độ, Planner, Kết quả Planning Chain) + Tầng 2 "Công thức & Rule" (Danh mục Recipe, Operation→Recipe, Loading/Unloading, Process, Batch Key Rules, Cột All Open Job, Auto Rules). Mỗi mục có **số bước + chấm trạng thái xanh/đỏ đọc trực tiếp từ DB** (query gộp 1 lần, dùng chung qua `getConfigHealth` + React cache).
  2. **Tổng quan Cấu hình** (`/settings`) nâng cấp: **thanh tiến độ %** (Tầng 1 + Tầng 2), **danh sách "cần xử lý ngay"** (mỗi mục có nút Sửa →), giữ sơ đồ 8 bước + thẻ đếm.
  3. **ST Operation Flow → "Trợ lý cấu hình Operation" 3 bước** (wizard): Bước 1 Mã công đoạn & loại → Bước 2 Công đoạn chính & Nhóm (tự điền thứ tự/prefix) → Bước 3 Khu vực & Planner + **thẻ xem trước chuỗi** (chip xanh = đủ, đỏ = thiếu) → Lưu. Vẫn giữ bảng danh sách Operation + trạng thái sức khỏe.
  4. **Dịch toàn bộ tiêu đề cột sang tiếng Việt** ở 11 màn hình còn lại: Operation→Recipe, Chemical Handling Time, Process Time, Schedule Area, Source→Main Mapping, ST Group, Physical Area, Process Recipe, Open Job Column Values, Batch Key/Recipe Rules, Main Operation Recipe Mapping.
- **Không đổi logic nghiệp vụ** — không đổi API, không đổi DB. Không cần SQL.

## v223 - KIỂM TRA JOB "MẤT TÍCH" TRÊN PLANNING BOARD (chưa cấu hình ST)

- **Yêu cầu user**: làm cách kiểm tra ngay trong app — Job đang mở nhưng NextOperation chưa khai báo/mapping ST thì KHÔNG hiện trên Planning Board (dễ bị tưởng "mất job").
- **Đã làm** (code-only, không SQL):
  1. **Planning Board** thêm panel cảnh báo (dưới bộ lọc, trên bảng): **"⚠ N Job đang mở nhưng KHÔNG hiện trên bảng (chưa cấu hình ST)"** kèm chip đếm theo 5 nhóm lý do:
     1) NextOperation chưa khai báo ST Scope · 2) loại ST_SCOPE_ONLY (chỉ hiển thị) · 3) thuộc ST nhưng chưa gán Source→Main Mapping · 4) cấu hình đủ nhưng chưa Rebuild Chain · 5) có chain nhưng chưa có dòng sẵn sàng (đang chờ).
     Bấm "Xem danh sách chi tiết" → bảng Job + NextOperation + lý do + số dòng chain (tối đa 300 dòng).
  2. **Tổng quan Cấu hình** thêm mục "Cần xử lý ngay": **"N Job đang mở nhưng chưa cấu hình ST"** → bấm là nhảy thẳng tới panel trên Planning Board (`/planning#missing-jobs`).
  3. Logic truy vấn đặt tại `src/lib/planning/missing-config-jobs.ts` (dùng chung); component `src/components/missing-jobs-panel.tsx`.
- Không cần SQL migration — chỉ SELECT. Không đổi logic hiển thị hiện tại.

## v224 - THÊM NHANH OPERATION CHƯA HIỆN TRÊN PLANNING BOARD (tạo ĐỦ mapping)

- **Yêu cầu user**: liệt kê các Operation chưa hiện được trên Planning Board; cho phép chọn để thêm; khi thêm phải tạo mapping cho các cấu hình liên quan.
- **Đã làm** (code-only, không SQL migration):
  1. **Panel "➕ Operations chưa hiện trên Planning Board"** (ngay dưới panel cảnh báo Job): gom theo Operation Code + số Job mất tích + lý do (5 nhóm) + **gợi ý Công đoạn chính / Nhóm ST** (lấy từ mapping có sẵn hoặc bảng tĩnh ST_OPERATION_MAPPING mục DIRECT; không có → chính code đó, quy tắc DIRECT).
  2. **Chọn nhiều + cấu hình mặc định 1 lần**: Nhóm ST (tự động theo từng gợi ý hoặc chọn tay), Khu vật lý, Khu điều độ (chọn lane tự điền Planner nếu lane đã có chủ), Planner, và ô "Công đoạn chính (ghi đè)" nếu muốn gom tất cả về 1 công đoạn.
  3. **Nút "＋ Thêm N Operation đã chọn"** → API hàng loạt mới `/api/config/st-operation-flow/bulk`: mỗi Operation được tạo **ĐỦ mapping** (md_operation → md_st_operation_scope → md_st_group → md_operation_master → md_planning_operation_scope → md_st_operation_mapping → md_area_operation_group → md_schedule_area_operation → md_planner_work_assignment) trong **1 transaction**, **chỉ rebuild chain 1 lần** ở cuối (nhanh hơn nhiều so với gọi POST từng con). Kiểm tra trước toàn bộ → lỗi báo rõ từng Operation, không ghi nửa chừng.
  4. Tách logic áp dụng 1 Operation thành `src/lib/st-operation-flow-apply.ts` (`applyOperationFlow` + `validateApplyPayload`) dùng chung; route POST cũ giữ nguyên.
  5. Chỉ nhóm ① chưa khai báo / ② ST_SCOPE_ONLY / ③ chưa mapping mới thêm được; nhóm ④ nhắc Rebuild Chain; nhóm ⑤ đang chờ (không phải lỗi).
- Không cần SQL.

## v224 - THÊM NHANH OPERATION CHƯA HIỆN TRÊN PLANNING BOARD (tạo ĐỦ mapping)

- **Yêu cầu user**: liệt kê các Operation chưa hiện được trên Planning Board; cho phép chọn để thêm; khi thêm phải tạo mapping cho các cấu hình liên quan.
- **Đã làm** (code-only, không SQL migration):
  1. **Panel "➕ Operations chưa hiện trên Planning Board"** (ngay dưới panel cảnh báo Job): gom theo Operation Code + số Job mất tích + lý do (5 nhóm) + **gợi ý Công đoạn chính / Nhóm ST** (lấy từ mapping có sẵn hoặc bảng tĩnh ST_OPERATION_MAPPING mục DIRECT; không có → chính code đó, quy tắc DIRECT).
  2. **Chọn nhiều + cấu hình mặc định 1 lần**: Nhóm ST (tự động theo từng gợi ý hoặc chọn tay), Khu vật lý, Khu điều độ (chọn lane tự điền Planner nếu lane đã có chủ), Planner, và ô "Công đoạn chính (ghi đè)" nếu muốn gom tất cả về 1 công đoạn.
  3. **Nút "＋ Thêm N Operation đã chọn"** → API hàng loạt mới `/api/config/st-operation-flow/bulk`: mỗi Operation được tạo **ĐỦ mapping** (md_operation → md_st_operation_scope → md_st_group → md_operation_master → md_planning_operation_scope → md_st_operation_mapping → md_area_operation_group → md_schedule_area_operation → md_planner_work_assignment) trong **1 transaction**, **chỉ rebuild chain 1 lần** ở cuối (nhanh hơn nhiều so với gọi POST từng con). Kiểm tra trước toàn bộ → lỗi báo rõ từng Operation, không ghi nửa chừng.
  4. Tách logic áp dụng 1 Operation thành `src/lib/st-operation-flow-apply.ts` (`applyOperationFlow` + `validateApplyPayload`) dùng chung; route POST cũ giữ nguyên.
  5. Chỉ nhóm ① chưa khai báo / ② ST_SCOPE_ONLY / ③ chưa mapping mới thêm được; nhóm ④ nhắc Rebuild Chain; nhóm ⑤ đang chờ (không phải lỗi).
- Không cần SQL.

## v225 - XEM CÁC CÔNG ĐOẠN ĐƯỢC HIỂN THỊ TRÊN PLANNING BOARD (luôn hiện)

- **Yêu cầu user**: chức năng xem (luôn) các công đoạn được cho hiển thị trên Planning Board.
- **Đã làm** (code-only, không SQL):
  1. Panel **"✅ Các công đoạn được hiển thị trên Planning Board"** trên trang Planning Board (luôn hiển thị, nằm dưới panel chưa hiện): liệt kê mọi Operation Code thuộc ST Scope loại PLANNING_OPERATION.
  2. Mỗi công đoạn hiển thị: Công đoạn chính · Nhóm ST · Khu vật lý · Khu điều độ · Planner · **số Job đang hiện trên bảng** · **trạng thái chuỗi** (Đủ cấu hình / Thiếu Source→Main / Thiếu Main Master / Thiếu Group / Thiếu Khu / Thiếu Planner).
  3. Header: chip đếm tổng (đủ cấu hình / thiếu / tổng Job đang hiện) + **ô tìm nhanh** lọc theo tên/khu/lane/planner.
  4. Dòng thiếu cấu hình nền cam → nhắc mở Trợ lý Operation + Rebuild Chain.
- Logic tại `src/lib/planning/visible-operations.ts` + component `src/components/visible-operations-manager.tsx`. Không cần SQL.

## v226 - SỬA TRỰC TIẾP TRÊN PANEL "CÁC CÔNG ĐOẠN ĐƯỢC HIỂN THỊ" (inline edit)

- **Yêu cầu user**: thêm chức năng chỉnh sửa — sửa trực tiếp luôn (không phải sang trang Cấu hình).
- **Đã làm** (code-only, không SQL):
  1. Panel "✅ Các công đoạn được hiển thị trên Planning Board" thêm nút **"✏️ Sửa"** mỗi dòng → các ô biến thành hộp chọn ngay tại chỗ: **Công đoạn chính** (gợi ý + chọn quy tắc mapping), **Nhóm ST**, **Khu vật lý**, **Khu điều độ** (chọn lane tự điền Planner nếu có chủ), **Planner**.
  2. Nút **Lưu** → gọi API cấu hình sẵn có (POST st-operation-flow): cập nhật ĐỦ mapping liên quan (Scope → Source→Main → Main Master → Nhóm → Khu vật lý → Khu điều độ → Planner) + dựng lại toàn bộ chuỗi công đoạn (có hộp xác nhận trước). Có nút Hủy.
  3. `visible-operations.ts` bổ sung area_id / schedule_area_code / mapping_rule vào dữ liệu để điền sẵn form.
- Không cần SQL.

## v227 - DEFAULT VIEW PLANNING BOARD LƯU TRÊN MÁY CHỦ (dùng chung mọi môi trường)

- **Vấn đề user gặp**: bấm "Set Default" ở localhost lưu xong, nhưng lên Vercel lại không còn.
- **Nguyên nhân**: Default View (cột + bộ lọc + sắp xếp + mật độ) trước đây lưu vào **localStorage của trình duyệt** → chỉ tồn tại trên đúng máy/trình duyệt đó.
- **Đã sửa (v227)**:
  1. **Bảng mới `planning_board_view`** (migration 040): view_key (SYSTEM / OP:xxx / AREA:xxx) + payload JSON.
  2. **API mới `/api/planning/board-view`**: GET lấy toàn bộ Default View; POST action save/delete.
  3. **Planning Board** đổi sang đọc/ghi Default View từ máy chủ: "Set Default" → lưu lên server (thông báo "đã lưu trên máy chủ — dùng chung mọi môi trường"); "Load Default" / "Delete Default" cũng chạy qua server; tự động tải khi mở trang (thứ tự ưu tiên Operation → Area → System giữ nguyên). Dữ liệu cũ trong localStorage vẫn được đọc làm dự phòng khi chưa có trên server.
- **⚠ LẦN NÀY CẦN CHẠY 1 LỆNH SQL** (khác các bản trước): mở Supabase → SQL Editor → chạy `supabase/migrations/040_planning_board_view_default.sql` trước khi dùng tính năng này.

## v228 - JOB ĐANG Ở CÔNG ĐOẠN TRUNG GIAN VẪN HIỆN TRÊN PLANNING BOARD (neo vào công đoạn chính kế tiếp)

- **Yêu cầu user**: NextOperation là công đoạn trung gian (vd MSKG-PC — che chắn trước khi làm, không phải công đoạn chính để điều độ) thì Job hiện đang KHÔNG lên bảng. Muốn nó hiện và neo vào **cột công đoạn chính KẾ TIẾP** (vd CPBILP) để lập kế hoạch.
- **Nguyên nhân**: `sync-planning-chains` chỉ chèn NextOperation vào chuỗi khi code đó **đã có mapping** (điều kiện v165). Nếu code trung gian chưa mapping và không có trong AllOperation → chuỗi không neo được vị trí → không tạo dòng ELIGIBLE → Job biến mất.
- **Đã sửa (v228)**: chèn **mọi NextOperation** (kể cả chưa mapping) vào vị trí hiện tại của chuỗi — NextOperation là vị trí thật của Job. Code trung gian không mapping tự bị `standardize()` bỏ qua, và **công đoạn chính đầu tiên sau nó trở thành mục tiêu lập kế hoạch** (MSKG-PC → CPBILP ELIGIBLE). Giữ nguyên: không sửa dữ liệu nguồn, PIONBL vẫn bỏ qua, Job đã qua hết công đoạn chính vẫn không hiện.
- **⚠ Sau khi deploy**: mở Planning Board và bấm **Rebuild Chain** 1 lần để dựng lại chuỗi theo logic mới.
- Không cần SQL.

## v229 - PANEL "CÁC CÔNG ĐOẠN TRUNG GIAN ĐANG CÓ JOB"

- **Yêu cầu user**: thêm panel liệt kê các công đoạn trung gian (không phải công đoạn chính) đang có Job, kèm số Job + công đoạn chính kế tiếp mà chúng neo vào.
- **Đã làm** (code-only, không SQL):
  1. Panel **"🔧 Các công đoạn trung gian đang có Job"** trên Planning Board (sau panel Job mất tích): mỗi công đoạn hiển thị **Số Job** · **Neo vào công đoạn chính** (từ dòng ELIGIBLE của chain — công đoạn chính kế tiếp) · **Số Job chưa neo** · **Lý do là trung gian** (1. Chưa có mapping — mặc định trung gian / 2. Có mapping nhưng không nằm trong danh sách điều độ md_planning_operation_scope).
  2. Chip đếm: tổng công đoạn trung gian · tổng Job · số Job chưa neo (nhắc bấm Rebuild Chain).
  3. Logic tại `src/lib/planning/intermediate-operations.ts` (dùng mode() lấy công đoạn chính phổ biến nhất khi Job neo khác nhau) + component `src/components/intermediate-operations-panel.tsx`.
- Không cần SQL.

## v230 - NÚT "XÓA" (BỎ KHỎI ST) TRÊN PANEL CÁC CÔNG ĐOẠN ĐƯỢC HIỂN THỊ

- **Yêu cầu user**: thêm nút xóa cạnh nút Sửa trên panel "✅ Các công đoạn được hiển thị trên Planning Board".
- **Đã làm** (code-only, không SQL): mỗi dòng thêm nút **"🗑 Xóa"** → hộp xác nhận rõ hậu quả (Job của công đoạn này không hiện trên bảng nữa; mapping ST ngưng hoạt động; Source Operation vẫn giữ trong catalog; lịch sử Batch/Schedule không bị xóa; dựng lại toàn bộ chuỗi) → gọi DELETE /api/config/st-operation-flow (đúng thao tác "Bỏ khỏi ST" hiện có) → làm mới trang.
- Không cần SQL.

## v231 - "BỎ KHỎI ST" XÓA NHANH (bỏ rebuild nặng)

- **Yêu cầu user**: nút "Bỏ khỏi ST" load quá lâu — muốn xóa nhanh nhất có thể.
- **Nguyên nhân**: DELETE cũ sau khi ngưng cấu hình còn chạy `syncAllStDerived` — dựng lại toàn bộ ST Routing (quét toàn bộ routing detail của mọi Part) + Planning Chain của mọi Job → chục giây.
- **Đã sửa (v231)**: DELETE giờ **xóa nhanh** — chỉ ngưng ST Scope + mapping + **ngưng ngay các dòng Planning Chain của code đó** (Job biến khỏi bảng tức thì) → trả về trong vài trăm ms. Dữ liệu dẫn xuất (ST routing summary) sẽ được làm sạch đầy đủ ở lần Rebuild Chain / lần cấu hình kế tiếp. Vẫn hỗ trợ `full_rebuild=true` nếu cần chạy đầy đủ.
- Cập nhật thông báo xác nhận ở cả 2 nút (Planning Board + Cấu hình → ST Operation Flow) cho khớp hành vi nhanh.
- Không cần SQL.

## v232 - GỘP 3 CABIN THÀNH KHU CHUNG "PAINTING" (điều độ board)

- **Yêu cầu user**: gộp CAB1/CAB2/CAB3 thành 1 area chung "Painting" để dễ allocate operation; board điều độ hiện khu gộp chung nhưng vẫn chia 3 bảng lane riêng; khi chọn lô unschedule, operation hiện đủ ở cả 3 cabin để chọn; logic điều độ giữ nguyên.
- **Cơ chế**: area "khu gộp" = `md_schedule_area` có `resource_group` xác định + `resource_code IS NULL`. Các cabin (resource_code != NULL cùng resource_group) tự động trở thành lane con.
- **Migration 041 (BẮT BUỘC chạy)**: thêm area `PAINTING` ('Painting', group PAINTING, resource_code NULL, planner 2, display_order 99). Không đụng CAB1/2/3 hiện có.
- **Board điều độ (ManualScheduleGrid)**: khu PAINTING hiện 1 khối gộp (viền đậm) chứa 3 bảng lane CAB1/CAB2/CAB3; MỖI lane hiện CHUNG danh sách lô Unscheduled của cả khu (union operation của PAINTING + 3 cabin) → chọn lô nào xếp vào cabin nào tùy ý. Logic từng cabin (khớp resource, điều độ riêng) giữ nguyên.
- **ScheduleBoardClient (pool Planning Batches)**: lô unscheduled của CAB1/2/3 gom về 1 nhóm "Painting" chung; chọn batch nào schedule vào cabin nào qua form.
- **Cấu hình**: "Painting" tự xuất hiện trong hộp "Khu điều độ" khi sửa operation → chọn nó là operation thuộc khu chung (có thể xếp vào bất kỳ cabin nào). Mapping cũ vào CAB1/2/3 giữ nguyên và vẫn hiện trong pool chung.
- **Cần chạy SQL**: migration 041 trong Supabase SQL Editor.

## v233 - SỬA LỖI "DUPLICATE KEY" TRÊN TRANG SOURCE → MAIN MAPPING

- **Yêu cầu user**: lỗi Console Error "Encountered two children with the same key, 70" ở operation-mapping-manager.tsx.
- **Nguyên nhân**: query trang join `md_st_operation_mapping` với `md_st_operation_scope` (đối chiếu bằng upper(trim())) — khi có 2 scope row khớp 1 mapping (khác hoa/thường, thừa khoảng trắng) → hàng bị nhân bản → `key={r.id}` trùng.
- **Đã sửa (code-only, không SQL)**:
  1. Query dùng `select distinct m.*` → loại hàng nhân bản do join.
  2. Key bảng đổi thành composite `id:st_group:source_operation_code:standard_operation_rule` → đảm bảo duy nhất theo UNIQUE của bảng, kể cả khi dữ liệu cũ có dị tật.
- Các bảng khác dùng `key={r.id}` với query bảng đơn (không join) — id luôn duy nhất, giữ nguyên.

## v234 - FIX "BỎ KHỎI ST" NHƯNG OPERATION VẪN HIỆN (scope trùng 'bẩn')

- **Yêu cầu user**: chọn "Bỏ khỏi ST" (UNMSKG-S) nhưng dòng không biến mất.
- **Nguyên nhân**: nút xóa cũ dùng `insert ... on conflict(operation_code) do update` — khớp CHÍNH XÁC tên. Nếu bảng `md_st_operation_scope` có dòng trùng "bẩn" (khác hoa/thường hoặc thừa khoảng trắng, vd 'UNMSKG-S '), lệnh xóa tạo dòng mới inactive nhưng dòng bẩn vẫn `is_active=true` → trang ST Operation Flow (lọc `where is_active=true` + gom theo `upper(trim())`) vẫn hiện operation. Cùng gốc với lỗi duplicate-key đã sửa ở v233.
- **Đã sửa (code-only)**: DELETE giờ UPDATE theo **chuẩn hóa** `upper(trim(operation_code))` → tắt `is_active=false` cho TẤT CẢ dòng khớp (mọi biến thể hoa/thường/khoảng trắng), không phụ thuộc ràng buộc unique. Áp dụng cho scope + mapping + planning_job_operation.
- **Khuyến nghị**: chạy SQL dọn dữ liệu scope trùng (xem hướng dẫn trong thư).

## v235 - DỌN CỘT "MA" TRÊN PLANNING BOARD (cột không còn trong danh sách hiển thị)

- **Yêu cầu user**: nhiều cột công đoạn ở Candidate Jobs không có trong "✅ Các công đoạn được hiển thị trên Planning Board" mà vẫn hiển thị.
- **Nguyên nhân**: cột ma trận Candidate Jobs đọc `md_planning_operation_scope` (công đoạn chính), panel hiển thị đọc `md_st_operation_scope` (operation nguồn). Nút "Bỏ khỏi ST" trước đây chỉ tắt scope nguồn + mapping — KHÔNG tắt main trong planning scope → main mất hết nguồn vẫn hiện cột chết mãi trên Board.
- **Đã sửa**:
  1. DELETE ("Bỏ khỏi ST") giờ tự đồng bộ: tắt main nào không còn mapping từ source đang hoạt động (planning scope + schedule area operation mapping).
  2. **Migration 042 (BẮT BUỘC chạy 1 lần)**: dọn tất cả main mồ côi đã tồn tại trong dữ liệu.
- Lưu ý: cột trên Board = CÔNG ĐOẠN CHÍNH (vd RWK, BSAUNSLD), panel hiển thị = operation NGUỒN (vd RWK-BSA→RWK). Một source khớp với cột main của nó. Khi cấu hình lại source trỏ tới main, main tự kích hoạt lại.

## v236 - BẢNG CHỌN CÔNG ĐOẠN HIỂN THỊ TRÊN CANDIDATE JOBS + GIẢI THÍCH LÝ DO

- **Yêu cầu user**: vẫn thấy operation không có trong panel hiển thị trên Board; muốn bảng click-chọn operation đã cấu hình sẵn để quyết định cột nào hiện; muốn biết lý do.
- **Lý do cột lệch panel** (4 nguyên nhân):
  1. Cột Candidate Jobs = CÔNG ĐOẠN CHÍNH (md_planning_operation_scope: RWK, BSAUNSLD...), panel = OPERATION NGUỒN (md_st_operation_scope: RWK-BSA→RWK...) — 2 danh sách khác tên.
  2. Chưa chạy migration 042 → main mồ côi (mất nguồn) vẫn là cột.
  3. PIONBL luôn được thêm cột (progress-only, hardcode) dù không cấu hình.
  4. Nút Columns cũ trộn 168 cột dữ liệu lô gốc (Job, PartDescription, NextOperation...) với cột operation → khó tìm.
- **Đã thêm**: nút "Công đoạn (X/Y)" cạnh nút Columns → bảng riêng liệt kê ĐÚNG các operation đã cấu hình sẵn (Planning Scope), tick/bỏ tick để hiện/ẩn cột ma trận, kèm khu vực (area/group), tìm nhanh, Chọn hết/Bỏ hết. Lưu tự động qua cơ chế cột hiện có (localStorage + Default View máy chủ).

## v237 - FIX "BỎ HẾT CÔNG ĐOẠN MÀ CỘT VẪN QUAY LẠI"

- **Yêu cầu user**: bấm "Bỏ hết" trong bảng chọn công đoạn nhưng các công đoạn vẫn hiển thị.
- **Nguyên nhân**: nút Bỏ hết/toggle chỉ lưu danh sách cột vào localStorage. Cơ chế Default View máy chủ (v227) — đã lưu sẵn với đầy đủ cột — TỰ ÁP DỤNG LẠI khi (a) fetch view hoàn tất sau khi bạn bấm, hoặc (b) tải lại trang → toàn bộ cột quay về.
- **Đã sửa (v237, code-only)**: mọi thay đổi cột (bỏ tick/tick một cột, Chọn hết, Bỏ hết) giờ TỰ ĐỘNG ghi vào Default View máy chủ (merge giữ filter/sort/density cũ) → không còn bị view tái áp dụng ghi đè, giữ nguyên sau F5 và trên mọi máy.
- Thêm dòng thông báo "Đã bỏ hết — ma trận không còn cột công đoạn" khi không còn công đoạn nào được chọn.

## v238 - BẢNG CHỌN CÔNG ĐOẠN = BỘ LỌC JOB TRÊN CANDIDATE JOBS

- **Yêu cầu user**: bỏ chọn hết công đoạn → danh sách Job trên Candidate Jobs phải EMPTY (không chỉ ẩn cột).
- **Đã sửa (v238, code-only)**: bảng "Công đoạn" giờ kiêm bộ lọc Job — Candidate Jobs chỉ hiện Job CÓ ô trạng thái ở công đoạn đang chọn (khớp quy tắc render ma trận: standard_operation + PIONBL + fallback Candidate Main). Bỏ chọn HẾT → danh sách Job trống; chọn một phần → chỉ Job liên quan. Số ELIGIBLE/PLANNED cập nhật theo. Lưu tự động vào Default View máy chủ (v237).

## v239 - ĐƠN GIẢN HÓA: CHỈ HIỆN JOB CÓ NEXT OPERATION THUỘC CÔNG ĐOẠN ST

- **Yêu cầu user**: (sau v238 thấy loạn) ý thật chỉ là — hiển thị các Job có NEXT OPERATION thuộc các công đoạn của ST là được.
- **Đã sửa (v239, code-only)**: bỏ lọc theo "ô trạng thái route" phức tạp (v238); thay bằng quy tắc đơn giản:
  - Candidate Jobs CHỈ hiện Job có `next_operation` ∈ danh sách operation ST (panel "Các công đoạn được hiển thị" — ST scope active).
  - Job có next operation là công đoạn ngoài ST (vd gia công CMMHXG, CNCDAS-1...) → KHÔNG hiện nữa.
  - Bảng "Công đoạn" (v236) vẫn dùng để chọn cột + thu hẹp: bỏ hết → trống; chọn một phần → chỉ Job có next op thuộc nhóm source của công đoạn đang chọn.
- Truyền `stOperations` (visibleOpsQ) từ trang Planning vào board client.

## v240 - XÓA HẾT LOGIC LỌC DANH SÁCH CŨ — CHỈ CÒN 1 QUY TẮC VIEW

- **Yêu cầu user**: xóa hết logic hiển thị danh sách cũ (đang mắc chỗ danh sách không đúng ý); giữ nguyên mọi logic khác. Ý tưởng: có 1 VIEW = danh sách tất cả công đoạn (panel "Các công đoạn được hiển thị trên Planning Board"); Candidate Jobs nhìn vào VIEW đó — nếu NEXT OPERATION của job nằm trong danh sách → hiện; ngoài ra không hiện.
- **Đã sửa (v240, code-only)**:
  - XÓA: lọc theo ô trạng thái route (v238), thu hẹp theo công đoạn chọn (v236-239), sourceByMain, selectedRouteOps.
  - CÒN LẠI DUY NHẤT: `next_operation ∈ stOperationSet` (danh sách operation ST trong panel — ST scope active).
  - Bảng "Công đoạn" giờ CHỈ chọn CỘT hiển thị (không còn ảnh hưởng danh sách Job).
  - Mọi logic khác (Planning Chain, Batch, Schedule, config) KHÔNG đổi.

## v241 - VIEW CÔNG ĐOẠN ST TÁCH RIÊNG (Candidate Jobs nhìn vào view này)

- **Yêu cầu user**: VIEW = danh sách công đoạn (panel) là VIEW CÔNG ĐOẠN CHÍNH; VIEW CÁC CÔNG ĐOẠN ST tách ra riêng để Candidate Jobs nhìn vào.
- **Đã làm (v241, code-only)**:
  - VIEW CÔNG ĐOẠN CHÍNH = panel "Các công đoạn được hiển thị trên Planning Board" — giữ nguyên (cấu hình).
  - VIEW CÔNG ĐOẠN ST (mới, tách riêng) = danh sách MỌI NEXT OPERATION trong All Open Jobs + các công đoạn ST đã cấu hình; bảng "Công đoạn" trên Board chính là view này — tick/bỏ tick từng công đoạn, kèm số job + nhãn "Đã cấu hình ST"/"Chỉ trong All Open Jobs".
  - Candidate Jobs chỉ hiện Job có NEXT OPERATION nằm TRONG view (mặc định = công đoạn ST đã cấu hình; bỏ hết → trống).
  - Lưu view vào Default View máy chủ (field mới `stView` trong payload jsonb — KHÔNG cần migration).
  - Query mới trên trang Planning: distinct next_operation + số job từ open_job_current.

## v242 - FIX "BỎ CHỌN HẾT MÀ JOB VẪN HIỆN"

- **Yêu cầu user**: bấm Bỏ hết trong VIEW CÔNG ĐOẠN ST (0/237) nhưng Candidate Jobs vẫn hiện 96 ELIGIBLE.
- **Nguyên nhân**: `displayCandidates` là useMemo nhưng danh sách deps THIẾU `effectiveStView` — khi tick/bỏ tick, state thay đổi nhưng memo không chạy lại → danh sách job giữ bản cũ.
- **Đã sửa (v242, code-only)**: thêm `effectiveStView` vào deps của displayCandidates.

## v243 - FIX "VIEW GHI 11 JOB NHƯNG CANDIDATE JOBS CHỈ HIỆN 2" (limit 500 cắt job)

- **Yêu cầu user**: MSKG-DBL view đếm 11 job nhưng danh sách Candidate Jobs chỉ hiện 2.
- **Nguyên nhân**: câu query Candidate Jobs có `limit 500` (vấn đề đã biết từ đợt rà soát) — chỉ lấy 500 dòng đầu theo ưu tiên; 9 job MSKG-DBL nằm ngoài 500 → không hiện.
- **Đã sửa (v243, code-only)**:
  1. Lọc theo VIEW CÔNG ĐOẠN ST **ngay trong SQL** (đọc từ planning_board_view, thứ tự OP → AREA → SYSTEM; chưa có view → mặc định = công đoạn ST đã cấu hình trừ ST_SCOPE_ONLY; view rỗng → 0 job) — lọc TRƯỚC limit nên không cắt job của công đoạn đã chọn.
  2. Nâng `limit 500` → `limit 5000`.
  3. Client: đổi VIEW → tự tải lại trang sau 1.2s (debounce) để job của công đoạn mới tick xuất hiện.

## v244 - NÂNG GIỚI HẠN DANH SÁCH CANDIDATE JOBS 5000 → 10000

- **Yêu cầu user**: tăng limit từ 5000 lên 10000.
- **Đã sửa (v244, code-only)**: `limit 5000` → `limit 10000` trong query Candidate Jobs.

## v245 - BỎ TỰ TẢI LẠI KHI ĐỔI VIEW (trang chậm/lỗi do reload liên tục)

- **Yêu cầu user**: vừa tick chọn là load rất chậm, dễ lỗi — muốn tạo danh sách rồi để Board nhìn vào đó hiển thị.
- **Nguyên nhân**: v243 tự tải lại trang sau mỗi lần tick → query nặng chạy lại từng lần → chậm/lỗi.
- **Đã sửa (v245, code-only)**:
  - Tick/bỏ tick công đoạn → lọc NGAY trên dữ liệu đã tải (không tải lại trang).
  - Thêm nút **"Áp dụng & tải lại"** trong VIEW: dùng khi tick thêm công đoạn MỚI (job chưa có trong trang) — lưu view rồi tải lại 1 lần có chủ đích.
  - Danh sách = VIEW (đã lưu máy chủ); Board nhìn vào view để hiển thị.

## v246 - CHỈ BÁO "HIỆN X/Y JOB" TRONG VIEW CÔNG ĐOẠN ST

- **Yêu cầu user**: công đoạn tick có job trong All Open Jobs nhưng không hiện trong Candidate Jobs — hỏi có limit gì không.
- **Giải thích**: có giới hạn 10.000 dòng (đã nâng từ 500), nhưng thiếu job thường do: (1) mới tick công đoạn → job chưa được nạp (cần "Áp dụng & tải lại"); (2) job chưa có dòng lập kế hoạch ELIGIBLE (cần Rebuild Chain); (3) bộ lọc Sort/Filter đang bật (kể cả từ Default View đã lưu).
- **Đã thêm (v246, code-only)**: mỗi dòng công đoạn trong VIEW hiện "· hiện X/Y job" — X = job đã hiện trên Board, Y = tổng job trong All Open Jobs → nhìn là biết thiếu do đâu.

## v247 - JOB TRUNG GIAN: TUYẾN ĐƯỜNG LẤY TỪ ROUTING DETAIL (theo Part + Revision)

- **Yêu cầu user**: cải thiện chỗ job trung gian — lấy theo routing detail để routing chính xác theo Part + Revision.
- **Nguyên nhân**: chuỗi lập kế hoạch (sync-planning-chains) dựng tuyến đường từ cột AllOperation (Excel — chỉ là phần còn lại từ vị trí hiện tại) → vị trí NextOperation của job trung gian/rework có thể không chính xác.
- **Đã sửa (v247, code-only)**:
  1. Query `md_routing_detailed` theo Part + Revision của các Job đang mở (có index partrev) → dựng map tuyến đường ĐẦY ĐỦ (chứa cả công đoạn trước vị trí hiện tại + công đoạn trung gian).
  2. `raw` route của job giờ lấy từ Routing Detail (nguồn CHÍNH); AllOperation chỉ fallback khi Part chưa có routing detail.
  3. Thống kê mới khi bấm Rebuild Chain: `Routing Detail X · AllOperation fallback Y` (X+Y = tổng job) — biết được bao nhiêu job dùng nguồn nào.
- **Hệ quả**: job trung gian (MSKG-*, rework...) được neo vào main kế tiếp theo đúng vị trí trong routing thật của Part — khớp với ma trận Board (vốn đã dựng từ routing detail) → DONE/READY/WAIT nhất quán.
- **Cần bấm Rebuild Chain 1 lần sau deploy.**

## v248 - SỬA LỖI "Unexpected token '<' ... is not valid JSON"

- **Yêu cầu user**: gặp lỗi `Lỗi: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
- **Nguyên nhân**: máy chủ trả trang lỗi **HTML** thay vì JSON — thường do API route chạy quá lâu bị cắt (Vercel) hoặc route lỗi; trình duyệt cố đọc JSON nên báo lỗi khó hiểu.
- **Đã sửa (v248, code-only)**:
  1. Thêm helper `safeJson` trong Planning Board: đọc text trước → nếu không phải JSON thì báo rõ `Máy chủ trả về lỗi (HTTP xxx) — do route chạy quá lâu hoặc route lỗi` + hướng dẫn (bấm lại / báo trợ lý).
  2. Áp dụng cho: Rebuild Chain, Tạo Batch, Lưu/Xóa Default View.
- **Ghi chú**: nếu lỗi xảy ra khi bấm Rebuild Chain trên Vercel — hàm dựng toàn bộ chuỗi có thể vượt giới hạn thời gian gói Hobby (60s). Cách chạy an toàn: bấm Rebuild ở **localhost** (không giới hạn) hoặc báo trợ lý để tối ưu.

## v249 - DỌN PLANNING BOARD: XÓA CÁC BẢNG TRỢ GIÚP

- **Yêu cầu user**: xóa các bảng trên Planning Board — không cần dùng nữa.
- **Đã xóa (v249, code-only)** trên trang /planning:
  1. ⚠ Panel "Job mở nhưng KHÔNG hiện trên bảng" (MissingJobs)
  2. 🔧 Panel "Các công đoạn trung gian đang có Job" (Intermediate)
  3. ➕ Panel "Operations chưa hiện trên Planning Board" (Missing Operations)
  4. ✅ Panel "Các công đoạn được hiển thị trên Planning Board" (Visible Operations)
- Board giờ chỉ còn: bộ lọc Area/Operation + Candidate Jobs + Batch Builder. Cấu hình công đoạn vẫn đầy đủ tại tab Cấu hình (Tổng quan có cảnh báo job chưa cấu hình + ST Operation Flow có Sửa/Bỏ khỏi ST). Bỏ luôn 3 query không dùng → trang nhẹ hơn.

## v250 - CÔNG ĐOẠN TRÙNG TRONG ROUTING: DÙNG LAST/NEXT OPERATION ĐỂ CHỌN ĐÚNG OCCURRENCE

- **Yêu cầu user**: routing detail có công đoạn TRÙNG (vd CMSA 2 lần) → min(source_seq) không xác định được vị trí trước/sau → status DONE/READY/WAIT sai. Đề xuất dùng LastOperation + NextOperation so trong routing detail.
- **Đã sửa (v250, code-only)** trong query ma trận Planning Board:
  1. CTE `next_op_position`: vị trí NextOperation = occurrence ĐẦU TIÊN nằm SAU occurrence CUỐI của LastOperation trong routing detail → chọn đúng lần xuất hiện đang đứng.
  2. `ready_position`: ưu tiên vị trí Main đang ELIGIBLE với điều kiện `source_seq >= next_op_position` (thay vì min() chọn occurrence đầu tiên) → DONE/READY/WAIT đúng cả khi công đoạn lặp; vẫn xử lý plan-ahead và trường hợp NextOperation trung gian.
  3. Fallback giữ nguyên (không có routing → vị trí từ planning row).
- **Cần bấm Rebuild Chain không bắt buộc** (chỉ đổi hiển thị ma trận; chain giữ nguyên — currentAnchor đã dùng LastLaborOp để chọn occurrence từ trước).

## v251 - MỐC 2: BATCH HISTORY XÁC ĐỊNH OCCURRENCE (khi LastOperation thiếu)

- **Yêu cầu user**: xác nhận làm v251 (sau khi thống nhất: LastOperation = mốc chính, batch = mốc phụ; job hoàn thành không batch vẫn đúng nhờ LastOperation; lấy mốc CAO HƠN để không tụt lùi).
- **Đã sửa (v251, code-only)** trong `next_op_position` (query Planning Board): floor = `greatest(LastOperation position, vị trí routing cao nhất đã có Batch không hủy ở chính NextOperation)`.
- Chỉ đổi HIỂN THỊ ma trận — không cần Rebuild Chain, không cần SQL.

## v252 - CỘT ALLOPERATION HIỂN THỊ ĐẦY ĐỦ (hết cắt chữ)

- **Yêu cầu user**: cột AllOperation bị mất chữ (truncate).
- **Đã sửa (v252, code-only)**: cột `all_operation` đổi sang hiển thị XUỐNG DÒNG (white-space normal, word-break, min-width 300px) thay vì cắt 230px với dấu "…". Các cột khác giữ nguyên.

## v253 - FIX CỘT ALLOPERATION VẪN CẮT CHỮ (tên cột Excel "AllOperation" không gạch dưới)

- **Yêu cầu user**: v252 rồi mà cột AllOperation vẫn mất chữ.
- **Nguyên nhân**: class mở rộng chỉ áp dụng khi tên cột = `all_operation` (có gạch dưới), nhưng Excel dùng tên **"AllOperation"** (không gạch dưới) → class không kích hoạt → vẫn cắt 230px.
- **Đã sửa (v253, code-only)**: nhận cả 2 tên `ALL_OPERATION` và `ALLOPERATION`.

## v254 - FLYBAR# TRẢ VỀ NHƯ CŨ (chỉ gộp khi có lane con thật)

- **Yêu cầu user**: chỉ gộp cabin PAINTING — KHÔNG gộp Flybar; trả Flybar về như cũ.
- **Nguyên nhân**: v232 gộp MỌI khu có resource_code=NULL → CHEMICAL_LINE (Flybar#) cũng thành "khu gộp" nhưng không có area con (điều độ qua resource FB-01..06) → hiện khối rỗng "0 lane".
- **Đã sửa (v254, code-only)**: chỉ hiển thị dạng khu gộp khi khu đó CÓ lane con thật (PAINTING có CAB1/2/3); khu không có area con → render block như cũ (bảng hóa chất với FB + nút Đề xuất/Lưu tất cả/Sửa Loading).

## v255 - FREEZE PANE TÙY CHỈNH (checkbox + Job dính khi cuộn ngang)

- **Yêu cầu user**: (1) muốn tự freeze pane theo ý; (2) cột đầu tiên ở vùng freeze luôn bị trắng thông tin.
- **Thực trạng**: class sticky cũ chỉ còn trong CSS, KHÔNG được dùng → thực tế không có freeze pane.
- **Đã làm (v255, code-only)**:
  1. Xây lại freeze pane: cột **checkbox** + cột **Job** dính khi cuộn ngang (position sticky, nền trắng/xám đặc + z-index cao) → không còn tình trạng cột trắng/che mất chữ.
  2. Nút **"📌 Freeze: Bật/Tắt"** trên toolbar → bật/tắt theo ý bạn, lưu tự động (mỗi máy).
- Nếu cột trắng bạn thấy nằm ở chỗ KHÁC (hộp Columns / vị trí khác) — gửi ảnh rõ hơn để tôi xử lý tiếp.

## v256 - FREEZE PANE CHỌN VÙNG THEO Ý (freeze đến cột bất kỳ)

- **Yêu cầu user**: làm sao chọn vùng để freeze (không chỉ cố định checkbox+Job).
- **Đã làm (v256, code-only)**: nút "📌 Freeze ▾" mở menu liệt kê mọi cột đang hiển thị → chọn cột nào thì freeze từ đầu bảng (checkbox) đến cột đó; chọn "Không freeze" = tắt. Đo bề rộng thật từng cột (useLayoutEffect) → gán left cộng dồn → cột rộng khác nhau vẫn dính chuẩn. Lưu tự động theo máy.

## v257 - BỎ HARDCODE FREEZE CŨ + FREEZE MỚI ĐO CHUẨN TỪNG CỘT

- **Yêu cầu user**: bỏ hardcode freeze cũ trước, rồi cải thiện freeze mới.
- **Đã làm (v257, code-only)**:
  1. BỎ hardcode: cột checkbox KHÔNG còn dính bắt buộc (trước đây luôn sticky) — giờ chỉ dính khi user bật freeze.
  2. "Không freeze" → KHÔNG có cột nào dính (kể cả checkbox).
  3. Sửa lỗi đo vị trí của v256: gán `data-fcol` (vị trí cột trong vùng đóng băng) cho cả header + body, đo bề rộng từ TH rồi áp left giống nhau cho header và body → các cột dính sát nhau, không lệch.

## v258 - GỠ TOÀN BỘ FREEZE PANE (tạm thời — do lỗi hiển thị)

- **Yêu cầu user**: bị lỗi hiển thị — tạm thời xóa hết liên quan freeze để kiểm tra.
- **Đã làm (v258, code-only)**: gỡ sạch mọi code freeze (v255→v257): state, menu "📌 Freeze ▾", withFrozen/cloneElement, useLayoutEffect đo cột, class CSS sticky-select/freeze-col. Bảng trở về hiển thị như trước khi có freeze (cuộn tự do, không có cột dính).

## v277 - FIX "KHÔNG LƯU KHI ADD/SAVE RECIPE" (điều kiện Áp dụng cho Job bị mất sau khi lưu)

Triệu chứng: trên trang **Công thức & Rule**, điền điều kiện "Áp dụng cho Job" rồi bấm
**Add / Save Recipe** — dòng mapping xuất hiện nhưng điều kiện biến mất
(cột Giá trị điều kiện hiện "Không lọc (Mọi Job)").

Nguyên nhân gốc: form `main-operation-recipe-mapping-manager.tsx` ghi điều kiện
với key `{column, operator, value}`, trong khi TOÀN BỘ hệ thống đọc format chuẩn
`{source_column, operator, source_value}` (`parseSelectionRule` → bảng hiển thị,
engine `live-recipe.ts` chọn recipe trên Planning Board, migration 043 backfill).
`parseSelectionRule` lọc bỏ condition thiếu `source_column` → điều kiện "vô hình".

Sửa 3 chỗ (chỉ code, KHÔNG cần migration SQL mới):
1. Form lưu đúng format chuẩn `source_column/operator/source_value`.
2. `parseSelectionRule` chấp nhận CẢ format cũ `{column,value}` lẫn chuẩn →
   các mapping lỡ lưu trước v277 TỰ hiển thị + hoạt động lại, không cần sửa tay DB.
3. API `operation-code-map`: khi tick "Recipe mặc định", gỡ mặc định của MỌI dòng
   cùng Operation Code (unique index `uq_operation_code_recipe_active_default` áp
   cho cả operation_code, không tách theo standard_operation) — trước đây lọc theo
   standard_operation nên đôi khi văng lỗi 500 duplicate key.

## v276 - HẾT LỖI "Unexpected token '<' ... is not valid JSON" (safeJson dùng chung mọi fetch)

- **Hiện tượng (user báo)**: lỗi "Unexpected token '<', \"<!DOCTYPE ...\" is not valid JSON" — máy chủ trả về TRANG HTML thay vì JSON (route chạy quá lâu bị cắt trên Vercel / route lỗi) nhưng client gọi `r.json()` trực tiếp.
- **Đã làm**:
  - `src/lib/fetch-json.ts` (mới): hàm `safeJson` — body là JSON → trả về như cũ; body là HTML → ném lỗi tiếng Việt rõ ràng kèm HTTP status + gợi ý.
  - Thay ~40 chỗ gọi `.json()` trực tiếp trong **22 client component** (master-importer, open-job-importer, manual-schedule-grid, schedule-board-client, batch-detail-manager, main-operation-recipe-mapping-manager, process-time-rule-manager, chemical-handling-time-manager, area/schedule-area/operation/st-group managers, ...) bằng `safeJson`.
  - `planning-board-client.tsx`: giữ bản safeJson cục bộ (callers dựa vào cơ chế throw khi HTTP lỗi), chỉ thay chỗ `.then(r=>r.json())` còn sót.
  - Các route nặng (rebuild/import) đã có `maxDuration=300` — trên Vercel Hobby vẫn bị giới hạn 60s, giờ lỗi timeout hiện thông báo rõ thay vì chuỗi JSON vô nghĩa.
- Code-only, không cần SQL.

## v275 - LÀM RÕ Ô "MỌI JOB" TRONG BẢNG RECIPE

- **Câu hỏi user**: "cột điều kiện sao lại mọi job".
- **Giải thích**: "Mọi Job" = mapping KHÔNG có điều kiện "Áp dụng cho Job" → recipe dùng cho TẤT CẢ job của công đoạn đó (đúng, không phải lỗi; rule cũ chuyển qua cũng không kèm điều kiện).
- **Đã làm (code-only)**: trình bày rõ hơn — cột "Cột điều kiện" để "—", cột "Giá trị điều kiện" hiện badge **"Không lọc (Mọi Job)"** (kèm tooltip giải thích). Khi đặt điều kiện → 2 cột hiện tên cột + giá trị như cũ.

## v274 - BẢNG RECIPE: TÁCH CỘT "ÁP DỤNG CHO" THÀNH "CỘT ĐIỀU KIỆN" + "GIÁ TRỊ ĐIỀU KIỆN"

- **Yêu cầu user**: "thêm cột điều kiện, và giá trị điều kiện mà" — tách cột để nhìn tách bạch cột nào + giá trị nào.
- **Đã làm (code-only)**: `main-operation-recipe-mapping-manager.tsx` — bảng giờ có **2 cột riêng**: **Cột điều kiện** (tên cột đã dịch, đánh số ① ② …) và **Giá trị điều kiện** (toán tử + giá trị, cùng số thứ tự để ghép cặp). Chưa đặt điều kiện → cột 1 badge xanh **"Mọi Job"**, cột 2 "—".
- Kết quả: nhìn bảng thấy ngay recipe dùng cột nào để lọc và giá trị bao nhiêu.

## v273 - FIX LỖI 500 TRANG "CÔNG THỨC & RULE" (lệch thứ tự query Promise.all)

- **Hiện tượng (user gửi log dev)**: `/recipe-operation-map` trả 500 — `TypeError: Cannot read properties of undefined (reading 'trim')` tại `main-operation-recipe-mapping-manager.tsx:116` (`v.value.trim()` trong `valuesByColumn`).
- **Nguyên nhân**: bản v270 chèn query `md_recipe_time_rule` vào SAI VỊ TRÍ trong `Promise.all` (đặt sau query mapping — vị trí 5) trong khi biến nhận `timeRulesQ` khai ở vị trí 12 → **mọi biến từ vị trí 5 trở đi nhận nhầm dữ liệu**; `columnValues` nhận nhầm query chỉ có `source_column` (không có `source_value`) → `value` undefined → crash. (Đúng lỗi "tuple destructure" đã cảnh báo trong hồ sơ bàn giao.)
- **Sửa**: `recipe-operation-map/page.tsx` — di chuyển query `md_recipe_time_rule` về đúng vị trí 12 (trước query Part); thêm phòng thủ `v.value==null` trong manager.
- Code-only, không cần SQL.

## v272 - BẢNG RECIPE: CỘT "ÁP DỤNG CHO" HIỂN THỊ RÕ TÊN CỘT + ĐIỀU KIỆN, MỌI JOB

- **Yêu cầu user (làm rõ lần 2)**: "thêm tên cột áp dụng, và điều kiện áp dụng" (ảnh header bảng Operation Code → Recipe Mapping, cột "Áp dụng cho").
- **Đã làm (code-only)**: `main-operation-recipe-mapping-manager.tsx` — cột **"Áp dụng cho"** giờ hiển thị theo từng dòng: **số thứ tự · tên cột (đã dịch, vd "Alloy (Master)") · điều kiện (vd "= 7075")**; mapping CHƯA đặt điều kiện → badge xanh **"Mọi Job"** (áp dụng cho tất cả) thay vì dấu "—" mơ hồ. `globals.css`: style `.recipe-apply-list` / `.recipe-apply-line`.
- Kết quả: nhìn bảng biết ngay recipe nào dành riêng cho nhóm job nào (cột + điều kiện), recipe nào dùng chung (Mọi Job).
- Gộp cùng v271 (dropdown cột thêm Tên Primer 1 / Tên Top Coat / Tên Anti Abrasion từ Master Data).

## v271 - DROPDOWN "CHỌN CỘT" THÊM CỘT TÊN SƠN TỪ MASTER DATA

- **Yêu cầu user (làm rõ)**: "ý tôi là cột của cái này" — ý là **dropdown "— Chọn cột —"** trong mục "Áp dụng cho Job" (không phải cột bảng như v270).
- **Làm rõ nội dung dropdown (đã có từ v269)**: 2 nhóm — **All Open Job** (cột từ file All Open Job) + **Part Master (file Master Data)**: Alloy, Temper, TSA, Chemical Conv Airbus, Primer 1/2/3, Top Coat 1/2, Anti Abrasion, Varnish, Program, Part Cluster, Part Description, Surface dm², + các cột Yêu cầu (Req:...) từ 38 cột Process Requirement.
- **v271 bổ sung 3 cột còn thiếu**: **Tên Primer 1** (primer1_name), **Tên Top Coat** (topcoat_name), **Tên Anti Abrasion** (antiabrasion_name) — tên sơn đầy đủ, hữu ích khi All Open Job chỉ có mã sơn. Cập nhật đồng bộ: live-recipe.ts (merge map), sync-planning-chains.ts (Rebuild), page (mdFixed + union giá trị unique), manager (MD_LABELS).
- Code-only, không cần SQL mới.

## v270 - BẢNG RECIPE THÊM CỘT THÔNG TIN + MỞ RỘNG ĐIỀU KIỆN "ÁP DỤNG CHO JOB" (tối đa 8)

- **Yêu cầu user**: "thêm cột và thêm điều kiện áp dụng để biết thêm đúng không" (ảnh bảng Operation Code → Recipe Mapping).
- **Đã làm (code-only, không SQL mới)**:
  - `main-operation-recipe-mapping-manager.tsx`:
    - Nâng giới hạn điều kiện "Áp dụng cho Job" từ **3 → 8** (engine vốn hỗ trợ N điều kiện AND; chỉ nới UI).
    - Thêm **2 cột thông tin**: **Nhóm recipe** (Process Family · Recipe Group) và **Thời gian Process** (tóm tắt từ md_recipe_time_rule — ưu tiên FIXED_HOURS "hh:mm cố định", kế QTY_SURFACE "Theo SL / DT").
  - `recipe-operation-map/page.tsx`: query thêm `r.process_family,r.recipe_group` + `timeRulesQ` (md_recipe_time_rule), truyền prop.
- Kết quả: nhìn bảng là biết recipe đó thuộc nhóm nào, xử lý mất bao lâu, áp dụng cho job nào (điều kiện), mã lô/prefix ra sao.

## v269 - ĐIỀU KIỆN RECIPE ĐỌC THÊM CỘT TỪ FILE MASTER DATA (theo Part + Revision)

- **Yêu cầu user**: "lấy thêm cột ở file master data — all open job vẫn chưa đầy đủ dữ liệu" (kèm ảnh mục ⑫ từ điển).
- **Đã làm (code-only, không cần SQL mới — dữ liệu master đã import sẵn)**:
  - `live-recipe.ts`: `LiveRecipeContext` thêm `masterByPartRev` (bản đồ cột Master Data theo PART\u0001REV từ `md_part` + `md_material_finish` + `md_process_requirement`); hàm `mergeJobData` gộp All Open Job + cột Master (tiền tố `MD:`); `bestRecipeMatch`/`effectiveRecipeKey` khớp điều kiện trên dữ liệu gộp.
  - `sync-planning-chains.ts` (Rebuild): thêm 3 query master + map + gộp khi chọn recipe.
  - `planning/page.tsx` + `api/planning/batch/route.ts`: Mã lô mẫu `{MD:...}` cũng thay bằng dữ liệu gộp.
  - UI `recipe-operation-map/page.tsx` + `main-operation-recipe-mapping-manager.tsx`: dropdown cột chia 2 nhóm — **All Open Job** / **Part Master (file Master Data)** (Alloy, Temper, TSA, Chemical Conv Airbus, Primer 1-3, Top Coat 1-2, Anti Abrasion, Varnish, Program, Part Cluster, Part Description, Surface dm² + các cột Yêu cầu Req:...); danh sách giá trị unique của cột Master cũng có cho toán tử "="; nhãn hiển thị gọn (VD "Alloy = 7075" thay vì "MD:ALLOY = 7075").
- **Cách dùng**: Import Master Data (đã có) → mở Công thức & Rule → Áp dụng cho Job → chọn cột nhóm Master → chọn giá trị. Job lấy cột Master theo Part + Revision của job.
- Lưu ý: dữ liệu Master lấy từ lần Import Master gần nhất; All Open Job vẫn là nguồn ưu tiên cho cột trùng tên (Master có tiền tố MD: nên không đè nhau).

## v268 - FIX LỖI HYDRATION "Freeze Pane" vs "Current Main" trên Planning Board

- **Hiện tượng (user gửi ảnh)**: mở Planning Board báo lỗi Next.js "Hydration failed — server rendered text didn't match client" tại `<PlanningBoardClient>` (src/app/planning/page.tsx:1029); diff: server "Freeze Pane" ↔ client "Current Main".
- **Nguyên nhân**: `useState(loadFreeze)` gọi `loadFreeze` NGAY LÚC RENDER — server (không có window) trả `{mode:"off"}` → nút "📌 Freeze Pane"; client đọc localStorage `st-planning:freeze:v1` (đã ghìm cột "Current Main") → nút "📌 Current Main" → lệch text → lỗi hydration (cùng vấn đề đã ghi chú ở v261, giờ thành lỗi hiển thị).
- **Sửa (planning-board-client.tsx)**: khởi tạo freeze = `{mode:"off"}` (SSR-safe), thêm `useEffect(()=>{setFreeze(loadFreeze());},[])` đọc lại sau khi mount → SSR khớp client lần render đầu; sau hydration mới áp dụng freeze đã lưu (kèm class/data-fc của bảng cũng hết lệch).
- Đã rà toàn bộ component: không còn chỗ nào đọc localStorage trong `useState` initializer. Code-only, không cần SQL.

## v267 - ĐIỀU KIỆN RECIPE: thêm "trống / rỗng" + dropdown giá trị unique + bảng công đoạn chưa gán

- **Yêu cầu user**: (1) thêm giá trị trống/rỗng; (2) chọn "=" → hiện danh sách giá trị UNIQUE của cột để chọn; (3) thêm tất cả công đoạn chính để làm recipe cho từng công đoạn.
- **Đã làm (code-only, không cần SQL mới)**:
  - `batch-key-recipe.ts`: thêm toán tử **`is_empty`** ("trống / rỗng") vào `matchCondition` + type operator.
  - `main-operation-recipe-mapping-manager.tsx`:
    - OPERATORS thêm "trống / rỗng"; ruleLabel hiển thị gọn.
    - Khi chọn **toán tử =** và đã chọn cột → ô giá trị thành **dropdown giá trị unique** của cột đó (lấy từ `md_open_job_column_value`, bấm Scan/Rebuild ở mục ⑫ để cập nhật). Giá trị cũ đang chọn (không có trong danh sách) vẫn hiện để không mất.
    - Thêm bảng **"Operation Code chưa gán Recipe"** cuối trang: liệt kê mọi mã công đoạn đang hoạt động chưa có mapping → nút "Cấu hình →" tự điền form (bạn làm recipe lần lượt cho từng công đoạn).
  - `recipe-operation-map/page.tsx`: thêm 2 query (columnValues + unmapped), truyền props, cập nhật chú thích.
- **Lưu ý**: danh sách giá trị unique phụ thuộc dữ liệu quét ở mục ⑫ (Cột All Open Job); giá trị trống dùng toán tử "trống / rỗng" (không nằm trong dropdown).

## v266 - GỘP 3 MÀN HÌNH RECIPE THÀNH 1: "CÔNG THỨC & RULE" (cần migration 043)

- **Yêu cầu user**: "gộp 3 tab làm 1 được không — 3 cái loạn quá, tối ưu lại" → chốt "ok gởi mã".
- **Gộp**: Danh mục Recipe (9) + Operation → Recipe (10) + Batch Key / Recipe Rules (13) → **1 trang `/recipe-operation-map` "Công thức & Rule"**, 3 phần:
  - ① **Công đoạn → Recipe** (chính): form + bảng mapping có đủ Ưu tiên · Mặc định · Áp dụng cho Job (điều kiện) · **Mã lô mẫu** · **Prefix số lô** (2 cột mới — trước đây chỉ có ở Rule).
  - ② **Danh mục Recipe** (thu gọn, `<details>`): ProcessRecipeManager nhúng sẵn (kèm tìm Part).
  - ③ **Công đoạn chính → Recipe được phép** (thu gọn, nâng cao).
- **Engine**: bỏ hẳn bước Rule khỏi mọi nơi — recipe + Mã lô + Prefix giờ đọc từ mapping (`bestRecipeMatch` trong `live-recipe.ts`):
  - `sync-planning-chains.ts`, `planning/page.tsx`, `planning-board-client.tsx`, `api/planning/batch/route.ts`, `api/planning/batch/[id]/jobs/route.ts`.
  - `batch-key-recipe.ts`: xóa BatchKeyRule/RuleSuggestion/ruleMatches/evaluateRulesForJob/parseRules/RULES_SQL; giữ matchCondition, parseSelectionRule, pickBestRecipe(ForJob), substituteTemplate, toRecipeCandidates/groupRecipeCandidates (mở rộng batch fields).
  - `operation-code-map/route.ts`: lưu batch_key_template + batch_no_prefix.
- **Dọn**: xóa `components/batch-key-recipe-rule-manager.tsx` + `api/config/batch-key-recipe-rules/`; `process-recipes` + `batch-key-recipe-rules` → redirect; sidebar Tầng 2 còn 4 mục (9 Công thức & Rule · 10 Loading · 11 Process · 12 Cột từ điển); settings cập nhật chips/issues; logic-guide bỏ mục 8.8 rule.
- **MIGRATION 043 BẮT BUỘC**: `043_merge_recipe_rules.sql` — thêm 2 cột + tự chuyển Rule cũ (điều kiện → selection_rule, mã lô/prefix giữ nguyên). Chạy trên Supabase SQL Editor TRƯỚC khi deploy. Rule match ANY / không có recipe → bỏ qua (hiếm).
- **Kết quả**: 1 màn hình duy nhất cho toàn bộ recipe; chọn Job vào lô vẫn tự ra Recipe + Mã lô + Prefix đúng.

## v265 - DỌN DẸP CẤU HÌNH: xóa Auto Planning Rules + tách mục tùy chọn

- **Yêu cầu user**: "check lại — những gì không cần thì xóa đi, clean lại để dễ dùng" (ảnh chụp sidebar Tầng 2).
- **Đã dọn (code-only, không SQL)**:
  1. **Xóa "Auto Planning Rules"** — placeholder tính năng tương lai chưa có engine, gây rối mắt:
     - Bỏ khỏi sidebar `config-nav.tsx` (item + statusKey autoplan_total + câu query health).
     - Bỏ khỏi trang Tổng quan `/settings`.
     - Sửa link Bước trước của trang "Cột All Open Job".
     - Xóa 3 file: `app/auto-planning-rules/page.tsx`, `components/auto-planning-rule-manager.tsx`, `api/config/auto-planning-rules/route.ts`.
     - Dọn nhắc trong `logic-guide/page.tsx` (query + bullet — biến autoRules khai báo nhưng KHÔNG hiển thị), `lib/stats.ts`, `api/config/operation-master/rename/route.ts`.
  2. **Tầng 2 chỉ còn mục thật cần dùng**: 9–12 = bắt buộc (tính vào % tiến độ, có trong "Cần xử lý ngay"); 13–14 = nhóm "Tùy chọn · gom lô tự động theo giá trị Job" (không tính tiến độ, không báo lỗi khi thiếu).
  3. **Xóa 6 component chết**: intermediate-operations-panel, missing-jobs-panel, missing-operations-manager, visible-operations-manager (4 panel đã gỡ khỏi /planning từ v249), login-form, logout-button (trang login hiện chỉ redirect; auth chưa làm).
- **Kết quả**: sidebar Tầng 2 gọn còn 6 mục (9–14), trang Tổng quan rõ ràng bắt buộc/tùy chọn, không còn mục xám "chờ tương lai".
- Lưu ý: bảng `md_auto_planning_rule` trong DB giữ nguyên (không xóa dữ liệu); chỉ bỏ UI.

## v264 - ĐỀ XUẤT RECIPE CHÍNH XÁC: theo điều kiện từng Job + đồng bộ máy chủ

- **Yêu cầu user**: "tôi muốn làm để đề xuất chính xác recipe".
- **Nguyên nhân 1 (lệch giữa hiển thị và máy chủ)**: Batch Builder gửi recipe đề xuất (theo cấu hình hiện tại) nhưng máy chủ còn bám `planning_job_operation.recipe_key` (giá trị CŨ lúc Rebuild) → chặn oan ("Job có Recipe khác Batch") hoặc lô ra recipe cũ khác đề xuất hiển thị.
- **Nguyên nhân 2 (không phân biệt từng Job)**: "Operation → Recipe" chỉ chọn theo Ưu tiên/Mặc định — cùng công đoạn, 2 Job khác vật liệu/spec vẫn ra 1 recipe. Cột `selection_rule` (migration 014) có sẵn nhưng CHƯA từng được dùng.
- **Đã làm (code-only, không cần SQL mới)**:
  1. **Điều kiện áp dụng cho từng Job (dùng `selection_rule`)**:
     - `batch-key-recipe.ts`: + `parseSelectionRule` (JSON conditions) + `pickBestRecipeForJob` — chỉ xét mapping khớp ĐIỀU KIỆN của Job; mapping không điều kiện = fallback; trong nhóm hợp lệ vẫn theo priority → is_default → updated_at.
     - `live-recipe.ts` / `sync-planning-chains.ts` / `planning/page.tsx` / `batches/[id]/page.tsx`: đọc `selection_rule`, tính effective theo `source_data` của Job.
     - UI `main-operation-recipe-mapping-manager.tsx` + `recipe-operation-map/page.tsx`: thay ô text "Selection Rule" bằng bộ điều kiện (chọn cột All Open Job + toán tử + giá trị, tối đa 3 điều kiện); bảng hiển thị cột "Áp dụng cho" (cột = giá trị).
  2. **Đồng bộ máy chủ (hết lệch đề xuất ↔ lô)**:
     - `batch-utils.ts`: + `recipeAllowedForJob` — recipe hợp lệ cho Job theo CẤU HÌNH HIỆN TẠI (Standard Operation → Recipe / Operation Code → Recipe / Part+Rev → Recipe).
     - `api/planning/batch/route.ts` (tạo lô): `resolved` tính theo cấu hình hiện tại (không bám p.recipe_key cũ); validation dùng `recipeAllowedForJob`; cập nhật job recipe ưu tiên recipe mới (`coalesce($2,recipe_key)`).
     - `api/planning/batch/[id]/jobs/route.ts` (thêm job): job chưa recipe → tự chọn theo cấu hình hiện tại (có điều kiện); validation dùng `recipeAllowedForJob` (rule khớp khác recipe lô vẫn chặn); cập nhật ưu tiên recipe mới.
- **Kết quả**: cấu hình "Operation → Recipe" với điều kiện → mỗi Job ra ĐÚNG recipe của nó; đề xuất hiển thị = recipe lô thật (không còn chặn oan / lệch). Rebuild Chain vẫn nên bấm 1 lần sau deploy để DB có recipe chuẩn.
- Lưu ý: bảng `md_main_operation_recipe` không có cột id → tiebreaker "thứ tự nhập" dùng updated_at cũ nhất (đã nêu từ v262).

## v263 - ĐỀ XUẤT RECIPE KHI CHỌN JOB VÀO LÔ (theo toàn bộ cấu hình) + TAB CẤU HÌNH RÕ HƠN

- **Yêu cầu user**: "cải tiến lại các tab — đơn giản chọn job và công đoạn chính sẽ ra đúng recipe; khi chọn thêm vào lô thì tự đề xuất đúng recipe theo cấu hình".
- **Nguyên nhân**: Batch Builder chỉ hiện đề xuất recipe khi có RULE khớp (tab 13) — người dùng cấu hình xong "Operation → Recipe" (tab 10) mà vẫn thấy "Chưa có rule khớp"; màn hình thêm job vào lô (Batch Detail) không hiện đề xuất recipe nào.
- **Đã làm (code-only, không cần SQL mới)**:
  - `planning-board-client.tsx` (Batch Builder): đề xuất recipe theo TOÀN BỘ cấu hình (rule → paint theo Part → Operation Code theo Ưu tiên/Mặc định/cập nhật) nhờ `effective_recipe_key` từ v262. Khối hiển thị: ✓ Recipe đề xuất cho lô (kèm nguồn: theo rule / theo cấu hình) · ⚠ Các Job chọn có Recipe khác nhau · ✕ Chưa có recipe (kèm link cấu hình nhanh). `createBatch` vẫn gửi `recipe_key` = lựa chọn tay / đề xuất đồng thuận.
  - `batch-detail-manager.tsx` + `planning/batches/[id]/page.tsx`: thêm banner "Recipe đề xuất" khi chọn Job trong màn hình Add Jobs to Batch (server truyền `effective_recipe_key` cho mọi dòng candidate).
  - `main-operation-recipe-mapping-manager.tsx` + `recipe-operation-map/page.tsx`: thêm cột **✓ Tự chọn** (recipe đang thắng theo đúng thứ tự engine: priority → is_default → updated_at) + ghi chú giải thích ngay trên form.
  - `config-nav.tsx`: ghi chú dưới "Tầng 2 · Công thức & Rule": "Chỉ cần 9–12 cho nhu cầu cơ bản; 13–14 dành cho gom lô TỰ ĐỘNG theo giá trị Job."
  - `globals.css`: style `.recipe-suggestion-banner`, `.chemical-multi-map-note`, `.recipe-winner`, `.config-nav-hint`.
- **Kết quả**: cấu hình xong tab 9–12 (không cần Rule) → chọn Job vào lô là tự đề xuất đúng Recipe; Rule (tab 13) chỉ còn là tùy chọn gom lô tự động theo giá trị Job.
- Lưu ý: đề xuất hiển thị theo cấu hình hiện tại; khi tạo lô máy chủ vẫn kiểm tra cứng (recipe phải hợp lệ cho mọi Job).

## v262 - RECIPE TỰ CHỌN THEO CẤU HÌNH + HIỂN THỊ LIVE (không cần Rebuild)

- **Yêu cầu user**: "làm lại cấu hình recipe + process để khi chọn job vào lô sẽ tự hiển thị được recipe đúng của job theo cấu hình thiết lập" — chốt hướng A + B.
- **Nguyên nhân**: (1) Operation Code có NHIỀU recipe (`md_main_operation_recipe`) → hệ thống chỉ tự chọn khi ĐÚNG 1 recipe; cột `priority`/`is_default` có sẵn nhưng chưa được dùng → job hiện "RECIPE REQUIRED" dù đã cấu hình. (2) Recipe hiển thị lấy từ `planning_job_operation.recipe_key` (lúc Rebuild) → sửa cấu hình xong phải bấm Rebuild mới thấy.
- **Sửa A — tự chọn theo ưu tiên cấu hình** (code-only):
  - `src/lib/batch-key-recipe.ts`: thêm `pickBestRecipe` (priority nhỏ trước → is_default → updated_at cũ trước, không có cột id trong bảng) + `groupRecipeCandidates`/`toRecipeCandidates`.
  - `src/lib/planning/sync-planning-chains.ts`: Operation Code nhiều recipe → tự chọn `pickBestRecipe` (trước đây trả null).
  - `src/app/api/planning/batch/route.ts` (tạo lô): không có rule + job chưa có recipe → tự đề xuất recipe chung theo cấu hình; khác nhau → báo rõ.
  - `src/app/api/planning/batch/[id]/jobs/route.ts` (thêm job): lô chưa có recipe → tự điền recipe cho job theo cấu hình; nếu mọi job cùng recipe → tự gắn recipe cho lô (có Process Time).
- **Sửa B — hiển thị recipe theo cấu hình HIỆN TẠI**:
  - `src/lib/planning/live-recipe.ts` (mới): `loadLiveRecipeContext` (md_main_operation_recipe + md_part_process_recipe) + `effectiveRecipeKey` (cùng thứ tự: rule → paint theo Part+Rev → op code best).
  - `src/app/planning/page.tsx`: cột Recipe của Job CHƯA vào lô (ELIGIBLE) hiển thị theo cấu hình hiện tại; Job đã vào lô (PLANNED) giữ recipe thật của lô.
  - `src/app/planning/batches/[id]/page.tsx`: Job chưa có recipe trong danh sách "Add Jobs to Batch" → hiện recipe theo cấu hình hiện tại.
- **Không cần migration SQL** — code-only. Sau deploy: nên bấm Rebuild Chain 1 lần để mọi job có recipe chuẩn trong DB.

## v261 - MỞ TRANG = THẲNG VIEW ĐÃ LƯU (bỏ "hình 1" 169 cột nháy trước "hình 2")

- **Yêu cầu user**: "load hình đầu rồi mới đến hình sau, làm sao chỉ load hình 2 cho nhẹ" — mở Planning Board thấy 169 cột (server mặc định) rồi mới nhảy sang 57 cột (view đã lưu).
- **Nguyên nhân**: SSR + client render đầu hiện TOÀN BỘ cột; sau khi mount client mới fetch Default View máy chủ rồi áp dụng → nháy 2 trạng thái.
- **Sửa**: `planning/page.tsx` đọc Default View (planning_board_view, thứ tự OP→AREA→SYSTEM) NGAY Ở SSR → truyền `initialView` {columns, stView, filters, sortRules, density, routeFocus} xuống `PlanningBoardClient` → khởi tạo state từ đó → trang SSR ra thẳng "hình 2". Effect nạp view máy chủ vẫn giữ (đồng bộ khi đổi Area/Operation) nhưng lúc mở trang không đổi gì. Effect đọc localStorage cột bị bỏ qua khi đã có view từ SSR (tránh nháy ngược).
- **Kết quả**: mở trang = thẳng view đã lưu (57 cột, 74 công đoạn, freeze) — HTML nhỏ hơn, tải nhẹ hơn, không nháy. Freeze pane vẫn theo localStorage (chỉ hiện sau hydration, khác biệt nhỏ ở nhãn nút).

## v260 - FREEZE PANE KIỂU EXCEL (chọn vị trí → chốt)

- **Yêu cầu user**: làm lại freeze pane kiểu Excel — bật, chọn vị trí, chốt.
- **Kỹ thuật mới (không lặp lỗi v255–257)**: KHÔNG chạm render từng ô (không cloneElement/wrapper) — chỉ thêm class `candidate-freeze-on` + `data-fc` trên `<table>`; bề rộng cột THẬT đo bằng JS → CSS var `--fcws-N` (px lũy kế) → sticky `left` đúng từng pixel → hết cột trắng/cắt chữ.
- **Luồng dùng**: bấm 📌 Freeze Pane → thanh xanh hướng dẫn → click tiêu đề cột chọn vị trí → ghìm NGAY (vạch chia xanh) → ✓ Chốt (lưu localStorage `st-planning:freeze:v1`, mỗi máy/trình duyệt riêng) hoặc Hủy/ESC.
- **Khi đã ghìm**: nút hiện 📌 Freeze: &lt;cột&gt; → menu: Đổi vị trí… / Chỉ dòng tiêu đề / Không freeze.
- Nền ô ghìm đặc (giữ màu priority/row-selected/hover), vạch chia sau cột cuối, tối đa 16 cột. Kèm demo `demo-freeze-pane-v260.html` + hướng dẫn hình ảnh `HUONG_DAN_FREEZE_PANE.html`.

## v259 - GỠ NỐT CSS HARDCODE FREEZE CŨ (v122/v144/v155) + batch-detail

- **Yêu cầu user**: code vẫn còn hardcode freeze pane (sau v258).
- **Nguyên nhân**: v258 chỉ gỡ freeze MỚI (v255–257); 3 khối CSS freeze CŨ từ v122/v144/v155 vẫn còn trong globals.css — dính cứng 8 cột đầu bảng bằng `:nth-child` + bề rộng cố định + vạch chia — chính là thủ phạm gây cột trắng/lệch trước đây. `batch-detail-manager.tsx` còn class `planning-sticky-select`.
- **Đã sửa (v259, code-only)**: gỡ toàn bộ sticky/nth-child/divider của 3 khối CSS cũ; giữ viewport cuộn 2 chiều + Full View + density; gỡ class sticky trong batch-detail-manager. Bảng giờ cuộn tự do hoàn toàn (không cột dính, không header dính).

## v278 — Fix timeout trang Công thức & Rule

Đã sửa lỗi `Connection terminated due to connection timeout` khi mở `/recipe-operation-map`.

- Trang không còn tải trước toàn bộ giá trị unique của All Open Job và Master Data khi vừa mở (trước đây có thể quét bảng lớn và làm cạn/timeout kết nối PostgreSQL).
- Khi chọn điều kiện với toán tử `=`, hệ thống mới tải tối đa 500 giá trị unique của **đúng cột đang chọn**.
- Thêm API nội bộ `GET /api/config/recipe-condition-values?column=...` cho All Open Job, các cột Master Data và `MD:REQ:*`.
- Nếu danh sách giá trị tải lỗi, form vẫn hoạt động và hiển thị lỗi rõ ràng; không làm toàn bộ trang Công thức & Rule bị lỗi 500.

Không cần migration SQL mới.

## v279 — Fix nghẽn kết nối từ Planning Board

Đã xử lý nguyên nhân chính gây `timeout exceeded when trying to connect` trên các tab khác sau khi mở Planning Board.

- Loại bỏ Route Matrix SQL khổng lồ được chạy lặp cho từng Candidate Job (Routing Detail + lịch sử Batch/Schedule + `jsonb_agg`), vốn có thể giữ connection PostgreSQL 14–54 giây khi có nhiều Candidate.
- Planning Board vẫn giữ toàn bộ dữ liệu Candidate, trạng thái ELIGIBLE/PLANNED, Recipe hiệu lực, Batch, lọc, sắp xếp và thao tác tạo Batch như cũ.
- Route-detail chi tiết không còn được dựng sẵn cho mọi Job ngay lúc mở Board; đây là phần sẽ tách thành tải theo Job khi cần ở đợt cải tiến tiếp theo.
- Mục tiêu: mở Planning nhanh hơn, giải phóng connection kịp thời để Công thức & Rule và các tab khác không bị timeout.

Không cần migration SQL mới.
