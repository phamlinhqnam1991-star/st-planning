import type {PoolClient} from "pg";
import {loadMaskingUnmaskingPlan,type SupportPlanJob,type SupportType} from "@/lib/masking-unmasking-plan";

export type ProductionExecutionStatus="WAITING"|"ON-GOING"|"DONE";
export type ProductionExecutionSource="BATCH"|"MASKING"|"UNMASKING";

export type ProductionJobDetail={
 jobNum:string;
 partDescription:string;
 currentGoodWipQty:number|null;
 totalSurface:number|null;
 lastLaborOp:string;
 nextOperation:string;
 priority:string;
};

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
 sequence:number;
 scheduleStatus:string;
};

type ExecutionRow={
 source_type:ProductionExecutionSource;
 source_key:string;
 execution_status:ProductionExecutionStatus;
 actual_start:string|null;
 actual_end:string|null;
 remark:string|null;
};

type BatchJobDetailRow={
 batch_id:number;
 job_num:string;
 part_description:string|null;
 current_good_wip_qty:number|null;
 total_surface:number|null;
 last_operation:string|null;
 next_operation:string|null;
 priority_type:string|null;
};

const clean=(v:unknown)=>String(v??"").trim();
const num=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
const iso=(v:unknown)=>{if(!v)return null;const d=v instanceof Date?v:new Date(String(v));return Number.isNaN(d.getTime())?null:d.toISOString();};
const keyForBatch=(batchId:number)=>`BATCH:${batchId}`;
const keyForSupport=(type:SupportType,batchId:number,main:string)=>`${type}:${batchId}:${clean(main).toUpperCase()}`;
const makeJobDetail=(data:{jobNum:string;partDescription:string;currentGoodWipQty:number|null;totalSurface:number|null;lastLaborOp:string;nextOperation:string;priority:string;}):ProductionJobDetail=>({
 jobNum:clean(data.jobNum),
 partDescription:clean(data.partDescription),
 currentGoodWipQty:data.currentGoodWipQty==null?null:Number(data.currentGoodWipQty),
 totalSurface:data.totalSurface==null?null:Number(data.totalSurface),
 lastLaborOp:clean(data.lastLaborOp),
 nextOperation:clean(data.nextOperation),
 priority:clean(data.priority),
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
  // Allow the new page to render in WAITING mode before migration 068 is applied.
  // Reporting writes will still require the migration, but existing Planning/Schedule stays unaffected.
  if(e?.code==="42P01")return new Map<string,ExecutionRow>();
  throw e;
 }
}

async function loadBatchJobDetails(c:PoolClient,batchIds:number[]){
 if(!batchIds.length)return new Map<number,ProductionJobDetail[]>();
 const q=await c.query(`
  select
   bj.batch_id,
   bj.job_num,
   oj.part_description,
   oj.current_good_wip_qty,
   coalesce(bj.surface_dm2,oj.total_surface) total_surface,
   oj.last_operation,
   oj.next_operation,
   oj.priority_type
  from public.planning_batch_job bj
  join public.planning_batch b on b.id=bj.batch_id and b.status<>'CANCELLED'
  left join public.open_job_current oj on oj.job_num=bj.job_num and oj.is_open=true
  where bj.batch_id=any($1::bigint[])
  order by bj.batch_id,bj.created_at,bj.job_num
 `,[batchIds]);
 const map=new Map<number,ProductionJobDetail[]>();
 for(const row of q.rows as BatchJobDetailRow[]){
  const batchId=Number(row.batch_id);
  const list=map.get(batchId)||[];
  list.push(makeJobDetail({
   jobNum:clean(row.job_num),
   partDescription:clean(row.part_description),
   currentGoodWipQty:row.current_good_wip_qty==null?null:Number(row.current_good_wip_qty),
   totalSurface:row.total_surface==null?null:Number(row.total_surface),
   lastLaborOp:clean(row.last_operation),
   nextOperation:clean(row.next_operation),
   priority:clean(row.priority_type),
  }));
  map.set(batchId,list);
 }
 return map;
}

