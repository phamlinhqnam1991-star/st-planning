-- ============================================================
-- 021_schedule_board.sql
-- Scheduling Board / finite resource assignment
-- Chemical Line: 6 Flybars, max 3 concurrent, 60-minute launch spacing
-- Painting: CAB1/CAB2/CAB3/CAB4 independent resources
-- ============================================================

begin;

create table if not exists public.md_schedule_resource(
    resource_code text primary key,
    resource_name text not null,
    resource_group text not null,
    area_name text,
    max_concurrent integer not null default 1 check(max_concurrent >= 1),
    launch_interval_minutes integer not null default 0 check(launch_interval_minutes >= 0),
    sort_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

insert into public.md_schedule_resource(
    resource_code,resource_name,resource_group,area_name,
    max_concurrent,launch_interval_minutes,sort_order,is_active
)
values
 ('SPX-CLEAN','SPX Clean','SPX_CLEAN','Sirius cleaning',1,0,5,true),
 ('MANUAL-DBL','Manual DBL','MANUAL_DBL','Manual Blasting',1,0,6,true),
 ('AUTO-DBL','Auto DBL','AUTO_DBL','Auto Blasting',1,0,7,true),
 ('PLATING','Plating','PLATING','Plating',1,0,8,true),
 ('HE-BAKE','He-Bake','HE_BAKE','He-bake Oven',1,0,9,true),
 ('PASS-BRTG','Passivation / Brightening','PASSIVATION','Passivation',1,0,10,true),
 ('MANUALSP','Manual Shot Peening','MANUALSP','Manual Shot peening',1,0,20,true),
 ('AUTOSHP','Automatic Shot Peening','AUTOSHP','Automatic shot peening',1,0,30,true),

 -- Six physical carriers. Line-level concurrency/launch rules are enforced
 -- by the scheduler across all CHEMICAL_LINE resources.
 ('FB-01','Chemical Line Flybar 01','CHEMICAL_LINE','chemical line',3,60,41,true),
 ('FB-02','Chemical Line Flybar 02','CHEMICAL_LINE','chemical line',3,60,42,true),
 ('FB-03','Chemical Line Flybar 03','CHEMICAL_LINE','chemical line',3,60,43,true),
 ('FB-04','Chemical Line Flybar 04','CHEMICAL_LINE','chemical line',3,60,44,true),
 ('FB-05','Chemical Line Flybar 05','CHEMICAL_LINE','chemical line',3,60,45,true),
 ('FB-06','Chemical Line Flybar 06','CHEMICAL_LINE','chemical line',3,60,46,true),

 ('CAB1','Painting CAB1','PAINTING','Painting',1,0,51,true),
 ('CAB2','Painting CAB2','PAINTING','Painting',1,0,52,true),
 ('CAB3','Painting CAB3','PAINTING','Painting',1,0,53,true),
 ('CAB4','Painting CAB4','PAINTING','Painting',1,0,54,true),
 ('PAINT-POWDER','Paint Powder','PAINT_POWDER','Powder coating',1,0,60,true)
on conflict(resource_code) do update set
 resource_name=excluded.resource_name,
 resource_group=excluded.resource_group,
 area_name=excluded.area_name,
 max_concurrent=excluded.max_concurrent,
 launch_interval_minutes=excluded.launch_interval_minutes,
 sort_order=excluded.sort_order,
 is_active=excluded.is_active,
 updated_at=now();

create table if not exists public.planning_schedule(
    id bigserial primary key,
    batch_id bigint not null references public.planning_batch(id) on delete cascade,
    resource_code text not null references public.md_schedule_resource(resource_code),
    schedule_date date not null,
    planned_start timestamptz not null,
    planned_end timestamptz not null,
    duration_minutes integer not null check(duration_minutes > 0),
    sequence_no integer not null default 0,
    status text not null default 'SCHEDULED'
      check(status in ('SCHEDULED','RELEASED','RUNNING','COMPLETED','CANCELLED')),
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint planning_schedule_time_ck check(planned_end > planned_start)
);

create unique index if not exists ux_planning_schedule_active_batch
on public.planning_schedule(batch_id)
where status <> 'CANCELLED';

create index if not exists ix_planning_schedule_resource_time
on public.planning_schedule(resource_code,planned_start,planned_end)
where status <> 'CANCELLED';

create index if not exists ix_planning_schedule_date
on public.planning_schedule(schedule_date,status);

commit;
