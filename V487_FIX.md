# V487 — Future ST Job + Auto Preparation

## Phạm vi
Chỉ mở rộng Production Add Job / downstream handover và cập nhật Logic + Training. Không đổi Recipe resolver, Batch Size, Schedule engine, READY classifier hay RBAC.

## Logic mới
1. Job chỉ cần tồn tại trong All Open Job và Target Main phải nằm trong current/future ST routing thật. RAW NextOperation có thể vẫn ở bộ phận khác.
2. Khi Target Main chưa materialize, server gọi `syncPlanningChains(...,{jobNums:[job]})` cho riêng Job rồi resolve lại. Không hard-code Main.
3. Nếu Production xác nhận entry ở một Main phía sau, các live Main phía trước chưa có Batch được deactivate. Audit ADD_JOB lưu `futureStEntry`, `stEntryMain`, `stEntryInstanceKey`; sync Planning Chain dùng marker này để không resurrect các Main cũ cho đến khi RAW position bắt kịp/passed.
4. Add Job vào Main Batch vẫn ghi Production main execution như logic hiện hành (direct Production Add = DONE; nhận downstream attention = WAITING).
5. Ngay sau Add/Accept, chạy canonical Masking/Unmasking resolver. Nếu Main có support operation, tạo Job-level Preparation execution `WAITING` cho Masking/Unmasking. Không tự DONE và không kế thừa DONE của Job khác.
6. Attention vẫn tạo cho tất cả downstream Main, độc lập với việc Main có/không có Masking/Unmasking.
7. Production UI `router.refresh()` sau Add/Accept để server-derived Preparation hiển thị ngay.

## Database
Không có migration SQL mới; dùng `production_adjustment_item.proposal_json` hiện có làm audit marker Production ST entry.
