-- =====================================================================
-- 013_chemical_line_recipe_mapping.sql
-- ST Planning - Chemical Line Recipe Configuration
--
-- Paint:
--   Recipe No comes from Master List -> Recipe Name from Process Recipe Master.
--
-- Chemical Line:
--   Recipe is configured manually per SOURCE OPERATION CODE.
--   Process Recipe Master remains the single source of Recipe No + Recipe Name.
--
-- Numeric Recipe No is normalized to 3 digits.
-- Non-numeric Recipe No (example 29A) is preserved.
-- Batch Key excludes Recipe No.
-- =====================================================================

begin;

create table if not exists public.md_operation_code_recipe (
    operation_code text primary key,
    recipe_key text not null
        references public.md_process_recipe(recipe_key)
        on delete restrict,
    note text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists ix_operation_code_recipe_recipe
    on public.md_operation_code_recipe(recipe_key,is_active);

alter table public.md_operation_code_recipe enable row level security;

drop policy if exists "authenticated read operation code recipe"
    on public.md_operation_code_recipe;

create policy "authenticated read operation code recipe"
    on public.md_operation_code_recipe
    for select
    to authenticated
    using (true);

-- ---------------------------------------------------------------------
-- Chemical Line Recipe Master
-- Source provided by user.
-- Family = CHEMICAL_LINE
-- Recipe Group = CHEMICAL_LINE
-- ---------------------------------------------------------------------

insert into public.md_process_recipe
(recipe_key,process_family,recipe_group,recipe_no,recipe_name,batch_key,source_system,note,is_active)
values
('CHEMICAL_LINE|CHEMICAL_LINE|001','CHEMICAL_LINE','CHEMICAL_LINE','001','Pre-Cleaning Boeing part for P.T','CHEMICAL_LINE|CHEMICAL_LINE|PRE-CLEANING BOEING PART FOR P.T','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|002','CHEMICAL_LINE','CHEMICAL_LINE','002','Anodizing BSA Unsealed','CHEMICAL_LINE|CHEMICAL_LINE|ANODIZING BSA UNSEALED','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|003','CHEMICAL_LINE','CHEMICAL_LINE','003','Anodizing BSA Sealed','CHEMICAL_LINE|CHEMICAL_LINE|ANODIZING BSA SEALED','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|004','CHEMICAL_LINE','CHEMICAL_LINE','004','Surface activation for chemical milling','CHEMICAL_LINE|CHEMICAL_LINE|SURFACE ACTIVATION FOR CHEMICAL MILLING','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|005','CHEMICAL_LINE','CHEMICAL_LINE','005','Chemical Milling','CHEMICAL_LINE|CHEMICAL_LINE|CHEMICAL MILLING','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|006','CHEMICAL_LINE','CHEMICAL_LINE','006','Chemical conversion','CHEMICAL_LINE|CHEMICAL_LINE|CHEMICAL CONVERSION','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|007','CHEMICAL_LINE','CHEMICAL_LINE','007','Deanodizing','CHEMICAL_LINE|CHEMICAL_LINE|DEANODIZING','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|008','CHEMICAL_LINE','CHEMICAL_LINE','008','Chemical gauge reduction','CHEMICAL_LINE|CHEMICAL_LINE|CHEMICAL GAUGE REDUCTION','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|009','CHEMICAL_LINE','CHEMICAL_LINE','009','Pre-Cleaning Boeing part for P.T (Reworked parts)','CHEMICAL_LINE|CHEMICAL_LINE|PRE-CLEANING BOEING PART FOR P.T (REWORKED PARTS)','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|010','CHEMICAL_LINE','CHEMICAL_LINE','010','Anodizing BSA Unsealed for shot peened parts','CHEMICAL_LINE|CHEMICAL_LINE|ANODIZING BSA UNSEALED FOR SHOT PEENED PARTS','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|011','CHEMICAL_LINE','CHEMICAL_LINE','011','Anodizing BSA Sealed for shot peened parts','CHEMICAL_LINE|CHEMICAL_LINE|ANODIZING BSA SEALED FOR SHOT PEENED PARTS','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|012','CHEMICAL_LINE','CHEMICAL_LINE','012','Hook Maintenance','CHEMICAL_LINE|CHEMICAL_LINE|HOOK MAINTENANCE','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|013','CHEMICAL_LINE','CHEMICAL_LINE','013','Pre-Cleaning Boeing part non P.T','CHEMICAL_LINE|CHEMICAL_LINE|PRE-CLEANING BOEING PART NON P.T','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|014','CHEMICAL_LINE','CHEMICAL_LINE','014','Pre-Cleaning shot peened part non Anodizing','CHEMICAL_LINE|CHEMICAL_LINE|PRE-CLEANING SHOT PEENED PART NON ANODIZING','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|015','CHEMICAL_LINE','CHEMICAL_LINE','015','Anodizing Sirius parts','CHEMICAL_LINE|CHEMICAL_LINE|ANODIZING SIRIUS PARTS','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|016','CHEMICAL_LINE','CHEMICAL_LINE','016','Pre-cleaning Embraer/Sonaca part for P.T','CHEMICAL_LINE|CHEMICAL_LINE|PRE-CLEANING EMBRAER/SONACA PART FOR P.T','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|017','CHEMICAL_LINE','CHEMICAL_LINE','017','Anodizing TSA Unsealed (without alkaline etching)','CHEMICAL_LINE|CHEMICAL_LINE|ANODIZING TSA UNSEALED (WITHOUT ALKALINE ETCHING)','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|018','CHEMICAL_LINE','CHEMICAL_LINE','018','Anodizing TSA Sealed (without alkaline etching)','CHEMICAL_LINE|CHEMICAL_LINE|ANODIZING TSA SEALED (WITHOUT ALKALINE ETCHING)','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|019','CHEMICAL_LINE','CHEMICAL_LINE','019','Chemical conversion Alodine 1200 (without alkaline etching) Airbus part belong to AIPI/AIPS scope','CHEMICAL_LINE|CHEMICAL_LINE|CHEMICAL CONVERSION ALODINE 1200 (WITHOUT ALKALINE ETCHING) AIRBUS PART BELONG TO AIPI/AIPS SCOPE','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|020','CHEMICAL_LINE','CHEMICAL_LINE','020','Chemical conversion Airbus Canada part','CHEMICAL_LINE|CHEMICAL_LINE|CHEMICAL CONVERSION AIRBUS CANADA PART','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|021','CHEMICAL_LINE','CHEMICAL_LINE','021','Anodizing TSA Sealed by hot water','CHEMICAL_LINE|CHEMICAL_LINE|ANODIZING TSA SEALED BY HOT WATER','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|022','CHEMICAL_LINE','CHEMICAL_LINE','022','Stripping anodizing/ Conversion coating (with alkaline etch) for Airbus','CHEMICAL_LINE|CHEMICAL_LINE|STRIPPING ANODIZING/ CONVERSION COATING (WITH ALKALINE ETCH) FOR AIRBUS','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|023','CHEMICAL_LINE','CHEMICAL_LINE','023','Chemical conversion Alodine 1200 (without alkaline etching) Sonaca/Embraer part','CHEMICAL_LINE|CHEMICAL_LINE|CHEMICAL CONVERSION ALODINE 1200 (WITHOUT ALKALINE ETCHING) SONACA/EMBRAER PART','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|024','CHEMICAL_LINE','CHEMICAL_LINE','024','Stripping anodizing/ Conversion coating (with alkaline etch) for Sonaca/Embraer','CHEMICAL_LINE|CHEMICAL_LINE|STRIPPING ANODIZING/ CONVERSION COATING (WITH ALKALINE ETCH) FOR SONACA/EMBRAER','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|025','CHEMICAL_LINE','CHEMICAL_LINE','025','Pre-Cleaning Airbus part for P.T','CHEMICAL_LINE|CHEMICAL_LINE|PRE-CLEANING AIRBUS PART FOR P.T','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|026','CHEMICAL_LINE','CHEMICAL_LINE','026','Bright Dip Anodizing for Sirius parts','CHEMICAL_LINE|CHEMICAL_LINE|BRIGHT DIP ANODIZING FOR SIRIUS PARTS','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|027','CHEMICAL_LINE','CHEMICAL_LINE','027','Chemical conversion Alodine 1200 for Sirius parts','CHEMICAL_LINE|CHEMICAL_LINE|CHEMICAL CONVERSION ALODINE 1200 FOR SIRIUS PARTS','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|028','CHEMICAL_LINE','CHEMICAL_LINE','028','Alkaline degrease for Sirius parts','CHEMICAL_LINE|CHEMICAL_LINE|ALKALINE DEGREASE FOR SIRIUS PARTS','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|029','CHEMICAL_LINE','CHEMICAL_LINE','029','Anodizing Sirius parts 5-15 micron','CHEMICAL_LINE|CHEMICAL_LINE|ANODIZING SIRIUS PARTS 5-15 MICRON','MANUAL','Seed from Chemical Line recipe list',true),
('CHEMICAL_LINE|CHEMICAL_LINE|29A','CHEMICAL_LINE','CHEMICAL_LINE','29A','BSA – MIL-PRF-8625 Loại IC/ BSA – MIL-PRF-8625 type IC.','CHEMICAL_LINE|CHEMICAL_LINE|BSA – MIL-PRF-8625 LOẠI IC/ BSA – MIL-PRF-8625 TYPE IC.','MANUAL','Seed from Chemical Line recipe list',true)

on conflict(recipe_key)
do update set
    recipe_name=excluded.recipe_name,
    batch_key=excluded.batch_key,
    process_family=excluded.process_family,
    recipe_group=excluded.recipe_group,
    source_system='MANUAL',
    is_active=true,
    updated_at=now();

analyze public.md_process_recipe;
analyze public.md_operation_code_recipe;

commit;

select recipe_no,recipe_name
from public.md_process_recipe
where process_family='CHEMICAL_LINE'
  and recipe_group='CHEMICAL_LINE'
  and is_active=true
order by
  case when recipe_no ~ '^[0-9]+$' then recipe_no::int else 9999 end,
  recipe_no;
