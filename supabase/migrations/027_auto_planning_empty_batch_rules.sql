-- ============================================================
-- 027_auto_planning_empty_batch_rules.sql
-- Foundation for:
-- Auto Plan -> Auto Batch -> Auto Schedule -> Auto Fill
-- Defaults preserve the current manual workflow.
-- ============================================================

begin;

alter table public.md_auto_planning_rule
  add column if not exists allow_empty_batch boolean not null default true,
  add column if not exists allow_schedule_empty_batch boolean not null default true,
  add column if not exists auto_create_empty_batch boolean not null default false,
  add column if not exists auto_fill_scheduled_batch boolean not null default false,
  add column if not exists require_recipe_before_schedule boolean not null default false,
  add column if not exists require_paint_type_before_schedule boolean not null default false,
  add column if not exists batch_lock_before_start_minutes integer not null default 0;

alter table public.md_auto_planning_rule
  drop constraint if exists ck_auto_plan_lock_before_start_minutes;

alter table public.md_auto_planning_rule
  add constraint ck_auto_plan_lock_before_start_minutes
  check (batch_lock_before_start_minutes >= 0);

comment on column public.md_auto_planning_rule.allow_empty_batch is
'Allow a planning Batch container to be created with Jobs=0 before WIP arrives.';

comment on column public.md_auto_planning_rule.allow_schedule_empty_batch is
'Allow a Jobs=0 Batch to be scheduled to Resource/Start/Duration before Fill Jobs.';

comment on column public.md_auto_planning_rule.auto_create_empty_batch is
'Future Auto Batch engine may create an empty plan-ahead Batch for this Standard Operation. Does not run automatically in v87.';

comment on column public.md_auto_planning_rule.auto_fill_scheduled_batch is
'Future Auto Fill engine may fill eligible Candidate Jobs into an already scheduled open Batch. Does not run automatically in v87.';

comment on column public.md_auto_planning_rule.require_recipe_before_schedule is
'When enforced by Auto Schedule, Batch must have Recipe before scheduling.';

comment on column public.md_auto_planning_rule.require_paint_type_before_schedule is
'When enforced by Auto Schedule, paint Batch must have its paint requirement resolved before scheduling.';

comment on column public.md_auto_planning_rule.batch_lock_before_start_minutes is
'Future lock cutoff: stop Add/Remove Job this many minutes before scheduled start. 0 means no automatic cutoff.';

commit;
