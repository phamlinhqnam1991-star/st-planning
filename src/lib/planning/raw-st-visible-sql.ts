/**
 * Canonical RAW NextOperation ST membership used by Planning Board/Dashboard.
 *
 * V404: membership follows the same Current Main logic already materialized by
 * syncPlanningChains. A RAW NextOperation may enter the ST Planning population
 * when it is either:
 *   1) an active PLANNING_OPERATION, or
 *   2) an active Intermediate Operation that belongs to an active ST Bridge.
 *
 * The live Planning Chain must still contain a Current Main occurrence for the
 * Job. That Current Main is the FIRST active planning_job_operation ordered by
 * planning_seq/source_seq/id; it is the result of the canonical
 * LastOperation + NextOperation resolver (Bridge -> AllOperation fallback ->
 * direct Next Main rescue). ST_SCOPE_ONLY is always excluded.
 */
export const RAW_ST_VISIBLE_CTE_SQL = `
 active_raw_scope as (
  select
   upper(trim(operation_code)) operation_code,
   case
    when bool_or(operation_type='ST_SCOPE_ONLY') then 'ST_SCOPE_ONLY'
    when bool_or(operation_type='PLANNING_OPERATION') then 'PLANNING_OPERATION'
    else null
   end operation_type
  from public.md_st_operation_scope
  where is_active=true
    and operation_type in ('PLANNING_OPERATION','ST_SCOPE_ONLY')
    and nullif(trim(operation_code),'') is not null
  group by upper(trim(operation_code))
 ), active_bridge_raw as (
  select distinct upper(trim(bo.operation_code)) operation_code
  from public.md_intermediate_bridge_operation bo
  join public.md_intermediate_bridge_segment bs
    on bs.id=bo.segment_id
   and bs.is_active=true
  where nullif(trim(bo.operation_code),'') is not null
 ), visible_st_raw as (
  select s.operation_code
  from active_raw_scope s
  where s.operation_type='PLANNING_OPERATION'
  union
  select b.operation_code
  from active_bridge_raw b
  where not exists(
   select 1 from active_raw_scope s
   where s.operation_code=b.operation_code
     and s.operation_type='ST_SCOPE_ONLY'
  )
 )
`;
