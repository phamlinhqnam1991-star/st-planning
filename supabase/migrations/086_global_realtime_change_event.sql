-- V508 · Global Realtime No-Supabase
-- Tiny PostgreSQL invalidation feed. Business data remains in existing tables;
-- this table stores only cross-device change signals so every open browser can
-- reconcile without manual Refresh/F5 or Supabase Realtime.

create table if not exists public.system_change_event (
  id bigserial primary key,
  event_id text not null unique,
  at_ms bigint not null,
  source_tab_id text not null,
  method varchar(12) not null,
  path text not null,
  domains text[] not null default '{}'::text[],
  created_by_user_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_system_change_event_created_at
  on public.system_change_event(created_at desc);

comment on table public.system_change_event is
  'V508 lightweight invalidation feed for Global Realtime No-Supabase. No business state is stored here.';
