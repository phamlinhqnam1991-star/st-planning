-- =====================================================================
-- 019_batch_job_sequence_snapshot.sql
-- Durable Batch history for Previous Batch lookup
--
-- Problem:
-- planning_job_operation is rebuilt after each All Open Job import.
-- Historical Batch lookup must not depend only on the live/rebuilt chain row.
--
-- Solution:
-- Snapshot original sequence values into planning_batch_job at Batch creation.
-- Existing Batch history is backfilled from its linked planning_job_operation.
-- =====================================================================

begin;

alter table public.planning_batch_job
    add column if not exists source_seq_snapshot integer;

alter table public.planning_batch_job
    add column if not exists planning_seq_snapshot integer;

alter table public.planning_batch_job
    add column if not exists operation_instance_key_snapshot text;

-- Backfill existing Batch history.
update public.planning_batch_job bj
set
    source_seq_snapshot = coalesce(bj.source_seq_snapshot,p.source_seq),
    planning_seq_snapshot = coalesce(bj.planning_seq_snapshot,p.planning_seq),
    operation_instance_key_snapshot = coalesce(
        bj.operation_instance_key_snapshot,
        p.operation_instance_key
    )
from public.planning_job_operation p
where p.id=bj.planning_job_operation_id
  and (
      bj.source_seq_snapshot is null
      or bj.planning_seq_snapshot is null
      or bj.operation_instance_key_snapshot is null
  );

create index if not exists ix_planning_batch_job_history_seq
on public.planning_batch_job(job_num,source_seq_snapshot,batch_id);

analyze public.planning_batch_job;

commit;

select
    count(*) as batch_job_rows,
    count(*) filter(where source_seq_snapshot is not null) as with_source_seq_snapshot,
    count(*) filter(where planning_seq_snapshot is not null) as with_planning_seq_snapshot
from public.planning_batch_job;
