-- v179 - Distinguish Planning Operations from ST-scope-only Operations.
--
-- PLANNING_OPERATION:
--   Source -> Main -> ST Group -> Physical Area -> Schedule Area -> Planner
--
-- ST_SCOPE_ONLY:
--   Visible in All Open Jobs through NextOperation/ST Scope, but excluded from
--   Planning Chain, Batch creation candidates, Planning Board and Scheduling.

begin;

alter table public.md_st_operation_scope
 add column if not exists operation_type text;

update public.md_st_operation_scope
set operation_type=upper(trim(operation_type))
where upper(trim(coalesce(operation_type,''))) in ('PLANNING_OPERATION','ST_SCOPE_ONLY');

update public.md_st_operation_scope
set operation_type='PLANNING_OPERATION'
where operation_type is null
   or upper(trim(operation_type)) not in ('PLANNING_OPERATION','ST_SCOPE_ONLY');

alter table public.md_st_operation_scope
 alter column operation_type set default 'PLANNING_OPERATION',
 alter column operation_type set not null;

alter table public.md_st_operation_scope
 drop constraint if exists md_st_operation_scope_operation_type_check;

alter table public.md_st_operation_scope
 add constraint md_st_operation_scope_operation_type_check
 check(operation_type in ('PLANNING_OPERATION','ST_SCOPE_ONLY'));

create index if not exists ix_st_operation_scope_type_active_code
 on public.md_st_operation_scope(operation_type,is_active,operation_code);

-- Defensive cleanup for databases where the column may already have been
-- introduced manually before this migration.
update public.md_st_operation_mapping m
set is_active=false,updated_at=now()
where m.is_active=true
  and exists(
   select 1
   from public.md_st_operation_scope s
   where s.is_active=true
     and s.operation_type='ST_SCOPE_ONLY'
     and upper(trim(s.operation_code))=upper(trim(m.source_operation_code))
  );

-- Keep derived ST Routing rows in ST scope, but standardize only Operations
-- classified as PLANNING_OPERATION. This prevents an advanced/stale mapping
-- from leaking ST_SCOPE_ONLY into Planning Board.
create or replace function public.refresh_st_operation_mapping(
 p_routing_codes text[] default null
) returns void language plpgsql security definer as $$
begin
  with base as (
    select r.routing_code,r.seq,r.operation_code,
           lag(r.operation_code) over(partition by r.routing_code order by r.seq) prev_operation_code,
           lead(r.operation_code) over(partition by r.routing_code order by r.seq) next_operation_code,
           m.st_group,m.mapping_rule,m.standard_operation_rule,
           case when m.st_group='PRIMER' then row_number() over(partition by r.routing_code,m.st_group order by r.seq)
                when m.st_group='TOPCOAT' then row_number() over(partition by r.routing_code,m.st_group order by r.seq)
                else null end as occurrence_no
    from public.md_st_routing r
    left join lateral (
      select mm.*
      from public.md_st_operation_mapping mm
      join public.md_st_operation_scope scope
        on upper(trim(scope.operation_code))=upper(trim(mm.source_operation_code))
       and scope.is_active=true
       and scope.operation_type='PLANNING_OPERATION'
      where mm.is_active=true
        and upper(trim(mm.source_operation_code))=upper(trim(r.operation_code))
      order by case when mm.mapping_rule='SEQUENCE/FALLBACK' then 2 else 1 end,mm.sort_order
      limit 1
    ) m on true
    where r.is_active=true
      and (p_routing_codes is null or r.routing_code=any(p_routing_codes))
  ), calc as (
    select *,case
      when standard_operation_rule is null then null
      when st_group='PRIMER' then case when occurrence_no=1 then 'PRIMER' when occurrence_no=2 then 'PRIMER2' else 'PRIMER3' end
      when st_group='TOPCOAT' then case when occurrence_no=1 then 'TOPCOAT1' else 'TOPCOAT2' end
      when operation_code='HE-BAKE' and (prev_operation_code='PLA-ZiNi' or next_operation_code='PLA-CC') then 'HE-BAKE after plating'
      when operation_code='HE-BAKE' and next_operation_code in ('A-DBLST','M-DBLST') then 'HE-BAKE before blasting'
      when operation_code='HE-BAKE' then 'HE-BAKE'
      when mapping_rule='DIRECT' then standard_operation_rule
      else null end as standard_operation_calc
    from base
  )
  update public.md_st_routing r set
    standard_operation=c.standard_operation_calc,
    planning_group=c.st_group,
    mapping_rule=case when r.operation_code='HE-BAKE' then case when c.standard_operation_calc='HE-BAKE' then 'SEQUENCE/FALLBACK' else 'SEQUENCE' end else c.mapping_rule end,
    occurrence_no=c.occurrence_no
  from calc c
  where r.routing_code=c.routing_code and r.seq=c.seq;
end $$;

select public.refresh_st_operation_mapping(null);

commit;
