/**
 * Canonical RAW NextOperation membership used by Planning Board/Dashboard.
 *
 * A Job is in the Planning ST population only when the RAW
 * open_job_current.next_operation is one of the operations visible to the ST
 * Planning Board:
 *   - active PLANNING_OPERATION in md_st_operation_scope, or
 *   - an automatically derived active Bridge intermediate operation,
 *   - but never an explicit ST_SCOPE_ONLY operation.
 *
 * Keep this SQL aligned with visibleOperations() so Dashboard/Workload never
 * broaden the population to every planning_job_operation in the database.
 */
export const RAW_ST_VISIBLE_CTE_SQL = `
 active_raw_scope as (
  select
   upper(trim(operation_code)) operation_code,
   case
    when bool_or(operation_type='ST_SCOPE_ONLY') then 'ST_SCOPE_ONLY'
    else 'PLANNING_OPERATION'
   end operation_type
  from public.md_st_operation_scope
  where is_active=true
    and operation_type<>'INTERMEDIATE'
  group by upper(trim(operation_code))
 ), active_bridge_raw as (
  select distinct upper(trim(bo.operation_code)) operation_code
  from public.md_intermediate_bridge_operation bo
  join public.md_intermediate_bridge_segment bs
    on bs.id=bo.segment_id and bs.is_active=true
  where nullif(trim(bo.operation_code),'') is not null
 ), visible_st_raw as (
  select operation_code
  from active_raw_scope
  where operation_type='PLANNING_OPERATION'
  union
  select b.operation_code
  from active_bridge_raw b
  where not exists(
   select 1
   from active_raw_scope s
   where s.operation_code=b.operation_code
     and s.operation_type='ST_SCOPE_ONLY'
  )
 )
`;
