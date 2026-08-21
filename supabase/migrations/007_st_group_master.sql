-- Dynamic ST Group Master
create table if not exists public.md_st_group(
  st_group text primary key,
  group_name text not null,
  description text,
  sort_order integer not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.md_st_group(st_group,group_name,sort_order,is_active)
select st_group,st_group,row_number() over(order by st_group),true
from (
  select distinct st_group from public.md_operation_master where st_group is not null and trim(st_group)<>''
  union
  select distinct st_group from public.md_st_operation_mapping where st_group is not null and trim(st_group)<>''
) x
on conflict(st_group) do update set is_active=true,updated_at=now();

alter table public.md_st_group enable row level security;
drop policy if exists "authenticated read st group" on public.md_st_group;
create policy "authenticated read st group" on public.md_st_group for select to authenticated using (true);
