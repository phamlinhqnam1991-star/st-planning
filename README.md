## v355 — Process Recipe hỗ trợ nhập tay
- `+ Thêm Process Recipe` có 2 chế độ cho Recipe Group / Recipe No / Recipe Name: **Chọn từ Open Job** hoặc **Nhập tay**.
- Có thể trộn cách nhập giữa các field; field nhập tay lưu `source_column = NULL`, field chọn từ Open Job vẫn validate Column Values.
- Recipe No nhập tay dạng số vẫn padding 3 số (`5` → `005`).
- Không cần migration SQL mới.

## v352 — Multiple Recipe Rules + Batch Compatibility theo Rule ID
- Cùng Operation Code + Recipe được phép có nhiều Recipe Rule condition độc lập.
- `md_main_operation_recipe.mapping_id` là ID của Rule; Planning Board lưu `planning_batch.recipe_mapping_id` để Batch Compatibility dùng đúng condition của Rule đã match.
- Bắt buộc chạy migration `064_recipe_mapping_rule_identity.sql` trước khi deploy source v352.

# v342 — Fix duplicate key "uq_process_recipe_active_lookup" khi thêm Recipe cùng No khác Name

- Nền code: v341.
- **Lỗi**: thêm Recipe cùng `Process Family + Group + No` nhưng khác `Recipe Name` → `duplicate key value violates unique constraint "uq_process_recipe_active_lookup"`.
- **Nguyên nhân**: migration 012 (H) cố tình tạo `unique(process_family, recipe_group, recipe_no) where is_active` — "chỉ 1 recipe ACTIVE cho mỗi No" — mâu thuẫn với logic v340 (1 No nhiều Name).
- **Fix**: migration `061_recipe_no_multi_name_lookup.sql` — đổi index thành `unique(family, group, no, upper(trim(coalesce(recipe_name,'')))) where is_active` → cùng No khác Name được phép cùng active; cùng No + cùng Name (không phân biệt hoa/thường) vẫn bị chặn trùng. Rollback kèm theo.
- **Thứ tự deploy**: chạy migration 061 TRƯỚC code v340/v342.

# v341 — Tối ưu tốc độ mở trang Công thức & Rule

- Nền code: v340.
- **Trước**: mỗi lần mở trang chạy 13 query, trong đó 2 query quét `md_process_requirement` (**2.1M rows**) — đặc biệt query giá trị MD:REQ có thể trả về hàng trăm nghìn row → payload khổng lồ, mở trang rất chậm.
- **Sau**:
  - `masterValuesQ` bỏ nhánh `REQ:` (chỉ còn md_part + md_material_finish — nhỏ).
  - Danh sách requirement_code cache **5 phút** (`unstable_cache`, tag `config-recipe`), refresh sau Import Master.
  - Giá trị của từng mã yêu cầu **lazy-load** qua endpoint mới `GET /api/config/recipe-condition-values?column=MD:REQ:<code>` — chỉ fetch khi người dùng chọn cột MD:REQ trong builder "Áp dụng cho Job" (có trạng thái "Đang tải giá trị...").
- **Migration bắt buộc**: `supabase/migrations/060_process_requirement_lookup_indexes.sql` — 2 index cho md_process_requirement (tránh seq-scan 2.1M rows). Có rollback kèm theo.

# v340 — Danh mục Recipe: 1 Recipe No có thể có nhiều Recipe Name

- Nền code: v339.
- `POST /api/process-recipe` (② Danh mục Recipe):
  - **Cùng No + cùng Name** → cập nhật/reactivate recipe đã có (hành vi cũ giữ nguyên).
  - **Cùng No + khác Name** → tạo **Recipe mới (variant)**: `recipe_key = family|group|no|NAME` — 1 Recipe No giờ có thể có nhiều Recipe Name, mỗi tên là 1 Recipe độc lập (mapping ①, Batch, lịch sử riêng).
  - **Chưa có No** → tạo mới key canonical `family|group|no` (giữ cũ).
  - Không nhập Name khi No đã tồn tại → báo lỗi hướng dẫn nhập Name; Recipe Name không được chứa `|` (vì đi vào recipe_key + batch_key).
