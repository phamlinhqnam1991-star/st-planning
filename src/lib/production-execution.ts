import type {PoolClient} from "pg";
import {loadMaskingUnmaskingPlan,type SupportPlanJob,type SupportType} from "@/lib/masking-unmasking-plan";

export type ProductionExecutionStatus="WAITING"|"ON-GOING"|"DONE";
export type ProductionExecutionSource="BATCH"|"MASKING"|"UNMASKING";
export type ProductionReportGroup="CHEMICAL_LINE"|"SHOT_PEENING"|"MASK_UNMASK"|"PAINTING"|"SIRIUS_CLEANING"|"BLASTING"|"PLATING"|"PASS_BRTG"|"OTHER";
export type ProductionReportMode="LINE"|"JOB";

export type ProductionJobDetail={
 planningJobOperationId:number;
 jobNum:string;
 partDescription:string;
 currentGoodWipQty:number|null;
 totalSurface:number|null;
 lastLaborOp:string;
 nextOperation:string;
 priority:string;
 supportOperations:string[];
 isAddedJob:boolean;
 status:ProductionExecutionStatus;
 actualStart:string|null;
 actualEnd:string|null;
 remark:string;
};

export type ProductionNextMainAttention={
 eventId:number;
 jobNum:string;
 sourceBatchId:number;
 sourceBatchNo:string;
 sourceOperation:string;
 nextOperation:string;
 recipeKey:string;
 recipeNo:string;
 recipeName:string;
 createdAt:string;
};

export type ProductionRemoveImpact={
 id:number;
 sourceBatchId:number;
 sourceBatchNo:string;
 sourceOperation:string;
 jobNum:string;
 nextOperation:string;
 affectedBatchId:number;
 affectedBatchNo:string;
 affectedResourceCode:string;
 affectedPlannedStart:string|null;
 changedJobQty:number;
 changedJobSurface:number;
 impactLevel:"WARNING"|"IMPACTED"|"CRITICAL";
 status:"NEW"|"ACKNOWLEDGED";
 createdAt:string;
 acknowledgedAt:string|null;
 acknowledgedBy:string;
 note:string;
};

export async function loadProductionRemoveImpacts(c:PoolClient,batchIds:number[]):Promise<ProductionRemoveImpact[]>{
 const ids=[...new Set(batchIds.map(Number).filter(x=>Number.isFinite(x)&&x>0))];
 if(!ids.length)return [];
 try{
  const q=await c.query(`
   select id,source_batch_id,source_batch_no,source_standard_operation,job_num,
          next_standard_operation,affected_batch_id,affected_batch_no,affected_resource_code,affected_planned_start,
          changed_job_qty,changed_job_surface,impact_level,status,created_at,acknowledged_at,acknowledged_by,note
   from planning_handover_change_event
   where affected_batch_id=any($1::bigint[])
     and change_type='REMOVE_JOB'
     and note like 'PRODUCTION_REMOVE_BEFORE_START:%'
     and created_at>=now()-interval '14 days'
   order by case status when 'NEW' then 0 else 1 end,
            case impact_level when 'CRITICAL' then 0 when 'IMPACTED' then 1 else 2 end,
            created_at desc,id desc
  `,[ids]);
  return q.rows.map((row:any)=>({
   id:Number(row.id),
   sourceBatchId:Number(row.source_batch_id||0),
   sourceBatchNo:clean(row.source_batch_no),
   sourceOperation:clean(row.source_standard_operation),
   jobNum:clean(row.job_num),
   nextOperation:clean(row.next_standard_operation),
   affectedBatchId:Number(row.affected_batch_id||0),
   affectedBatchNo:clean(row.affected_batch_no),
   affectedResourceCode:clean(row.affected_resource_code),
   affectedPlannedStart:iso(row.affected_planned_start),
   changedJobQty:num(row.changed_job_qty),
   changedJobSurface:num(row.changed_job_surface),
   impactLevel:(clean(row.impact_level)||"WARNING") as ProductionRemoveImpact["impactLevel"],
   status:(clean(row.status)||"NEW") as ProductionRemoveImpact["status"],
   createdAt:iso(row.created_at)||"",
   acknowledgedAt:iso(row.acknowledged_at),
   acknowledgedBy:clean(row.acknowledged_by),
   note:clean(row.note),
  }));
 }catch(e:any){
  if(e?.code==="42P01"||e?.code==="42703")return [];
  throw e;
 }
}

