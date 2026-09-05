create table if not exists public.app_user_profile (
  user_id uuid primary key,
  email text not null unique,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_role (
  role_key text primary key,
  role_name text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_permission (
  permission_key text primary key,
  permission_name text not null,
  module_key text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_user_role (
  user_id uuid not null references public.app_user_profile(user_id) on delete cascade,
  role_key text not null references public.app_role(role_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,role_key)
);
