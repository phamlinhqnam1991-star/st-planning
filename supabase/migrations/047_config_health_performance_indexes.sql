-- v286 Configuration page performance
-- Indexes only: no business/query logic change.
-- Optimizes getConfigHealth() and the async Configuration sidebar health API.

begin;

-- Latest active Source Operation -> Main Operation lookup used by LATERAL ... limit 1.
create index if not exists ix_cfg_st_mapping_source_latest
 on public.md_st_operation_mapping (
   (upper(trim(source_operation_code))),
   updated_at desc,
   id desc
 )
 where is_active=true;

-- Active ST scope is normalized with upper(trim(operation_code)).
create index if not exists ix_cfg_st_scope_code_active
 on public.md_st_operation_scope (
   (upper(trim(operation_code))),
   operation_type
 )
 where is_active=true;

-- Main Operation -> Schedule Area lookup in config health chain.
create index if not exists ix_cfg_schedule_area_operation_std_active
 on public.md_schedule_area_operation (
   standard_operation,
   schedule_area_code
 )
 where is_active=true;

-- ST Group -> Physical Area lookup in config health chain.
create index if not exists ix_cfg_area_operation_group_st_group_active
 on public.md_area_operation_group (
   st_group,
   area_id
 )
 where is_active=true;

-- Planner assignment lookup/count for active Schedule Areas.
create index if not exists ix_cfg_planner_assignment_active
 on public.md_planner_work_assignment (
   schedule_area_code,
   planner_owner
 )
 where is_active=true;

-- Exact anti-join used by missing_jobs: only rows that make a Job "not missing".
create index if not exists ix_cfg_planning_job_operation_job_ready
 on public.planning_job_operation (job_num)
 where is_active=true and status in ('ELIGIBLE','PLANNED');

-- Smaller index for scanning only currently-open jobs in missing_jobs.
create index if not exists ix_cfg_open_job_current_open_job
 on public.open_job_current (job_num)
 where is_open=true;

commit;
