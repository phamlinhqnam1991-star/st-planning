-- v93 Schedule Area Master: configurable scheduling columns/areas.
begin;

create table if not exists public.md_schedule_area(
  schedule_area_code text primary key,
  schedule_area_name text not null,
  resource_group text,
  resource_code text,
  planner_owner text not null default 'BOTH'
    check(planner_owner in ('1','2','BOTH')),
  display_order integer not null default 0,
  default_rows integer not null default 20 check(default_rows between 1 and 200),
  allow_manual_plan boolean not null default true,
  allow_auto_plan boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.md_schedule_area_operation(
  id bigserial primary key,
  schedule_area_code text not null references public.md_schedule_area(schedule_area_code) on delete cascade,
  standard_operation text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(schedule_area_code,standard_operation)
);

create index if not exists ix_schedule_area_order
 on public.md_schedule_area(is_active,display_order,schedule_area_code);
create index if not exists ix_schedule_area_operation_op
 on public.md_schedule_area_operation(standard_operation) where is_active;

alter table public.md_schedule_area enable row level security;
alter table public.md_schedule_area_operation enable row level security;

drop policy if exists "authenticated read md_schedule_area" on public.md_schedule_area;
create policy "authenticated read md_schedule_area"
 on public.md_schedule_area for select to authenticated using(true);

drop policy if exists "authenticated read md_schedule_area_operation" on public.md_schedule_area_operation;
create policy "authenticated read md_schedule_area_operation"
 on public.md_schedule_area_operation for select to authenticated using(true);

insert into public.md_schedule_area(
 schedule_area_code,schedule_area_name,resource_group,resource_code,
 planner_owner,display_order,default_rows,allow_manual_plan,allow_auto_plan,is_active
) values
 ('SPX_CLEAN','SPX Clean','SPX_CLEAN','SPX-CLEAN','BOTH',10,20,true,true,true),
 ('MANUAL_DBL','Manual DBL','MANUAL_DBL','MANUAL-DBL','BOTH',20,20,true,true,true),
 ('AUTO_DBL','Auto DBL','AUTO_DBL','AUTO-DBL','BOTH',30,20,true,true,true),
 ('PLATING','Plating','PLATING','PLATING','BOTH',40,20,true,true,true),
 ('HE_BAKE','He-Bake','HE_BAKE','HE-BAKE','BOTH',50,20,true,true,true),
 ('PASS_BRTG','Passivation / Brightening','PASSIVATION','PASS-BRTG','BOTH',60,20,true,true,true),
 ('MANUALSP','Batch# ManualSP','MANUALSP','MANUALSP','1',70,20,true,true,true),
 ('AUTOSHP','Batch# AutoSHP','AUTOSHP','AUTOSHP','1',80,20,true,true,true),
 ('CHEMICAL_LINE','Flybar#','CHEMICAL_LINE',null,'1',90,20,true,true,true),
 ('CAB1','Batch# CAB1','PAINTING','CAB1','2',100,20,true,true,true),
 ('CAB2','Batch# CAB2','PAINTING','CAB2','2',110,20,true,true,true),
 ('CAB3','Batch# CAB3','PAINTING','CAB3','2',120,20,true,true,true),
 ('PAINT_POWDER','Paint Powder','PAINT_POWDER','PAINT-POWDER','2',130,20,true,true,true)
on conflict(schedule_area_code) do update set
 schedule_area_name=excluded.schedule_area_name,
 resource_group=excluded.resource_group,
 resource_code=excluded.resource_code,
 planner_owner=excluded.planner_owner,
 display_order=excluded.display_order,
 allow_manual_plan=excluded.allow_manual_plan,
 allow_auto_plan=excluded.allow_auto_plan,
 is_active=true,
 updated_at=now();

commit;
