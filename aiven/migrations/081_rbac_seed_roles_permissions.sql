insert into public.app_role(role_key,role_name,description,is_system) values
 ('ADMIN','Administrator','Toàn quyền hệ thống',true),
 ('PLANNER','Planner','Planning + Điều độ theo phạm vi được giao',true),
 ('PRODUCTION_OPERATOR','Production Operator','Báo cáo sản xuất theo khu vực được giao',true),
 ('SHIFT_SUPERVISOR','Shift Supervisor','Báo cáo sản xuất + thêm Job ngoài lô theo khu vực được giao',true)
on conflict(role_key) do update set role_name=excluded.role_name,description=excluded.description,is_system=excluded.is_system;

insert into public.app_permission(permission_key,permission_name,module_key,description) values
 ('dashboard.view','Xem Dashboard','DASHBOARD','Xem dashboard và KPI'),
 ('jobs.view','Xem All Open Jobs','OPERATIONS','Xem dữ liệu Job mở'),
 ('planning.view','Xem Planning Board','PLANNING','Xem Planning Board'),
 ('planning.edit','Sửa Planning Board','PLANNING','Tạo/sửa/xóa Batch, Add/Remove Job theo Main scope'),
 ('schedule.view','Xem Board Điều Độ','SCHEDULE','Xem Board Điều Độ'),
 ('schedule.edit','Sửa Board Điều Độ','SCHEDULE','Tạo/sửa/xóa lịch theo Schedule Area scope'),
 ('production.view','Xem Production Execution','PRODUCTION','Xem báo cáo sản xuất'),
 ('production.report','Báo cáo sản xuất','PRODUCTION','Cập nhật WAITING/ON-GOING/DONE, Actual, Note'),
 ('production.add_job','Thêm Job ngoài lô','PRODUCTION','Thêm Job ngoài kế hoạch từ Production'),
 ('adjustment.view','Xem Điều chỉnh đầu ngày','ADJUSTMENT','Xem carry-over/reconciliation'),
 ('adjustment.approve','Duyệt Điều chỉnh đầu ngày','ADJUSTMENT','Preview/Approve/Reject change set trong phạm vi'),
 ('alerts.view','Xem cảnh báo thay đổi SX','PRODUCTION','Xem Production Change Alerts'),
 ('tracking.view','Xem Tracker','TRACKING','Xem Job/Part Tracker'),
 ('master.view','Xem Master Data','MASTER','Xem Master Data'),
 ('master.edit','Sửa Master Data','MASTER','Thay đổi Master Data'),
 ('import.view','Xem Import Master','IMPORT','Xem trạng thái import'),
 ('import.execute','Thực hiện Import','IMPORT','Upload/import/reset/rebuild dữ liệu nguồn'),
 ('config.view','Xem Configuration','CONFIG','Xem cấu hình'),
 ('config.edit','Sửa Configuration','CONFIG','Thay đổi cấu hình'),
 ('security.manage','Quản lý Users & Permissions','SECURITY','Tạo account, role, permission, scope'),
 ('guide.view','Xem Logic & Hướng dẫn','GUIDE','Xem logic chuẩn'),
 ('training.view','Xem Training','TRAINING','Xem training người mới')
on conflict(permission_key) do update set permission_name=excluded.permission_name,module_key=excluded.module_key,description=excluded.description;

insert into public.app_role_permission(role_key,permission_key)
select r.role_key,p.permission_key
from public.app_role r
join public.app_permission p on
 r.role_key='ADMIN'
 or (r.role_key='PLANNER' and p.permission_key in ('dashboard.view','jobs.view','planning.view','planning.edit','schedule.view','schedule.edit','production.view','adjustment.view','adjustment.approve','alerts.view','tracking.view','guide.view','training.view'))
 or (r.role_key='PRODUCTION_OPERATOR' and p.permission_key in ('dashboard.view','jobs.view','production.view','production.report','alerts.view','tracking.view','guide.view','training.view'))
 or (r.role_key='SHIFT_SUPERVISOR' and p.permission_key in ('dashboard.view','jobs.view','production.view','production.report','production.add_job','alerts.view','tracking.view','guide.view','training.view'))
on conflict do nothing;

create index if not exists ix_app_audit_log_created_at on public.app_audit_log(created_at desc);
