-- =====================================================================
-- 057_no_chain_all_main_ready.sql
-- ST Planning v314
--
-- Persist how each live Planning Job Operation was resolved so the special
-- NO_CHAIN + AllOperation Main rule can stay isolated from normal chains.
-- =====================================================================

begin;

alter table public.planning_job_operation
  add column if not exists route_resolution_mode text;

alter table public.planning_job_operation
  drop constraint if exists planning_job_operation_route_resolution_mode_check;

alter table public.planning_job_operation
  add constraint planning_job_operation_route_resolution_mode_check
  check (
    route_resolution_mode is null
    or route_resolution_mode in (
      'BRIDGE_PAIR',
      'ALLOPERATION_FALLBACK',
      'DIRECT_NEXT_MAIN',
      'NO_CHAIN_ALL_MAIN'
    )
  );

comment on column public.planning_job_operation.route_resolution_mode is
  'Planning route resolver mode. NO_CHAIN_ALL_MAIN means physical Current Main is unresolved, but every Main Planning occurrence found in this Job AllOperation is active/READY unless already batched.';

commit;