- UI: thêm hint trên form "+ Thêm Process Recipe" giải thích quy tắc.
- Không có migration mới (md_process_recipe.recipe_key là PK, không unique theo No — API tự enforce).

# v339 — Lọc cột kiểu Excel (mũi tên ▼ trên header MỌI cột)

- Nền code: v338.
- Mỗi header cột (Job, Part/Rev, Qty, Surface, LastLaborOp, NextOperation, Priority, Current Main, AllOperation, mọi cột All Open Source, mọi cột Main Planning/Route Matrix) có nút **▼**:
  - Bấm ▼ → popup kiểu Excel: ô tìm kiếm, **Chọn hết / Bỏ hết**, bộ đếm `n/tổng`, danh sách **giá trị distinct** dạng checkbox (lọc live khi tick).
  - Nút ▼ chuyển **xanh** khi cột đang có filter.
  - Kết hợp nhiều cột cùng lúc (AND); bấm ▼ lần nữa để chỉnh, ESC/click ngoài để đóng.
- Cột route (Main Planning): giá trị = trạng thái từng occurrence (READY/PLANNED/DONE/…, `—` nếu không có occurrence).
- Filter lưu cùng Default View (`filters.colFilters`), tương thích ngược preset cũ.
- Popup dùng fixed overlay nên không bị cắt bởi scroll container; vị trí bám theo header cột.
- Không có migration mới.

# v338 — Lọc theo trạng thái từng cột Main Planning (Route Matrix)

- Nền code: v337.
- Panel **Sort / Filter → "Main Planning (Route Matrix)"**: mỗi cột Main Planning (CMSA, CPBILP, PRIMER, TOPCOAT1…) có 1 dropdown lọc theo trạng thái của cột đó: `All / Có occurrence / Không occurrence / READY / PLANNED / PLANNED-UNSCHEDULED / SCHEDULED / RUNNING / HOLD / COMPLETED / DONE / WAITING`.
- Kết hợp nhiều cột cùng lúc (AND); nút "Xóa hết" để bỏ toàn bộ.
- Filter được lưu cùng Default View (`filters.routeMain`), tương thích ngược với preset cũ.
- Lưu ý: lọc theo trạng thái cột cần dữ liệu Route Matrix — nếu bảng đang trống khi vừa đặt lọc, Route Matrix sẽ tải xong và các dòng hiện ra.
- Không có migration mới.

# v337 — Fix dòng priority chẵn mất tint khi Freeze Pane bật

- Nền code: v336.
- Bug: khi freeze bật, dòng priority ở vị trí **CHẴN** (vd CAT5) hiển thị màu zebra `#fcfdff` thay vì màu priority trên các ô đóng băng → "cùng CAT5 nhưng dòng vàng, dòng không vàng".
- Nguyên nhân: rule khôi phục zebra dòng chẵn `[data-fc] tbody tr:nth-child(even) td:nth-child(-n+K)` có specificity `(0,5,3)` **cao hơn** rule khôi phục tint `[data-fc] tr.priority-*>td:nth-child(-n+K)` `(0,5,2)` → zebra thắng trên ô đóng băng của dòng chẵn.
- Fix: thêm `tbody` vào 64 rule tint trong vùng freeze → `(0,5,3)` = zebra, đứng sau trong block → tint thắng theo thứ tự. Hành vi khớp với trạng thái không freeze (TD tint phủ TR zebra).
- Đã verify bằng computed style trên mock đầy đủ CSS thật: dòng chẵn/lẻ CAT5 đều vàng, dòng thường vẫn zebra.
- Không có migration mới.

# v336 — Fix highlight cột Priority khi Freeze Pane bật

- Nền code: v335.
- Bug: khi cột Priority nằm trong vùng Freeze Pane (`candidate-freeze-on`), màu đậm của cell priority (vd `#ffd9d6` cho CAT3) bị override tint dòng khi freeze nuốt mất (specificity `(0,5,2)` > `(0,5,1)`) → cell chỉ còn màu nhạt, mất nổi bật.
- Fix: thêm override strong với `:not(.x)` để nâng specificity lên `(0,5,3)`, thắng lại tint dòng khi freeze. Đã verify bằng computed style trên mock dựng từ CSS thật.
- Không có migration mới.

# v335 — Fallback Ambiguous: mở READY các Main bị mơ hồ occurrence

