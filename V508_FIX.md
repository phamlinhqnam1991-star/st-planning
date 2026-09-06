# V508 — Global Realtime No-Supabase

## Chốt kiến trúc
- Aiven PostgreSQL là canonical database duy nhất cho business data.
- Bỏ hoàn toàn Supabase Realtime khỏi cơ chế đồng bộ ST Planning.
- Không cần `NEXT_PUBLIC_SUPABASE_URL` hoặc `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` cho realtime.
- Supabase chỉ còn optional cho legacy Storage/import nếu luồng cũ vẫn đang dùng.

## Luồng realtime
1. Một mutation `/api/*` thành công.
2. Tab thao tác apply invalidation ngay lập tức.
3. Tab cùng PC nhận qua `BroadcastChannel`; `localStorage` là fallback.
4. Event nhỏ được ghi vào PostgreSQL `system_change_event` qua `/api/realtime/change-events`.
5. Máy/browser khác đọc feed khoảng 1.2 giây/lần và tự reconcile dữ liệu canonical.
6. Tab ngủ/offline resume cursor khi visible/online và safety reconcile, không cần F5.

## Phạm vi tự đồng bộ
Planning, Batch, Điều độ/Schedule, Báo cáo sản xuất, Add/Remove Job, Remove Before Start, Shift Accept, Daily Production Adjustment, Dashboard, Audit, Import, Master Data, Config/Recipe/Area, Internal Chat/Admin mutation.

## Database
Chạy migration:
- `086_global_realtime_change_event.sql`

Bảng này chỉ lưu invalidation signal, không lưu/nhân bản business state.

## Không đổi
Không đổi READY/WAIT, Planning Chain, Recipe Resolver, Batch Compatibility, Schedule constraint, Chemical Line, Painting, Production Execution hoặc logic V506 Remove Before Start.