function applyExecution(
 base:Omit<ProductionWorkItem,"status"|"actualStart"|"actualEnd"|"remark">,
 map:Map<string,ExecutionRow>
):ProductionWorkItem{
 const row=map.get(`${base.sourceType}|${base.sourceKey}`);
 return {
  ...base,
  status:row?.execution_status||"WAITING",
  actualStart:iso(row?.actual_start),
  actualEnd:iso(row?.actual_end),
  remark:clean(row?.remark),
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
   makeJobDetail({
    jobNum:x.jobNum,
    partDescription:x.partDescription,
    currentGoodWipQty:x.currentGoodWipQty,
    totalSurface:x.surface,
    lastLaborOp:x.lastOperation,
    nextOperation:x.nextOperation,
    priority:x.priority,
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
   coalesce(om.planning_sort_order,999999) planning_order,
   coalesce(jobinfo.job_numbers,'{}'::text[]) job_numbers
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
  left join lateral (
   select array_agg(distinct bj.job_num order by bj.job_num) job_numbers
   from public.planning_batch_job bj
   where bj.batch_id=b.id
  ) jobinfo on true
  where s.status<>'CANCELLED'
    and s.schedule_date=$1::date
  order by s.planned_start,coalesce(om.planning_sort_order,999999),b.batch_no
 `,[date]);

 const supportPlan=await loadMaskingUnmaskingPlan(c,{view:"scheduled",scheduleDate:date});
 const supportAggregates:[SupportType,ReturnType<typeof aggregateSupportRows>][]=[
  ["MASKING",aggregateSupportRows("MASKING",supportPlan.flatMap(g=>g.masking))],
  ["UNMASKING",aggregateSupportRows("UNMASKING",supportPlan.flatMap(g=>g.unmasking))],
 ];
 const batchIds=[...new Set<number>([
  ...batchQ.rows.map((x:any)=>Number(x.batch_id)),
  ...supportAggregates.flatMap(([,groups])=>groups.map(g=>Number(g.first.batchId)))
 ].filter(Number.isFinite))];
 const [execution,batchJobDetails]=await Promise.all([
  loadExecutionRows(c,batchIds),
  loadBatchJobDetails(c,batchIds),
 ]);

 const work:ProductionWorkItem[]=[];
 for(const row of batchQ.rows){
  const batchId=Number(row.batch_id);
  const sourceKey=keyForBatch(batchId);
  work.push(applyExecution({
   sourceType:"BATCH",
   sourceKey,
   batchId,
   scheduleId:Number(row.schedule_id)||null,
   plannedStart:iso(row.planned_start),
   plannedEnd:iso(row.planned_end),
   targetTime:iso(row.planned_start),
   area:clean(row.area_name)||"—",
   resource:clean(row.resource_code),
   operation:clean(row.standard_operation),
   linkedMainOperation:clean(row.standard_operation),
   batchNo:clean(row.batch_no),
   recipeKey:clean(row.recipe_key),
   recipeNo:clean(row.recipe_no),
   recipeName:clean(row.recipe_name),
   jobs:num(row.total_jobs),
   qty:num(row.total_qty),
   surface:num(row.total_surface_dm2),
   jobNumbers:Array.isArray(row.job_numbers)?row.job_numbers.map(clean).filter(Boolean):[],
   jobDetails:batchJobDetails.get(batchId)||[],
   supportOperations:[],
   sequence:num(row.planning_order),
   scheduleStatus:clean(row.schedule_status),
  },execution));
 }

 for(const [type,groups] of supportAggregates){
  for(const group of groups){
   const first=group.first;
   const batchId=Number(first.batchId);
   const sourceKey=keyForSupport(type,batchId,first.standardOperation);
   const anchor=iso(type==="MASKING"?first.plannedStart:first.plannedEnd);
   work.push(applyExecution({
    sourceType:type,
    sourceKey,
    batchId,
    scheduleId:first.scheduleId,
    plannedStart:anchor,
    plannedEnd:null,
    targetTime:anchor,
    area:type==="MASKING"?"Masking":"Unmasking",
    resource:clean(first.resourceCode),
    operation:group.supportOps.join(" / ")||(type==="MASKING"?"MASKING":"UNMASKING"),
    linkedMainOperation:clean(first.standardOperation),
    batchNo:clean(first.batchNo),
    recipeKey:clean(first.recipeKey),
    recipeNo:clean(first.recipeNo),
    recipeName:clean(first.recipeName),
    jobs:group.jobs.length,
    qty:group.qty,
    surface:group.surface,
    jobNumbers:group.jobs,
    jobDetails:group.jobDetails,
    supportOperations:group.supportOps,
    sequence:(first.planningOrder??999999)+(type==="MASKING"?-0.2:0.2),
    scheduleStatus:clean(first.scheduleStatus),
   },execution));
  }
 }

 const typeOrder:Record<ProductionExecutionSource,number>={MASKING:0,BATCH:1,UNMASKING:2};
 return work.sort((a,b)=>{
  const at=a.targetTime?new Date(a.targetTime).getTime():Number.MAX_SAFE_INTEGER;
  const bt=b.targetTime?new Date(b.targetTime).getTime():Number.MAX_SAFE_INTEGER;
  return at-bt || a.sequence-b.sequence || typeOrder[a.sourceType]-typeOrder[b.sourceType] || a.batchNo.localeCompare(b.batchNo);
 });
}
