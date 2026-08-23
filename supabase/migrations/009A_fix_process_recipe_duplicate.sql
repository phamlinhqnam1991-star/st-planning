-- Run this if migration 009 previously failed with SQLSTATE 21000.
-- Safe to run after the tables from 009 already exist.

with paint_source as (
  select part_num,revision_num,'PRIMER'::text recipe_group,'PRIMER'::text standard_operation,'PRIMER1'::text source_slot,
         case when upper(trim(coalesce(primer1,''))) in ('','N/A','NA','NONE','-') then null else trim(primer1) end recipe_no,
         case when upper(trim(coalesce(primer1_name,''))) in ('','N/A','NA','NONE','-') then null else trim(primer1_name) end recipe_name
  from public.md_material_finish where is_active
  union all
  select part_num,revision_num,'PRIMER','PRIMER2','PRIMER2',
         case when upper(trim(coalesce(primer2,''))) in ('','N/A','NA','NONE','-') then null else trim(primer2) end,
         case when upper(trim(coalesce(primer1_name,''))) in ('','N/A','NA','NONE','-') then null else trim(primer1_name) end
  from public.md_material_finish where is_active
  union all
  select part_num,revision_num,'PRIMER','PRIMER3','PRIMER3',
         case when upper(trim(coalesce(primer3,''))) in ('','N/A','NA','NONE','-') then null else trim(primer3) end,
         case when upper(trim(coalesce(primer1_name,''))) in ('','N/A','NA','NONE','-') then null else trim(primer1_name) end
  from public.md_material_finish where is_active
  union all
  select part_num,revision_num,'TOPCOAT','TOPCOAT1','TOPCOAT1',
         case when upper(trim(coalesce(topcoat1,''))) in ('','N/A','NA','NONE','-') then null else trim(topcoat1) end,
         case when upper(trim(coalesce(topcoat_name,''))) in ('','N/A','NA','NONE','-') then null else trim(topcoat_name) end
  from public.md_material_finish where is_active
  union all
  select part_num,revision_num,'TOPCOAT','TOPCOAT2','TOPCOAT2',
         case when upper(trim(coalesce(topcoat2,''))) in ('','N/A','NA','NONE','-') then null else trim(topcoat2) end,
         case when upper(trim(coalesce(topcoat_name,''))) in ('','N/A','NA','NONE','-') then null else trim(topcoat_name) end
  from public.md_material_finish where is_active
  union all
  select part_num,revision_num,'ANTI_ABRASION','ANTI-ABRASION','ANTIABRATION',
         case when upper(trim(coalesce(antiabration,''))) in ('','N/A','NA','NONE','-') then null else trim(antiabration) end,
         case when upper(trim(coalesce(antiabrasion_name,''))) in ('','N/A','NA','NONE','-') then null else trim(antiabrasion_name) end
  from public.md_material_finish where is_active
  union all
  select part_num,revision_num,'VARNISH','VARNISH','VARINISHNAME',
         null::text,
         case when upper(trim(coalesce(varinish_name,''))) in ('','N/A','NA','NONE','-') then null else trim(varinish_name) end
  from public.md_material_finish where is_active
),
normalized as (
 select *,
   'PAINT|'||recipe_group||'|'||
   coalesce(upper(recipe_no),'NAME')||'|'||
   coalesce(upper(recipe_name),'') recipe_key
 from paint_source
 where recipe_no is not null or recipe_name is not null
),
dedup as (
 select distinct on (part_num,revision_num,standard_operation)
   part_num,revision_num,standard_operation,recipe_key,source_slot,recipe_no,recipe_name
 from normalized
 order by
   part_num,revision_num,standard_operation,
   case
     when recipe_no is not null and recipe_name is not null then 1
     when recipe_no is not null then 2
     when recipe_name is not null then 3
     else 9
   end,
   source_slot
)
insert into public.md_part_process_recipe(
 part_num,revision_num,standard_operation,recipe_key,source_slot,source_recipe_no,source_recipe_name,is_active
)
select part_num,revision_num,standard_operation,recipe_key,source_slot,recipe_no,recipe_name,true
from dedup
on conflict(part_num,revision_num,standard_operation) do update set
 recipe_key=excluded.recipe_key,
 source_slot=excluded.source_slot,
 source_recipe_no=excluded.source_recipe_no,
 source_recipe_name=excluded.source_recipe_name,
 is_active=true,
 updated_at=now();

analyze public.md_part_process_recipe;
