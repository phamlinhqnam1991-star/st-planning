# TRIỂN KHAI v313 — NEXTOP MAIN / NO_CHAIN RESCUE

1. Deploy code v313.
2. **Không có migration SQL mới**; giữ toàn bộ migration hiện có đến `056`.
3. Vào Planning Board bấm **Rebuild Chain** một lần.
4. Resolver cũ vẫn chạy trước. Chỉ khi sắp trả `NO CHAIN`, hệ thống kiểm tra `NextOperation`.
5. Nếu `NextOperation` là Main Planning occurrence hợp lệ, nó chính là **Current Main**.
6. **Next Main Planning** lấy từ các Main tiếp theo trong `AllOperation` của chính Job, theo Mapping + Planning Scope hiện tại.
7. Nếu NextOperation lặp lại nhiều occurrence, hệ thống dùng `LastLaborOp` để xác định occurrence; còn mơ hồ thì vẫn `NO CHAIN`, không đoán.
8. Không đổi logic v312: Current + toàn bộ Next Main(s) chưa có Batch đều `READY` để plan-ahead.
9. Không đổi Recipe / Batch Key / Manual-Auto Bridge / Scheduling.

---

# TRIỂN KHAI v312 — PLAN-AHEAD ALL MAIN READY

1. Deploy code v312.
2. **Không có migration SQL mới**; giữ toàn bộ migration hiện có đến `056`.
3. Vào Planning Board bấm **Rebuild Chain** một lần để đổi các chain cũ từ `LOCKED` sang logic plan-ahead mới.
4. Resolver vị trí không đổi: `MANUAL Segment → AUTO Segment → AllOperation fallback → NO CHAIN`, dùng `LastLaborOp + NextOperation`.
5. Từ `Current Main` trở về sau: chưa có Batch = `READY`; có Batch chưa Schedule = `PLANNED-UNSCHEDULED`; có Schedule = trạng thái Schedule thực tế.
6. Main phía trước Current: giữ `SCHEDULED/COMPLETED` hoặc `PLANNED-UNSCHEDULED` nếu có history; nếu không có history thì `DONE`.
7. Không còn yêu cầu Main trước phải Schedule để Main sau READY.
8. Không đổi Recipe, Batch Key, Auto/Manual Bridge hoặc thuật toán Scheduling.

---

# TRIỂN KHAI v311 — ALLOPERATION FIRST MAIN FALLBACK

1. Deploy code v311.
2. **Không có migration SQL mới**; giữ toàn bộ migration hiện có đến `056`.
3. Vào Planning Board bấm **Rebuild Chain** một lần.
4. Resolver vẫn là `MANUAL Segment → AUTO Segment → AllOperation fallback → NO CHAIN`.
5. Nếu cả `LastLaborOp` và `NextOperation` đều không có trong `AllOperation`, nhưng route chuẩn hóa có Main Planning, lấy **Main Planning đầu tiên** làm Current Main và cho `READY` nếu chưa có Batch history.
6. Chỉ `NO CHAIN` khi không còn Main Planning hợp lệ để dựng chain.
7. Không thay Recipe, Batch, Schedule hoặc Auto Bridge.

---

# TRIỂN KHAI v310 — ALLOPERATION FALLBACK / NO CHAIN

1. Deploy code v310.
2. **Không có migration SQL mới**. Giữ toàn bộ migration đến `056`.
3. Vào Planning Board bấm **Rebuild Chain** một lần.
4. Resolver dùng đúng thứ tự: `MANUAL Segment → AUTO Segment → AllOperation fallback → NO CHAIN`.
5. AllOperation fallback chỉ chạy khi không có Segment match `LastLaborOp + NextOperation`.
6. Nếu fallback không xác định duy nhất được Main Planning upcoming gần nhất, Job hiển thị `NO CHAIN`.
7. Schedule history không dùng để chọn Current Main; chỉ dùng tính trạng thái READY/WAIT/PLANNED/SCHEDULED.

---

# TRIỂN KHAI v309 — MANUAL INTERMEDIATE BRIDGE

1. Deploy code v309.
2. Chạy migration `056_manual_intermediate_bridge_segments.sql`.
3. Vào **Cấu hình → ST Operation Flow**.
4. Ở khu vực **Intermediate Bridge Segments · AUTO + MANUAL**, dùng **＋ Manual Bridge Segment** cho ngoại lệ.
5. Nhập `Previous Main`, danh sách Intermediate theo đúng thứ tự, `Next Main`, Priority và Note.
6. Manual có ưu tiên cao hơn Auto; priority lớn hơn thắng giữa các Manual cùng match.
7. Auto Rebuild không xóa Manual.
8. Sau khi thêm/sửa/ngưng Manual Segment, vào Planning Board bấm **Rebuild Chain** để áp dụng cho Candidate hiện tại.
9. Vị trí Job vẫn chỉ được xác định bằng `LastLaborOp + NextOperation`; Schedule history không dùng để đoán vị trí.

---

# TRIỂN KHAI v305 — AUTO BRIDGE ĐỌC TOÀN BỘ ST ROUTING CHAIN

