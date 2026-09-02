-- =====================================================================
-- 069_process_requirement_filtered_import.sql
-- Keep only Process Requirement codes that are actually required by an
-- active MD:REQ Recipe Rule, plus optional planner-managed manual keep codes.
--
-- IMPORTANT:
-- This migration does NOT delete/truncate md_process_requirement.
-- Existing large data is preserved until the planner explicitly runs the
-- cleanup action from Configuration -> Process Requirement Import Filter,
-- then re-imports the Master Excel with the filtered importer.
-- =====================================================================

begin;

create table if not exists public.md_process_requirement_keep(
  requirement_code text primary key,
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.md_process_requirement_keep enable row level security;

drop policy if exists "authenticated read process requirement keep"
on public.md_process_requirement_keep;
create policy "authenticated read process requirement keep"
on public.md_process_requirement_keep
for select to authenticated
using(true);

comment on table public.md_process_requirement_keep is
'Optional Process Requirement codes to keep/import even when no active MD:REQ Recipe Rule currently references them.';

commit;
