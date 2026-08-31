# Planning Board performance v281

Phạm vi thay đổi chỉ là hiệu năng tải Planning Board; không đổi Candidate SQL/business rules.

## Đã xác nhận trong source
- `/planning` là Server Component dynamic và trước đây form GET làm full page navigation.
- `healScheduledHandoffs()` trước đây chạy trên mọi page load trước Candidate query.
- Planning page trước đây nạp lại Area/Operation/matrix/visible operation/NextOperation và live recipe metadata/context.
- Candidate query giữ nguyên CTE/LATERAL/route_status và thứ tự sort hiện hữu.

## Thay đổi
1. Static Planning metadata dùng cache server (`planning-static`, 120 giây).
2. Live recipe context + recipe metadata dùng short-lived in-process cache 60 giây để tránh 5+ master queries trên mỗi filter request.
3. Bỏ `healScheduledHandoffs()` khỏi `/planning`; Schedule API vẫn là nơi heal/unlock sau thay đổi schedule.
4. Candidate SQL được chuyển nguyên logic sang `src/lib/planning/candidate-data.ts` để SSR và API dùng chung một nguồn.
5. Thêm `GET /api/planning/candidates`; filter/paging client fetch, không full page reload.
6. Thêm migration `044_planning_candidate_performance_indexes.sql` cho các join/filter/LATERAL nóng.

## Không thay đổi
- READY/PLANNED/SCHEDULED/WAITING/DONE logic.
- route_status CTE/LATERAL logic.
- Recipe matching và Batch Key suggestion logic.
- Batch/Schedule data model.
- Planning sort/business priority.
