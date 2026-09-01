-- =====================================================================
-- 064_recipe_mapping_rule_identity.sql
-- v352 - One Operation Code + Recipe can have MANY independent rules.
--
-- Before:
--   md_main_operation_recipe PRIMARY KEY(operation_code, recipe_key)
--   => saving the same Recipe with another condition overwrote the old row.
--
-- After:
--   mapping_id BIGINT PRIMARY KEY
--   => same operation_code + recipe_key may appear many times, each row owns
--      its own selection_rule / priority / batch template.
--
-- planning_batch.recipe_mapping_id stores the anchor Recipe Rule used when
-- the Batch was created. compatibility_conditions remains the planner-selected
-- subset used to decide which Jobs may join the Batch.
-- =====================================================================
begin;

-- 1) Give every existing mapping row a durable identity.
create sequence if not exists public.md_main_operation_recipe_mapping_id_seq;

alter table public.md_main_operation_recipe
  add column if not exists mapping_id bigint;

alter sequence public.md_main_operation_recipe_mapping_id_seq
  owned by public.md_main_operation_recipe.mapping_id;

alter table public.md_main_operation_recipe
  alter column mapping_id set default nextval('public.md_main_operation_recipe_mapping_id_seq');

update public.md_main_operation_recipe
set mapping_id=nextval('public.md_main_operation_recipe_mapping_id_seq')
where mapping_id is null;

select setval(
  'public.md_main_operation_recipe_mapping_id_seq',
  greatest(coalesce((select max(mapping_id) from public.md_main_operation_recipe),0),1),
  true
);

alter table public.md_main_operation_recipe
  alter column mapping_id set not null;

-- 2) Replace the OLD composite PK only when it is still present.
-- Idempotent: if v352 already made mapping_id the PK, keep it (the Batch FK may
-- already depend on that PK, so dropping it on a second manual run would fail).
do $$
declare
  pk_name text;
  pk_def text;
begin
  select c.conname,pg_get_constraintdef(c.oid)
    into pk_name,pk_def
  from pg_constraint c
  join pg_class t on t.oid=c.conrelid
  join pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public'
    and t.relname='md_main_operation_recipe'
    and c.contype='p'
  limit 1;

  if pk_name is not null and position('(mapping_id)' in replace(lower(pk_def),' ',''))=0 then
    execute format('alter table public.md_main_operation_recipe drop constraint %I',pk_name);
    pk_name:=null;
  end if;

  if pk_name is null then
    alter table public.md_main_operation_recipe
      add constraint pk_md_main_operation_recipe_mapping_id primary key(mapping_id);
  end if;
end $$;

-- Deliberately NON-UNIQUE: many condition rules may point to the same Recipe.
create index if not exists ix_main_operation_recipe_op_recipe_rule_active
  on public.md_main_operation_recipe(operation_code,recipe_key,priority,mapping_id)
  where is_active=true;

create index if not exists ix_main_operation_recipe_mapping_active
  on public.md_main_operation_recipe(mapping_id)
  where is_active=true;

comment on column public.md_main_operation_recipe.mapping_id is
'Durable identity of one Operation Code -> Recipe selection rule. Multiple mapping_id rows may share the same operation_code + recipe_key when their selection_rule differs.';

-- 3) Remember which Recipe Rule anchored each Batch.
alter table public.planning_batch
  add column if not exists recipe_mapping_id bigint;

-- Idempotent FK creation.
do $$
begin
  if not exists(
    select 1
    from pg_constraint
    where conname='fk_planning_batch_recipe_mapping'
      and conrelid='public.planning_batch'::regclass
  ) then
    alter table public.planning_batch
      add constraint fk_planning_batch_recipe_mapping
      foreign key(recipe_mapping_id)
      references public.md_main_operation_recipe(mapping_id)
      on delete set null;
  end if;
end $$;

create index if not exists ix_planning_batch_recipe_mapping_id
  on public.planning_batch(recipe_mapping_id)
  where recipe_mapping_id is not null;

comment on column public.planning_batch.recipe_mapping_id is
'Anchor Operation Code -> Recipe rule used when this Batch was created. Batch compatibility checkboxes come from this rule; compatibility_conditions stores the selected subset.';

analyze public.md_main_operation_recipe;
analyze public.planning_batch;

commit;
