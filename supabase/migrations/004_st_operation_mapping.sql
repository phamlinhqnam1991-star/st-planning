-- ST Operation Mapping / Operation Master v2026-08-21
-- Chỉ bổ sung lớp chuẩn hóa Planning. Không thay đổi Routing Detail nguồn hoặc RoutingCode hiện có.

create table if not exists public.md_operation_master(
  standard_operation text primary key,
  st_group text not null,
  time_calc_type text,
  priority integer,
  qty_min numeric,
  qty_max numeric,
  surface_min_dm2 numeric,
  surface_max_dm2 numeric,
  fixed_hours numeric,
  standard_hours numeric,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.md_st_operation_mapping(
  id bigserial primary key,
  sort_order integer not null,
  st_group text not null,
  source_operation_code text not null,
  source_label text,
  standard_operation_rule text not null,
  mapping_rule text not null check(mapping_rule in ('DIRECT','OCCURRENCE','SEQUENCE','SEQUENCE/FALLBACK')),
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_operation_code,st_group,standard_operation_rule)
);

alter table public.md_st_routing add column if not exists standard_operation text;
alter table public.md_st_routing add column if not exists planning_group text;
alter table public.md_st_routing add column if not exists mapping_rule text;
alter table public.md_st_routing add column if not exists occurrence_no integer;

create index if not exists ix_st_mapping_source on public.md_st_operation_mapping(source_operation_code) where is_active;
create index if not exists ix_st_routing_standard_operation on public.md_st_routing(standard_operation) where is_active;

alter table public.md_operation_master enable row level security;
alter table public.md_st_operation_mapping enable row level security;
drop policy if exists "authenticated read" on public.md_operation_master;
create policy "authenticated read" on public.md_operation_master for select to authenticated using (true);
drop policy if exists "authenticated read" on public.md_st_operation_mapping;
create policy "authenticated read" on public.md_st_operation_mapping for select to authenticated using (true);

