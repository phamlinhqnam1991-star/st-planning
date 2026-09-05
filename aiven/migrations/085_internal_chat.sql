create table if not exists public.app_chat_message (
  id bigserial primary key,
  message_type text not null default 'USER' check(message_type in ('USER','SYSTEM')),
  sender_user_id uuid references public.app_user_profile(user_id) on delete set null,
  sender_display_name text,
  body text not null,
  event_key text,
  is_cross_planner boolean not null default false,
  source_main text,
  affected_main text,
  source_planner text,
  affected_planner text,
  entity_type text,
  entity_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_chat_user_state (
  user_id uuid primary key references public.app_user_profile(user_id) on delete cascade,
  last_read_message_id bigint not null default 0,
  last_read_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists ix_app_chat_message_created on public.app_chat_message(id desc,created_at desc);

with permission_rows(permission_key,permission_name,module_key,description) as (
 values
  ('chat.view','Xem Chat nội bộ','CHAT','Xem nhóm Chat nội bộ và thông báo thay đổi hệ thống'),
  ('chat.send','Gửi Chat nội bộ','CHAT','Gửi tin nhắn vào nhóm Chat nội bộ')
), upsert_permission as (
 insert into public.app_permission(permission_key,permission_name,module_key,description)
 select * from permission_rows
 on conflict(permission_key) do update set
  permission_name=excluded.permission_name,
  module_key=excluded.module_key,
  description=excluded.description
 returning permission_key
)
insert into public.app_role_permission(role_key,permission_key)
select r.role_key,p.permission_key
from public.app_role r
cross join upsert_permission p
where r.role_key in ('ADMIN','PLANNER','PRODUCTION_OPERATOR','SHIFT_SUPERVISOR')
on conflict do nothing;
