-- ============================================================
-- 072 Masking/Unmasking + Production Execution load performance
-- Index-only migration. No planning / routing / scheduling logic change.
-- ============================================================

begin;

-- loadMaskingUnmaskingPlan resolves only candidate Part/Revision pairs and
-- joins routing rows by normalized Part/Revision in source_seq order.
create index if not exists ix_routing_detail_partrev_seq_active_expr
on public.md_routing_detailed(
  (upper(trim(part_num))),
  (upper(trim(revision_num))),
  source_seq
)
where is_active=true;

-- Candidate Batch -> Job -> active Planning Main lookup.
create index if not exists ix_pbj_batch_pjo_job
on public.planning_batch_job(batch_id,planning_job_operation_id,job_num);

-- Production Execution loads Job detail for the batches scheduled on one day.
-- Existing batch_id index is retained; this covering order helps deterministic
-- batch detail reads without changing any business rule.
create index if not exists ix_pbj_batch_created_job
on public.planning_batch_job(batch_id,created_at,job_num);

analyze public.md_routing_detailed;
analyze public.planning_batch_job;

commit;
