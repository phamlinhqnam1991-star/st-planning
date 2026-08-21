create or replace function public.rebuild_st_routing(p_batch uuid) returns void language plpgsql security definer as $$
declare r record; v_code text; v_next int;
begin
 create temp table _affected(part_num text,revision_num text,primary key(part_num,revision_num)) on commit drop;
 insert into _affected select distinct part_num,revision_num from md_routing_detailed where last_import_batch_id=p_batch on conflict do nothing;
 -- Full first import fallback: all active revisions when mapping is empty.
 if not exists(select 1 from md_part_routing) then insert into _affected select part_num,revision_num from md_part_revision where is_active on conflict do nothing; end if;
 delete from md_part_routing p using _affected a where p.part_num=a.part_num and p.revision_num=a.revision_num;
 create temp table _sig as select a.part_num,a.revision_num,string_agg(d.operation_detail_code,'>' order by d.source_seq) signature,count(*) op_count from _affected a join md_routing_detailed d on d.part_num=a.part_num and d.revision_num=a.revision_num and d.is_active join md_st_operation_scope s on s.operation_code=d.operation_code and s.is_active group by a.part_num,a.revision_num;
 for r in select distinct signature,op_count from _sig loop
   select routing_code into v_code from md_st_routing_summary where routing_signature=r.signature limit 1;
   if v_code is null then select coalesce(max(nullif(regexp_replace(routing_code,'\D','','g'),'')::int),0)+1 into v_next from md_st_routing_summary; v_code:='RT_ST_'||lpad(v_next::text,4,'0'); insert into md_st_routing_summary(routing_code,routing_name,operation_count,routing_signature,is_active) values(v_code,v_code,r.op_count,r.signature,true); end if;
   if not exists(select 1 from md_st_routing where routing_code=v_code) then insert into md_st_routing(routing_code,seq,operation_code,operation_detail_code,operation_detail_name,is_active) select v_code,row_number() over(order by d.source_seq)*10,d.operation_code,d.operation_detail_code,d.operation_detail_name,true from _sig x join md_routing_detailed d on d.part_num=x.part_num and d.revision_num=x.revision_num and d.is_active join md_st_operation_scope s on s.operation_code=d.operation_code and s.is_active where x.signature=r.signature order by d.source_seq limit r.op_count; end if;
 end loop;
 insert into md_part_routing(part_num,revision_num,routing_code,is_active,updated_at,last_import_batch_id) select x.part_num,x.revision_num,s.routing_code,true,now(),p_batch from _sig x join md_st_routing_summary s on s.routing_signature=x.signature on conflict(part_num,revision_num) do update set routing_code=excluded.routing_code,is_active=true,updated_at=now(),last_import_batch_id=p_batch;
 update md_st_routing_summary s set part_revision_count=(select count(*) from md_part_routing p where p.routing_code=s.routing_code and p.is_active),is_active=exists(select 1 from md_part_routing p where p.routing_code=s.routing_code and p.is_active),updated_at=now();
end $$;
