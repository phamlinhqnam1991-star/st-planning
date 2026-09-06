-- V512 · Masking Estimate advisory for Scheduling Board
-- Purpose: estimate masking workload/duration/ready time only; does NOT create a Masking scheduling resource.

begin;

create table if not exists public.md_masking_team_setting (
  setting_key text primary key default 'DEFAULT',
  total_people numeric not null default 0 check (total_people >= 0),
  note text null,
  updated_at timestamptz not null default now()
);

insert into public.md_masking_team_setting(setting_key,total_people,note)
values('DEFAULT',0,'V512 advisory masking manpower pool')
on conflict(setting_key) do nothing;

create table if not exists public.md_masking_area_manpower (
  area_code text primary key references public.md_area(area_code) on delete restrict,
  allocated_people numeric not null default 0 check (allocated_people >= 0),
  note text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.md_main_masking_time_column (
  id bigserial primary key,
  standard_operation text not null,
  source_column text not null,
  area_code text not null references public.md_area(area_code) on delete restrict,
  time_basis text not null default 'JOB_TOTAL' check (time_basis in ('JOB_TOTAL','PER_PIECE')),
  value_unit text not null default 'HOURS' check (value_unit in ('HOURS','MINUTES')),
  sort_order integer not null default 100,
  note text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(standard_operation,source_column)
);

create index if not exists ix_main_masking_time_column_active
  on public.md_main_masking_time_column(upper(trim(standard_operation)),is_active,sort_order,id);

create index if not exists ix_main_masking_time_column_source
  on public.md_main_masking_time_column(source_column,is_active);

create index if not exists ix_masking_area_manpower_active
  on public.md_masking_area_manpower(is_active,area_code);

comment on table public.md_main_masking_time_column is
'V512 advisory mapping: Main Operation -> All Open Job masking-time column + Physical Area. Used only to estimate masking duration/ready time on Scheduling Board.';

comment on table public.md_masking_area_manpower is
'V512 advisory masking manpower allocation by Physical Area. Used for estimate only; not a finite-capacity schedule resource.';

commit;
