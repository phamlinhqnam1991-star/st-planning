-- 075 Main Operation Masking / Unmasking configuration
-- Explicitly maps support operations that occur BEFORE each normalized Main Planning Operation.
-- Existing derived resolver remains the fallback when a Main has no explicit configuration.

create table if not exists public.md_main_support_operation (
  id bigserial primary key,
  standard_operation text not null,
  support_type text not null check (support_type in ('MASKING','UNMASKING')),
  support_operation_code text not null,
  relation text not null default 'BEFORE_MAIN' check (relation in ('BEFORE_MAIN')),
  sort_order integer not null default 100,
  note text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (standard_operation,support_type,support_operation_code,relation)
);

create index if not exists idx_main_support_operation_active
  on public.md_main_support_operation(upper(trim(standard_operation)),support_type,is_active);

-- Default paint support mapping. These are the physical routing support operation codes
-- already used by the current ST routing model. Planner can add/remove them in Configuration.
insert into public.md_main_support_operation(standard_operation,support_type,support_operation_code,relation,sort_order,note)
select x.standard_operation,x.support_type,x.support_operation_code,'BEFORE_MAIN',x.sort_order,'Default paint support mapping v451'
from (values
  ('PRIMER','MASKING','MSKG-TC',10),
  ('PRIMER','UNMASKING','UNMSKG',20),
  ('PRIMER2','MASKING','MSKG-TC',10),
  ('PRIMER2','UNMASKING','UNMSKG',20),
  ('PRIMER3','MASKING','MSKG-TC',10),
  ('PRIMER3','UNMASKING','UNMSKG',20),
  ('TOPCOAT1','MASKING','MSKG-TC',10),
  ('TOPCOAT1','UNMASKING','UNMSKG',20),
  ('TOPCOAT2','MASKING','MSKG-TC',10),
  ('TOPCOAT2','UNMASKING','UNMSKG',20),
  ('ANTI-ABRASION','MASKING','MSKGABP',10),
  ('ANTI-ABRASION','UNMASKING','UNMSKG',20),
  ('PAINT MARKING','MASKING','MSKG-TC',10),
  ('PAINT MARKING','UNMASKING','UNMSKG',20),
  ('VARNISH','MASKING','MSKG-TC',10),
  ('VARNISH','UNMASKING','UNMSKG',20)
) as x(standard_operation,support_type,support_operation_code,sort_order)
where exists (
  select 1 from public.md_operation_master om
  where upper(trim(om.standard_operation))=upper(trim(x.standard_operation))
)
on conflict (standard_operation,support_type,support_operation_code,relation)
do nothing;

comment on table public.md_main_support_operation is
'Configurable Masking/Unmasking support operations linked BEFORE a normalized Main Planning Operation. PRIMER/TOPCOAT are occurrence-normalized by Planning Chain.';
