-- =====================================================================
-- 018_skip_pionbl_planning.sql
-- ST Planning - Skip PIONBL from Planning / Batch sequence
--
-- Example source routing:
--   CPBILP -> PIONBL -> BSAUNSLD
--
-- Planning sequence becomes:
--   CPBILP -> BSAUNSLD
--
-- PIONBL remains in All Open Job / AllOperation source data.
-- Existing Batch history is NOT deleted.
-- =====================================================================

begin;

-- Remove PIONBL from selectable Planning Scope.
update public.md_planning_operation_scope
set
    is_active=false,
    updated_at=now()
where standard_operation='PIONBL';

-- Remove any current PIONBL row from the active Planning Chain.
-- Historical planning_batch_job references remain valid.
update public.planning_job_operation
set
    is_active=false,
    updated_at=now()
where standard_operation='PIONBL'
  and is_active=true;

analyze public.md_planning_operation_scope;
analyze public.planning_job_operation;

commit;

select
    standard_operation,
    is_active
from public.md_planning_operation_scope
where standard_operation in ('CPBILP','PIONBL','BSAUNSLD')
order by sort_order;
