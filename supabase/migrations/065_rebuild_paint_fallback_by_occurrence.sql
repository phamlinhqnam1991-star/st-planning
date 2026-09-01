-- =====================================================================
-- 065_rebuild_paint_fallback_by_occurrence.sql
-- Repair Part/Revision -> Paint Recipe fallback by the EXACT paint occurrence.
--
-- Problem fixed:
--   PRIMER2 / PRIMER3 were historically generated from PRIMER1, so a Job whose
--   PRIMER1 = 515X349 and PRIMER2 = 10P4 could fallback PRIMER2 to 515X349.
--
-- Final mapping source:
--   PRIMER   <- md_material_finish.primer1
--   PRIMER2  <- md_material_finish.primer2
--   PRIMER3  <- md_material_finish.primer3
--   TOPCOAT1 <- md_material_finish.topcoat1
--   TOPCOAT2 <- md_material_finish.topcoat2
--   ANTI-ABRASION <- md_material_finish.antiabration
--   VARNISH  <- md_material_finish.varinish_name
--
-- Source value is matched to active Process Recipe Master by Recipe Name first,
-- then Recipe No. No Recipe Master rows are created by this repair.
-- Safe to run repeatedly.
-- =====================================================================

begin;

drop table if exists tmp_paint_occurrence_source;
create temporary table tmp_paint_occurrence_source on commit drop as
with src as (
  select part_num,revision_num,'PRIMER'::text standard_operation,'PRIMER'::text recipe_group,'PRIMER1'::text source_slot,nullif(trim(primer1),'') source_value,last_import_batch_id
  from public.md_material_finish where is_active=true
  union all
  select part_num,revision_num,'PRIMER2','PRIMER','PRIMER2',nullif(trim(primer2),''),last_import_batch_id
  from public.md_material_finish where is_active=true
  union all
  select part_num,revision_num,'PRIMER3','PRIMER','PRIMER3',nullif(trim(primer3),''),last_import_batch_id
  from public.md_material_finish where is_active=true
  union all
  select part_num,revision_num,'TOPCOAT1','TOPCOAT','TOPCOAT1',nullif(trim(topcoat1),''),last_import_batch_id
  from public.md_material_finish where is_active=true
  union all
  select part_num,revision_num,'TOPCOAT2','TOPCOAT','TOPCOAT2',nullif(trim(topcoat2),''),last_import_batch_id
  from public.md_material_finish where is_active=true
  union all
  select part_num,revision_num,'ANTI-ABRASION','ANTI_ABRASION','ANTIABRATION',nullif(trim(antiabration),''),last_import_batch_id
  from public.md_material_finish where is_active=true
  union all
  select part_num,revision_num,'VARNISH','VARNISH','VarinishName',nullif(trim(varinish_name),''),last_import_batch_id
  from public.md_material_finish where is_active=true
), clean_src as (
  select *
  from src
  where source_value is not null
    and upper(source_value) not in ('N/A','NA','NONE','-')
), candidates as (
  select
    s.*,
    r.recipe_key,
    r.recipe_no,
    r.recipe_name,
    row_number() over (
      partition by s.part_num,s.revision_num,s.standard_operation
      order by
        case when upper(regexp_replace(trim(coalesce(r.recipe_name,'')),'\\s+',' ','g'))
                   = upper(regexp_replace(trim(s.source_value),'\\s+',' ','g')) then 0 else 1 end,
        case when upper(trim(coalesce(r.recipe_no,''))) = upper(trim(s.source_value)) then 0 else 1 end,
        case when r.source_system='MANUAL' then 0 else 1 end,
        r.updated_at desc,
        r.recipe_key
    ) rn
  from clean_src s
  join public.md_process_recipe r
    on r.is_active=true
   and r.process_family='PAINT'
   and r.recipe_group=s.recipe_group
   and (
        upper(regexp_replace(trim(coalesce(r.recipe_name,'')),'\\s+',' ','g'))
          = upper(regexp_replace(trim(s.source_value),'\\s+',' ','g'))
        or upper(trim(coalesce(r.recipe_no,''))) = upper(trim(s.source_value))
   )
)
select * from candidates where rn=1;

-- Remove stale active fallback rows for the affected paint occurrences first.
-- Historical Batches/Schedules are untouched; this table is runtime fallback only.
update public.md_part_process_recipe
set is_active=false,updated_at=now()
where standard_operation in (
  'PRIMER','PRIMER2','PRIMER3','TOPCOAT1','TOPCOAT2','ANTI-ABRASION','VARNISH'
)
and is_active=true;

insert into public.md_part_process_recipe(
  part_num,revision_num,standard_operation,recipe_key,
  source_slot,source_recipe_no,source_recipe_name,
  is_active,updated_at,last_import_batch_id
)
select
  part_num,revision_num,standard_operation,recipe_key,
  source_slot,recipe_no,null,
  true,now(),last_import_batch_id
from tmp_paint_occurrence_source
on conflict(part_num,revision_num,standard_operation)
do update set
  recipe_key=excluded.recipe_key,
  source_slot=excluded.source_slot,
  source_recipe_no=excluded.source_recipe_no,
  source_recipe_name=null,
  is_active=true,
  updated_at=now(),
  last_import_batch_id=excluded.last_import_batch_id;

analyze public.md_part_process_recipe;

commit;

-- Verification summary.
select standard_operation,count(*) active_rows
from public.md_part_process_recipe
where is_active=true
  and standard_operation in ('PRIMER','PRIMER2','PRIMER3','TOPCOAT1','TOPCOAT2','ANTI-ABRASION','VARNISH')
group by standard_operation
order by standard_operation;
