-- V464 FIX
-- Recipe-specific Batch Size
-- IMPORTANT: file này có đúng 4 câu SQL thực thi.

-- Query 1/4: bảng Batch Size override theo Recipe.
create table if not exists public.md_operation_recipe_batch_size (
  id bigserial primary key,
  standard_operation text not null,
  recipe_key text not null,
  batch_size_qty numeric not null,
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint md_operation_recipe_batch_size_qty_check
    check (batch_size_qty > 0)
);

-- Query 2/4: mỗi Main Operation + Recipe chỉ có 1 cấu hình active.
create unique index if not exists ux_operation_recipe_batch_size_active
  on public.md_operation_recipe_batch_size(
    upper(trim(standard_operation)),
    recipe_key
  )
  where is_active = true;

-- Query 3/4: index lookup cấu hình Recipe theo Main Operation.
create index if not exists ix_operation_recipe_batch_size_operation
  on public.md_operation_recipe_batch_size(upper(trim(standard_operation)))
  where is_active = true;

-- Query 4/4: cho phép Auto Split bật dù Common Batch Size để trống.
-- Khi đó hệ thống ưu tiên Recipe Batch Size,
-- nếu Recipe cũng không có Batch Size thì Job dùng chung 1 Batch, không split.
alter table public.md_operation_master
  drop constraint if exists md_operation_master_batch_auto_split_size_check;