- Nền code: v334.
- Resolver `allOperationFallbackAnchor`: khi cặp `LastLaborOp + NextOperation` khớp trong AllOperation nhưng dẫn tới **nhiều occurrence Main khác nhau** (`byTarget.size>1`) — thay vì NO CHAIN, trả anchor `ALLOPERATION_AMBIGUOUS`:
  - Chain mở từ **occurrence Main sớm nhất** trong tập candidate, gồm luôn các Main phía sau (plan-ahead v312).
  - Mọi Main chưa có Batch → `ELIGIBLE` (UI READY, chọn được); Main đã có Batch → `PLANNED` theo lịch sử.
- **Giữ NO CHAIN** cho các trường hợp còn lại: NextOperation trống, route không có Main Planning nào (`full` rỗng), Bridge khớp nhưng segment mơ hồ, direct rescue không định vị được.
- Không có migration mới. Sau deploy vào Planning Board bấm **Rebuild Chain** một lần.

# v334 — Chip lọc trạng thái Candidate (ELIGIBLE / PLANNED / WAIT / NO CHAIN)

- Nền code: v333.
- Toolbar Candidate Jobs: các con số `ELIGIBLE · PLANNED · WAIT · NO CHAIN` giờ là **nút lọc bấm được** — bấm 1 lần lọc bảng theo đúng trạng thái đó, bấm lại (hoặc bấm "Tất cả N job") để bỏ lọc.
- `NO CHAIN` = Job mở nhưng resolver chain (MANUAL → AUTO → AllOperation fallback) không định vị được Main hợp lệ; job vẫn hiện trên board với Current Main "NO CHAIN", không chọn được.
- Không có migration mới.

# v333 — Trang đăng nhập + nút Đăng xuất (fix 401 trên Vercel)

- Nền code: v332.
- **Vấn đề**: mọi API route yêu cầu Supabase session (`requireApiUser`) nhưng app **không có trang đăng nhập** (`/login` chỉ redirect, `login-form` là dead code) → trên production không thể tạo session → mọi API trả 401 "Phiên đăng nhập đã hết hạn".
- **Fix**:
  - `src/components/login-form.tsx` (client): đăng nhập email/password qua `supabase.auth.signInWithPassword`, redirect `/planning`.
  - `src/app/login/page.tsx`: render form; đã có session thì redirect thẳng `/planning`.
  - `src/components/logout-button.tsx`: `signOut()` → `/login`, gắn vào header Planning Board.
- **Yêu cầu cấu hình** (không phải migration):
  - Supabase: Authentication → Providers → **Email** bật.
  - Tạo user: Authentication → Users → Add user (email + password).
  - Vercel: `ADMIN_EMAILS` (nếu set) phải chứa email đăng nhập, nếu không API trả 403.

# v332 — Tạo/Thêm Batch nhanh hơn nhiều (gộp SQL + bỏ full reload)

- Nền code: v331.
- **Server (`POST /api/planning/batch`)**:
  - Dùng `getCachedLiveRecipeContext` (cache 60s) thay vì `loadLiveRecipeContext` — không đọc lại 5 bảng recipe/master mỗi lần tạo Batch.
  - Check `recipeAllowedForJob` từ vòng lặp N query → **1 query set-based** cho mọi Job.
  - Insert `planning_batch_job` + update status từ 2×N round-trip → **1 INSERT (unnest) + 1 UPDATE (id=any)** cho cả nhánh tạo mới lẫn thêm vào batch có sẵn.
  - Trên DB mạng (Supabase/Vercel, mỗi round-trip 10-50ms), N=50 Job → tiết kiệm hàng giây.
- **Client (Planning Board)**:
  - Bỏ `location.reload()` sau khi tạo/rebuild → refresh **tại chỗ**: `onReloadCandidates()` (tải lại Candidates, không reload trang) + `refreshDeferredData()` (`/api/planning/deferred-data` — cập nhật Target Batch dropdown + Công đoạn ST).
  - Clear selection sau khi tạo Batch.
- Không có migration mới; không đổi contract API trả về.
- Lưu ý: `src/app/api/planning/batch/[id]/jobs` (Batch Detail thêm job) vẫn dùng vòng lặp per-job như cũ — có thể áp dụng pattern tương tự sau nếu cần.

