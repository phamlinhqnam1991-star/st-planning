# V490 — Scheduling Board Workload Presentation

## Scope
Chỉ thay phần **ST Workload Summary · By Area** trên Scheduling Board và metadata breakdown phục vụ bảng này. Không đổi Sequential READY/WAIT, Batch, Recipe resolver, Scheduling engine, Production hay RBAC.

## 1. Thứ tự cột mới
1. Main Operation
2. Recipe No
3. Recipe Name
4. READY · Previous Main Scheduled / Done
5. READY · Previous Main Not Yet Scheduled
6. WAIT · Next Main
7. WAIT · Future Mains
8. PLANNED-UNSCHEDULED
9. SCHEDULED
10. HOLD
11. Total

## 2. Màu READY
- READY · Previous Main Scheduled / Done: xanh lá đậm.
- READY · Previous Main Not Yet Scheduled: xanh lá nhạt.

Đây chỉ là presentation. Logic vẫn là: Previous Main **đã Plan/tạo Batch** thì mở đúng một Next Main READY; Schedule không phải điều kiện mở. Schedule chỉ phân loại READY vào Scheduled/Done hay Not Yet Scheduled.

## 3. Chemical Line / Flybar gọn theo Recipe
- Bỏ dòng `MAIN TOTAL` trong ST Workload Summary của Chemical Line/Flybar.
- Chỉ render Recipe rows.
- Main Operation vẫn được lặp ở cột đầu trên từng Recipe row để không mất context.

## 4. WAIT · Next Main breakdown ngoài Chemical Line
- Với Schedule Area không phải Chemical Line, WAIT · Next Main có breakdown theo **immediate Previous Main Planning** của từng Job.
- Ví dụ một WAIT Next Main của PRIMER có thể hiện `← BSAUNSLD · 12 Job` và `← TSAUNSL · 3 Job`.
- Tooltip giữ cả Surface / Qty / Job của từng breakdown group.
- Chemical Line không hiện breakdown này để giữ Flybar compact.

## 5. Source of truth
Scheduling vẫn dùng `loadStDashboardData()` làm canonical workload engine. V490 chỉ bổ sung metadata `waitNextBreakdown` từ `previous_main_operation` của cùng Planning Chain, không tạo workload formula mới.

## 6. Documentation
- Logic & Guide cập nhật V490.
- New User Training cập nhật V490.
- Không có SQL migration mới.

## Validation
- TypeScript syntax transpile: PASS cho các file thay đổi.
- `i18n:check`: PASS · 1628 EN/VI pairs · 0 conflicts.
