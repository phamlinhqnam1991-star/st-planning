-- =====================================================================
-- 014_chemical_operation_multi_recipe.sql
-- ST Planning - Chemical Line: ONE Operation Code -> MANY Recipes
--
-- Current/old:
--   operation_code PRIMARY KEY -> only one Recipe
--
-- New:
--   PRIMARY KEY(operation_code, recipe_key)
--
-- Additional fields reserved for future All Open Job auto-selection:
--   priority        : lower number = higher preference
--   selection_rule  : future rule/expression/JSON; currently optional text
--   is_default      : optional fallback Recipe for an Operation Code
--
-- This migration preserves existing mappings from migration 013.
-- =====================================================================

begin;

alter table public.md_operation_code_recipe
    add column if not exists priority integer not null default 100;

alter table public.md_operation_code_recipe
    add column if not exists selection_rule text;

alter table public.md_operation_code_recipe
    add column if not exists is_default boolean not null default false;

-- Drop the old single-column primary key, whatever its generated name is.
do $$
declare
    pk_name text;
begin
    select c.conname
      into pk_name
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public'
      and t.relname='md_operation_code_recipe'
      and c.contype='p'
    limit 1;

    if pk_name is not null then
        execute format(
          'alter table public.md_operation_code_recipe drop constraint %I',
          pk_name
        );
    end if;
end $$;

-- Remove accidental duplicates before adding composite PK.
delete from public.md_operation_code_recipe a
using public.md_operation_code_recipe b
where a.ctid < b.ctid
  and a.operation_code=b.operation_code
  and a.recipe_key=b.recipe_key;

alter table public.md_operation_code_recipe
    add constraint pk_md_operation_code_recipe
    primary key(operation_code,recipe_key);

create index if not exists ix_operation_code_recipe_operation
    on public.md_operation_code_recipe(operation_code,is_active,priority);

create index if not exists ix_operation_code_recipe_recipe
    on public.md_operation_code_recipe(recipe_key,is_active);

-- Only one ACTIVE default Recipe is allowed per Operation Code.
create unique index if not exists uq_operation_code_recipe_active_default
    on public.md_operation_code_recipe(operation_code)
    where is_active=true and is_default=true;

analyze public.md_operation_code_recipe;

commit;

select
    operation_code,
    count(*) filter(where is_active) as active_recipe_count,
    min(priority) filter(where is_active) as best_priority
from public.md_operation_code_recipe
group by operation_code
order by operation_code;
