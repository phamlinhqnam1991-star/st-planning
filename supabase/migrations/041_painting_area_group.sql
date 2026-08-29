-- v232 Khu gộp Painting: gộp 3 cabin CAB1/CAB2/CAB3 thành 1 khu chung "Painting".
-- Area gộp = resource_group xác định + resource_code NULL.
-- Board điều độ tự nhóm các cabin (resource_code != NULL, cùng resource_group) vào khu chung,
-- vẫn hiển thị 3 bảng lane riêng và dùng chung danh sách lô Unscheduled.
begin;

insert into public.md_schedule_area(
 schedule_area_code,schedule_area_name,resource_group,resource_code,
 planner_owner,display_order,default_rows,allow_manual_plan,allow_auto_plan,is_active
)
values (
 'PAINTING','Painting','PAINTING',NULL,
 '2',99,20,true,true,true
)
on conflict(schedule_area_code) do update set
 schedule_area_name=excluded.schedule_area_name,
 resource_group=excluded.resource_group,
 resource_code=NULL,
 planner_owner=excluded.planner_owner,
 display_order=excluded.display_order,
 is_active=true,
 updated_at=now();

commit;
