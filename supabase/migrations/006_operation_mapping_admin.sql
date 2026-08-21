-- ST Operation Mapping Admin
-- Adds audit trail only. Existing mapping data and routing logic are preserved.
create table if not exists public.md_st_operation_mapping_history(
  id bigserial primary key,
  mapping_id bigint,
  action text not null check(action in ('ADD','UPDATE','DEACTIVATE','ACTIVATE','MOVE')),
  source_operation_code text,
  old_st_group text,
  new_st_group text,
  old_standard_operation_rule text,
  new_standard_operation_rule text,
  old_mapping_rule text,
  new_mapping_rule text,
  changed_by text,
  changed_at timestamptz not null default now()
);
create index if not exists ix_st_mapping_group_active on public.md_st_operation_mapping(st_group,is_active);
create index if not exists ix_st_mapping_history_mapping on public.md_st_operation_mapping_history(mapping_id,changed_at desc);
alter table public.md_st_operation_mapping_history enable row level security;
drop policy if exists "authenticated read mapping history" on public.md_st_operation_mapping_history;
create policy "authenticated read mapping history" on public.md_st_operation_mapping_history for select to authenticated using (true);
