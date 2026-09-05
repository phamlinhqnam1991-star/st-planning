create table if not exists public.app_session (
  session_id uuid primary key,
  user_id uuid not null references public.app_user_profile(user_id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists ix_app_session_user_active on public.app_session(user_id,expires_at) where revoked_at is null;

create index if not exists ix_app_session_expiry on public.app_session(expires_at);
