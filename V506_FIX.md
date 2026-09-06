# V506 · Production Remove Before Start

## Phạm vi đã chốt

Chỉ bổ sung workflow xác nhận Job thực tế trước lần Start đầu tiên của Batch Chemical Line / Painting và xử lý ảnh hưởng downstream. Không thay đổi Recipe resolver, Planning Chain rules, Batch Key, READY/WAIT logic hay kiến trúc Scheduling hiện hữu.

## Production Start Confirmation

- Khi Batch Chemical Line / Painting chuyển lần đầu từ `WAITING` sang `ON-GOING` hoặc `DONE`, UI mở danh sách toàn bộ Job của Batch.
- Tất cả Job được tick mặc định.
- Production bỏ tick Job chưa load; phải giữ ít nhất 1 Job để Start.
- Job bỏ tick được remove khỏi source Batch trước Actual Start, không được coi là đã process và được recompute về Main chưa thực hiện.
- Audit source được lưu bằng `production_adjustment_item` hiện có với `item_type=REMOVE_JOB`, `reasonCode=NOT_LOADED`, `removedBeforeStart=true`.

## Downstream impact

- Với mỗi downstream Batch active đã chứa Job bị remove, tạo `planning_handover_change_event` hiện có với `change_type=REMOVE_JOB` và prefix `PRODUCTION_REMOVE_BEFORE_START:`.
- Job downstream không bị xóa tự động ngay. Điều độ hiện `UPSTREAM JOB REMOVED · ACCEPT REQUIRED`.
- `Shift Accept & Remove` mới xóa Job khỏi downstream Batch, recompute Job planning status, Batch Job/Qty/Surface/Process Time và Chemical schedule khi áp dụng.
- Downstream Batch còn REMOVE impact `NEW` bị chặn lần Start đầu tiên.
- Nếu downstream Batch đã START trước khi impact được tạo, event là `CRITICAL`; hệ thống không tự remove và hiển thị `CONFLICT` để Supervisor xử lý ngoại lệ.

## Planning Board / Alerts

- Job quay lại source Main có badge `REMOVED FROM PREVIOUS BATCH · <Batch No>` trên Planning Board.
- Production Change Alerts đọc cả `ADD_JOB` và `REMOVE_JOB` để audit thay đổi thực tế sản xuất.
- Internal notification được phát khi source Batch Start có Job remove và khi downstream Shift Accept.

## Security

- Không tạo business table mới; tái sử dụng `production_adjustment_item` và `planning_handover_change_event`.
- Migration `085_shift_supervisor_schedule_alert_view.sql` thêm `schedule.view` cho `SHIFT_SUPERVISOR` để đọc cảnh báo Điều độ.
- Shift vẫn không có `schedule.edit`; Accept Remove dùng `production.add_job` + Production Area scope. Planner có thể xử lý bằng `schedule.edit` + Schedule Area scope.

## File chính thay đổi

- `src/lib/production-remove-before-start.ts`
- `src/app/api/production-execution/start-confirmation/route.ts`
- `src/app/api/schedule/handover-alerts/[id]/accept-remove/route.ts`
- `src/app/api/production-execution/route.ts`
- `src/components/production-execution-client.tsx`
- `src/components/schedule-board-client.tsx`
- `src/app/schedule/page.tsx`
- `src/lib/production-change-alerts.ts`
- `src/components/production-change-alerts-client.tsx`
- `src/lib/planning/candidate-data.ts`
- `src/components/planning-board-client.tsx`
- `src/lib/security/permissions.ts`
- `src/app/logic-guide/page.tsx`
- `src/lib/ai/st-planning-knowledge.ts`
- `src/components/erp/erp-kit.css`
- `supabase/migrations/085_shift_supervisor_schedule_alert_view.sql`

## Verification

- TS/TSX syntax parser: OK cho toàn bộ file code sửa mới.
- Global TypeScript semantic scan: không phát hiện TS7006 hay lỗi semantic mới trong các file V506; các lỗi còn lại của scan là do môi trường đóng gói không có dependency/type package của Next/React/pg.
- ZIP integrity: kiểm tra khi đóng gói delivery.
- Full `npm ci` / `next build` không hoàn tất trong môi trường đóng gói vì dependency install bị transport timeout.
