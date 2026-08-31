-- =====================================================================
-- 049_planning_chain_source_occurrence.sql
-- v288 canonical Planning Chain identity
--
-- Source occurrence identity is owned by each Job's AllOperation:
--   (job_num, source_seq, source_operation_code)
-- source_seq is the original 1-based ordinal BEFORE mapping/scope filtering.
-- PIONBL stays in AllOperation but never becomes an active Planning row.
--
-- This migration does NOT delete Batch/Schedule history.
-- =====================================================================

begin;

-- PIONBL is trace-only, not a Main Planning Operation.
update public.md_planning_operation_scope
set is_active=false,updated_at=now()
where upper(trim(standard_operation))='PIONBL';

update public.planning_job_operation
set is_active=false,updated_at=now()
where is_active=true
  and upper(trim(standard_operation))='PIONBL';

-- Defensive cleanup for exact duplicate LIVE source occurrences before adding
-- the guard index. Keep one row only; historical planning_batch_job references
-- to the deactivated rows remain untouched.
with ranked as (
  select
    p.id,
    row_number() over(
      partition by
        p.job_num,
        p.source_seq,
        upper(trim(p.source_operation_code))
      order by
        case p.status when 'PLANNED' then 0 when 'ELIGIBLE' then 1 else 2 end,
        p.updated_at desc,
        p.id desc
    ) rn
  from public.planning_job_operation p
  where p.is_active=true
)
update public.planning_job_operation p
set is_active=false,updated_at=now()
from ranked r
where p.id=r.id
  and r.rn>1;

-- One original source occurrence can own only one LIVE Planning row.
create unique index if not exists uq_planning_job_operation_active_source_occurrence
on public.planning_job_operation(
  job_num,
  source_seq,
  (upper(trim(source_operation_code)))
)
where is_active=true;

-- Shared predecessor/history lookup indexes.
create index if not exists ix_planning_batch_job_predecessor_lookup
on public.planning_batch_job(
  job_num,
  standard_operation,
  source_seq_snapshot
);

create index if not exists ix_planning_batch_job_source_occurrence
on public.planning_batch_job(
  job_num,
  source_seq_snapshot,
  source_operation_code,
  standard_operation,
  batch_id
);

create index if not exists ix_planning_schedule_active_batch_planned
on public.planning_schedule(batch_id,planned_start)
where status<>'CANCELLED' and planned_start is not null;

analyze public.planning_job_operation;
analyze public.planning_batch_job;
analyze public.planning_schedule;

commit;