-- Mapping đầy đủ đã chốt. Dùng canonical source code ở cột source_operation_code;
-- source_label giữ nguyên cách gọi chi tiết người dùng xác nhận.
insert into public.md_st_operation_mapping(sort_order,st_group,source_operation_code,source_label,standard_operation_rule,mapping_rule,note) values
(1,'CMSA','CMSA','CMSA','CMSA','DIRECT',null),
(2,'CHEMMILL','CHEMMILL','CHEMMILL','CHEMMILL','DIRECT',null),
(3,'CPBILP','CPBILP','CPBILP','CPBILP','DIRECT',null),
(4,'CPBILP-A','CPBILP-A','CPBILP-A','CPBILP-A','DIRECT',null),
(5,'PIONBL','PIONBL','PIONBL','PIONBL','DIRECT',null),
(6,'RWK','RWKCC-IM','RWKCC-IM','RWK','DIRECT',null),
(7,'RWK','RWK-BSA','RWK-BSA','RWK','DIRECT',null),
(8,'V_A-SHPN','V_A-SHPN','V_A-SHPN','V_A-SHPN','DIRECT',null),
(9,'MANUALSP','V_M-SPFD','V_M-SPFD','MANUALSP','DIRECT','MANUALSP latest mapping'),
(10,'MANUALSP','ARL-SHPN','ARL-SHPN','MANUALSP','DIRECT','MANUALSP latest mapping'),
(11,'MANUALSP','V_M-SHPN','V_M-SHPN','MANUALSP','DIRECT','MANUALSP latest mapping'),
(12,'CLASP','CLASP','CLASP','CLASP','DIRECT',null),
(13,'BSAUNSLD','BSAUNSLD','BSAUNSLD','BSAUNSLD','DIRECT',null),
(14,'TSAUNSL','TSAUNSL','TSAUNSL','TSAUNSL','DIRECT',null),
(15,'BSASLD','BSASLD','BSASLD','BSASLD','DIRECT',null),
(16,'TSASLD','TSASLD','TSASLD','TSASLD','DIRECT',null),
(17,'CCNV-IM','CCNV-IM','CCNV-IM','CCNV-IM','DIRECT',null),
(18,'CCNV-IA','CCNV-IA','CCNV-IA','CCNV-IA','DIRECT',null),
(19,'ANOD/CCNV FB','ANOD/CCNV FB','ANOD/CCNV FB','ANOD/CCNV FB','DIRECT',null),
(20,'V_PASS/BRTG','CP-PA','CP-PA','V_PASS/BRTG','DIRECT',null),
(21,'V_PASS/BRTG','V_PASS','V_PASS','V_PASS/BRTG','DIRECT',null),
(22,'V_PASS/BRTG','BRTG','BRTG','V_PASS/BRTG','DIRECT',null),
(23,'FMSKG-CM','FMSKG-CM','FMSKG-CM','FMSKG-CM','DIRECT',null),
(24,'SIPC','SIPC','SIPC','SIPC','DIRECT',null),
(25,'SI-SEAL','SI-SEAL','SI-SEAL','SI-SEAL','DIRECT',null),
(26,'STRIP','STRIP','STRIP','STRIP','DIRECT',null),
(27,'HE-BAKE','HE-BAKE','HE-BAKE','HE-BAKE after plating','SEQUENCE','after plating identified by sequence context'),
(28,'HE-BAKE','HE-BAKE','HE-BAKE','HE-BAKE before blasting','SEQUENCE','before blasting identified by sequence context'),
(29,'A-DBLST','A-DBLST','A-DBLST','A-DBLST','DIRECT',null),
(30,'M-DBLST','M-DBLST','M-DBLST','M-DBLST','DIRECT',null),
(31,'PLA-ZiNi','PLA-ZiNi','PLA-ZiNi','PLA-ZiNi','DIRECT',null),
(32,'HE-BAKE','HE-BAKE','HE-BAKE','HE-BAKE','SEQUENCE/FALLBACK','HE-BAKE fallback'),
(33,'PLA-CC','PLA-CC','PLA-CC','PLA-CC','DIRECT',null),
(34,'PRIMER','FULTKAPP','FULTKAPP','PRIMER / PRIMER2 / PRIMER3','OCCURRENCE',null),
(35,'PRIMER','PPRSLV2C','PPRSLV2C','PRIMER / PRIMER2 / PRIMER3','OCCURRENCE',null),
(36,'PRIMER','PPRSLVT','PPRSLVT','PRIMER / PRIMER2 / PRIMER3','OCCURRENCE',null),
(37,'PRIMER','SIPT','SIPT','PRIMER / PRIMER2 / PRIMER3','OCCURRENCE',null),
(38,'PRIMER','V-SBPCMP','V-SBPCMP primer','PRIMER / PRIMER2 / PRIMER3','OCCURRENCE',null),
(39,'TOPCOAT','PTCSLVT','PTCSLVT','TOPCOAT1 / TOPCOAT2','OCCURRENCE',null),
(40,'TOPCOAT','PTCWTR','PTCWTR','TOPCOAT1 / TOPCOAT2','OCCURRENCE',null),
(41,'TOPCOAT','SIPOC','SIPOC','TOPCOAT1 / TOPCOAT2','OCCURRENCE',null),
(42,'TOPCOAT','V-ASCCMP','V-ASCCMP','TOPCOAT1 / TOPCOAT2','OCCURRENCE',null),
(43,'TOPCOAT','SIPPOC','SIPPOC topcoat','TOPCOAT1 / TOPCOAT2','OCCURRENCE',null),
(44,'ANTI-ABRASION','APP-AABP','APP-AABP','ANTI-ABRASION','DIRECT',null),
(45,'ANTI-ABRASION','V-AAPCMP','V-AAPCMP anti abrasion','ANTI-ABRASION','DIRECT',null),
(46,'PAINT MARKING','MRKG-PA','MRKG-PA','PAINT MARKING','DIRECT',null),
(47,'PAINT MARKING','PAINTING MARKING','painting marking','PAINT MARKING','DIRECT','text alias supported'),
(48,'VARNISH','V_VRNS','V_VRNS','VARNISH','DIRECT',null),
(49,'VARNISH','VRNSCOAT','VRNSCOAT varinish','VARNISH','DIRECT',null)
on conflict(source_operation_code,st_group,standard_operation_rule) do update set
 sort_order=excluded.sort_order,source_label=excluded.source_label,
 standard_operation_rule=excluded.standard_operation_rule,mapping_rule=excluded.mapping_rule,
 is_active=true,note=excluded.note,updated_at=now();

