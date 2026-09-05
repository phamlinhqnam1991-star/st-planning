create table if not exists public.app_role_permission (
  role_key text not null references public.app_role(role_key) on delete cascade,
  permission_key text not null references public.app_permission(permission_key) on delete cascade,
  primary key(role_key,permission_key)
);

create table if not exists public.app_user_permission (
  user_id uuid not null references public.app_user_profile(user_id) on delete cascade,
  permission_key text not null references public.app_permission(permission_key) on delete cascade,
  allowed boolean not null default true,
  primary key(user_id,permission_key)
);

create table if not exists public.app_user_scope (
  user_id uuid not null references public.app_user_profile(user_id) on delete cascade,
  scope_type text not null check(scope_type in ('PLANNING_MAIN','SCHEDULE_AREA','PRODUCTION_AREA')),
  scope_key text not null,
  created_at timestamptz not null default now(),
  primary key(user_id,scope_type,scope_key)
);

create table if not exists public.app_audit_log (
  id bigserial primary key,
  user_id uuid,
  email text,
  action text not null,
  entity_type text,
  entity_id text,
  summary text,
  before_json jsonb,
  after_json jsonb,
  metadata_json jsonb,
  created_at timestamptz not null default now()
);
