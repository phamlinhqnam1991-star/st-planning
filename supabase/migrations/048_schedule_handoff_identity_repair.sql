-- =====================================================================
-- 048_schedule_handoff_identity_repair.sql
-- Repair stale Planning Chain handoff after a previous Main was scheduled.
--
-- Root cause fixed in v287:
-- historical Batch/Schedule identity must prefer operation_instance_key over
-- source_seq because source_seq can move after Routing Detail / mapping rebuild.
--
-- This migration is intentionally limited to:
--   1) backfill durable Batch identity snapshots when possible,
--   2) add lookup indexes,
--   3) unlock ONLY the immediate next active Main when its immediate previous
--      Main already has a non-cancelled Schedule.
-- It never unlocks the second/third future Main.
-- =====================================================================

begin;

update public.planning_batch_job bj
set
  operation_instance_key_snapshot=coalesce(
    nullif(trim(bj.operation_instance_key_snapshot),''),
    p.operation_instance_key
  ),
  source_seq_snapshot=coalesce(bj.source_seq_snapshot,p.source_seq),
  planning_seq_snapshot=coalesce(bj.planning_seq_snapshot,p.planning_seq)
from public.planning_job_operation p
where p.id=bj.planning_job_operation_id
  and (
    nullif(trim(bj.operation_instance_key_snapshot),'') is null
    or bj.source_seq_snapshot is null
    or bj.planning_seq_snapshot is null
  );

create index if not exists ix_planning_batch_job_history_instance
on public.planning_batch_job(job_num,operation_instance_key_snapshot,batch_id)
where operation_instance_key_snapshot is not null;

create index if not exists ix_planning_job_operation_handoff_order
on public.planning_job_operation(job_num,is_active,planning_seq,source_seq,id);

with ordered as (
  select
    p.id,
    p.job_num,
    p.status,
    lag(p.id) over(
      partition by p.job_num
      order by p.planning_seq,p.source_seq,p.id
    ) previous_id,
    lag(p.operation_instance_key) over(
      partition by p.job_num
      order by p.planning_seq,p.source_seq,p.id
    ) previous_instance_key,
    lag(p.source_operation_code) over(
      partition by p.job_num
      order by p.planning_seq,p.source_seq,p.id
    ) previous_source_operation_code,
    lag(p.standard_operation) over(
      partition by p.job_num
      order by p.planning_seq,p.source_seq,p.id
    ) previous_standard_operation,
    lag(p.source_seq) over(
      partition by p.job_num
      order by p.planning_seq,p.source_seq,p.id
    ) previous_source_seq
  from public.planning_job_operation p
  where p.is_active=true
    and p.standard_operation<>'PIONBL'
),
unlockable as (
  select cur.id
  from ordered cur
  where cur.status='LOCKED'
    and cur.previous_id is not null
    and exists(
      select 1
      from public.planning_batch_job bj
      join public.planning_batch b
        on b.id=bj.batch_id
       and b.status<>'CANCELLED'
      join public.planning_schedule ps
        on ps.batch_id=bj.batch_id
       and ps.status<>'CANCELLED'
      where bj.job_num=cur.job_num
        and (
          bj.planning_job_operation_id=cur.previous_id
          or (
            cur.previous_instance_key is not null
            and nullif(trim(bj.operation_instance_key_snapshot),'') is not null
            and upper(trim(bj.operation_instance_key_snapshot))=
                upper(trim(cur.previous_instance_key))
          )
          or (
            upper(trim(bj.standard_operation))=
                upper(trim(cur.previous_standard_operation))
            and upper(trim(bj.source_operation_code))=
                upper(trim(cur.previous_source_operation_code))
            and bj.source_seq_snapshot=cur.previous_source_seq
          )
        )
    )
)
update public.planning_job_operation p
set status='ELIGIBLE',updated_at=now()
where p.id in(select id from unlockable)
  and p.status='LOCKED';

analyze public.planning_batch_job;
analyze public.planning_job_operation;

commit;
