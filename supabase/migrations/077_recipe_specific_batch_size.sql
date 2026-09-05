-- V462: Batch Size may be overridden by Recipe while Batch No format stays per Main Operation.

create table if not exists public.md_operation_recipe_batch_size (
  id bigserial primary key,
  standard_operation text not null,
  recipe_key text not null,
  batch_size_qty numeric not null,
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint md_operation_recipe_batch_size_qty_check check (batch_size_qty > 0)
);

create unique index if not exists ux_operation_recipe_batch_size_active
  on public.md_operation_recipe_batch_size(upper(trim(standard_operation)), recipe_key)
  where is_active=true;

create index if not exists ix_operation_recipe_batch_size_operation
  on public.md_operation_recipe_batch_size(upper(trim(standard_operation)))
  where is_active=true;

-- Auto Split may be enabled without a COMMON Batch Size because a Recipe-specific
-- Batch Size can now be configured. If neither exact Recipe nor COMMON size exists,
-- that Recipe is not split and remains one batch.
alter table public.md_operation_master
  drop constraint if exists md_operation_master_batch_auto_split_size_check;
