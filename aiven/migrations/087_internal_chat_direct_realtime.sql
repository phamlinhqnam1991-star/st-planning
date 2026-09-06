-- V510 · Internal Chat stability + direct user chat + per-conversation unread state
-- Canonical database: Aiven PostgreSQL. Supabase is not used.

alter table public.app_chat_message
  add column if not exists recipient_user_id uuid references public.app_user_profile(user_id) on delete set null;

create table if not exists public.app_chat_read_state (
  user_id uuid not null references public.app_user_profile(user_id) on delete cascade,
  conversation_key text not null,
  last_read_message_id bigint not null default 0,
  last_read_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(user_id,conversation_key)
);

insert into public.app_chat_read_state(user_id,conversation_key,last_read_message_id,last_read_at,updated_at)
select user_id,'GROUP',last_read_message_id,last_read_at,updated_at
from public.app_chat_user_state
on conflict(user_id,conversation_key) do nothing;

create index if not exists ix_app_chat_message_recipient_id on public.app_chat_message(recipient_user_id,id desc);
create index if not exists ix_app_chat_message_sender_id on public.app_chat_message(sender_user_id,id desc);
create index if not exists ix_app_chat_read_state_user on public.app_chat_read_state(user_id,conversation_key,last_read_message_id);
