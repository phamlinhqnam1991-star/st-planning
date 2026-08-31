-- Planning Board Candidate performance indexes.
-- No business logic / Candidate SQL is changed by this migration.

create index if not exists ix_pjo_candidate_job_source_main_active
on public.planning_job_operation(job_num, upper(trim(source_operation_code)), standard_operation, planning_seq, id)
where is_active=true;

create index if not exists ix_pjo_job_source_seq_active
on public.planning_job_operation(job_num, source_seq, planning_seq)
where is_active=true;

create index if not exists ix_pbj_job_source_main_recent
on public.planning_batch_job(job_num, upper(trim(source_operation_code)), standard_operation, id desc);

create index if not exists ix_pbj_job_history_source_seq_recent
on public.planning_batch_job(job_num, source_seq_snapshot desc, id desc)
where standard_operation<>'PIONBL';

create index if not exists ix_schedule_batch_recent_active
on public.planning_schedule(batch_id, planned_start desc, id desc)
where status<>'CANCELLED';

create index if not exists ix_area_group_st_group_active_area
on public.md_area_operation_group(st_group, area_id)
where is_active=true;

create index if not exists ix_st_routing_route_op_seq_active
on public.md_st_routing(routing_code, upper(trim(operation_code)), seq)
where is_active=true;

create index if not exists ix_st_scope_op_type_active_expr
on public.md_st_operation_scope(upper(trim(operation_code)), operation_type)
where is_active=true;

create index if not exists ix_st_mapping_source_expr_active
on public.md_st_operation_mapping(upper(trim(source_operation_code)))
where is_active=true;

create index if not exists ix_md_operation_code_expr_active_sort
on public.md_operation(upper(trim(operation_code)), planning_sort_order)
where is_active=true;

create index if not exists ix_open_job_next_operation_open_expr
on public.open_job_current(upper(trim(next_operation)))
where is_open=true and nullif(trim(coalesce(next_operation,'')),'') is not null;

create index if not exists ix_main_operation_recipe_op_recipe_active
on public.md_main_operation_recipe(operation_code, recipe_key, priority, is_default)
where is_active=true;

analyze public.planning_job_operation;
analyze public.planning_batch_job;
analyze public.planning_schedule;
analyze public.open_job_current;