1. Dùng code v305 làm nền mới. Không cần migration SQL mới nếu đã có migration 053.
2. Vào **Cấu hình → ST Operation Flow**.
3. Nếu còn run dở từ bản cũ, chọn **Hủy & làm lại** để tạo FULL run mới.
4. Bấm **Rebuild Auto Bridge Segments**.
5. Total routing lần này lấy từ `select count(distinct routing_code) from md_st_routing where is_active=true`, không còn lấy từ Routing Summary active. Vì vậy Total có thể lớn hơn 259 rất nhiều.
6. Hệ thống vẫn chạy 150 routing/request và tự tiếp tục đến 100%, sau đó Finalize atomic.
7. Kiểm tra `segment active`. Nếu Bridge thay đổi, sang Planning Board bấm **Rebuild Chain** một lần.

SQL kiểm tra nguồn FULL run mới:

```sql
select
  count(*) as routing_step_rows,
  count(distinct routing_code) as routing_codes
from md_st_routing
where is_active=true;
```

Số `total_routings` của run FULL mới phải bằng `routing_codes` ở query này.

# HOTFIX v300 — Auto Bridge Main Detection

Nếu database cho thấy run `COMPLETED 259/259` nhưng chỉ có 1 segment active, deploy v300. Nguyên nhân không phải chunk; Auto Discover v299 đọc `md_st_routing.standard_operation` có thể stale/null. v300 standardize Main trực tiếp từ `operation_code` bằng Mapping live giống Planning Chain. Không cần migration mới; sau deploy bấm Full **Rebuild Auto Bridge Segments** lại rồi Rebuild Chain nếu Bridge thay đổi.

---

# HOTFIX v299 — lỗi `RUNNING` / integer

Nếu v298 báo:

```text
Rebuild tạm dừng: invalid input syntax for type integer: "RUNNING"
```

Deploy v299. **Không cần migration mới**. Migration `053_intermediate_bridge_chunked_rebuild.sql` của v298 vẫn dùng nguyên. Sau deploy, bấm **Rebuild Auto Bridge Segments** lại. Lỗi xảy ra ở bước INSERT run header trước khi chunk được xử lý; Bridge ACTIVE cũ không bị thay đổi.

---

# TRIỂN KHAI v298 — AUTO BRIDGE CHUNKED / RESUMABLE

1. Deploy code v298.
2. Nếu database chưa có v297, chạy migration `052_auto_intermediate_from_main_routing.sql` trước.
3. Chạy migration mới `053_intermediate_bridge_chunked_rebuild.sql`.
4. Vào **Cấu hình → ST Operation Flow**.
5. Bấm **Rebuild Auto Bridge Segments**.
6. UI sẽ xử lý mặc định **150 routing/request** và hiện:
   - `Đã xử lý X / Total routing`;
   - `% tiến độ`;
   - `Current batch`;
   - `run_id` và routing cuối.
7. Nếu mất mạng/timeout/tab đóng, mở lại trang và bấm **Tiếp tục Rebuild**. Không chạy lại từ đầu.
8. Nếu Main Planning/ST Routing thay đổi trong lúc run đang chạy, hệ thống chặn Finalize. Dùng **Hủy & làm lại**.
9. Chỉ khi 100% mới **Finalize**. Tới lúc transaction Finalize commit, Planning Board vẫn dùng nguyên bộ Bridge ACTIVE cũ.
10. Sau Full Bridge Finalize, nếu Bridge thay đổi, vào Planning Board bấm **Rebuild Chain** một lần để đồng bộ chain của Job với bộ Bridge mới.

## Incremental sau Import Master

Import Master v298 so sánh routing signature ACTIVE trước/sau import. Chỉ routing code mới xuất hiện hoặc không còn active được đưa vào `INCREMENTAL` Bridge run. UI Import tự xử lý run này theo cùng cơ chế chunk ngắn.

Ví dụ database có 20.000 routing nhưng import chỉ làm thay đổi 37 routing signature:

```text
Không rebuild 20.000
→ Incremental run = 37 routing
→ chunk ngắn
→ Finalize atomic
```

## An toàn dữ liệu

```text
Bridge ACTIVE hiện tại
        ↓ vẫn phục vụ Planning Board
Run mới → staging theo run_id
        ↓
150 routing/request
        ↓
100%
        ↓
Finalize transaction
        ↓
Bridge mới ACTIVE
```

Run dừng ở 63% không làm mất hay trộn Bridge đang dùng.


## v303 - Auto Bridge canonical Planning Source fix
- Auto Bridge chỉ coi một `operation_code` là Main khi chính Source Operation đó đang active trong `md_st_operation_scope` với `operation_type=PLANNING_OPERATION`, sau đó dùng deterministic live mapping và kiểm tra `md_planning_operation_scope`.
- Mọi raw `operation_code` khác nằm giữa hai Main liên tiếp trong cùng `routing_code`, theo `seq`, được suy ra là Intermediate.
- Không dùng helper/stale mapping của Intermediate để nâng Intermediate thành Main.
- `PIONBL` và alias map về `PIONBL` vẫn skip.
- Progress mỗi chunk hiện thêm số Main occurrence, số route có >=2 Main, số segment tìm thấy và số Planning source mapping để chẩn đoán trực tiếp.
- Không có migration mới so với v302/v301; giữ nguyên migration 053 cho chunk/resume/staging.
