-- =====================================================================
-- 024_batch_no_prefix.sql
-- Batch No format: XXX_DDMMM_NNN
-- Example: CHM_23AUG_001
-- Prefix is maintained in Operation Master.
-- Sequence restarts at 001 for each prefix + planning date.
-- =====================================================================

begin;

alter table public.md_operation_master
  add column if not exists batch_prefix text;

-- Prefix must be exactly 3 A-Z / 0-9 characters when configured.
alter table public.md_operation_master
  drop constraint if exists ck_md_operation_master_batch_prefix;

alter table public.md_operation_master
  add constraint ck_md_operation_master_batch_prefix
  check (batch_prefix is null or batch_prefix ~ '^[A-Z0-9]{3}$');

-- Ensure the corrected TSAUNSLD Standard Operation can also receive the new prefix.
insert into public.md_operation_master(standard_operation,st_group,batch_prefix,is_active)
values ('TSAUNSLD','TSAUNSLD','CHM',true)
on conflict(standard_operation) do nothing;

-- Default prefixes for the confirmed main Planning Operations.
-- Chemical-line operations intentionally share CHM.
update public.md_operation_master
set batch_prefix = case standard_operation
  when 'CMSA' then 'CMS'
  when 'CHEMMILL' then 'CML'
  when 'CPBILP' then 'CHM'
  when 'CPBILP-A' then 'CHM'
  when 'PIONBL' then 'PIO'
  when 'RWK' then 'RWK'
  when 'V_A-SHPN' then 'ASP'
  when 'MANUALSP' then 'MSP'
  when 'CLASP' then 'CLP'
  when 'BSAUNSLD' then 'CHM'
  when 'TSAUNSLD' then 'CHM'
  when 'TSAUNSL' then 'CHM'
  when 'BSASLD' then 'CHM'
  when 'TSASLD' then 'CHM'
  when 'CCNV-IM' then 'CHM'
  when 'CCNV-IA' then 'CHM'
  when 'ANOD/CCNV FB' then 'CHM'
  when 'V_PASS/BRTG' then 'PAS'
  when 'FMSKG-CM' then 'MSK'
  when 'SIPC' then 'SIP'
  when 'SI-SEAL' then 'SIS'
  when 'STRIP' then 'SPX'
  when 'HE-BAKE after plating' then 'HEB'
  when 'HE-BAKE before blasting' then 'HEB'
  when 'A-DBLST' then 'ADB'
  when 'M-DBLST' then 'MDB'
  when 'PLA-ZiNi' then 'PLZ'
  when 'HE-BAKE' then 'HEB'
  when 'PLA-CC' then 'PLC'
  when 'PRIMER' then 'PRI'
  when 'PRIMER2' then 'PRI'
  when 'PRIMER3' then 'PRI'
  when 'TOPCOAT1' then 'TOP'
  when 'TOPCOAT2' then 'TOP'
  when 'ANTI-ABRASION' then 'AAB'
  when 'PAINT MARKING' then 'PMK'
  when 'VARNISH' then 'VAR'
  else batch_prefix
end,
updated_at=now()
where is_active=true;

create index if not exists ix_operation_master_batch_prefix
  on public.md_operation_master(batch_prefix)
  where is_active=true;

commit;
