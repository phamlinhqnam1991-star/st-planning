import type {PoolClient} from "pg";

export type ProductionChangeAlert={
 id:number;productionDate:string;createdAt:string;approvedAt:string|null;
 batchId:number;batchNo:string;standardOperation:string;recipeNo:string|null;recipeName:string|null;
 jobNum:string;partNum:string;revisionNum:string;partDescription:string;program:string;priority:string;
 qty:number;surface:number;reason:string;validationMessage:string;sourceKind:"DIRECT"|"PROPAGATED";
 resourceCode:string|null;plannedStart:string|null;plannedEnd:string|null;
 sourceBatchQtyBefore:number|null;sourceBatchQtyAfter:number|null;sourceBatchSurfaceBefore:number|null;sourceBatchSurfaceAfter:number|null;
 nextStandardOperation:string|null;affectedPlanner:string|null;affectedBatchId:number|null;affectedBatchNo:string|null;
 affectedResourceCode:string|null;affectedPlannedStart:string|null;impactLevel:string|null;handoverStatus:string|null;
 handoverCreatedAt:string|null;handoverAcknowledgedAt:string|null;handoverAcknowledgedBy:string|null;handoverNote:string|null;
 nextMainStatus:"NO_NEXT_MAIN"|"WAITING_BATCH"|"ATTENTION_NEW"|"ACKNOWLEDGED"|"UNKNOWN";
};

const n=(v:unknown)=>Number(v||0);
const txt=(v:unknown)=>String(v??"").trim();
const iso=(v:unknown)=>v?new Date(v as any).toISOString():null;

export async function loadProductionChangeAlerts(c:PoolClient,productionDate:string):Promise<ProductionChangeAlert[]>{
 const q=await c.query(`
  select i.id,s.production_date,i.created_at,i.approved_at,i.batch_id,b.batch_no,b.standard_operation,
         r.recipe_no,r.recipe_name,i.job_num,i.reason,i.validation_message,i.proposal_json,
         coalesce(j.part_num,i.proposal_json->>'partNum','') part_num,
         coalesce(j.revision_num,i.proposal_json->>'revisionNum','') revision_num,
         coalesce(j.part_description,i.proposal_json->>'partDescription','') part_description,
         coalesce(j.program,'') program,coalesce(j.priority_type,'') priority_type,
         coalesce((i.proposal_json->>'qty')::numeric,pbj.qty,0) changed_qty,
         coalesce((i.proposal_json->>'surface')::numeric,pbj.surface_dm2,0) changed_surface,
         ps.resource_code,ps.planned_start,ps.planned_end,
         e.source_batch_qty_before,e.source_batch_qty_after,e.source_batch_surface_before,e.source_batch_surface_after,
         e.next_standard_operation,e.affected_planner,e.affected_batch_id,e.affected_batch_no,e.affected_resource_code,e.affected_planned_start,
         e.impact_level,e.status handover_status,e.created_at handover_created_at,e.acknowledged_at handover_acknowledged_at,
         e.acknowledged_by handover_acknowledged_by,e.note handover_note
  from production_adjustment_item i
  join production_adjustment_set s on s.id=i.adjustment_set_id
  join planning_batch b on b.id=i.batch_id
  left join md_process_recipe r on r.recipe_key=b.recipe_key
  left join open_job_current j on upper(trim(j.job_num))=upper(trim(i.job_num))
  left join planning_batch_job pbj on pbj.batch_id=i.batch_id and pbj.planning_job_operation_id=i.planning_job_operation_id
  left join lateral(
    select x.resource_code,x.planned_start,x.planned_end
    from planning_schedule x where x.batch_id=i.batch_id and x.status<>'CANCELLED'
    order by x.planned_start desc,x.id desc limit 1
  ) ps on true
  left join lateral(
    select h.* from planning_handover_change_event h
    where h.source_batch_id=i.batch_id and h.job_num=i.job_num and h.change_type='ADD_JOB' and h.note like 'PRODUCTION_ADD:%'
    order by h.created_at desc,h.id desc limit 1
  ) e on true
  where s.production_date=$1::date and i.item_type='ADD_JOB' and i.status='APPROVED' and i.approved_by='Production'
  order by i.created_at desc,i.id desc
 `,[productionDate]);
 return q.rows.map((x:any)=>{
  const reportedFrom=txt(x.proposal_json?.reportedFrom);
  const sourceKind=reportedFrom==="NEXT_MAIN_ATTENTION"?"PROPAGATED":"DIRECT";
  let nextMainStatus:ProductionChangeAlert["nextMainStatus"]="UNKNOWN";
  if(x.next_standard_operation){
   if(x.handover_status==="NEW")nextMainStatus=x.affected_batch_id?"ATTENTION_NEW":"WAITING_BATCH";
   else if(x.handover_status==="ACKNOWLEDGED")nextMainStatus="ACKNOWLEDGED";
  }else if(sourceKind==="DIRECT")nextMainStatus="NO_NEXT_MAIN";
  return {
   id:n(x.id),productionDate:String(x.production_date).slice(0,10),createdAt:iso(x.created_at)!,approvedAt:iso(x.approved_at),
   batchId:n(x.batch_id),batchNo:txt(x.batch_no),standardOperation:txt(x.standard_operation),recipeNo:txt(x.recipe_no)||null,recipeName:txt(x.recipe_name)||null,
   jobNum:txt(x.job_num),partNum:txt(x.part_num),revisionNum:txt(x.revision_num),partDescription:txt(x.part_description),program:txt(x.program),priority:txt(x.priority_type),
   qty:n(x.changed_qty),surface:n(x.changed_surface),reason:txt(x.reason),validationMessage:txt(x.validation_message),sourceKind,
   resourceCode:txt(x.resource_code)||null,plannedStart:iso(x.planned_start),plannedEnd:iso(x.planned_end),
   sourceBatchQtyBefore:x.source_batch_qty_before==null?null:n(x.source_batch_qty_before),sourceBatchQtyAfter:x.source_batch_qty_after==null?null:n(x.source_batch_qty_after),
   sourceBatchSurfaceBefore:x.source_batch_surface_before==null?null:n(x.source_batch_surface_before),sourceBatchSurfaceAfter:x.source_batch_surface_after==null?null:n(x.source_batch_surface_after),
   nextStandardOperation:txt(x.next_standard_operation)||null,affectedPlanner:txt(x.affected_planner)||null,affectedBatchId:x.affected_batch_id==null?null:n(x.affected_batch_id),
   affectedBatchNo:txt(x.affected_batch_no)||null,affectedResourceCode:txt(x.affected_resource_code)||null,affectedPlannedStart:iso(x.affected_planned_start),
   impactLevel:txt(x.impact_level)||null,handoverStatus:txt(x.handover_status)||null,handoverCreatedAt:iso(x.handover_created_at),
   handoverAcknowledgedAt:iso(x.handover_acknowledged_at),handoverAcknowledgedBy:txt(x.handover_acknowledged_by)||null,handoverNote:txt(x.handover_note)||null,nextMainStatus
  };
 });
}
