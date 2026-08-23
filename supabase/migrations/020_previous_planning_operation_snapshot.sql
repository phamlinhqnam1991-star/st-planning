-- =====================================================================
-- 020_previous_planning_operation_snapshot.sql
-- Preserve the expected previous Planning Operation for each active row.
--
-- This is derived from FULL AllOperation after ST mapping and Planning Scope
-- filtering (PIONBL is already skipped).
--
-- Example:
-- AllOperation: CPBILP -> PIONBL -> BSAUNSLD
-- Planning:     CPBILP -> BSAUNSLD
--
-- Candidate BSAUNSLD keeps:
-- previous_standard_operation_snapshot = CPBILP
--
-- even when the current future chain starts at BSAUNSLD.
-- =====================================================================

begin;

alter table public.planning_job_operation
    add column if not exists previous_standard_operation_snapshot text;

alter table public.planning_job_operation
    add column if not exists previous_source_operation_code_snapshot text;

alter table public.planning_job_operation
    add column if not exists previous_source_seq_snapshot integer;

analyze public.planning_job_operation;

commit;