# v331 — Revert về chunk + lazy (v328) kèm 2 fix jank

- Nền code: v330 (thử nghiệm all-in-one + render hết — **đo thực tế CHẬM hơn** trên dữ liệu production, đã revert).
- **Revert**: tải Candidate về chunked 200/page render dần (v328) + progressive DOM 100 dòng/IntersectionObserver (v298) + Route Matrix lazy theo dòng đang xem.
- **Fix 1 — gộp cập nhật Route Matrix**: trước đây mỗi chunk route-status (60 id) `setCandidates` 1 lần → cả bảng re-render N lần; giờ gom hết vào 1 Map và **setCandidates 1 lần duy nhất** sau khi tất cả worker xong.
- **Fix 2 — row key ổn định**: key dòng từ `id-job-op-sourceCode-rowIndex` → chỉ còn `job_num` → React tái sử dụng DOM, không remount cả bảng khi filter/status đổi.
- Giữ nguyên v329 (SSR preload metadata) + v324 (light + source columns nền) + v325 (timeout probe).
- Không có migration mới; không đổi business API.

# v330 — Bỏ chunk & lazy, hiện tất cả Candidate trên 1 trang (ĐÃ REVERT ở v331 — đo chậm hơn)

- Nền code: v329.
- `planning-candidate-shell.tsx`: bỏ progressive chunked load (v328) — 1 request duy nhất `pageSize=all` trả **toàn bộ Candidate**; xóa `loadingMore`, notice "Đang tải tiếp Jobs…".
- `planning-board-client.tsx`: bỏ progressive DOM (v298: 100 dòng + IntersectionObserver) — **render toàn bộ** dòng cùng lúc; xóa sentinel + `candidateDomLimit`.
- Route Matrix: vì mọi dòng render ngay nên visibility effect kích hoạt 1 lần với **toàn bộ id** → status tải ngay sau load (endpoint route-status vẫn tự chunk 60 id/pool 3 bên trong).
- Cột All Open Source vẫn light + fetch nền 1 lần cho tất cả job (giữ — nếu gộp vào payload chính sẽ làm request nặng thêm ~2.8MB, bảng vẽ chậm hơn).
- Vẫn giữ timeout 60s client / 58s server + probe tự chẩn đoán.
- Không có migration mới; không đổi business API.

# v329 — SSR preload Candidate metadata (Planning Board mở nhanh hơn)

- Nền code: v328 (bản sau cleanup 2026-08-31).
- `/planning` SSR chạy `loadPlanningCandidateMetadata` (2 query nhẹ: Recipe dropdown + Time Rules Batch panel) song song với view/static data, truyền thẳng vào `initial.recipeOptions` / `initial.timeRules`.
- Bộ lọc (Recipe dropdown, Time Rules) dùng được ngay từ HTML đầu tiên, không còn chờ query Candidate nặng.
- Load Candidate giữ nguyên v324 light + v328 chunked; Route Matrix / cột All Open Source vẫn lazy.
- Message loading đổi "Đang tải Candidate metadata…" → "Đang tải Candidate Jobs…".
- Không có migration mới; không đổi business API.

# v313 — NO_CHAIN rescue: NextOperation Main = Current Main

- Nền code: v312.
- Giữ nguyên resolver hiện tại; chỉ bổ sung fallback cuối trước khi kết luận `NO CHAIN`.
- Nếu kết quả chuẩn vẫn là `NO_CHAIN` nhưng `NextOperation` chính là một Main Planning occurrence hợp lệ của Job, **Main đó là Current Main**.
- Nếu `NextOperation` xuất hiện lặp lại trong `AllOperation`, chỉ dùng `LastLaborOp` để định vị occurrence; nếu vẫn còn nhiều occurrence thì không đoán.
- Sau khi Current Main được xác định, **Next Main Planning = các Main tiếp theo trong chính `AllOperation` của Job** sau chuẩn hóa Mapping + Planning Scope.
- Nếu `LastLaborOp` rỗng/stale nhưng `NextOperation` là một Main Planning occurrence duy nhất, vẫn lấy `NextOperation` làm Current Main.
- Current Main và toàn bộ Next Main(s) tiếp tục theo logic v312: chưa có Batch = `READY`, có Batch = `PLANNED`; Schedule chỉ hiển thị trạng thái thực tế, không gate plan-ahead.
- Không thay Recipe, Batch Key, Auto/Manual Bridge discovery, Schedule engine.
- Không có migration SQL mới. Sau deploy bấm **Rebuild Chain** một lần.

