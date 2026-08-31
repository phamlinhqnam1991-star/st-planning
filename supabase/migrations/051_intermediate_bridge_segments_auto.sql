-- v296 - Auto Intermediate Bridge Segments from ST Routing Chain · Standardized
--
-- Replaces the v295 one-operation -> Previous Main -> Next Main runtime model.
-- INTERMEDIATE remains a raw-operation classification only. Previous/Next Main
-- are discovered automatically from md_st_routing by routing_code + seq.

begin;

create table if not exists public.md_intermediate_bridge_segment (
  id bigserial primary key,
  bridge_key text not null unique,
  previous_main_operation text not null,
  next_main_operation text not null,
  intermediate_signature text not null,
  source text not null default 'AUTO_ROUTING',
  route_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint md_intermediate_bridge_segment_source_check
    check (source in ('AUTO_ROUTING','MANUAL')),
  constraint md_intermediate_bridge_segment_prev_next_check
    check (upper(trim(previous_main_operation)) <> upper(trim(next_main_operation)))
);

create table if not exists public.md_intermediate_bridge_operation (
  id bigserial primary key,
  segment_id bigint not null references public.md_intermediate_bridge_segment(id) on delete cascade,
  sequence_no integer not null,
  operation_code text not null,
  created_at timestamptz not null default now(),
  unique(segment_id,sequence_no)
);

create table if not exists public.md_intermediate_bridge_route (
  id bigserial primary key,
  segment_id bigint not null references public.md_intermediate_bridge_segment(id) on delete cascade,
  routing_code text not null,
  previous_main_seq integer,
  next_main_seq integer,
  created_at timestamptz not null default now(),
  unique(segment_id,routing_code,previous_main_seq,next_main_seq)
);

create index if not exists ix_intermediate_bridge_segment_pair
  on public.md_intermediate_bridge_segment(
    upper(trim(previous_main_operation)),
    upper(trim(next_main_operation))
  ) where is_active=true;

create index if not exists ix_intermediate_bridge_operation_code
  on public.md_intermediate_bridge_operation(upper(trim(operation_code)),segment_id);

create index if not exists ix_intermediate_bridge_route_code
  on public.md_intermediate_bridge_route(routing_code,segment_id);

-- v295 bridge columns are kept only for backward schema compatibility/audit.
-- Runtime v296 no longer reads them. Clear active INTERMEDIATE values so there
-- is one source of truth: md_intermediate_bridge_segment + operation + route.
update public.md_st_operation_scope
set previous_main_operation=null,
    next_main_operation=null,
    updated_at=now()
where is_active=true
  and operation_type='INTERMEDIATE'
  and (previous_main_operation is not null or next_main_operation is not null);

commit;