-- Các code mới cần được nhận diện trong ST Scope nhưng KHÔNG loại bỏ 125 code cũ.
insert into public.md_st_operation_scope(operation_code,is_active) values
 ('CHEMMILL',true),('RWKCC-IM',true),('RWK-BSA',true),('ANOD/CCNV FB',true),
 ('TSAUNSL',true),('STRIP',true),('HE-BAKE',true),('PTCWTR',true),('PAINTING MARKING',true)
on conflict(operation_code) do update set is_active=true;

-- Operation_Master cho Planning. Chỉ upsert nhóm/mã; tuyệt đối không ghi đè các cột thời gian đang/ sẽ cấu hình.
insert into public.md_operation_master(standard_operation,st_group,is_active)
select x.standard_operation,x.st_group,true from (values
 ('CMSA','CMSA'),('CHEMMILL','CHEMMILL'),('CPBILP','CPBILP'),('CPBILP-A','CPBILP-A'),('PIONBL','PIONBL'),
 ('RWK','RWK'),('V_A-SHPN','V_A-SHPN'),('MANUALSP','MANUALSP'),('CLASP','CLASP'),('BSAUNSLD','BSAUNSLD'),
 ('TSAUNSL','TSAUNSL'),('BSASLD','BSASLD'),('TSASLD','TSASLD'),('CCNV-IM','CCNV-IM'),('CCNV-IA','CCNV-IA'),
 ('ANOD/CCNV FB','ANOD/CCNV FB'),('V_PASS/BRTG','V_PASS/BRTG'),('FMSKG-CM','FMSKG-CM'),('SIPC','SIPC'),('SI-SEAL','SI-SEAL'),
 ('STRIP','STRIP'),('HE-BAKE after plating','HE-BAKE'),('HE-BAKE before blasting','HE-BAKE'),('A-DBLST','A-DBLST'),
 ('M-DBLST','M-DBLST'),('PLA-ZiNi','PLA-ZiNi'),('HE-BAKE','HE-BAKE'),('PLA-CC','PLA-CC'),
 ('PRIMER','PRIMER'),('PRIMER2','PRIMER'),('PRIMER3','PRIMER'),('TOPCOAT1','TOPCOAT'),('TOPCOAT2','TOPCOAT'),
 ('ANTI-ABRASION','ANTI-ABRASION'),('PAINT MARKING','PAINT MARKING'),('VARNISH','VARNISH')
) as x(standard_operation,st_group)
on conflict(standard_operation) do update set st_group=excluded.st_group,is_active=true,updated_at=now();

-- Helper: backfill standardized planning fields for all existing ST routing rows.
create or replace function public.refresh_st_operation_mapping(p_routing_codes text[] default null) returns void language plpgsql security definer as $$
begin
  with base as (
    select r.routing_code,r.seq,r.operation_code,
           lag(r.operation_code) over(partition by r.routing_code order by r.seq) prev_operation_code,
           lead(r.operation_code) over(partition by r.routing_code order by r.seq) next_operation_code,
           m.st_group,m.mapping_rule,m.standard_operation_rule,
           case when m.st_group='PRIMER' then row_number() over(partition by r.routing_code,m.st_group order by r.seq)
                when m.st_group='TOPCOAT' then row_number() over(partition by r.routing_code,m.st_group order by r.seq)
                else null end as occurrence_no
    from md_st_routing r
    left join lateral (
      select mm.* from md_st_operation_mapping mm
      where mm.is_active and upper(trim(mm.source_operation_code))=upper(trim(r.operation_code))
      order by case when mm.mapping_rule='SEQUENCE/FALLBACK' then 2 else 1 end, mm.sort_order
      limit 1
    ) m on true
    where r.is_active and (p_routing_codes is null or r.routing_code=any(p_routing_codes))
  ), calc as (
    select *,case
      when st_group='PRIMER' then case when occurrence_no=1 then 'PRIMER' when occurrence_no=2 then 'PRIMER2' else 'PRIMER3' end
      when st_group='TOPCOAT' then case when occurrence_no=1 then 'TOPCOAT1' else 'TOPCOAT2' end
      when operation_code='HE-BAKE' and (prev_operation_code='PLA-ZiNi' or next_operation_code='PLA-CC') then 'HE-BAKE after plating'
      when operation_code='HE-BAKE' and next_operation_code in ('A-DBLST','M-DBLST') then 'HE-BAKE before blasting'
      when operation_code='HE-BAKE' then 'HE-BAKE'
      when mapping_rule='DIRECT' then standard_operation_rule
      else null end as standard_operation_calc
    from base
  )
  update md_st_routing r set
    standard_operation=c.standard_operation_calc,
    planning_group=c.st_group,
    mapping_rule=case when r.operation_code='HE-BAKE' then case when c.standard_operation_calc='HE-BAKE' then 'SEQUENCE/FALLBACK' else 'SEQUENCE' end else c.mapping_rule end,
    occurrence_no=c.occurrence_no
  from calc c where r.routing_code=c.routing_code and r.seq=c.seq;
