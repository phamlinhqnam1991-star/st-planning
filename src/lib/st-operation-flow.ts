import type {PoolClient} from "pg";
import {syncPlanningChains} from "@/lib/planning/sync-planning-chains";

export const cleanCode=(v:unknown)=>String(v??"").trim().toUpperCase();

/**
 * Canonical ST configuration chain:
 * md_operation (raw/source operation catalog)
 * -> md_st_operation_scope (belongs to ST + PLANNING_OPERATION/ST_SCOPE_ONLY)
 * -> md_st_operation_mapping (source -> Main Operation)
 * -> md_operation_master + md_planning_operation_scope (Main Operation)
 * -> md_st_group
 * -> md_area_operation_group -> md_area (physical area)
 * -> md_schedule_area_operation -> md_schedule_area (scheduling lane)
 * -> derived ST routing + planning_job_operation.
 */
export async function rebuildAllStRoutingDerived(c:PoolClient){
  // Rebuild the derived ST Routing from the CURRENT user-managed ST Scope.
  // Config changes are rare, so correctness is preferred over incremental complexity.
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
    from md_routing_detailed d
    join md_st_operation_scope s
      on upper(trim(s.operation_code))=upper(trim(d.operation_code))
     and s.is_active=true
    where d.is_active=true
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

  // Part -> derived ST Routing is fully regenerated from the canonical scope.
  await c.query(`
    update md_part_routing set is_active=false,updated_at=now()
  `);
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

  // Rebuild route rows for all currently used signatures from one representative Part/Rev.
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
    join md_routing_detailed d
      on d.part_num=r.part_num
     and d.revision_num=r.revision_num
     and d.is_active=true
    join md_st_operation_scope scope
      on upper(trim(scope.operation_code))=upper(trim(d.operation_code))
     and scope.is_active=true
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

  // Database-function guard for upgraded/legacy environments: even if a stale
  // active Source mapping exists, ST_SCOPE_ONLY may never expose a standardized
  // Main Operation to Planning Board or Scheduling.
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