export type ProductionWorkItem={
 sourceType:ProductionExecutionSource;
 sourceKey:string;
 batchId:number;
 scheduleId:number|null;
 status:ProductionExecutionStatus;
 actualStart:string|null;
 actualEnd:string|null;
 remark:string;
 plannedStart:string|null;
 plannedEnd:string|null;
 targetTime:string|null;
 area:string;
 areaSort:number;
 resource:string;
 operation:string;
 linkedMainOperation:string;
 batchNo:string;
 recipeKey:string;
 recipeNo:string;
 recipeName:string;
 jobs:number;
 qty:number;
 surface:number;
 jobNumbers:string[];
 jobDetails:ProductionJobDetail[];
 supportOperations:string[];
 nextMainAttentions:ProductionNextMainAttention[];
 sequence:number;
 scheduleStatus:string;
 reportGroup:ProductionReportGroup;
 reportMode:ProductionReportMode;
};

type ExecutionRow={
 source_type:ProductionExecutionSource;
 source_key:string;
 execution_status:ProductionExecutionStatus;
 actual_start:string|null;
 actual_end:string|null;
 remark:string|null;
};

type JobExecutionRow=ExecutionRow&{
 planning_job_operation_id:number;
 job_num:string;
};

type BatchJobDetailRow={
 batch_id:number;
 planning_job_operation_id:number;
 job_num:string;
 part_description:string|null;
 current_good_wip_qty:number|null;
 total_surface:number|null;
 last_operation:string|null;
 next_operation:string|null;
 priority_type:string|null;
 is_added_job:boolean;
};

type RawJobDetail=Omit<ProductionJobDetail,"status"|"actualStart"|"actualEnd"|"remark">;

const clean=(v:unknown)=>String(v??"").trim();
const num=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
const iso=(v:unknown)=>{if(!v)return null;const d=v instanceof Date?v:new Date(String(v));return Number.isNaN(d.getTime())?null:d.toISOString();};
const keyForBatch=(batchId:number)=>`BATCH:${batchId}`;
const keyForSupport=(type:SupportType,batchId:number,main:string)=>`${type}:${batchId}:${clean(main).toUpperCase()}`;

function reportGroupFor(input:{sourceType:ProductionExecutionSource;area:string;resource:string;operation:string}):ProductionReportGroup{
 if(input.sourceType==="MASKING"||input.sourceType==="UNMASKING")return "MASK_UNMASK";
 const area=clean(input.area).toUpperCase();
 const resource=clean(input.resource).toUpperCase();
 const operation=clean(input.operation).toUpperCase();
 const hay=`${area}|${resource}|${operation}`;
 if(resource.startsWith("FB-")||area.includes("CHEMICAL LINE")||operation==="CHEMICAL_LINE")return "CHEMICAL_LINE";
 if(resource==="AUTOSHP"||resource==="MANUALSP"||area.includes("SHOT PEEN")||operation==="V_A-SHPN"||operation==="MANUALSP")return "SHOT_PEENING";
 if(resource.startsWith("CAB")||resource==="PAINT-POWDER"||area.includes("PAINT")||area.includes("POWDER COATING"))return "PAINTING";
 if(resource==="SPX-CLEAN"||area.includes("SIRIUS"))return "SIRIUS_CLEANING";
 if(resource==="MANUAL-DBL"||resource==="AUTO-DBL"||area.includes("BLAST")||hay.includes("DBL"))return "BLASTING";
 if(resource==="PLATING"||resource==="HE-BAKE"||area.includes("PLATING")||area.includes("HE-BAKE")||area.includes("HE BAKE"))return "PLATING";
 if(resource==="PASS-BRTG"||area.includes("PASSIVATION")||area.includes("BRIGHTEN"))return "PASS_BRTG";
 return "OTHER";
}

