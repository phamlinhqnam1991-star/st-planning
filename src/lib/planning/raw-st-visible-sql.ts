/**
 * Canonical RAW NextOperation ST membership used by Planning Board/Dashboard.
 *
 * V408: operation-code membership alone is NOT enough for Bridge Intermediate.
 * A Job enters the ST population only when its RAW NextOperation is either:
 *   1) a direct active PLANNING_OPERATION that resolves to the Job's live
 *      Current Main; or
 *   2) an Intermediate Operation in an active Bridge whose ordered pair
 *      LastOperation -> NextOperation is valid and whose next_main_operation is
 *      exactly the Job's live Current Main.
 * ST_SCOPE_ONLY always remains excluded.
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

/**
 * Context-aware ST classification for one open Job.
 * The aliases are internal fixed identifiers supplied by server code only.
 */
export function rawStOperationTypeSql(jobAlias="j",currentMainAlias="current_main"){
 const j=jobAlias;
 const p=currentMainAlias;
 const raw=`upper(trim(coalesce(${j}.next_operation,'')))`;
 const last=`upper(trim(coalesce(${j}.last_operation,'')))`;
 const currentMain=`upper(trim(coalesce(${p}.standard_operation,'')))`;
 const currentSource=`upper(trim(coalesce(${p}.source_operation_code,'')))`;
 return `case
  when exists(
   select 1 from public.md_st_operation_scope sx
   where sx.is_active=true
     and sx.operation_type='ST_SCOPE_ONLY'
     and upper(trim(sx.operation_code))=${raw}
  ) then 'ST_SCOPE_ONLY'
  when ${p}.id is not null
   and exists(
    select 1 from public.md_st_operation_scope sx
    where sx.is_active=true
      and sx.operation_type='PLANNING_OPERATION'
      and upper(trim(sx.operation_code))=${raw}
   )
   and (
    ${currentSource}=${raw}
    or ${currentMain}=${raw}
    or exists(
     select 1 from public.md_st_operation_mapping mx
     where mx.is_active=true
       and upper(trim(mx.source_operation_code))=${raw}
       and upper(trim(mx.standard_operation_rule))=${currentMain}
    )
   ) then 'PLANNING_OPERATION'
  when ${p}.id is not null
   and exists(
    select 1
    from public.md_intermediate_bridge_operation bo
    join public.md_intermediate_bridge_segment bs
      on bs.id=bo.segment_id
     and bs.is_active=true
    where upper(trim(bo.operation_code))=${raw}
      and upper(trim(bs.next_main_operation))=${currentMain}
      and (
       (
        bo.sequence_no>1
        and exists(
         select 1
         from public.md_intermediate_bridge_operation prevbo
         where prevbo.segment_id=bo.segment_id
           and prevbo.sequence_no=bo.sequence_no-1
           and upper(trim(prevbo.operation_code))=${last}
        )
       )
       or
       (
        bo.sequence_no=1
        and (
         upper(trim(bs.previous_main_operation))=${last}
         or exists(
          select 1 from public.md_st_operation_mapping pm
          where pm.is_active=true
            and upper(trim(pm.source_operation_code))=${last}
            and upper(trim(pm.standard_operation_rule))=upper(trim(bs.previous_main_operation))
         )
        )
       )
      )
   ) then 'INTERMEDIATE'
  else null
 end`;
}

export function rawStJobMatchSql(jobAlias="j",currentMainAlias="current_main"){
 return `(${rawStOperationTypeSql(jobAlias,currentMainAlias)}) in ('PLANNING_OPERATION','INTERMEDIATE')`;
}
