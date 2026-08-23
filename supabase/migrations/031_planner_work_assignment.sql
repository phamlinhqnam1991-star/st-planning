-- v94 Planner Work Assignment
-- Assignment is independent from Schedule Area master so areas can move between planners without changing process logic.
begin;

create table if not exists public.md_planner_work_assignment(
  schedule_area_code text primary key
    references public.md_schedule_area(schedule_area_code) on delete cascade,
  planner_owner text not null default 'UNASSIGNED'
    check(planner_owner in ('1','2','UNASSIGNED')),
  note text,
  updated_by text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.md_planner_work_assignment(schedule_area_code,planner_owner,is_active)
select
 a.schedule_area_code,
 case when a.planner_owner in ('1','2') then a.planner_owner else 'UNASSIGNED' end,
 true
from public.md_schedule_area a
on conflict(schedule_area_code) do nothing;

alter table public.md_planner_work_assignment enable row level security;
drop policy if exists "authenticated read md_planner_work_assignment" on public.md_planner_work_assignment;
create policy "authenticated read md_planner_work_assignment"
 on public.md_planner_work_assignment for select to authenticated using(true);

commit;