function reportModeFor(group:ProductionReportGroup):ProductionReportMode{
 return group==="CHEMICAL_LINE"||group==="PAINTING"?"LINE":"JOB";
}

function parentExecutionSummary(parent:ExecutionRow|undefined){
 return {
  status:(parent?.execution_status||"WAITING") as ProductionExecutionStatus,
  actualStart:iso(parent?.actual_start),
  actualEnd:iso(parent?.actual_end),
  remark:clean(parent?.remark),
 };
}

const makeRawJobDetail=(data:{planningJobOperationId:number;jobNum:string;partDescription:string;currentGoodWipQty:number|null;totalSurface:number|null;lastLaborOp:string;nextOperation:string;priority:string;isAddedJob?:boolean;supportOperations?:string[];}):RawJobDetail=>({
 planningJobOperationId:Number(data.planningJobOperationId)||0,
 jobNum:clean(data.jobNum),
 partDescription:clean(data.partDescription),
 currentGoodWipQty:data.currentGoodWipQty==null?null:Number(data.currentGoodWipQty),
 totalSurface:data.totalSurface==null?null:Number(data.totalSurface),
 lastLaborOp:clean(data.lastLaborOp),
 nextOperation:clean(data.nextOperation),
 priority:clean(data.priority),
 isAddedJob:Boolean(data.isAddedJob),
 supportOperations:[...new Set((data.supportOperations||[]).map(clean).filter(Boolean))],
});

async function loadExecutionRows(c:PoolClient,batchIds:number[]){
 if(!batchIds.length)return new Map<string,ExecutionRow>();
 try{
  const q=await c.query(`
   select source_type,source_key,execution_status,actual_start,actual_end,remark
   from public.production_execution
   where batch_id=any($1::bigint[])
  `,[batchIds]);
  return new Map<string,ExecutionRow>(q.rows.map((row:ExecutionRow)=>[`${row.source_type}|${row.source_key}`,row]));
 }catch(e:any){
  if(e?.code==="42P01")return new Map<string,ExecutionRow>();
  throw e;
 }
}

async function loadJobExecutionRows(c:PoolClient,batchIds:number[]){
 const empty={map:new Map<string,JobExecutionRow>(),sources:new Set<string>()};
 if(!batchIds.length)return empty;
 try{
  const q=await c.query(`
   select source_type,source_key,planning_job_operation_id,job_num,
          execution_status,actual_start,actual_end,remark
   from public.production_execution_job
   where batch_id=any($1::bigint[])
  `,[batchIds]);
  const rows=q.rows as JobExecutionRow[];
  return {
   map:new Map<string,JobExecutionRow>(rows.map(row=>[
    `${row.source_type}|${row.source_key}|${Number(row.planning_job_operation_id)}`,row
   ])),
   sources:new Set<string>(rows.map(row=>`${row.source_type}|${row.source_key}`)),
  };
 }catch(e:any){
  // V446 can render from the legacy parent execution row before migration 074 is applied.
  // Per-Job reporting writes require migration 074 on Aiven.
  if(e?.code==="42P01")return empty;
  throw e;
 }
}