Xem chi tiết: `docs/PLANNING_NEXTOP_MAIN_NO_CHAIN_RESCUE_V313.md`.

# v312 — Plan-ahead: Current + all Next Main READY

- Nền code: v311.
- Vị trí Job vẫn giữ nguyên resolver: `MANUAL Segment → AUTO Segment → AllOperation fallback → NO CHAIN`, chỉ dùng `LastLaborOp + NextOperation` để định vị.
- Sau khi xác định Current Main, **Current Main và tất cả Next Main phía sau đều `ELIGIBLE` / UI `READY` mặc định** nếu chưa có Batch.
- Không còn `LOCKED / WAIT PREV` vì Main trước chưa Schedule; hỗ trợ tạo Batch plan-ahead cho nhiều Main phía sau.
- Main có Batch active vẫn giữ `PLANNED`; Route Matrix ưu tiên hiển thị trạng thái Schedule thực tế `SCHEDULED / RUNNING / HOLD / COMPLETED`.
- Main phía trước Current giữ lịch sử thực tế: có Schedule → trạng thái Schedule; có Batch chưa Schedule → `PLANNED-UNSCHEDULED`; không có history → `DONE` theo progress.
- Đã loại bỏ helper Schedule-handoff cũ; Scheduling không còn mở khóa Main kế tiếp.
- Không đổi Recipe, Batch Key, Auto/Manual Bridge discovery hay Scheduling engine.
- Không có migration mới. Sau deploy bấm **Rebuild Chain** một lần.

Xem chi tiết: `docs/PLANNING_PLAN_AHEAD_ALL_READY_V312.md`.

# v311 — AllOperation first-Main fallback fix

- Nền code: v310.
- Resolver giữ nguyên thứ tự: `MANUAL Segment → AUTO Segment → AllOperation fallback → NO CHAIN`.
- Khi không Segment nào match và cả `LastLaborOp` lẫn `NextOperation` đều không xuất hiện trong `AllOperation`, nhưng canonical route vẫn có Main Planning, hệ thống lấy **Main Planning đầu tiên** làm `Current Main`.
- Main đầu tiên này có `requiredPreviousInstanceKey = null`, nên nếu chưa có Batch history thì trạng thái là `ELIGIBLE` / UI hiển thị `READY`.
- Ví dụ `AllOperation = CPBILP-A | PIONBL | TSAUNSLD | PPRSLVT | ...`, `LastLaborOp=INSMA`, `NextOperation=MSKG-PC` → `Current Main = CPBILP-A`, `READY`.
- Chỉ trả `NO CHAIN` khi Segment không match và AllOperation/canonical route không còn xác định được Main Planning hợp lệ.
- Schedule/Batch history vẫn không dùng để định vị Current Main.
- Không có migration mới. Sau deploy bấm **Rebuild Chain** một lần.

Xem chi tiết: `docs/PLANNING_ALLOPERATION_FIRST_MAIN_FALLBACK_V311.md`.

# v310 — Segment → AllOperation nearest-Main fallback → NO CHAIN

- Nền code: v309.
- Vị trí Job vẫn chỉ dùng `LastLaborOp + NextOperation` từ All Open Job.
- Thứ tự resolver mới: `MANUAL Segment → AUTO Segment → AllOperation fallback → NO CHAIN`.
- Chỉ khi **không Segment nào match**, hệ thống mới xem `AllOperation` của chính Job.
- AllOperation fallback lấy **Main Planning upcoming gần nhất** từ vị trí pair; hỗ trợ trường hợp một Intermediate không tồn tại trong AllOperation bằng occurrence duy nhất của thành viên còn lại trong pair.
- Nếu nhiều occurrence dẫn tới nhiều Current Main khác nhau hoặc không còn Main hợp lệ → `NO CHAIN`, không tự đoán.
- Schedule/Batch history chỉ tính `ELIGIBLE / LOCKED / PLANNED / SCHEDULED`, không dùng để định vị Current Main.
- Không có migration mới. Sau deploy bấm **Rebuild Chain** một lần.

