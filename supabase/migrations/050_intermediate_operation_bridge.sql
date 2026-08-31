-- v295 - Intermediate Operation Bridge
--
-- INTERMEDIATE is a real shop-floor NextOperation used by VIEW CÔNG ĐOẠN ST,
-- but it is NOT a Main Planning Operation and does not create its own
-- planning_job_operation row / Batch / Schedule.
-- It bridges the current raw NextOperation to the canonical Main Planning chain
-- created from AllOperation.

begin;

alter table public.md_st_operation_scope
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists previous_main_operation text,
  add column if not exists next_main_operation text;

alter table public.md_st_operation_scope
  drop constraint if exists md_st_operation_scope_operation_type_check;

alter table public.md_st_operation_scope
  add constraint md_st_operation_scope_operation_type_check
  check(operation_type in ('PLANNING_OPERATION','INTERMEDIATE','ST_SCOPE_ONLY'));

-- Normalize bridge metadata.
update public.md_st_operation_scope
set previous_main_operation=nullif(upper(trim(previous_main_operation)),''),
    next_main_operation=nullif(upper(trim(next_main_operation)),'')
where previous_main_operation is not null
   or next_main_operation is not null;

-- Only INTERMEDIATE keeps bridge metadata.
update public.md_st_operation_scope
set previous_main_operation=null,
    next_main_operation=null
where operation_type<>'INTERMEDIATE'
  and (previous_main_operation is not null or next_main_operation is not null);

-- An INTERMEDIATE raw operation must never retain a Source -> Main mapping.
update public.md_st_operation_mapping m
set is_active=false,updated_at=now()
where m.is_active=true
  and exists(
    select 1
    from public.md_st_operation_scope s
    where s.is_active=true
      and s.operation_type='INTERMEDIATE'
      and upper(trim(s.operation_code))=upper(trim(m.source_operation_code))
  );

-- Nor may an old live chain row survive for the intermediate raw source code.
update public.planning_job_operation p
set is_active=false,updated_at=now()
where p.is_active=true
  and exists(
    select 1
    from public.md_st_operation_scope s
    where s.is_active=true
      and s.operation_type='INTERMEDIATE'
      and upper(trim(s.operation_code))=upper(trim(p.source_operation_code))
  );

create index if not exists ix_st_operation_scope_intermediate_next
  on public.md_st_operation_scope(
    upper(trim(operation_code)),
    upper(trim(next_main_operation))
  )
  where is_active=true and operation_type='INTERMEDIATE';

create index if not exists ix_st_operation_scope_intermediate_prev
  on public.md_st_operation_scope(
    upper(trim(operation_code)),
    upper(trim(previous_main_operation))
  )
  where is_active=true and operation_type='INTERMEDIATE';

commit;
