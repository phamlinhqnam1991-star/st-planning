-- v283 Planning Board lazy Route Matrix support.
-- Business SQL/READY/Batch/Schedule logic is unchanged; these indexes only
-- support joins used by the existing route_status calculation after it was
-- moved to /api/planning/route-status.

create index if not exists ix_routing_detail_part_rev_active_seq_op
on public.md_routing_detailed(part_num,revision_num,source_seq,operation_code)
where is_active=true;

create index if not exists ix_part_routing_part_rev_active_code
on public.md_part_routing(part_num,revision_num,routing_code)
where is_active=true;

create index if not exists ix_pjo_job_source_main_status_active
on public.planning_job_operation(
  job_num,
  upper(trim(source_operation_code)),
  standard_operation,
  status,
  planning_seq,
  id
)
where is_active=true;

create index if not exists ix_pbj_job_main_source_seq_recent
on public.planning_batch_job(job_num,standard_operation,source_seq_snapshot,id desc);

create index if not exists ix_pbj_job_source_expr_recent
on public.planning_batch_job(job_num,upper(trim(source_operation_code)),id desc);

analyze public.md_routing_detailed;
analyze public.md_part_routing;
analyze public.planning_job_operation;
analyze public.planning_batch_job;