end $$;

-- Rebuild function giữ nguyên Routing Signature/Code nguồn; chỉ bổ sung chuẩn hóa Planning vào chuỗi.
create or replace function public.rebuild_st_routing(p_batch uuid) returns void language plpgsql security definer as $$
declare r record; v_code text; v_next int; v_codes text[];
begin
 create temp table _affected(part_num text,revision_num text,primary key(part_num,revision_num)) on commit drop;
 insert into _affected select distinct part_num,revision_num from md_routing_detailed where last_import_batch_id=p_batch on conflict do nothing;
 if not exists(select 1 from md_part_routing) then insert into _affected select part_num,revision_num from md_part_revision where is_active on conflict do nothing; end if;
 delete from md_part_routing p using _affected a where p.part_num=a.part_num and p.revision_num=a.revision_num;
 create temp table _sig as
 select a.part_num,a.revision_num,string_agg(d.operation_detail_code,'>' order by d.source_seq) signature,count(*) op_count
 from _affected a join md_routing_detailed d on d.part_num=a.part_num and d.revision_num=a.revision_num and d.is_active
 join md_st_operation_scope s on upper(s.operation_code)=upper(d.operation_code) and s.is_active
 group by a.part_num,a.revision_num;
 for r in select distinct signature,op_count from _sig loop
   select routing_code into v_code from md_st_routing_summary where routing_signature=r.signature limit 1;
   if v_code is null then
     select coalesce(max(nullif(regexp_replace(routing_code,'\D','','g'),'')::int),0)+1 into v_next from md_st_routing_summary;
     v_code:='RT_ST_'||lpad(v_next::text,4,'0');
     insert into md_st_routing_summary(routing_code,routing_name,operation_count,routing_signature,is_active) values(v_code,v_code,r.op_count,r.signature,true);
   end if;
   if not exists(select 1 from md_st_routing where routing_code=v_code) then
     insert into md_st_routing(routing_code,seq,operation_code,operation_detail_code,operation_detail_name,is_active)
     select v_code,row_number() over(order by d.source_seq)*10,d.operation_code,d.operation_detail_code,d.operation_detail_name,true
     from _sig x join md_routing_detailed d on d.part_num=x.part_num and d.revision_num=x.revision_num and d.is_active
     join md_st_operation_scope s on upper(s.operation_code)=upper(d.operation_code) and s.is_active
     where x.signature=r.signature order by d.source_seq limit r.op_count;
   end if;
 end loop;
 insert into md_part_routing(part_num,revision_num,routing_code,is_active,updated_at,last_import_batch_id)
 select x.part_num,x.revision_num,s.routing_code,true,now(),p_batch from _sig x join md_st_routing_summary s on s.routing_signature=x.signature
 on conflict(part_num,revision_num) do update set routing_code=excluded.routing_code,is_active=true,updated_at=now(),last_import_batch_id=p_batch;
 update md_st_routing_summary s set part_revision_count=(select count(*) from md_part_routing p where p.routing_code=s.routing_code and p.is_active),is_active=exists(select 1 from md_part_routing p where p.routing_code=s.routing_code and p.is_active),updated_at=now();
 select array_agg(distinct s.routing_code) into v_codes from _sig x join md_st_routing_summary s on s.routing_signature=x.signature;
 if v_codes is not null then perform public.refresh_st_operation_mapping(v_codes); end if;
end $$;

-- Backfill project/database đã có routing trước migration này.
select public.refresh_st_operation_mapping(null);
