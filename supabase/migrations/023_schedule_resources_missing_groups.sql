-- ============================================================
-- 023_schedule_resources_missing_groups.sql
-- Add missing scheduling resources to the existing Board.
-- ============================================================

begin;

insert into public.md_schedule_resource(
    resource_code,resource_name,resource_group,area_name,
    max_concurrent,launch_interval_minutes,sort_order,is_active
)
values
 ('SPX-CLEAN','SPX Clean','SPX_CLEAN','Sirius cleaning',1,0,5,true),
 ('MANUAL-DBL','Manual DBL','MANUAL_DBL','Manual Blasting',1,0,6,true),
 ('AUTO-DBL','Auto DBL','AUTO_DBL','Auto Blasting',1,0,7,true),
 ('PLATING','Plating','PLATING','Plating',1,0,8,true),
 ('HE-BAKE','He-Bake','HE_BAKE','He-bake Oven',1,0,9,true)
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

select
 resource_code,resource_name,resource_group,area_name,is_active
from public.md_schedule_resource
where resource_code in (
 'SPX-CLEAN','MANUAL-DBL','AUTO-DBL','PLATING','HE-BAKE'
)
order by sort_order;
