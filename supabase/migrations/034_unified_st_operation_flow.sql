-- v178 Unified ST Operation Flow
-- Canonical chain:
-- md_operation -> md_st_operation_scope -> md_st_operation_mapping
-- -> md_operation_master/md_planning_operation_scope -> md_st_group
-- -> md_area_operation_group -> md_area
-- -> md_schedule_area_operation -> md_schedule_area

begin;

create index if not exists ix_st_operation_scope_active_code
 on public.md_st_operation_scope(is_active,operation_code);
create index if not exists ix_st_mapping_active_source
 on public.md_st_operation_mapping(source_operation_code) where is_active;
create index if not exists ix_planning_scope_active_order
 on public.md_planning_operation_scope(is_active,sort_order,standard_operation);
create index if not exists ix_schedule_area_operation_active_op
 on public.md_schedule_area_operation(standard_operation) where is_active;

-- Legacy consistency only: an active Mapping that never received a Scope row
-- is inserted. An existing user-disabled Scope row is NOT reactivated.
insert into public.md_st_operation_scope(operation_code,is_active)
select distinct upper(trim(m.source_operation_code)),true
from public.md_st_operation_mapping m
left join public.md_st_operation_scope s
 on upper(trim(s.operation_code))=upper(trim(m.source_operation_code))
where m.is_active=true
 and s.operation_code is null
on conflict(operation_code) do nothing;

-- Ensure all Schedule Areas have an explicit Planner assignment row.
insert into public.md_planner_work_assignment(schedule_area_code,planner_owner,is_active)
select a.schedule_area_code,
 case when a.planner_owner in ('1','2') then a.planner_owner else 'UNASSIGNED' end,
 true
from public.md_schedule_area a
on conflict(schedule_area_code) do nothing;

commit;
