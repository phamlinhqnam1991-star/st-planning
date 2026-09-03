import type {PoolClient} from "pg";

export type SupportType="MASKING"|"UNMASKING";
export type SupportView="scheduled"|"unscheduled";

export type MainPlanningOperation={
  standard_operation:string;
  planning_order:number|null;
};

export type SupportPlanRawRow={
  planning_job_operation_id:number;
  job_num:string;
  part_num:string|null;
  revision_num:string|null;
  part_description:string|null;
  prod_qty:number|null;
  current_good_wip_qty:number|null;
  total_surface:number|null;
  last_operation:string|null;
  next_operation:string|null;
  priority_type:string|null;
  standard_operation:string;
  planning_order:number|null;
  main_route_seq:number;
  previous_main_route_seq:number|null;
  support_seq:number;
  support_operation_code:string|null;
  operation_detail_code:string|null;
  operation_detail_name:string|null;
  support_type:SupportType;
  batch_id:number;
  batch_no:string|null;
  batch_status:string|null;
  planning_date:string|null;
  recipe_key:string|null;
  recipe_no:string|null;
  recipe_name:string|null;
  process_minutes:number|null;
  schedule_id:number|null;
  schedule_date:string|null;
  resource_code:string|null;
  planned_start:string|null;
  planned_end:string|null;
  schedule_status:string|null;
};

export type SupportOperation={
  seq:number;
  operationCode:string;
  detailCode:string;
  name:string;
};

export type SupportPlanJob={
  planningJobOperationId:number;
  jobNum:string;
  partNum:string;
  revisionNum:string;
  partDescription:string;
  qty:number|null;
  currentGoodWipQty:number|null;
  surface:number|null;
  lastOperation:string;
  nextOperation:string;
  priority:string;
  standardOperation:string;
  planningOrder:number|null;
  supportType:SupportType;
  supportOperations:SupportOperation[];
  batchId:number;
  batchNo:string;
  batchStatus:string;
  planningDate:string|null;
  recipeKey:string;
  recipeNo:string;
  recipeName:string;
  processMinutes:number|null;
  scheduleId:number|null;
  scheduleDate:string|null;
  resourceCode:string;
  plannedStart:string|null;
  plannedEnd:string|null;
  scheduleStatus:string;
};

export type MainSupportPlan={
  standardOperation:string;
  displayName:string;
  planningOrder:number|null;
  masking:SupportPlanJob[];
  unmasking:SupportPlanJob[];
};

export type LoadMaskingUnmaskingPlanInput={
  search?:string;
  view?:SupportView;
  scheduleDate?:string;
};

const clean=(v:unknown)=>String(v??"").trim();
const displayMain=(operation:string)=>clean(operation).toUpperCase()==="PRIMER"?"PRIMER1":clean(operation);

/**
 * Masking / Unmasking is a derived support plan.
 *
 * IMPORTANT: planning_job_operation.source_seq belongs to the Job AllOperation
 * identity. Routing Detail source_seq belongs to the full physical routing and
 * includes Intermediate/Masking/Unmasking steps that AllOperation may omit.
 * They must NEVER be compared, even after simple 1..N normalization.
 *
 * Instead this resolver rebuilds the canonical MAIN occurrences directly on
 * md_routing_detailed using the same ST Operation Mapping + Planning Scope +
 * PRIMER/TOPCOAT occurrence rules as Planning Chain. Each Routing Main receives
 * the same operation_instance_key shape (for example BSAUNSLD#1, PRIMER#1,
 * PRIMER2#1, TOPCOAT1#1). The Job Batch row is then joined to that exact Main
 * occurrence. Every real routing operation containing MSKG strictly between the
 * previous Routing Main and the current Routing Main belongs to the CURRENT Main.
 * UNMSKG* is Unmasking; all other *MSKG* operations are Masking.
 */
