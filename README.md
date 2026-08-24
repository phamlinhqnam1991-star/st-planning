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
