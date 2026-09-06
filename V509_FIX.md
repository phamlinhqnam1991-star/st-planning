# V509 · Global Realtime No-Supabase · Fail-safe Leader

## Lỗi V508 cần chặn
- Mỗi tab visible đều poll PostgreSQL khoảng 1.2 giây/lần.
- Initial feed subscription gọi `router.refresh()` ngay sau page render.
- Nhiều tab/máy có thể tạo lượng query/RSC reconcile không cần thiết và làm tăng nguy cơ DB/server overload.

## V509
- Chỉ 1 visible leader tab / browser profile poll PostgreSQL.
- Tab cùng máy nhận realtime qua `BroadcastChannel` + `localStorage` fallback.
- Healthy cross-device poll: ~1.8 giây.
- Exponential backoff đến 15 giây khi API/DB lỗi; migration 086 thiếu thì backoff 30 giây.
- Initial subscription KHÔNG `router.refresh()`.
- Chỉ event thật, có domain liên quan route hiện tại mới RSC soft reconcile.
- Feed cursor được lưu local để leader tab mới tiếp quản.
- Tab hidden release leader lease cho tab visible khác.
- Realtime failure phải fail-open: app vẫn render/hoạt động, không F5, không document reload.

## Database
- Vẫn dùng migration `086_global_realtime_change_event.sql`; không thêm business table mới.

## Không đổi
Không đổi READY/WAIT, Planning Chain, Recipe, Batch, Schedule, Chemical Line, Painting, Production, Remove Before Start, Audit hoặc permission logic.
