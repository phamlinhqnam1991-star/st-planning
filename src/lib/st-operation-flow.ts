import type {PoolClient} from "pg";
import {syncPlanningChains} from "@/lib/planning/sync-planning-chains";

export const cleanCode=(v:unknown)=>String(v??"").trim().toUpperCase();

/**
 * Canonical ST configuration chain:
 * md_operation (raw/source operation catalog)
 * -> md_st_operation_scope (PLANNING_OPERATION / ST_SCOPE_ONLY; Intermediate is AUTO-derived)
 * -> md_st_operation_mapping (source -> Main Operation)
 * -> md_operation_master + md_planning_operation_scope (Main Operation)
 * -> md_st_group
 * -> md_area_operation_group -> md_area (physical area)
 * -> md_schedule_area_operation -> md_schedule_area (scheduling lane)
 * -> derived ST routing + planning_job_operation.
 */
export async function rebuildAllStRoutingDerived(c:PoolClient){
  // v297: ST Routing Chain · Standardized is generated automatically from the
  // full raw routing span between the FIRST and LAST Main Planning occurrence.
  // Therefore raw operations between Main Planning steps do not need to be
  // manually classified INTERMEDIATE just to appear in ST Routing.
  await c.query(`
    create temporary table if not exists _cfg_st_steps(
      part_num text,
      revision_num text,
      source_seq integer,
      operation_code text,
      operation_detail_code text,
      operation_detail_name text,
      primary key(part_num,revision_num,source_seq)
    ) on commit drop
  `);
  await c.query(`truncate table _cfg_st_steps`);

  await c.query(`
    with winner_mapping as (
      select source_operation_code,standard_operation_rule
      from (
        select
          upper(trim(m.source_operation_code)) source_operation_code,
          upper(trim(m.standard_operation_rule)) standard_operation_rule,
          row_number() over(
            partition by upper(trim(m.source_operation_code))
            order by
              case
                when m.mapping_rule='DIRECT' then 0
                when m.mapping_rule='SEQUENCE/FALLBACK' then 1
                else 2
              end,
              coalesce(m.sort_order,2147483647),
              m.updated_at desc nulls last,
              m.created_at desc nulls last,
              m.id desc
          ) rn
        from md_st_operation_mapping m
        join md_st_operation_scope s
          on s.is_active=true
         and s.operation_type='PLANNING_OPERATION'
         and upper(trim(s.operation_code))=upper(trim(m.source_operation_code))
        where m.is_active=true
      ) x
      where rn=1
    ), main_span as (
      select
        d.part_num,d.revision_num,
        min(d.source_seq)::int first_main_seq,
        max(d.source_seq)::int last_main_seq
      from md_routing_detailed d
      join winner_mapping m
        on m.source_operation_code=upper(trim(d.operation_code))
      join md_planning_operation_scope p
        on p.is_active=true
       and upper(trim(p.standard_operation))=m.standard_operation_rule
      where d.is_active=true
        and upper(trim(d.operation_code))<>'PIONBL'
      group by d.part_num,d.revision_num
    )
    insert into _cfg_st_steps(
      part_num,revision_num,source_seq,operation_code,operation_detail_code,operation_detail_name
    )
    select
      d.part_num,d.revision_num,d.source_seq,d.operation_code,
      d.operation_detail_code,d.operation_detail_name
    from md_routing_detailed d
    join main_span s
      on s.part_num=d.part_num
     and s.revision_num=d.revision_num
     and d.source_seq between s.first_main_seq and s.last_main_seq
    where d.is_active=true
    order by d.part_num,d.revision_num,d.source_seq
  `);

  await c.query(`
    create temporary table if not exists _cfg_st_sig(
      part_num text,
      revision_num text,
      signature text,
      op_count integer,
      primary key(part_num,revision_num)
    ) on commit drop
  `);
  await c.query(`truncate table _cfg_st_sig`);

  await c.query(`
    insert into _cfg_st_sig(part_num,revision_num,signature,op_count)
    select
      d.part_num,
      d.revision_num,
      string_agg(coalesce(nullif(d.operation_detail_code,''),d.operation_code),'>' order by d.source_seq),
      count(*)::int
    from _cfg_st_steps d
    group by d.part_num,d.revision_num
  `);

  // Keep existing Routing Codes for known signatures. New signatures receive
  // a deterministic CONFIG code so configuration changes do not depend on MAX()+1 races.
  await c.query(`
    insert into md_st_routing_summary(
      routing_code,routing_name,operation_count,part_revision_count,
      routing_signature,is_active,created_at,updated_at
    )
    select
      'RT_ST_CFG_'||upper(substr(md5(x.signature),1,12)),
      'ST Routing Config '||upper(substr(md5(x.signature),1,12)),
      max(x.op_count),0,x.signature,true,now(),now()
    from _cfg_st_sig x
    left join md_st_routing_summary s on s.routing_signature=x.signature
    where s.routing_code is null
    group by x.signature
    on conflict(routing_signature) do nothing
  `);

  await c.query(`update md_part_routing set is_active=false,updated_at=now()`);
  await c.query(`
    insert into md_part_routing(part_num,revision_num,routing_code,is_active,updated_at)
    select x.part_num,x.revision_num,s.routing_code,true,now()
    from _cfg_st_sig x
    join md_st_routing_summary s on s.routing_signature=x.signature
    on conflict(part_num,revision_num) do update set
      routing_code=excluded.routing_code,
      is_active=true,
      updated_at=now()
  `);

  await c.query(`
    delete from md_st_routing r
    using md_st_routing_summary s
    where s.routing_code=r.routing_code
      and exists(select 1 from _cfg_st_sig x where x.signature=s.routing_signature)
  `);

  await c.query(`
    with representative as (
      select distinct on (x.signature)
        x.signature,x.part_num,x.revision_num,s.routing_code
      from _cfg_st_sig x
      join md_st_routing_summary s on s.routing_signature=x.signature
      order by x.signature,x.part_num,x.revision_num
    )
    insert into md_st_routing(
      routing_code,seq,operation_code,operation_detail_code,operation_detail_name,is_active
    )
    select
      r.routing_code,
      row_number() over(partition by r.routing_code order by d.source_seq)*10,
      d.operation_code,
      d.operation_detail_code,
      d.operation_detail_name,
      true
    from representative r
    join _cfg_st_steps d
      on d.part_num=r.part_num
     and d.revision_num=r.revision_num
    order by r.routing_code,d.source_seq
  `);

  await c.query(`
    update md_st_routing_summary s set
      operation_count=coalesce((select count(*) from md_st_routing r where r.routing_code=s.routing_code and r.is_active),0),
      part_revision_count=coalesce((select count(*) from md_part_routing p where p.routing_code=s.routing_code and p.is_active),0),
      is_active=exists(select 1 from md_part_routing p where p.routing_code=s.routing_code and p.is_active),
      updated_at=now()
  `);

  await c.query(`select public.refresh_st_operation_mapping(null)`);

  // v297: md_st_routing now contains raw Intermediate rows too. Preserve the
  // existing HE-BAKE business rule by looking at the nearest PLANNING source
  // operations, not the immediately adjacent raw row.
  await c.query(`
    with hb as (
      select
        r.routing_code,r.seq,
        (
          select upper(trim(rp.operation_code))
          from md_st_routing rp
          join md_st_operation_mapping mp
            on mp.is_active=true and upper(trim(mp.source_operation_code))=upper(trim(rp.operation_code))
          join md_st_operation_scope sp
            on sp.is_active=true and sp.operation_type='PLANNING_OPERATION'
           and upper(trim(sp.operation_code))=upper(trim(rp.operation_code))
          where rp.is_active=true and rp.routing_code=r.routing_code and rp.seq<r.seq
          order by rp.seq desc limit 1
        ) prev_planning_code,
        (
          select upper(trim(rn.operation_code))
          from md_st_routing rn
          join md_st_operation_mapping mn
            on mn.is_active=true and upper(trim(mn.source_operation_code))=upper(trim(rn.operation_code))
          join md_st_operation_scope sn
            on sn.is_active=true and sn.operation_type='PLANNING_OPERATION'
           and upper(trim(sn.operation_code))=upper(trim(rn.operation_code))
          where rn.is_active=true and rn.routing_code=r.routing_code and rn.seq>r.seq
          order by rn.seq asc limit 1
        ) next_planning_code
      from md_st_routing r
      where r.is_active=true and upper(trim(r.operation_code))='HE-BAKE'
    )
    update md_st_routing r
    set standard_operation=case
          when hb.prev_planning_code=upper('PLA-ZiNi') or hb.next_planning_code='PLA-CC' then 'HE-BAKE after plating'
          when hb.next_planning_code in ('A-DBLST','M-DBLST') then 'HE-BAKE before blasting'
          else 'HE-BAKE'
        end,
        mapping_rule=case
          when hb.prev_planning_code=upper('PLA-ZiNi') or hb.next_planning_code in ('PLA-CC','A-DBLST','M-DBLST') then 'SEQUENCE'
          else 'SEQUENCE/FALLBACK'
        end
    from hb
    where r.routing_code=hb.routing_code and r.seq=hb.seq
  `);

  // Explicit ST_SCOPE_ONLY remains trace-only and may never become a Main.
  // Legacy manual INTERMEDIATE classification is intentionally ignored in v297;
  // bridge membership is inferred from the standardized route itself.
  await c.query(`
    update md_st_routing r
       set standard_operation=null,
           planning_group=null,
           mapping_rule=null,
           occurrence_no=null
      from md_st_operation_scope scope
     where scope.is_active=true
       and scope.operation_type='ST_SCOPE_ONLY'
       and upper(trim(scope.operation_code))=upper(trim(r.operation_code))
       and (
         r.standard_operation is not null
         or r.planning_group is not null
         or r.mapping_rule is not null
         or r.occurrence_no is not null
       )
  `);
}

export async function syncAllStDerived(c:PoolClient){
  await rebuildAllStRoutingDerived(c);
  return await syncPlanningChains(c);
}
