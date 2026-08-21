create extension if not exists pgcrypto;
create sequence if not exists public.st_routing_code_seq start 1;

create table if not exists public.master_import_batch(
 id uuid primary key default gen_random_uuid(), file_name text not null, storage_path text,
 status text not null default 'RUNNING' check(status in('RUNNING','SUCCESS','FAILED')),
 source_rows integer not null default 0, routing_rows integer not null default 0,
 started_by uuid references auth.users(id), created_at timestamptz not null default now(), finished_at timestamptz, error_message text
);
create table if not exists public.md_part(
 part_num text primary key, part_description text, program text, part_cluster text, surface_dm2 numeric,
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), last_import_batch_id uuid references public.master_import_batch(id)
);
create table if not exists public.md_part_revision(
 part_num text not null references public.md_part(part_num), revision_num text not null, is_active boolean not null default true,
 effective_from date, effective_to date, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), last_import_batch_id uuid references public.master_import_batch(id),
 primary key(part_num,revision_num)
);
create table if not exists public.md_operation(
 operation_code text primary key, operation_name text, department text, work_center text, process_group text,
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), last_import_batch_id uuid references public.master_import_batch(id)
);
create table if not exists public.md_routing_detailed(
 part_num text not null, revision_num text not null, source_seq integer not null, operation_code text not null, next_operation_code text,
 operation_detail_code text not null, operation_detail_name text not null, is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), last_import_batch_id uuid references public.master_import_batch(id),
 primary key(part_num,revision_num,source_seq)
);
create index if not exists ix_routing_detail_active on public.md_routing_detailed(is_active,operation_code);
create index if not exists ix_routing_detail_part_rev on public.md_routing_detailed(part_num,revision_num,source_seq);
create or replace view public.md_routing with (security_invoker=true) as
select part_num,revision_num,source_seq as seq,operation_code,is_active,last_import_batch_id from public.md_routing_detailed;

create table if not exists public.md_material_finish(
 part_num text not null, revision_num text not null, primer1 text, primer2 text, primer3 text, topcoat1 text, topcoat2 text, antiabration text,
 primer1_name text, topcoat_name text, antiabrasion_name text, varinish_name text, alloy text, temper text, tsa text, chemicalconv_airbus text,
 is_active boolean not null default true, updated_at timestamptz not null default now(), last_import_batch_id uuid references public.master_import_batch(id),
 primary key(part_num,revision_num)
);
create table if not exists public.md_process_requirement(
 part_num text not null, revision_num text not null, requirement_code text not null, requirement_value text,
 is_active boolean not null default true, updated_at timestamptz not null default now(), last_import_batch_id uuid references public.master_import_batch(id),
 primary key(part_num,revision_num,requirement_code)
);
create index if not exists ix_process_req_active_code on public.md_process_requirement(is_active,requirement_code);

create table if not exists public.md_st_operation_scope(
 operation_code text primary key, is_active boolean not null default true, note text, updated_at timestamptz not null default now()
);
create table if not exists public.md_st_routing_summary(
 routing_code text primary key, routing_name text not null, operation_count integer not null default 0, part_revision_count integer not null default 0,
 routing_signature text not null unique, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.md_st_routing(
 routing_code text not null references public.md_st_routing_summary(routing_code), seq integer not null, operation_code text not null,
 operation_detail_code text not null, operation_detail_name text not null, is_active boolean not null default true, note text,
 updated_at timestamptz not null default now(), primary key(routing_code,seq)
);
create table if not exists public.md_part_routing(
 part_num text not null, revision_num text not null, routing_code text not null references public.md_st_routing_summary(routing_code),
 is_active boolean not null default true, note text, updated_at timestamptz not null default now(), last_import_batch_id uuid references public.master_import_batch(id),
 primary key(part_num,revision_num)
);

alter table public.master_import_batch enable row level security;
alter table public.md_part enable row level security; alter table public.md_part_revision enable row level security;
alter table public.md_operation enable row level security; alter table public.md_routing_detailed enable row level security;
alter table public.md_material_finish enable row level security; alter table public.md_process_requirement enable row level security;
alter table public.md_st_operation_scope enable row level security; alter table public.md_st_routing_summary enable row level security;
alter table public.md_st_routing enable row level security; alter table public.md_part_routing enable row level security;

do $$ declare t text; begin
 foreach t in array array['master_import_batch','md_part','md_part_revision','md_operation','md_routing_detailed','md_material_finish','md_process_requirement','md_st_operation_scope','md_st_routing_summary','md_st_routing','md_part_routing'] loop
   execute format('drop policy if exists authenticated_read on public.%I',t);
   execute format('create policy authenticated_read on public.%I for select to authenticated using (true)',t);
 end loop; end $$;

insert into storage.buckets(id,name,public) values('master-imports','master-imports',false) on conflict(id) do nothing;
drop policy if exists master_import_upload on storage.objects;
create policy master_import_upload on storage.objects for insert to authenticated with check(bucket_id='master-imports');
drop policy if exists master_import_read on storage.objects;
create policy master_import_read on storage.objects for select to authenticated using(bucket_id='master-imports');
