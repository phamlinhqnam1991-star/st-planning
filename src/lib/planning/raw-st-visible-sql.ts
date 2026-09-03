/**
 * Canonical RAW NextOperation ST membership used by Planning Board/Dashboard.
 *
 * A Job belongs to the ST Planning population only when the RAW
 * open_job_current.next_operation is explicitly configured as an active
 * PLANNING_OPERATION in md_st_operation_scope.
 *
 * IMPORTANT (v400): Auto-Bridge / INTERMEDIATE operations are chain/navigation
 * helpers only. They must NOT broaden RAW NextOperation membership. Likewise an
 * explicit ST_SCOPE_ONLY code stays visible in All Open Jobs/configuration but
 * does not enter Planning Board/Dashboard workload.
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
 ), visible_st_raw as (
  select operation_code
  from active_raw_scope
  where operation_type='PLANNING_OPERATION'
 )
`;
