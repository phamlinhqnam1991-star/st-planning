# V501 · All Open Jobs Cross Check / Audit Missing

## Phạm vi thay đổi

Chỉ bổ sung màn audit/đối chiếu trong **All Open Jobs**. Không thay đổi Planning Chain, READY/WAIT, Recipe, Batch, Scheduling hay Auto Planning.

## Logic audit

Nguồn chuẩn của audit là **tất cả `open_job_current.is_open=true`**, kể cả Job hiện không thuộc ST.

Mỗi dòng có cột:

- `Planning Board = YES`: RAW `NextOperation` thuộc canonical Planning Board scope và Job có live active `planning_job_operation`.
- `Planning Board = NO`: dòng không nằm trong canonical Planning Board population và luôn có cột **Lý do**.

Các nhóm lý do hiện có:

1. `NextOperation` trống.
2. `ST_SCOPE_ONLY` — chỉ hiển thị All Open Jobs, không vào Planning Board.
3. `NextOperation` ngoài ST Planning Scope / active Intermediate Bridge.
4. Planning Operation thiếu Source → Main Mapping active.
5. Intermediate/Bridge chưa resolve được Planning Chain.
6. Thuộc ST Planning nhưng chưa có live Planning Chain — cần Rebuild/kiểm tra route.
7. Có Planning Chain nhưng RAW `NextOperation` không còn thuộc canonical Planning Board scope.
8. Population mismatch dự phòng.

## UI

Thêm tab **Cross Check / Audit Missing** trong All Open Jobs với:

- KPI: tổng Open rows, Planning Board YES, Planning Board NO, ST_SCOPE_ONLY, ST config/chain issue.
- Quick filter theo nhóm lý do.
- Filter trực tiếp theo Planning Board YES/NO, Job, Part, Rev, Program, Next Operation, Last Operation, Current Main, Board Status, Chain rows, WIP Qty min/max, Surface min/max, Import Status, Reason.
- Pagination 100 dòng/trang.
- Link mở Job detail.

## Ghi chú

`Planning Board = YES` là membership theo **canonical population**, không phải theo filter/view cá nhân đang lưu. Vì vậy một Job audit YES vẫn có thể đang bị ẩn bởi VIEW/filter của người dùng trên Planning Board.
