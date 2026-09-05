create index if not exists ix_app_user_profile_email on public.app_user_profile(lower(email));
create index if not exists ix_app_user_scope_lookup on public.app_user_scope(user_id,scope_type,scope_key);
create index if not exists ix_app_user_role_user on public.app_user_role(user_id,role_key);
create index if not exists ix_app_user_permission_user on public.app_user_permission(user_id,permission_key,allowed);