Xem chi tiết: `docs/PLANNING_ALLOPERATION_NEAREST_MAIN_FALLBACK_V310.md`.

# v309 — Manual Intermediate Bridge Segments

- Nền code: v308.
- Thêm `MANUAL` Intermediate Bridge Segment dùng chung model với `AUTO_ROUTING`.
- UI ST Operation Flow có form Manual: Previous Main → ordered Intermediate Operations → Next Main, Priority, Note.
- Có Sửa / Ngưng Manual Segment; filter `Tất cả / AUTO / MANUAL`.
- Resolver vẫn chỉ dùng `LastLaborOp + NextOperation` để định vị physical position.
- Thứ tự rule: `MANUAL > AUTO_ROUTING`; nếu nhiều MANUAL cùng match thì priority lớn hơn thắng.
- Schedule history chỉ tính READY/WAIT/PLANNED/SCHEDULED, không dùng để chọn Segment.
- Full/Incremental Auto Bridge rebuild chỉ thay `AUTO_ROUTING`; Manual không bị xóa hoặc overwrite.
- Sau thay đổi Manual cần `Rebuild Chain` để áp dụng cho Candidate hiện tại.

## Migration bắt buộc

`supabase/migrations/056_manual_intermediate_bridge_segments.sql`

Sau deploy:
1. Chạy migration 056.
2. Vào **Cấu hình → ST Operation Flow → Intermediate Bridge Segments · AUTO + MANUAL**.
3. Tạo Manual Segment nếu cần ngoại lệ.
4. Vào Planning Board bấm **Rebuild Chain** một lần sau khi thay đổi Manual.

# v307 — Auto Bridge Same-Main Occurrence Finalize Fix

- Nền code: v306.
- Sửa lỗi Finalize: `md_intermediate_bridge_segment_prev_next_check` chặn Segment hợp lệ khi cùng một Main Planning xuất hiện lặp lại ở hai occurrence khác nhau.
- Cho phép `Previous Main = Next Main` **theo tên** nếu route evidence có `previous_main_seq < next_main_seq`.
- Finalize v307 kiểm tra staging trước khi publish:
  - Previous/Next Main không được rỗng.
  - `previous_main_seq < next_main_seq`.
- Không cần chạy lại 2.833 routing đã xử lý nếu staging/run hiện tại vẫn còn; sau khi chạy migration 055 có thể bấm `Finalize Bridge` lại.
- Không đổi discovery, chunk/resume/staging, Planning Chain, Recipe, Batch hay Schedule.

## Migration bắt buộc

`supabase/migrations/055_intermediate_bridge_same_main_occurrence.sql`

Sau deploy:
1. Chạy migration 055.
2. Mở lại ST Operation Flow.
3. Với run đã 100%, bấm `Finalize Bridge`.
4. Sau khi publish thành công, nếu Bridge thay đổi thì vào Planning Board bấm `Rebuild Chain` một lần.

# v306 — Auto Bridge 100% Finalize / Resume Fix

- Nền code: v305.
- Sửa trường hợp Full Rebuild đã `processed_routings = total_routings` nhưng run đứng ở `READY_TO_FINALIZE`/`FAILED` và không publish được Bridge ACTIVE.
- Finalize không còn phụ thuộc cứng vào status UI cũ; DB kiểm tra trực tiếp `md_intermediate_bridge_rebuild_route.processed_at`.
- Nếu `remaining_rows = 0`, Finalize được retry an toàn và chuyển run sang `FINALIZING`, kể cả lần Finalize trước đã làm run thành `FAILED`.
- Nếu vẫn còn route chưa xử lý, API trả đúng số `remaining` và đồng bộ lại `processed_routings`.
- Client refresh lại run thật từ API sau lỗi để không giữ state `READY_TO_FINALIZE` cũ khi DB đã đổi trạng thái.
- Khi đã 100%, nút đổi thành `✓ Finalize Bridge`. Không cần chạy lại 2.833 routing hiện có.
- Không có migration mới; giữ migration 053.

# v305 — Auto Bridge quét toàn bộ ST Routing Chain Standardized

