alter table public.app_user_profile add column if not exists password_hash text, add column if not exists password_changed_at timestamptz, add column if not exists last_login_at timestamptz;

alter table public.app_user_profile add column if not exists must_change_password boolean not null default false;

create index if not exists ix_app_user_profile_active_email on public.app_user_profile(is_active,lower(email));
