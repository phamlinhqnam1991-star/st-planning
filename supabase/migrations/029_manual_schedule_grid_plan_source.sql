-- ================================================================
-- 029_manual_schedule_grid_plan_source.sql
-- Unified source marker for Manual Grid / Planning Board / Auto Plan
-- ================================================================
begin;

alter table public.planning_batch
  add column if not exists plan_source text not null default 'PLANNING_BOARD';

alter table public.planning_schedule
  add column if not exists plan_source text not null default 'PLANNING_BOARD';

alter table public.planning_batch
  drop constraint if exists ck_planning_batch_plan_source;
alter table public.planning_batch
  add constraint ck_planning_batch_plan_source
  check (plan_source in ('MANUAL_GRID','PLANNING_BOARD','AUTO_PLAN'));

alter table public.planning_schedule
  drop constraint if exists ck_planning_schedule_plan_source;
alter table public.planning_schedule
  add constraint ck_planning_schedule_plan_source
  check (plan_source in ('MANUAL_GRID','PLANNING_BOARD','AUTO_PLAN'));

comment on column public.planning_batch.plan_source is
'Planning source. MANUAL_GRID = direct scheduling grid; PLANNING_BOARD = candidate/manual batch; AUTO_PLAN = future auto engine.';

comment on column public.planning_schedule.plan_source is
'Scheduling source propagated from planning_batch; future Auto Schedule uses AUTO_PLAN.';

commit;
