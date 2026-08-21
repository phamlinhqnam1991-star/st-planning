create or replace function public.rebuild_st_routing(p_batch_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare max_code bigint;
begin
  select coalesce(max(nullif(regexp_replace(routing_code,'\D','','g'),'')::bigint),0) into max_code from md_st_routing_summary;
  perform setval('st_routing_code_seq', greatest(max_code,1), max_code>0);

  update md_st_routing_summary set is_active=false,part_revision_count=0,updated_at=now();
  update md_st_routing set is_active=false,updated_at=now();
  update md_part_routing set is_active=false,updated_at=now();

  with part_sig as (
    select d.part_num,d.revision_num,
      string_agg(d.operation_detail_code,' -> ' order by d.source_seq) signature,
      count(*)::int operation_count
    from md_routing_detailed d join md_st_operation_scope s on s.operation_code=d.operation_code and s.is_active
    where d.is_active group by d.part_num,d.revision_num
  ), new_sig as (
    select distinct signature,operation_count from part_sig
  )
  insert into md_st_routing_summary(routing_code,routing_name,operation_count,part_revision_count,routing_signature,is_active)
  select 'RT_ST_'||lpad(nextval('st_routing_code_seq')::text,4,'0'),
         'ST Routing', operation_count,0,signature,true
  from new_sig n where not exists(select 1 from md_st_routing_summary x where x.routing_signature=n.signature);

  with part_sig as (
    select d.part_num,d.revision_num,string_agg(d.operation_detail_code,' -> ' order by d.source_seq) signature,count(*)::int operation_count
    from md_routing_detailed d join md_st_operation_scope s on s.operation_code=d.operation_code and s.is_active
    where d.is_active group by d.part_num,d.revision_num
  ), cnt as (select signature,max(operation_count) operation_count,count(*)::int part_count from part_sig group by signature)
  update md_st_routing_summary r set is_active=true,operation_count=c.operation_count,part_revision_count=c.part_count,updated_at=now() from cnt c where c.signature=r.routing_signature;

  with part_sig as (
    select d.part_num,d.revision_num,string_agg(d.operation_detail_code,' -> ' order by d.source_seq) signature
    from md_routing_detailed d join md_st_operation_scope s on s.operation_code=d.operation_code and s.is_active
    where d.is_active group by d.part_num,d.revision_num
  )
  insert into md_part_routing(part_num,revision_num,routing_code,is_active,last_import_batch_id)
  select p.part_num,p.revision_num,r.routing_code,true,p_batch_id from part_sig p join md_st_routing_summary r on r.routing_signature=p.signature
  on conflict(part_num,revision_num) do update set routing_code=excluded.routing_code,is_active=true,last_import_batch_id=excluded.last_import_batch_id,updated_at=now();

  update md_st_routing_summary set routing_name='ST Routing '||regexp_replace(routing_code,'^RT_ST_','') where routing_name='ST Routing';

  with part_sig as (
    select d.part_num,d.revision_num,string_agg(d.operation_detail_code,' -> ' order by d.source_seq) signature
    from md_routing_detailed d join md_st_operation_scope s on s.operation_code=d.operation_code and s.is_active
    where d.is_active group by d.part_num,d.revision_num
  ), scoped as (
    select d.*,p.signature from md_routing_detailed d
    join md_st_operation_scope s on s.operation_code=d.operation_code and s.is_active
    join part_sig p on p.part_num=d.part_num and p.revision_num=d.revision_num
    where d.is_active
  ), reps as (
    select signature,min(part_num||E'\x1f'||revision_num) rep from scoped group by signature
  ), lines as (
    select r.routing_code,
      row_number() over(partition by x.signature order by x.source_seq)::int*10 seq,
      x.operation_code,x.operation_detail_code,x.operation_detail_name
    from scoped x join reps p on p.signature=x.signature and p.rep=x.part_num||E'\x1f'||x.revision_num
    join md_st_routing_summary r on r.routing_signature=x.signature
  )
  insert into md_st_routing(routing_code,seq,operation_code,operation_detail_code,operation_detail_name,is_active)
  select routing_code,seq,operation_code,operation_detail_code,operation_detail_name,true from lines
  on conflict(routing_code,seq) do update set operation_code=excluded.operation_code,operation_detail_code=excluded.operation_detail_code,operation_detail_name=excluded.operation_detail_name,is_active=true,updated_at=now();
end $$;
