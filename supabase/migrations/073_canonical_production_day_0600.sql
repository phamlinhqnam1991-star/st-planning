begin;

-- V445 · Canonical production date = planned START owner in Asia/Ho_Chi_Minh.
-- 06:00 selected date <= planned_start < 06:00 next date belongs to selected date.
-- Therefore local 00:00-05:59 belongs to the PREVIOUS production date.
update public.planning_schedule
set schedule_date=(((planned_start at time zone 'Asia/Ho_Chi_Minh') - interval '6 hours')::date),
    updated_at=now()
where planned_start is not null
  and schedule_date is distinct from (((planned_start at time zone 'Asia/Ho_Chi_Minh') - interval '6 hours')::date);

comment on column public.planning_schedule.schedule_date is
'Canonical ST production date. Ownership is based on planned_start in Asia/Ho_Chi_Minh: 06:00 selected date <= Start < 06:00 next date. Local 00:00-05:59 belongs to the previous production date.';

commit;
