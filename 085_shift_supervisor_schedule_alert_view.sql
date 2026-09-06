-- V506 · Shift Supervisor needs read access to Scheduling Board so the
-- Production Remove Before Start alert can be reviewed and accepted there.
insert into public.app_role_permission(role_key,permission_key)
values('SHIFT_SUPERVISOR','schedule.view')
on conflict do nothing;
