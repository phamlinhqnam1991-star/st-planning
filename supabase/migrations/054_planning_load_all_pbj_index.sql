-- v302 Planning Board load-all support.
-- No business logic is changed. The per-Job "current batch" lookup in the
-- Candidate query filters planning_batch_job by planning_job_operation_id,
-- which had no supporting index. On large batch history this degrades to a
-- scan for EVERY Candidate row (and it is also used by Route Matrix history
-- joins). One index removes that per-row scan.

create index if not exists ix_pbj_pjo_recent
on public.planning_batch_job(planning_job_operation_id, id desc);

analyze public.planning_batch_job;
