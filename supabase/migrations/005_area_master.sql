-- Area Master v2026-08-21
-- Dynamic area catalog + user-managed ST Group -> Area assignment.
-- No hard-coded group assignment. Seed only the 14 confirmed Area names.

create table if not exists public.md_area (
  id bigserial primary key,
  area_code text not null unique,
  area_name text not null unique,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.md_area_operation_group (
  id bigserial primary key,
  area_id bigint not null references public.md_area(id) on delete restrict,
  st_group text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(st_group)
);

create index if not exists ix_area_active_sort on public.md_area(is_active, sort_order, area_name);
create index if not exists ix_area_group_area on public.md_area_operation_group(area_id) where is_active;

alter table public.md_area enable row level security;
alter table public.md_area_operation_group enable row level security;

drop policy if exists "authenticated read md_area" on public.md_area;
create policy "authenticated read md_area" on public.md_area for select to authenticated using (true);

drop policy if exists "authenticated read md_area_operation_group" on public.md_area_operation_group;
create policy "authenticated read md_area_operation_group" on public.md_area_operation_group for select to authenticated using (true);

insert into public.md_area(area_code,area_name,sort_order,is_active) values
('AREA_CHEM','Chemical line',10,true),
('AREA_NDT','NDT',20,true),
('AREA_ASP','Automatic shot peening',30,true),
('AREA_MSP','Manual Shot peening',40,true),
('AREA_MASK','Masking',50,true),
('AREA_UNMASK','Unmasking',60,true),
('AREA_PAINT','Painting',70,true),
('AREA_PLATING','Plating',80,true),
('AREA_SIRIUS','Sirius cleaning',90,true),
('AREA_MBLAST','Manual Blasting',100,true),
('AREA_ABLAST','Auto Blasting',110,true),
('AREA_PASS','Passivation',120,true),
('AREA_POWDER','Powder coating',130,true),
('AREA_HEBAKE','He-bake Oven',140,true)
on conflict(area_code) do update set
  area_name=excluded.area_name,
  sort_order=excluded.sort_order,
  is_active=true,
  updated_at=now();