- Nền code: v304 của người dùng.
- Sửa gốc phạm vi Full Rebuild: không còn giới hạn `md_st_routing_summary.is_active=true`.
- Full Rebuild lấy **mọi `routing_code` có row `md_st_routing.is_active=true`** trong `ST Routing Chain · Standardized`.
- Lý do: `md_st_routing_summary.is_active` chỉ phản ánh route hiện đang được Part/Revision active sử dụng; các routing pattern Standardized khác vẫn là nguồn hợp lệ để suy ra Intermediate Bridge Segment.
- Mỗi chunk vẫn 150 routing/request, có Resume + Staging + Atomic Finalize nên số route lớn không gây timeout một request.
- Trong từng routing: sort `seq`; Main nhận từ cấu hình Planning + live Mapping; mọi `operation_code` không phải Main nằm giữa 2 Main liên tiếp là Intermediate; `PIONBL`/alias PIONBL bị skip.
- Không có migration mới. Giữ migration `053_intermediate_bridge_chunked_rebuild.sql`.
- Sau deploy phải chạy **Full Rebuild Auto Bridge Segments** mới để snapshot lại toàn bộ routing_code Standardized.

# v302 — Fix Auto Bridge chỉ còn 1 Segment

- Full Rebuild 259/259 routing đã chạy đúng; lỗi nằm ở phân loại Main/Intermediate.
- Main occurrence bây giờ được xác định duy nhất bằng: `operation_code → deterministic live mapping → standard_operation ∈ md_planning_operation_scope`.
- Không dùng `md_st_routing.standard_operation` làm source of truth.
- Không thêm gate phụ `md_st_operation_scope.operation_type` vào việc nhận Main của Auto Bridge.
- Mọi raw operation không phải Main và nằm giữa hai Main liên tiếp được giữ trong ordered Intermediate signature theo `seq`.
- `ST_SCOPE_ONLY` vẫn không trở thành Planning Main/Batch; nếu nằm vật lý giữa hai Main, nó chỉ được dùng như bridge marker để định vị đoạn route.
- `PIONBL` và raw alias map về Main `PIONBL` bị skip khỏi Intermediate signature.
- Chunk/Resume/Staging/Atomic Finalize của v298-v301 giữ nguyên.
- Không có migration mới. Sau deploy cần Full `Rebuild Auto Bridge Segments` lại một lần.

# v300 — Fix Auto Bridge chỉ tạo 1 Segment

- Xác nhận Full Rebuild đã xử lý đủ 259/259 routing; chunk 150 + 109 hoạt động đúng.
- Lỗi nằm ở Auto Discover: v299 dùng `md_st_routing.standard_operation` đã materialize/stale để nhận Main Planning.
- v300 chỉ dùng `md_st_routing` làm nguồn `routing_code + seq + operation_code`; Main được standardize lại từ Mapping live + Planning Scope bằng cùng priority/rule với Planning Chain.
- Hỗ trợ PRIMER/PRIMER2/PRIMER3, TOPCOAT1/TOPCOAT2, HE-BAKE sequence và DIRECT mapping.
- Không thay thuật toán Segment: Previous Main + ordered Intermediate Operations + Next Main; PIONBL/ST_SCOPE_ONLY vẫn loại.
- Không có migration mới. Sau deploy, chạy Full `Rebuild Auto Bridge Segments` lại.

# v299 — Fix Auto Bridge Rebuild RUNNING/integer parameter order

- Sửa lỗi Start Rebuild: PostgreSQL `invalid input syntax for type integer: "RUNNING"`.
- Nguyên nhân: tham số `status` và `total_routings` bị truyền đảo thứ tự trong `startIntermediateBridgeRebuild()`.
- Giữ nguyên toàn bộ kiến trúc v298: chunked + resumable + staging + atomic finalize + incremental.
- Không có migration mới. Nếu đã chạy `053_intermediate_bridge_chunked_rebuild.sql` thì không cần chạy SQL thêm.

# v298 — Chunked / resumable Auto Bridge rebuild

- `Rebuild Auto Bridge Segments` chạy 150 routing/request, có progress + Resume + Cancel.
- Staging theo `run_id`; Planning Board tiếp tục dùng Bridge ACTIVE cũ đến khi Finalize atomically.
- Master Import tạo Incremental Bridge run chỉ cho routing signature thay đổi.
- Migration mới: `053_intermediate_bridge_chunked_rebuild.sql`.