export async function loadMaskingUnmaskingPlan(
  c:PoolClient,
  input:LoadMaskingUnmaskingPlanInput={}
):Promise<MainSupportPlan[]>{
  const q=clean(input.search);
  const view:SupportView=input.view==="unscheduled"?"unscheduled":"scheduled";
  const scheduleDate=clean(input.scheduleDate);

  const [mainQ,supportQ]=await Promise.all([
    c.query(`
      select
        s.standard_operation,
        coalesce(om.planning_sort_order,s.sort_order) planning_order
      from public.md_planning_operation_scope s
      left join public.md_operation_master om
        on upper(trim(om.standard_operation))=upper(trim(s.standard_operation))
       and om.is_active=true
      where s.is_active=true
      order by coalesce(om.planning_sort_order,s.sort_order) asc nulls last,
               upper(trim(s.standard_operation)) asc
    `),
    c.query(`
      /*
       * PERFORMANCE RULE:
       * Never rebuild canonical Routing Main for the whole routing master on a page load.
       * First reduce to Batch/Job rows that belong to the selected scheduled/unscheduled view,
       * then rebuild route context only for those Part/Revision pairs.
       */
      with candidate_batch_job as (
        select
          bj.planning_job_operation_id,
          bj.job_num,
          b.id batch_id,
          b.batch_no,
          b.status batch_status,
          b.planning_date,
          b.recipe_key,
          b.process_minutes,
          po.standard_operation,
          po.operation_instance_key,
          j.part_num,
          j.revision_num,
          j.part_description,
          j.prod_qty,
          j.current_good_wip_qty,
          j.total_surface,
          j.last_operation,
          j.next_operation,
          j.priority_type,
          om.planning_sort_order planning_order,
          ps.id schedule_id,
          ps.schedule_date,
          ps.resource_code,
          ps.planned_start,
          ps.planned_end,
          ps.status schedule_status
        from public.planning_batch_job bj
        join public.planning_batch b
          on b.id=bj.batch_id
         and b.status<>'CANCELLED'
        join public.planning_job_operation po
          on po.id=bj.planning_job_operation_id
         and po.is_active=true
        join public.open_job_current j
          on j.job_num=po.job_num
         and j.is_open=true
        left join public.md_operation_master om
          on upper(trim(om.standard_operation))=upper(trim(po.standard_operation))
         and om.is_active=true
        left join public.planning_schedule ps
          on ps.batch_id=b.id
         and ps.status<>'CANCELLED'
        where
          (($2::text='scheduled' and ps.id is not null and ps.schedule_date=$3::date)
           or
           ($2::text='unscheduled' and ps.id is null))
      ),
      candidate_part_revision as (
        select distinct
          upper(trim(part_num)) part_key,
          upper(trim(revision_num)) revision_key
        from candidate_batch_job
      ),
      route_detail_base as (
        select d.*
        from public.md_routing_detailed d
        join candidate_part_revision p
          on upper(trim(d.part_num))=p.part_key
         and upper(trim(d.revision_num))=p.revision_key
        where d.is_active=true
      ),
      route_detail as (
        select
          d.*,
          lag(upper(trim(d.operation_code))) over(
            partition by upper(trim(d.part_num)),upper(trim(d.revision_num))
            order by d.source_seq
          ) previous_raw_operation,
          lead(upper(trim(d.operation_code))) over(
            partition by upper(trim(d.part_num)),upper(trim(d.revision_num))
            order by d.source_seq
          ) next_raw_operation
        from route_detail_base d
      ),
      mapped_route as (
        select
          d.*,
          m.st_group,
          m.standard_operation_rule,
          count(*) filter(where m.st_group='PRIMER') over(
            partition by upper(trim(d.part_num)),upper(trim(d.revision_num))
            order by d.source_seq rows between unbounded preceding and current row
          )::int primer_occurrence,
          count(*) filter(where m.st_group='TOPCOAT') over(
            partition by upper(trim(d.part_num)),upper(trim(d.revision_num))
            order by d.source_seq rows between unbounded preceding and current row
          )::int topcoat_occurrence
        from route_detail d
        left join lateral (
          select
            mm.st_group,
            mm.standard_operation_rule
          from public.md_st_operation_mapping mm
          join public.md_st_operation_scope sc
            on upper(trim(sc.operation_code))=upper(trim(mm.source_operation_code))
           and sc.is_active=true
           and sc.operation_type='PLANNING_OPERATION'
          where mm.is_active=true
            and upper(trim(mm.source_operation_code))=upper(trim(d.operation_code))
          order by
            case
              when mm.mapping_rule='DIRECT' then 0
              when mm.mapping_rule='SEQUENCE/FALLBACK' then 1
              else 2
            end,
            coalesce(mm.sort_order,2147483647),
            mm.updated_at desc nulls last,
            mm.created_at desc nulls last,
            mm.id desc
          limit 1
        ) m on true
      ),
      standardized_route as (
        select
          m.*,
          case
            when m.st_group='PRIMER' then
              case
                when m.primer_occurrence=1 then 'PRIMER'
                when m.primer_occurrence=2 then 'PRIMER2'
                else 'PRIMER3'
              end
            when m.st_group='TOPCOAT' then
              case when m.topcoat_occurrence=1 then 'TOPCOAT1' else 'TOPCOAT2' end
            when upper(trim(m.operation_code))='HE-BAKE' then
              case
                when m.previous_raw_operation='PLA-ZINI' or m.next_raw_operation='PLA-CC'
                  then 'HE-BAKE after plating'
                when m.next_raw_operation in ('A-DBLST','M-DBLST')
                  then 'HE-BAKE before blasting'
                else 'HE-BAKE'
              end
            else m.standard_operation_rule
          end standard_operation
        from mapped_route m
      ),
      route_main_numbered as (
        select
          r.*,
          row_number() over(
            partition by
              upper(trim(r.part_num)),
              upper(trim(r.revision_num)),
              upper(trim(r.standard_operation))
            order by r.source_seq
          )::int standard_occurrence
        from standardized_route r
        join public.md_planning_operation_scope ps
          on upper(trim(ps.standard_operation))=upper(trim(r.standard_operation))
         and ps.is_active=true
        where nullif(trim(coalesce(r.standard_operation,'')),'') is not null
      ),
      route_main_identity as (
        select
          r.*,
          r.standard_operation||'#'||r.standard_occurrence::text operation_instance_key
        from route_main_numbered r
      ),
      route_main as (
        select
          r.*,
          lag(r.source_seq) over(
            partition by upper(trim(r.part_num)),upper(trim(r.revision_num))
            order by r.source_seq
          ) previous_main_route_seq
        from route_main_identity r
      ),
      batch_main as (
        select
          cbj.planning_job_operation_id,
          cbj.job_num,
          cbj.part_num,
          cbj.revision_num,
          cbj.part_description,
          cbj.prod_qty,
          cbj.current_good_wip_qty,
          cbj.total_surface,
          cbj.last_operation,
          cbj.next_operation,
          cbj.priority_type,
          cbj.standard_operation,
          cbj.planning_order,
          rm.source_seq main_route_seq,
          rm.previous_main_route_seq,
          cbj.batch_id,
          cbj.batch_no,
          cbj.batch_status,
          cbj.planning_date,
          cbj.recipe_key,
          cbj.process_minutes,
          cbj.schedule_id,
          cbj.schedule_date,
          cbj.resource_code,
          cbj.planned_start,
          cbj.planned_end,
          cbj.schedule_status
        from candidate_batch_job cbj
        join route_main rm
          on upper(trim(rm.part_num))=upper(trim(cbj.part_num))
         and upper(trim(rm.revision_num))=upper(trim(cbj.revision_num))
         and upper(trim(rm.operation_instance_key))=upper(trim(cbj.operation_instance_key))
      ),
      linked as (
        select
          bm.planning_job_operation_id,
          bm.job_num,
          bm.part_num,
          bm.revision_num,
          bm.part_description,
          bm.prod_qty,
          bm.current_good_wip_qty,
          bm.total_surface,
          bm.last_operation,
          bm.next_operation,
          bm.priority_type,
          bm.standard_operation,
          bm.planning_order,
          bm.main_route_seq,
          bm.previous_main_route_seq,
          d.source_seq support_seq,
          d.operation_code support_operation_code,
          d.operation_detail_code,
          d.operation_detail_name,
          case
            when upper(trim(coalesce(d.operation_code,''))) like '%UNMSKG%' then 'UNMASKING'
            when upper(trim(coalesce(d.operation_code,''))) like '%MSKG%' then 'MASKING'
            else null
          end support_type,
          bm.batch_id,
          bm.batch_no,
          bm.batch_status,
          bm.planning_date,
          bm.recipe_key,
          bm.process_minutes,
          bm.schedule_id,
          bm.schedule_date,
          bm.resource_code,
          bm.planned_start,
          bm.planned_end,
          bm.schedule_status
        from batch_main bm
        join route_detail d
          on upper(trim(d.part_num))=upper(trim(bm.part_num))
         and upper(trim(d.revision_num))=upper(trim(bm.revision_num))
         and d.source_seq>coalesce(bm.previous_main_route_seq,0)
         and d.source_seq<bm.main_route_seq
        where not exists(
          select 1
          from route_main other_main
          where upper(trim(other_main.part_num))=upper(trim(d.part_num))
            and upper(trim(other_main.revision_num))=upper(trim(d.revision_num))
            and other_main.source_seq=d.source_seq
        )
          and ($1::text=''
          or bm.job_num ilike '%'||$1||'%'
          or coalesce(bm.part_num,'') ilike '%'||$1||'%'
          or coalesce(bm.part_description,'') ilike '%'||$1||'%'
          or bm.standard_operation ilike '%'||$1||'%'
          or coalesce(bm.batch_no,'') ilike '%'||$1||'%'
          or coalesce(d.operation_detail_code,'') ilike '%'||$1||'%')
      )
      select
        l.*,
        pr.recipe_no,
        pr.recipe_name
      from linked l
      left join public.md_process_recipe pr
        on pr.recipe_key=l.recipe_key
      where l.support_type is not null
      order by l.planning_order asc nulls last,
               upper(trim(l.standard_operation)) asc,
               l.support_type,
               l.planned_start asc nulls last,
               l.batch_no,
               l.job_num,
               l.support_seq
    `,[q,view,scheduleDate||null])
  ]);
  const mainRows=mainQ.rows as MainPlanningOperation[];
  const supportRows=supportQ.rows as SupportPlanRawRow[];

  const group=new Map<string,SupportPlanJob>();
  for(const row of supportRows){
    const key=[row.standard_operation,row.support_type,row.planning_job_operation_id,row.batch_id,row.job_num].join("|");
    let item=group.get(key);
    if(!item){
      item={
        planningJobOperationId:Number(row.planning_job_operation_id),
        jobNum:clean(row.job_num),
        partNum:clean(row.part_num),
        revisionNum:clean(row.revision_num),
        partDescription:clean(row.part_description),
        qty:row.prod_qty==null?null:Number(row.prod_qty),
        currentGoodWipQty:row.current_good_wip_qty==null?null:Number(row.current_good_wip_qty),
        surface:row.total_surface==null?null:Number(row.total_surface),
        lastOperation:clean(row.last_operation),
        nextOperation:clean(row.next_operation),
        priority:clean(row.priority_type),
        standardOperation:clean(row.standard_operation),
        planningOrder:row.planning_order==null?null:Number(row.planning_order),
        supportType:row.support_type,
        supportOperations:[],
        batchId:Number(row.batch_id),
        batchNo:clean(row.batch_no),
        batchStatus:clean(row.batch_status),
        planningDate:row.planning_date,
        recipeKey:clean(row.recipe_key),
        recipeNo:clean(row.recipe_no),
        recipeName:clean(row.recipe_name),
        processMinutes:row.process_minutes==null?null:Number(row.process_minutes),
        scheduleId:row.schedule_id==null?null:Number(row.schedule_id),
        scheduleDate:row.schedule_date,
        resourceCode:clean(row.resource_code),
        plannedStart:row.planned_start,
        plannedEnd:row.planned_end,
        scheduleStatus:clean(row.schedule_status)
      };
      group.set(key,item);
    }
    const operationCode=clean(row.support_operation_code);
    const detailCode=clean(row.operation_detail_code)||operationCode;
    const name=clean(row.operation_detail_name);
    if(detailCode&&!item.supportOperations.some(x=>x.seq===Number(row.support_seq)&&x.detailCode===detailCode)){
      item.supportOperations.push({
        seq:Number(row.support_seq),
        operationCode,
        detailCode,
        name
      });
    }
  }

  const items=[...group.values()];
  const byMain=new Map<string,{masking:SupportPlanJob[];unmasking:SupportPlanJob[]}>();
  for(const item of items){
    const key=item.standardOperation.toUpperCase();
    const current=byMain.get(key)??{masking:[],unmasking:[]};
    if(item.supportType==="MASKING")current.masking.push(item); else current.unmasking.push(item);
    byMain.set(key,current);
  }

  return mainRows.map(row=>{
    const op=clean(row.standard_operation);
    const lists=byMain.get(op.toUpperCase())??{masking:[],unmasking:[]};
    return {
      standardOperation:op,
      displayName:displayMain(op),
      planningOrder:row.planning_order==null?null:Number(row.planning_order),
      masking:lists.masking,
      unmasking:lists.unmasking
    };
  });
}
