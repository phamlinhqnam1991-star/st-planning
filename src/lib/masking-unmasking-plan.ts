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
  total_surface:number|null;
  last_operation:string|null;
  next_operation:string|null;
  priority_type:string|null;
  standard_operation:string;
  planning_order:number|null;
  previous_source_seq_snapshot:number|null;
  main_source_seq:number;
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
 * Masking / Unmasking is a derived support plan.  The canonical Main Planning
 * occurrence is planning_job_operation itself, so PRIMER/PRIMER2/PRIMER3 and
 * TOPCOAT1/TOPCOAT2 stay exactly aligned with Planning Board occurrence logic.
 *
 * A support step belongs to the CURRENT Main when its physical routing row is
 * strictly between previous_source_seq_snapshot and current source_seq.
 * Only actual routing operations whose raw operation code contains MSKG are
 * considered.  UNMSKG* is Unmasking; every other *MSKG* operation is Masking.
 * operation_detail_code is kept for the planner-facing detail/traceability.
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
      select standard_operation,
             planning_sort_order planning_order
      from public.md_operation_master
      where is_active=true
      order by planning_sort_order asc nulls last, upper(trim(standard_operation)) asc
    `),
    c.query(`
      with batch_job as (
        select
          bj.planning_job_operation_id,
          bj.job_num,
          b.id batch_id,
          b.batch_no,
          b.status batch_status,
          b.planning_date,
          b.recipe_key,
          b.process_minutes
        from public.planning_batch_job bj
        join public.planning_batch b on b.id=bj.batch_id
        where b.status<>'CANCELLED'
      ),
      linked as (
        select
          po.id planning_job_operation_id,
          po.job_num,
          j.part_num,
          j.revision_num,
          j.part_description,
          j.prod_qty,
          j.total_surface,
          j.last_operation,
          j.next_operation,
          j.priority_type,
          po.standard_operation,
          om.planning_sort_order planning_order,
          po.previous_source_seq_snapshot,
          po.source_seq main_source_seq,
          d.source_seq support_seq,
          d.operation_code support_operation_code,
          d.operation_detail_code,
          d.operation_detail_name,
          case
            when upper(trim(coalesce(d.operation_code,''))) like '%MSKG%'
             and upper(trim(coalesce(d.operation_code,''))) like '%UNMSKG%'
              then 'UNMASKING'
            when upper(trim(coalesce(d.operation_code,''))) like '%MSKG%'
              then 'MASKING'
            else null
          end support_type,
          bj.batch_id,
          bj.batch_no,
          bj.batch_status,
          bj.planning_date,
          bj.recipe_key,
          bj.process_minutes
        from batch_job bj
        join public.planning_job_operation po
          on po.id=bj.planning_job_operation_id
         and po.is_active=true
        join public.open_job_current j
          on j.job_num=po.job_num
         and j.is_open=true
        left join public.md_operation_master om
          on upper(trim(om.standard_operation))=upper(trim(po.standard_operation))
         and om.is_active=true
        join public.md_routing_detailed d
          on d.part_num=j.part_num
         and d.revision_num=j.revision_num
         and d.is_active=true
         and d.source_seq>coalesce(po.previous_source_seq_snapshot,-2147483648)
         and d.source_seq<po.source_seq
        left join public.md_st_operation_scope support_scope
          on upper(trim(support_scope.operation_code))=upper(trim(d.operation_code))
         and support_scope.is_active=true
        where coalesce(support_scope.operation_type,'INTERMEDIATE')<>'PLANNING_OPERATION'
          and ($1::text=''
          or j.job_num ilike '%'||$1||'%'
          or coalesce(j.part_num,'') ilike '%'||$1||'%'
          or coalesce(j.part_description,'') ilike '%'||$1||'%'
          or po.standard_operation ilike '%'||$1||'%'
          or coalesce(bj.batch_no,'') ilike '%'||$1||'%'
          or coalesce(d.operation_detail_code,'') ilike '%'||$1||'%')
      )
      select
        l.*,
        pr.recipe_no,
        pr.recipe_name,
        ps.id schedule_id,
        ps.schedule_date,
        ps.resource_code,
        ps.planned_start,
        ps.planned_end,
        ps.status schedule_status
      from linked l
      left join public.md_process_recipe pr
        on pr.recipe_key=l.recipe_key
      left join lateral (
        select s.id,s.schedule_date,s.resource_code,s.planned_start,s.planned_end,s.status
        from public.planning_schedule s
        where s.batch_id=l.batch_id
          and s.status<>'CANCELLED'
        order by s.planned_start desc nulls last,s.id desc
        limit 1
      ) ps on true
      where l.support_type is not null
        and (
          ($2::text='scheduled' and ps.id is not null and ps.schedule_date=$3::date)
          or
          ($2::text='unscheduled' and ps.id is null)
        )
      order by l.planning_order asc nulls last,
               upper(trim(l.standard_operation)) asc,
               l.support_type,
               ps.planned_start asc nulls last,
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
