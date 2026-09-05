# V464 — Daily Production Adjustment + Universal Add Job

## Mục tiêu
Giữ nguyên Planning/Scheduling/Production architecture hiện có, chỉ bổ sung cơ chế đối soát đầu ngày và Add Job nhanh dùng chung mọi khu vực.

## Logic đã chốt
- Production day: 06:00 → 05:59 hôm sau.
- Production Report trước 05:59 chỉ ghi nhận thực tế; không tự sửa Batch/Schedule.
- Tab mới **Điều chỉnh đầu ngày** tạo proposal:
  - `CARRY_OVER`: Batch còn Job chưa DONE.
  - `REMOVE_JOB`: Job còn WAITING/chưa bắt đầu trong Batch.
  - `ADD_JOB`: Job thực tế đã hoàn thành ngoài Batch.
- Carry Over phải **Preview** trước khi duyệt.
- Preview chạy cả:
  1. Cross-Main dependency: Main sau không được Start trước End hiệu lực của Main trước, kể cả khác planner.
  2. Resource cascade: Batch bị overlap trên cùng resource được dời tiếp theo.
- Chỉ khi planner bấm Duyệt mới commit.
- Schedule cũ được chuyển `CANCELLED` kèm audit note; schedule mới được tạo active, vì vậy không ghi đè mất lịch sử trước chỉnh.
- Carry Over giữ nguyên Batch No., không sinh Batch mới.
- Production Execution có ô báo **Extra Job** ngay trên Batch để tạo proposal Add Job.
- Batch Detail có **Add Job nhanh**: chỉ nhập Job Number → lookup tự động Part/Rev/Qty/Surface/Main/Operation/Recipe/Status và validate.
- Add Job thông thường vẫn dùng validation chặt: Main, ELIGIBLE, Recipe, Batch active khác, Batch Size.
- Add Job từ Production Adjustment có thể `Duyệt ngoại lệ` để phản ánh thực tế đã xảy ra; ngoại lệ vẫn được audit trong adjustment item.

## Database
Migration mới: `supabase/migrations/078_daily_production_adjustment.sql`.
File có tối đa 4 SQL statements để phù hợp SQL runner hiện tại.

Hai migration 076/077 trong gói này cũng đã dùng bản sửa Max-4-query mới nhất.

## Các file chính thay đổi
- `src/lib/daily-production-adjustment.ts`
- `src/app/api/daily-production-adjustment/route.ts`
- `src/app/daily-production-adjustment/page.tsx`
- `src/components/daily-production-adjustment-client.tsx`
- `src/components/production-execution-client.tsx`
- `src/app/api/planning/batch/[id]/jobs/route.ts`
- `src/components/batch-detail-manager.tsx`
- `src/lib/erp/st-navigation.ts`
- `src/app/logic-guide/page.tsx`

## Lưu ý triển khai
Chạy migration theo thứ tự 076 → 077 → 078 trước khi dùng V464.