# v297 — Fully Auto Intermediate Bridge Segments

Bản này kế thừa toàn bộ logic đến v296 và thay cơ chế INTERMEDIATE cấu hình tay bằng AUTO inference.

## Logic chuẩn

Planner chỉ cấu hình:

- `PLANNING_OPERATION` (Source → Main Planning + Area/Schedule/Planner),
- `ST_SCOPE_ONLY`.

Không còn chọn `INTERMEDIATE` bằng tay.

Hệ thống dựng **ST Routing Chain · Standardized** từ toàn bộ raw operation nằm trong khoảng từ Main Planning đầu tiên đến Main Planning cuối cùng của từng Part/Revision. Sau đó, theo từng `routing_code` và `seq`:

1. Xác định các row Main Planning từ `standard_operation` + `md_planning_operation_scope`.
2. Lấy từng cặp Main Planning liên tiếp.
3. Mọi `operation_code` nằm giữa hai Main được suy ra là Intermediate.
4. Loại `PIONBL` và `ST_SCOPE_ONLY` khỏi Intermediate sequence.
5. Tạo Bridge Variant theo `Previous Main + ordered Intermediate Operations + Next Main`.
6. Giữ nguyên operation lặp lại; một operation có thể thuộc nhiều Segment.

## UI

Trong **Cấu hình → ST Operation Flow**:

- Auto Intermediate hiển thị read-only.
- Không có option `INTERMEDIATE` trong form.
- Có nút **Rebuild Auto Bridge Segments**.

## Database

Chạy migration:

`052_auto_intermediate_from_main_routing.sql`

Sau deploy, bấm **Rebuild Auto Bridge Segments** một lần.

Batch/Schedule history không bị xóa.


## v303 - Auto Bridge canonical Planning Source fix
- Auto Bridge chỉ coi một `operation_code` là Main khi chính Source Operation đó đang active trong `md_st_operation_scope` với `operation_type=PLANNING_OPERATION`, sau đó dùng deterministic live mapping và kiểm tra `md_planning_operation_scope`.
- Mọi raw `operation_code` khác nằm giữa hai Main liên tiếp trong cùng `routing_code`, theo `seq`, được suy ra là Intermediate.
- Không dùng helper/stale mapping của Intermediate để nâng Intermediate thành Main.
- `PIONBL` và alias map về `PIONBL` vẫn skip.
- Progress mỗi chunk hiện thêm số Main occurrence, số route có >=2 Main, số segment tìm thấy và số Planning source mapping để chẩn đoán trực tiếp.
- Không có migration mới so với v302/v301; giữ nguyên migration 053 cho chunk/resume/staging.

## v308 — Current Main theo LastLaborOp + NextOperation

Planning Chain/Candidate định vị vị trí Job chỉ bằng cặp `LastLaborOp + NextOperation` từ All Open Job. Cặp này được match trực tiếp trong `AllOperation` hoặc trong Auto Intermediate Bridge ACTIVE. Không còn fallback dùng một field đơn lẻ hay Schedule history để đoán Current Main. Candidate lấy row đầu của live chain làm Current Main; các Main phía sau vẫn chọn được trong Route Matrix để tạo Batch. Không cần migration mới.

### V345 · Next Operation Sort
- `Next Op Sort` được quản lý ở cấp RAW Operation Code (`md_operation.planning_sort_order`) và dùng để sort `NextOperation` trên Planning Board.
- Cho phép đặt thứ tự cho cả Planning Operation, ST_SCOPE_ONLY và Bridge Intermediate.
- Độc lập hoàn toàn với Main Planning Order / READY-WAIT / Planning Chain; đổi Next Op Sort không rebuild chain.

## v354 - Job Tracker
- Thêm tab Job Tracker (`/job-tracker`).
- Tra cứu theo Job Number/Part/Description.
- Gom Routing, Planning status, Recipe Rule, Batch, Process Time, Schedule, Resource, Chemical phases, All Open Job source data, Master routing, history và handover vào một màn hình read-only.
- Không cần migration SQL mới.
