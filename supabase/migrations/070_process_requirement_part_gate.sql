-- =====================================================================
-- 070_process_requirement_part_gate.sql
-- Part/Revision gate before Process Requirement import.
--
-- Example seeded rule:
--   Requirement ST = NO
--   -> store ZERO md_process_requirement rows for that Part/Revision.
--
-- Gate rules are configurable. Any active rule match skips all Process
-- Requirement rows for the source Part/Revision. Existing rows are removed
-- on the next Master Import by the V375 importer synchronization step.
-- =====================================================================

begin;

create table if not exists public.md_process_requirement_gate_rule(
  id bigserial primary key,
  requirement_code text not null unique,
  blocked_values text[] not null default '{}'::text[],
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.md_process_requirement_gate_rule enable row level security;

drop policy if exists "authenticated read process requirement gate rule"
on public.md_process_requirement_gate_rule;
create policy "authenticated read process requirement gate rule"
on public.md_process_requirement_gate_rule
for select to authenticated
using(true);

insert into public.md_process_requirement_gate_rule(
  requirement_code,blocked_values,is_active,note
)
values(
  'ST',array['NO']::text[],true,
  'If Master Requirement ST = NO, skip all Process Requirement rows for that Part/Revision.'
)
on conflict(requirement_code) do nothing;

comment on table public.md_process_requirement_gate_rule is
'Part/Revision-level Process Requirement import gates. A matching blocked value skips all Requirement rows for that Part/Revision.';

commit;