async function loadNextMainAttentions(c:PoolClient,batchIds:number[]){
 const map=new Map<number,ProductionNextMainAttention[]>();
 if(!batchIds.length)return map;
 try{
  const q=await c.query(`
   select e.id,e.affected_batch_id,e.job_num,e.source_batch_id,e.source_batch_no,e.source_standard_operation,e.next_standard_operation,e.created_at,
          coalesce(ab.recipe_key,np.recipe_key,'') recipe_key,
          coalesce(abr.recipe_no,npr.recipe_no,'') recipe_no,
          coalesce(abr.recipe_name,npr.recipe_name,'') recipe_name
   from planning_handover_change_event e
   left join planning_batch ab on ab.id=e.affected_batch_id
   left join md_process_recipe abr on abr.recipe_key=ab.recipe_key
   left join lateral(
    select p.recipe_key
    from planning_job_operation p
    where p.job_num=e.job_num and p.is_active=true
      and upper(trim(p.standard_operation))=upper(trim(e.next_standard_operation))
    order by p.planning_seq
    limit 1
   ) np on true
   left join md_process_recipe npr on npr.recipe_key=np.recipe_key
   where e.affected_batch_id=any($1::bigint[])
     and e.change_type='ADD_JOB' and e.status='NEW'
     and e.note like 'PRODUCTION_ADD:%'
     and not exists(
      select 1 from planning_batch_job bj
      where bj.batch_id=e.affected_batch_id and bj.job_num=e.job_num
     )
   order by e.affected_batch_id,e.created_at,e.id
  `,[batchIds]);
  for(const row of q.rows as any[]){
   const batchId=Number(row.affected_batch_id);
   const list=map.get(batchId)||[];
   list.push({eventId:Number(row.id),jobNum:clean(row.job_num),sourceBatchId:Number(row.source_batch_id),sourceBatchNo:clean(row.source_batch_no),sourceOperation:clean(row.source_standard_operation),nextOperation:clean(row.next_standard_operation),recipeKey:clean(row.recipe_key),recipeNo:clean(row.recipe_no),recipeName:clean(row.recipe_name),createdAt:iso(row.created_at)||new Date().toISOString()});
   map.set(batchId,list);
  }
  return map;
 }catch(e:any){
  if(e?.code==="42P01")return map;
  throw e;
 }
}

async function loadBatchJobNumbers(c:PoolClient,batchIds:number[]){
 const map=new Map<number,string[]>();
 if(!batchIds.length)return map;
 const q=await c.query(`
  select batch_id,job_num
  from public.planning_batch_job
  where batch_id=any($1::bigint[])
  order by batch_id,created_at,job_num
 `,[batchIds]);
 for(const row of q.rows as {batch_id:number;job_num:string}[]){
  const batchId=Number(row.batch_id);
  const list=map.get(batchId)||[];
  const job=clean(row.job_num);
  if(job&&!list.includes(job))list.push(job);
  map.set(batchId,list);
 }
 return map;
}

// V488: Production-added membership is a durable Batch + Job fact.
// Do not key the display flag only by planning_job_operation_id because a
// future-ST materialization/reconciliation can replace the occurrence id while
// the Job remains the same member of the same Batch. Matching approved ADD_JOB
// audit rows by Batch + Job keeps every Production-added Job visible together.
async function loadBatchJobDetails(c:PoolClient,batchIds:number[]){
 if(!batchIds.length)return new Map<number,RawJobDetail[]>();
 const q=await c.query(`
  select
   bj.batch_id,
   bj.planning_job_operation_id,
   bj.job_num,
   oj.part_description,
   oj.current_good_wip_qty,
   coalesce(bj.surface_dm2,oj.total_surface) total_surface,
   oj.last_operation,
   oj.next_operation,
   oj.priority_type,
   exists(
    select 1 from public.production_adjustment_item pai
    where pai.batch_id=bj.batch_id
      and pai.item_type='ADD_JOB'
      and pai.status='APPROVED'
      and (
       upper(trim(coalesce(pai.job_num,'')))=upper(trim(bj.job_num))
       or (coalesce(trim(pai.job_num),'')='' and pai.planning_job_operation_id=bj.planning_job_operation_id)
      )
   ) is_added_job
  from public.planning_batch_job bj
  join public.planning_batch b on b.id=bj.batch_id and b.status<>'CANCELLED'
  left join public.open_job_current oj on oj.job_num=bj.job_num and oj.is_open=true
  where bj.batch_id=any($1::bigint[])
  order by bj.batch_id,bj.created_at,bj.job_num
 `,[batchIds]);
 const map=new Map<number,RawJobDetail[]>();
 for(const row of q.rows as BatchJobDetailRow[]){
  const batchId=Number(row.batch_id);
  const list=map.get(batchId)||[];
  list.push(makeRawJobDetail({
   planningJobOperationId:Number(row.planning_job_operation_id),
   jobNum:clean(row.job_num),
   partDescription:clean(row.part_description),
   currentGoodWipQty:row.current_good_wip_qty==null?null:Number(row.current_good_wip_qty),
   totalSurface:row.total_surface==null?null:Number(row.total_surface),
   lastLaborOp:clean(row.last_operation),
   nextOperation:clean(row.next_operation),
   priority:clean(row.priority_type),
   isAddedJob:Boolean(row.is_added_job),
  }));
  map.set(batchId,list);
 }
 return map;
}

