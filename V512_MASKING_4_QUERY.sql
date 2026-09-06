-- V512/V513 · Masking Time Estimate Advisory
-- Aiven PostgreSQL · CHỈ 4 QUERY · chạy lần lượt 1 -> 4

-- QUERY 1
create table if not exists public.md_masking_team_setting (
  setting_key text primary key default 'DEFAULT',
  total_people numeric not null default 0 check (total_people >= 0),
  note text null,
  updated_at timestamptz not null default now()
);

-- QUERY 2
insert into public.md_masking_team_setting(setting_key,total_people,note)
values('DEFAULT',0,'V512 advisory masking manpower pool')
on conflict(setting_key) do nothing;

-- QUERY 3
create table if not exists public.md_masking_area_manpower (
  area_code text primary key references public.md_area(area_code) on delete restrict,
  allocated_people numeric not null default 0 check (allocated_people >= 0),
  note text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- QUERY 4
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
