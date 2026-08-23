-- ============================================================
-- 022_schedule_resources_6fb_4cab.sql
-- Update Scheduling resources:
-- Chemical Line = 6 Flybars, max 3 concurrent, 60-minute launch interval
-- Painting = 4 independent cabins: CAB1..CAB4
-- ============================================================

begin;

-- FB-07 is no longer available for new scheduling.
-- Historical schedule rows are preserved.
update public.md_schedule_resource
set is_active=false,updated_at=now()
where resource_code='FB-07';

insert into public.md_schedule_resource(
    resource_code,resource_name,resource_group,area_name,
    max_concurrent,launch_interval_minutes,sort_order,is_active
)
values
 ('FB-01','Chemical Line Flybar 01','CHEMICAL_LINE','chemical line',3,60,41,true),
 ('FB-02','Chemical Line Flybar 02','CHEMICAL_LINE','chemical line',3,60,42,true),
 ('FB-03','Chemical Line Flybar 03','CHEMICAL_LINE','chemical line',3,60,43,true),
 ('FB-04','Chemical Line Flybar 04','CHEMICAL_LINE','chemical line',3,60,44,true),
 ('FB-05','Chemical Line Flybar 05','CHEMICAL_LINE','chemical line',3,60,45,true),
 ('FB-06','Chemical Line Flybar 06','CHEMICAL_LINE','chemical line',3,60,46,true),
 ('CAB1','Painting CAB1','PAINTING','Painting',1,0,51,true),
 ('CAB2','Painting CAB2','PAINTING','Painting',1,0,52,true),
 ('CAB3','Painting CAB3','PAINTING','Painting',1,0,53,true),
 ('CAB4','Painting CAB4','PAINTING','Painting',1,0,54,true)
on conflict(resource_code) do update set
 resource_name=excluded.resource_name,
 resource_group=excluded.resource_group,
 area_name=excluded.area_name,
 max_concurrent=excluded.max_concurrent,
 launch_interval_minutes=excluded.launch_interval_minutes,
 sort_order=excluded.sort_order,
 is_active=excluded.is_active,
 updated_at=now();

commit;

select resource_code,resource_name,resource_group,max_concurrent,launch_interval_minutes,is_active
from public.md_schedule_resource
order by sort_order,resource_code;