function jobExecution(
 detail:RawJobDetail,
 sourceType:ProductionExecutionSource,
 sourceKey:string,
 parent:ExecutionRow|undefined,
 map:Map<string,JobExecutionRow>,
 sources:Set<string>
):ProductionJobDetail{
 const row=map.get(`${sourceType}|${sourceKey}|${detail.planningJobOperationId}`);
 const legacyParent=sources.has(`${sourceType}|${sourceKey}`)?undefined:parent;
 return {
  ...detail,
  status:row?.execution_status||legacyParent?.execution_status||"WAITING",
  actualStart:iso(row?.actual_start)||iso(legacyParent?.actual_start),
  actualEnd:iso(row?.actual_end)||iso(legacyParent?.actual_end),
  remark:clean(row?.remark)||clean(legacyParent?.remark),
 };
}

function workExecutionSummary(
 sourceType:ProductionExecutionSource,
 sourceKey:string,
 rows:ProductionJobDetail[],
 parentMap:Map<string,ExecutionRow>
){
 const parent=parentMap.get(`${sourceType}|${sourceKey}`);
 if(!rows.length)return {
  status:parent?.execution_status||"WAITING" as ProductionExecutionStatus,
  actualStart:iso(parent?.actual_start),actualEnd:iso(parent?.actual_end),remark:clean(parent?.remark)
 };
 const done=rows.filter(x=>x.status==="DONE").length;
 const active=rows.filter(x=>x.status==="ON-GOING").length;
 const status:ProductionExecutionStatus=done===rows.length?"DONE":active>0||done>0?"ON-GOING":"WAITING";
 const starts=rows.map(x=>x.actualStart).filter((x):x is string=>Boolean(x)).map(x=>new Date(x).getTime()).filter(Number.isFinite);
 const ends=rows.map(x=>x.actualEnd).filter((x):x is string=>Boolean(x)).map(x=>new Date(x).getTime()).filter(Number.isFinite);
 return {
  status,
  actualStart:starts.length?new Date(Math.min(...starts)).toISOString():status==="WAITING"?null:iso(parent?.actual_start),
  actualEnd:status==="DONE"&&ends.length?new Date(Math.max(...ends)).toISOString():status==="DONE"?iso(parent?.actual_end):null,
  remark:clean(parent?.remark),
 };
}

