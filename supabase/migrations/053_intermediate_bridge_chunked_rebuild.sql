-- v298 - Chunked / resumable Auto Intermediate Bridge rebuild
--
-- Full rebuild is no longer executed inside one web request. A run snapshots
-- the routing_code list and Main/Skip lookup, processes small chunks into
-- staging tables, then atomically publishes the staged result.

begin;

create table if not exists public.md_intermediate_bridge_rebuild_run (
  run_id text primary key,
  mode text not null default 'FULL',
  status text not null default 'RUNNING',
  total_routings integer not null default 0,
  processed_routings integer not null default 0,
  last_routing_code text,
  chunk_size integer not null default 150,
  planning_main_codes text[] not null default '{}',
  excluded_operation_codes text[] not null default '{}',
  source_fingerprint text not null default '',
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  constraint md_intermediate_bridge_rebuild_run_mode_check
    check (mode in ('FULL','INCREMENTAL')),
  constraint md_intermediate_bridge_rebuild_run_status_check
    check (status in ('RUNNING','READY_TO_FINALIZE','FINALIZING','COMPLETED','CANCELLED','FAILED')),
  constraint md_intermediate_bridge_rebuild_run_chunk_check
    check (chunk_size between 25 and 500)
);

create table if not exists public.md_intermediate_bridge_rebuild_route (
  run_id text not null references public.md_intermediate_bridge_rebuild_run(run_id) on delete cascade,
  route_index integer not null,
  routing_code text not null,
  processed_at timestamptz,
  primary key(run_id,route_index),
  unique(run_id,routing_code)
);

create table if not exists public.md_intermediate_bridge_stage_segment (
  run_id text not null references public.md_intermediate_bridge_rebuild_run(run_id) on delete cascade,
  bridge_key text not null,
  previous_main_operation text not null,
  next_main_operation text not null,
  intermediate_signature text not null,
  route_count integer not null default 0,
  primary key(run_id,bridge_key)
);

create table if not exists public.md_intermediate_bridge_stage_operation (
  run_id text not null,
  bridge_key text not null,
  sequence_no integer not null,
  operation_code text not null,
  primary key(run_id,bridge_key,sequence_no),
  foreign key(run_id,bridge_key)
    references public.md_intermediate_bridge_stage_segment(run_id,bridge_key)
    on delete cascade
);

create table if not exists public.md_intermediate_bridge_stage_route (
  run_id text not null,
  bridge_key text not null,
  routing_code text not null,
  previous_main_seq integer,
  next_main_seq integer,
  primary key(run_id,bridge_key,routing_code,previous_main_seq,next_main_seq),
  foreign key(run_id,bridge_key)
    references public.md_intermediate_bridge_stage_segment(run_id,bridge_key)
    on delete cascade
);

create index if not exists ix_bridge_rebuild_run_incomplete
  on public.md_intermediate_bridge_rebuild_run(updated_at desc)
  where status in ('RUNNING','READY_TO_FINALIZE','FINALIZING','FAILED');

create index if not exists ix_bridge_rebuild_route_next
  on public.md_intermediate_bridge_rebuild_route(run_id,route_index)
  where processed_at is null;

create index if not exists ix_bridge_stage_route_routing
  on public.md_intermediate_bridge_stage_route(run_id,routing_code);

-- Primary lookup used by every chunk. Only active standardized routes matter.
create index if not exists ix_md_st_routing_code_seq_active
  on public.md_st_routing(routing_code,seq)
  where is_active=true;

-- Normalized lookups used by Main/Scope discovery.
create index if not exists ix_md_st_operation_scope_code_type_active
  on public.md_st_operation_scope(upper(trim(operation_code)),operation_type)
  where is_active=true;

create index if not exists ix_md_planning_operation_scope_std_active
  on public.md_planning_operation_scope(upper(trim(standard_operation)))
  where is_active=true;

commit;