function aggregateSupportRows(type:SupportType,rows:SupportPlanJob[]){
 const groups=new Map<string,SupportPlanJob[]>();
 for(const row of rows){
  const key=`${row.batchId}|${row.standardOperation.toUpperCase()}`;
  const list=groups.get(key)||[];
  list.push(row);groups.set(key,list);
 }
 return [...groups.values()].map(list=>{
  const first=list[0];
  const supportOps=[...new Set(list.flatMap(x=>x.supportOperations.map(op=>op.detailCode||op.operationCode)).filter(Boolean))];
  const jobs=[...new Set(list.map(x=>x.jobNum).filter(Boolean))];
  const qty=list.reduce((sum,x)=>sum+num(x.qty),0);
  const surface=list.reduce((sum,x)=>sum+num(x.surface),0);
  const jobDetails=[...new Map(list.map(x=>[
   `${x.planningJobOperationId}|${x.jobNum}`,
   makeRawJobDetail({
    planningJobOperationId:x.planningJobOperationId,
    jobNum:x.jobNum,
    partDescription:x.partDescription,
    currentGoodWipQty:x.currentGoodWipQty,
    totalSurface:x.surface,
    lastLaborOp:x.lastOperation,
    nextOperation:x.nextOperation,
    priority:x.priority,
    supportOperations:x.supportOperations.map(op=>op.detailCode||op.operationCode).filter(Boolean),
   })
  ])).values()];
  return {first,list,supportOps,jobs,qty,surface,jobDetails};
 });
}

export async function loadProductionExecution(
 c:PoolClient,
 input:{scheduleDate:string}
):Promise<ProductionWorkItem[]>{
 const date=clean(input.scheduleDate);
 const batchQ=await c.query(`
  select
   s.id schedule_id,
   s.batch_id,
   s.status schedule_status,
   s.planned_start,
   s.planned_end,
   s.resource_code,
   coalesce(sr.area_name,sa.schedule_area_name,'') area_name,
   b.batch_no,
   b.standard_operation,
   b.recipe_key,
   b.total_jobs,
   b.total_qty,
   b.total_surface_dm2,
   pr.recipe_no,
   pr.recipe_name,
   coalesce(om.planning_sort_order,999999) planning_order
  from public.planning_schedule s
  join public.planning_batch b on b.id=s.batch_id and b.status<>'CANCELLED'
  left join public.md_process_recipe pr on pr.recipe_key=b.recipe_key and pr.is_active=true
  left join public.md_operation_master om
    on upper(trim(om.standard_operation))=upper(trim(b.standard_operation)) and om.is_active=true
  left join public.md_schedule_resource sr on sr.resource_code=s.resource_code
  left join lateral (
   select a.schedule_area_name
   from public.md_schedule_area_operation sao
   join public.md_schedule_area a
     on a.schedule_area_code=sao.schedule_area_code and a.is_active=true
   where sao.is_active=true
     and upper(trim(sao.standard_operation))=upper(trim(b.standard_operation))
   order by
    case when a.resource_code=s.resource_code then 0
         when a.resource_group=sr.resource_group then 1
         else 2 end,
    a.display_order,a.schedule_area_code
   limit 1
  ) sa on true
  where s.status<>'CANCELLED'
    -- V449: production-date ownership is defined ONLY by local planned START shifted back 6 hours.
    -- Example: 04/09 05:50 local => production date 03/09.
    and (((s.planned_start at time zone 'Asia/Ho_Chi_Minh') - interval '6 hours')::date)=$1::date
  order by s.planned_start,coalesce(om.planning_sort_order,999999),b.batch_no
 `,[date]);

 const supportPlan=await loadMaskingUnmaskingPlan(c,{view:"scheduled",scheduleDate:date});
 // V455: Masking/Unmasking report panels are owned by the PHYSICAL AREA of
 // the linked Main Planning operation, not by the Main name itself. Support
 // execution identity remains Batch + Main + support type; this lookup only
 // changes report presentation/grouping.
 const mainAreaQ=await c.query(`
  select
   upper(trim(om.standard_operation)) standard_operation_key,
   coalesce(a.area_name,'Unmapped') area_name,
   coalesce(a.sort_order,999999) area_sort
  from public.md_operation_master om
  left join public.md_area_operation_group ag
    on ag.st_group=om.st_group and ag.is_active=true
  left join public.md_area a
    on a.id=ag.area_id and a.is_active=true
  where om.is_active=true
  order by coalesce(a.sort_order,999999),upper(trim(om.standard_operation))
 `);
 const mainAreaByOperation=new Map<string,{areaName:string;areaSort:number}>();
 for(const row of mainAreaQ.rows as any[]){
  const key=clean(row.standard_operation_key).toUpperCase();
  if(key&&!mainAreaByOperation.has(key)){
   mainAreaByOperation.set(key,{areaName:clean(row.area_name)||"Unmapped",areaSort:num(row.area_sort)||999999});
  }
 }
 const supportAggregates:[SupportType,ReturnType<typeof aggregateSupportRows>][]=[
  ["MASKING",aggregateSupportRows("MASKING",supportPlan.flatMap(g=>g.masking))],
  ["UNMASKING",aggregateSupportRows("UNMASKING",supportPlan.flatMap(g=>g.unmasking))],
 ];
 const batchRows=(batchQ.rows as any[]).map(row=>{
  const group=reportGroupFor({sourceType:"BATCH",area:clean(row.area_name),resource:clean(row.resource_code),operation:clean(row.standard_operation)});
  return {row,group,mode:reportModeFor(group)};
 });
 const batchIds=[...new Set<number>([
  ...batchRows.map(x=>Number(x.row.batch_id)),
  ...supportAggregates.flatMap(([,groups])=>groups.map(g=>Number(g.first.batchId)))
 ].filter(Number.isFinite))];
 // V469: load Batch Job details for EVERY scheduled Batch, including LINE-report
 // areas (Painting/Chemical Line). Production-added Jobs are rendered from
 // jobDetails. Previously LINE batches were excluded here, so the added Job
 // appeared only in local client state and disappeared after any server reload.
 const detailBatchIds=[...new Set<number>([
  ...batchRows.map(x=>Number(x.row.batch_id)),
  ...supportAggregates.flatMap(([,groups])=>groups.map(g=>Number(g.first.batchId)))
 ].filter(Number.isFinite))];
 const lineBatchIds=batchRows.filter(x=>x.mode==="LINE").map(x=>Number(x.row.batch_id)).filter(Number.isFinite);
 const [execution,jobExecutionState,batchJobDetails,lineJobNumbers,nextMainAttentionByBatch]=await Promise.all([
  loadExecutionRows(c,batchIds),
  loadJobExecutionRows(c,detailBatchIds),
  loadBatchJobDetails(c,detailBatchIds),
  loadBatchJobNumbers(c,lineBatchIds),
  loadNextMainAttentions(c,batchIds),
 ]);

 const work:ProductionWorkItem[]=[];
 for(const batchRow of batchRows){
  const row=batchRow.row;
  const batchId=Number(row.batch_id);
  const sourceType:ProductionExecutionSource="BATCH";
  const sourceKey=keyForBatch(batchId);
  const parent=execution.get(`${sourceType}|${sourceKey}`);
  // V469: keep Job membership details even for LINE-report batches so
  // Production-added Jobs survive navigation/reload and remain visible under
  // the Batch row. Reporting granularity is still LINE for Painting/Chemical
  // Line; this does NOT enable per-Job status reporting there.
  const details=(batchJobDetails.get(batchId)||[]).map(d=>jobExecution(d,sourceType,sourceKey,parent,jobExecutionState.map,jobExecutionState.sources));
  const summary=batchRow.mode==="LINE"?parentExecutionSummary(parent):workExecutionSummary(sourceType,sourceKey,details,execution);
  work.push({
   sourceType,sourceKey,batchId,
   scheduleId:Number(row.schedule_id)||null,
   ...summary,
   plannedStart:iso(row.planned_start),
   plannedEnd:iso(row.planned_end),
   targetTime:iso(row.planned_start),
   area:clean(row.area_name)||"—",
   areaSort:mainAreaByOperation.get(clean(row.standard_operation).toUpperCase())?.areaSort||999999,
   resource:clean(row.resource_code),
   operation:clean(row.standard_operation),
   linkedMainOperation:clean(row.standard_operation),
   batchNo:clean(row.batch_no),
   recipeKey:clean(row.recipe_key),
   recipeNo:clean(row.recipe_no),
   recipeName:clean(row.recipe_name),
   jobs:num(row.total_jobs),qty:num(row.total_qty),surface:num(row.total_surface_dm2),
   jobNumbers:batchRow.mode==="LINE"?(lineJobNumbers.get(batchId)||[]):details.map(x=>x.jobNum).filter(Boolean),jobDetails:details,supportOperations:[],
   nextMainAttentions:nextMainAttentionByBatch.get(batchId)||[],
   sequence:num(row.planning_order),scheduleStatus:clean(row.schedule_status),
   reportGroup:batchRow.group,reportMode:batchRow.mode,
  });
 }

 for(const [type,groups] of supportAggregates){
  for(const group of groups){
   const first=group.first;
   const batchId=Number(first.batchId);
   const sourceType:ProductionExecutionSource=type;
   const sourceKey=keyForSupport(type,batchId,first.standardOperation);
   const parent=execution.get(`${sourceType}|${sourceKey}`);
   const details=group.jobDetails.map(d=>jobExecution(d,sourceType,sourceKey,parent,jobExecutionState.map,jobExecutionState.sources));
   const summary=workExecutionSummary(sourceType,sourceKey,details,execution);
   const anchor=iso(type==="MASKING"?first.plannedStart:first.plannedEnd);
   const linkedMainPlannedStart=iso(first.plannedStart);
   const linkedMainPlannedEnd=iso(first.plannedEnd);
   const linkedArea=mainAreaByOperation.get(clean(first.standardOperation).toUpperCase());
   work.push({
    sourceType,sourceKey,batchId,scheduleId:first.scheduleId,...summary,
    // V458: keep the support anchor for ordering, but expose the linked Main's
    // full scheduled window so Production Report Target renders exactly like
    // normal Production rows (Start -> End).
    plannedStart:linkedMainPlannedStart,plannedEnd:linkedMainPlannedEnd,targetTime:anchor,
    // V455: physical area belongs to the linked Main Planning operation.
    // The support type is still preserved by sourceType and supportOperations.
    area:linkedArea?.areaName||"Unmapped",
    areaSort:linkedArea?.areaSort||999999,
    resource:clean(first.resourceCode),
    operation:group.supportOps.join(" / ")||(type==="MASKING"?"MASKING":"UNMASKING"),
    linkedMainOperation:clean(first.standardOperation),
    batchNo:clean(first.batchNo),recipeKey:clean(first.recipeKey),recipeNo:clean(first.recipeNo),recipeName:clean(first.recipeName),
    jobs:group.jobs.length,qty:group.qty,surface:group.surface,
    jobNumbers:group.jobs,jobDetails:details,supportOperations:group.supportOps,
    nextMainAttentions:[],
    sequence:(first.planningOrder??999999)+(type==="MASKING"?-0.2:0.2),scheduleStatus:clean(first.scheduleStatus),
    reportGroup:"MASK_UNMASK",reportMode:"JOB",
   });
  }
 }

 const typeOrder:Record<ProductionExecutionSource,number>={MASKING:0,BATCH:1,UNMASKING:2};
 return work.sort((a,b)=>{
  const at=a.targetTime?new Date(a.targetTime).getTime():Number.MAX_SAFE_INTEGER;
  const bt=b.targetTime?new Date(b.targetTime).getTime():Number.MAX_SAFE_INTEGER;
  return at-bt || a.sequence-b.sequence || typeOrder[a.sourceType]-typeOrder[b.sourceType] || a.batchNo.localeCompare(b.batchNo);
 });
}
