import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";
import {canProductionBatch,canPlanningMain} from "@/lib/security/scope-db";
import {getProductionDateString} from "@/lib/schedule-time";
import {buildScheduleCascadePreview,ensureAdjustmentSet,loadAdjustmentData,scanProductionAdjustments} from "@/lib/daily-production-adjustment";
import {refreshBatchTotals,recomputeJobPlanningStatus,recipeAllowedForJob} from "@/lib/planning/batch-utils";
import {autoAdjustChemicalSchedule} from "@/lib/chemical-line-schedule-server";
import {loadBatchNumberConfig} from "@/lib/planning/batch-number";
import {syncPlanningChains} from "@/lib/planning/sync-planning-chains";
import {loadMaskingUnmaskingPlan,type SupportType} from "@/lib/masking-unmasking-plan";
import {notifyInternalChange} from "@/lib/internal-chat/server";

const clean=(v:unknown)=>String(v??"").trim();
const validDate=(v:unknown)=>/^\d{4}-\d{2}-\d{2}$/.test(clean(v));

async function plannerForOperation(c:any,operation:unknown):Promise<"1"|"2"|null>{
 const op=clean(operation);
 if(!op)return null;
 const q=await c.query(`
  select coalesce(w.planner_owner,a.planner_owner) planner_owner
  from md_schedule_area_operation m
  join md_schedule_area a on a.schedule_area_code=m.schedule_area_code and a.is_active=true
  left join md_planner_work_assignment w on w.schedule_area_code=a.schedule_area_code and w.is_active=true
  where m.is_active=true and upper(trim(m.standard_operation))=upper(trim($1))
  order by a.display_order,a.schedule_area_code
  limit 1
 `,[op]);
 const owner=clean(q.rows[0]?.planner_owner);
 return owner==="1"||owner==="2"?owner:null;
}

async function createProductionNextMainAttentions(c:any,args:{
 sourceBatchId:number;sourceBatchNo:string;sourceOperation:string;jobNum:string;planningSeq:number;
 qtyBefore:number;qtyAfter:number;surfaceBefore:number;surfaceAfter:number;jobQty:number;jobSurface:number;
}){
 const nextQ=await c.query(`
  select p.id,p.standard_operation,p.planning_seq,p.recipe_key,pr.recipe_no,pr.recipe_name
  from planning_job_operation p
  left join md_process_recipe pr on pr.recipe_key=p.recipe_key
  where p.job_num=$1 and p.is_active=true and p.planning_seq>$2
  order by p.planning_seq
 `,[args.jobNum,args.planningSeq]);
 if(!nextQ.rowCount)return [];

 const sourcePlanner=await plannerForOperation(c,args.sourceOperation);
 const results:any[]=[];
 for(const next of nextQ.rows){
  // For every downstream Main, infer the Batch that already contains the most
  // Jobs from the source Batch. This keeps the Production exception attached
  // to the actual downstream flow without hard-coding operation names.
  const targetQ=await c.query(`
   with source_jobs as (
    select distinct job_num
    from planning_batch_job
    where batch_id=$1 and job_num<>$2
   )
   select b.id affected_batch_id,b.batch_no affected_batch_no,b.recipe_key affected_recipe_key,
          br.recipe_no affected_recipe_no,br.recipe_name affected_recipe_name,
          s.id affected_schedule_id,s.resource_code affected_resource_code,s.planned_start affected_planned_start,
          count(distinct bj.job_num)::int overlap_jobs
   from planning_batch b
   join planning_batch_job bj on bj.batch_id=b.id
   join source_jobs sj on sj.job_num=bj.job_num
   left join md_process_recipe br on br.recipe_key=b.recipe_key
   left join lateral(
    select ps.id,ps.resource_code,ps.planned_start
    from planning_schedule ps
    where ps.batch_id=b.id and ps.status<>'CANCELLED'
    order by ps.planned_start desc,ps.id desc limit 1
   ) s on true
   where b.status<>'CANCELLED'
     and upper(trim(b.standard_operation))=upper(trim($3))
   group by b.id,b.batch_no,b.recipe_key,br.recipe_no,br.recipe_name,s.id,s.resource_code,s.planned_start,b.created_at
   order by count(distinct bj.job_num) desc,case when s.id is not null then 0 else 1 end,b.created_at desc,b.id desc
   limit 1
  `,[args.sourceBatchId,args.jobNum,next.standard_operation]);
  const target=targetQ.rows[0]||{};
  const affectedPlanner=await plannerForOperation(c,next.standard_operation);
  const plannedStart=target.affected_planned_start?new Date(target.affected_planned_start):null;
  const impactLevel=!target.affected_batch_id?"WARNING":plannedStart&&plannedStart.getTime()<=Date.now()+60*60000?"CRITICAL":target.affected_schedule_id?"IMPACTED":"WARNING";
  const recipeKey=clean(target.affected_recipe_key||next.recipe_key);
  const recipeNo=clean(target.affected_recipe_no||next.recipe_no);
  const recipeName=clean(target.affected_recipe_name||next.recipe_name);

  // If the Job is already in the inferred downstream Batch, no action is needed
  // for that Main, but return it so the caller can explain the complete route.
  if(target.affected_batch_id){
   const existsQ=await c.query(`select 1 from planning_batch_job where batch_id=$1 and job_num=$2 limit 1`,[target.affected_batch_id,args.jobNum]);
   if(existsQ.rowCount){
    results.push({alreadyInNextBatch:true,targetBatchId:Number(target.affected_batch_id),targetBatchNo:target.affected_batch_no||null,nextOperation:next.standard_operation,recipeKey,recipeNo,recipeName});
    continue;
   }
  }

  // Do not create duplicate NEW alerts when the same Production-added Job is
  // reconciled again or when a downstream attention is accepted later.
  const existingQ=await c.query(`
   select id
   from planning_handover_change_event
   where job_num=$1 and change_type='ADD_JOB' and status='NEW'
     and upper(trim(coalesce(next_standard_operation,'')))=upper(trim($2))
     and affected_batch_id is not distinct from $3::bigint
     and note like 'PRODUCTION_ADD:%'
   order by id desc limit 1
  `,[args.jobNum,next.standard_operation,target.affected_batch_id||null]);
  if(existingQ.rowCount){
   results.push({eventId:Number(existingQ.rows[0].id),targetBatchId:target.affected_batch_id?Number(target.affected_batch_id):null,targetBatchNo:target.affected_batch_no||null,nextOperation:next.standard_operation,recipeKey,recipeNo,recipeName});
   continue;
  }

  const recipeText=[recipeNo,recipeName].filter(Boolean).join(' · ');
  const ins=await c.query(`
   insert into planning_handover_change_event(
    source_batch_id,source_batch_no,source_standard_operation,source_planner,job_num,change_type,
    next_standard_operation,affected_planner,affected_batch_id,affected_batch_no,affected_schedule_id,affected_resource_code,affected_planned_start,
    source_batch_qty_before,source_batch_qty_after,source_batch_surface_before,source_batch_surface_after,changed_job_qty,changed_job_surface,
    impact_level,status,note
   ) values($1,$2,$3,$4,$5,'ADD_JOB',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'NEW',$20)
   returning id
  `,[args.sourceBatchId,args.sourceBatchNo,args.sourceOperation,sourcePlanner,args.jobNum,next.standard_operation,affectedPlanner,
      target.affected_batch_id||null,target.affected_batch_no||null,target.affected_schedule_id||null,target.affected_resource_code||null,target.affected_planned_start||null,
      args.qtyBefore,args.qtyAfter,args.surfaceBefore,args.surfaceAfter,args.jobQty,args.jobSurface,impactLevel,
      `PRODUCTION_ADD: ${args.jobNum} · ${args.sourceOperation} → ${next.standard_operation}${recipeText?` · Recipe ${recipeText}`:""}${target.affected_batch_no?` · attention ${target.affected_batch_no}`:" · downstream Batch chưa tạo"}`]);
  results.push({eventId:Number(ins.rows[0]?.id||0),targetBatchId:target.affected_batch_id?Number(target.affected_batch_id):null,targetBatchNo:target.affected_batch_no||null,nextOperation:next.standard_operation,recipeKey,recipeNo,recipeName});
 }
 return results;
}

async function findJobForBatch(c:any,batchId:number,jobNum:string){
 const q=await c.query(`
  select b.id batch_id,b.batch_no,b.standard_operation batch_standard_operation,b.recipe_key batch_recipe_key,b.process_minutes,b.total_qty,b.total_surface_dm2,
         p.id planning_job_operation_id,p.job_num,p.source_operation_code,p.standard_operation job_standard_operation,p.recipe_key job_recipe_key,p.status planning_status,
         p.planning_seq,p.source_seq,p.operation_instance_key,
         j.part_num,j.revision_num,j.part_description,j.program,j.priority_type,j.next_operation,j.last_operation,
         coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0) plan_qty,
         coalesce(j.total_surface,coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)*coalesce(j.surface_per_part_dm2,0),0) plan_surface,
         exists(select 1 from planning_batch_job x where x.batch_id=b.id and x.planning_job_operation_id=p.id) in_this_batch,
         (select b2.batch_no from planning_batch_job x2 join planning_batch b2 on b2.id=x2.batch_id and b2.status<>'CANCELLED'
          where x2.planning_job_operation_id=p.id and x2.batch_id<>b.id order by b2.created_at desc limit 1) other_batch_no,
         pr.recipe_no,pr.recipe_name
  from planning_batch b
  join open_job_current j on upper(trim(j.job_num))=upper(trim($2)) and j.is_open=true
  left join lateral(
    select p0.* from planning_job_operation p0
    where p0.job_num=j.job_num and p0.is_active=true and upper(trim(p0.standard_operation))=upper(trim(b.standard_operation))
    order by case p0.status when 'ELIGIBLE' then 0 when 'PLANNED' then 1 else 2 end,p0.planning_seq limit 1
  ) p on true
  left join md_process_recipe pr on pr.recipe_key=p.recipe_key
  where b.id=$1
  limit 1
 `,[batchId,jobNum]);
 return q.rows[0]||null;
}


async function ensureJobForProductionBatch(c:any,batchId:number,jobNum:string){
 let row=await findJobForBatch(c,batchId,jobNum);
 if(!row)throw new Error(`Không tìm thấy Job ${jobNum} trong All Open Job.`);
 if(row.planning_job_operation_id)return {row,synced:false};

 // Future ST Job: RAW NextOperation may still belong to another department.
 // Rebuild ONLY this Job from its own AllOperation, then resolve the Batch Main again.
 await syncPlanningChains(c,{jobNums:[jobNum]});
 row=await findJobForBatch(c,batchId,jobNum);
 if(!row?.planning_job_operation_id){
  throw new Error(`Job ${jobNum} không có Main ${row?.batch_standard_operation||"của Batch"} trong current/future ST routing.`);
 }
 return {row,synced:true};
}

async function promoteProductionStEntry(c:any,row:any){
 const planningSeq=Number(row.planning_seq||0);
 if(!planningSeq)return {futureStEntry:false,deactivatedEarlier:0};
 const priorQ=await c.query(`
  select p.id
  from planning_job_operation p
  where p.job_num=$1 and p.is_active=true and p.planning_seq<$2
    and not exists(
      select 1 from planning_batch_job bj
      join planning_batch b on b.id=bj.batch_id and b.status<>'CANCELLED'
      where bj.planning_job_operation_id=p.id
    )
  order by p.planning_seq,p.id
 `,[row.job_num,planningSeq]);
 if(!priorQ.rowCount)return {futureStEntry:false,deactivatedEarlier:0};
 await c.query(`
  update planning_job_operation p
  set is_active=false,updated_at=now()
  where p.id=any($1::bigint[])
 `,[priorQ.rows.map((x:any)=>Number(x.id))]);
 return {futureStEntry:true,deactivatedEarlier:priorQ.rowCount};
}

function supportKey(type:SupportType,batchId:number,main:string){
 return `${type}:${batchId}:${clean(main).toUpperCase()}`;
}

async function seedPreparationForProductionAddedJob(c:any,args:{productionDate:string;batchId:number;planningJobOperationId:number;jobNum:string;mainOperation:string;remark:string}){
 const plans=await loadMaskingUnmaskingPlan(c,{view:"scheduled",scheduleDate:args.productionDate});
 const main=plans.find(x=>clean(x.standardOperation).toUpperCase()===clean(args.mainOperation).toUpperCase());
 if(!main)return [] as Array<{type:SupportType;operations:string[]}>;
 const result:Array<{type:SupportType;operations:string[]}>=[];
 for(const type of ["UNMASKING","MASKING"] as SupportType[]){
  const rows=(type==="MASKING"?main.masking:main.unmasking).filter(x=>x.batchId===args.batchId);
  const target=rows.find(x=>x.planningJobOperationId===args.planningJobOperationId&&clean(x.jobNum).toUpperCase()===clean(args.jobNum).toUpperCase());
  if(!target)continue;
  const sourceKey=supportKey(type,args.batchId,args.mainOperation);

  // Preserve legacy parent-level execution before introducing the first explicit
  // Job row for this support source. Otherwise an old DONE parent could be lost
  // as soon as the newly added Job receives its WAITING row.
  const existingQ=await c.query(`select count(*)::int n from production_execution_job where source_type=$1 and source_key=$2`,[type,sourceKey]);
  if(Number(existingQ.rows[0]?.n||0)===0){
   const parentQ=await c.query(`select execution_status,actual_start,actual_end,remark,schedule_id from production_execution where source_type=$1 and source_key=$2 limit 1`,[type,sourceKey]);
   const parent=parentQ.rows[0];
   if(parent){
    for(const old of rows.filter(x=>x.planningJobOperationId!==args.planningJobOperationId)){
     await c.query(`
      insert into production_execution_job(source_type,source_key,batch_id,schedule_id,planning_job_operation_id,job_num,execution_status,actual_start,actual_end,remark)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      on conflict(source_type,source_key,planning_job_operation_id) do nothing
     `,[type,sourceKey,args.batchId,old.scheduleId||parent.schedule_id||null,old.planningJobOperationId,old.jobNum,parent.execution_status||"WAITING",parent.actual_start||null,parent.actual_end||null,parent.remark||null]);
    }
   }
  }

  await c.query(`
   insert into production_execution_job(source_type,source_key,batch_id,schedule_id,planning_job_operation_id,job_num,execution_status,actual_start,actual_end,remark)
   values($1,$2,$3,$4,$5,$6,'WAITING',null,null,$7)
   on conflict(source_type,source_key,planning_job_operation_id) do nothing
  `,[type,sourceKey,args.batchId,target.scheduleId||null,args.planningJobOperationId,args.jobNum,args.remark]);
  result.push({type,operations:[...new Set(target.supportOperations.map(op=>op.detailCode||op.operationCode).filter(Boolean))]});
 }
 return result;
}

async function removeJob(c:any,item:any){
 const rowQ=await c.query(`
  select bj.id,bj.job_num,bj.planning_job_operation_id,bj.qty,bj.surface_dm2,p.planning_seq
  from planning_batch_job bj join planning_job_operation p on p.id=bj.planning_job_operation_id
  where bj.batch_id=$1 and bj.planning_job_operation_id=$2 for update of bj,p
 `,[item.batch_id,item.planning_job_operation_id]);
 if(!rowQ.rowCount)throw new Error("Job không còn trong Batch.");
 const row=rowQ.rows[0];
 const exQ=await c.query(`select execution_status from production_execution_job where batch_id=$1 and planning_job_operation_id=$2 order by id desc limit 1`,[item.batch_id,item.planning_job_operation_id]);
 if(exQ.rows[0]?.execution_status&&exQ.rows[0].execution_status!=="WAITING")throw new Error("Chỉ được bớt Job khi Production vẫn WAITING/chưa bắt đầu.");
 const laterQ=await c.query(`select standard_operation from planning_job_operation where job_num=$1 and is_active=true and planning_seq>$2 and status='PLANNED' order by planning_seq limit 1`,[row.job_num,row.planning_seq]);
 if(laterQ.rowCount)throw new Error(`Không thể bớt Job vì công đoạn sau ${laterQ.rows[0].standard_operation} đã PLANNED.`);
 await c.query(`delete from planning_batch_job where id=$1`,[row.id]);
 await c.query(`update planning_job_operation set status='ELIGIBLE',updated_at=now() where id=$1`,[row.planning_job_operation_id]);
 await recomputeJobPlanningStatus(c,row.job_num);
 const bQ=await c.query(`select process_minutes from planning_batch where id=$1`,[item.batch_id]);
 const totals=await refreshBatchTotals(c,Number(item.batch_id));
 await autoAdjustChemicalSchedule(c,Number(item.batch_id),totals.processMinutes,{previousProcessMinutes:Number(bQ.rows[0]?.process_minutes||0)});
 return totals;
}

async function addJob(c:any,item:any,forceException:boolean,seedStatus:"WAITING"|"DONE"="DONE",seedRemark="Added by Daily Production Adjustment"){
 const row=await findJobForBatch(c,Number(item.batch_id),clean(item.job_num));
 if(!row||!row.planning_job_operation_id)throw new Error("Job không có Main Operation phù hợp với Batch.");
 if(row.in_this_batch)return {already:true};
 if(row.other_batch_no&&!forceException)throw new Error(`Job đang thuộc Batch active khác: ${row.other_batch_no}.`);
 if(row.batch_recipe_key){
  const allowed=await recipeAllowedForJob(c,{source_operation_code:row.source_operation_code,standard_operation:row.job_standard_operation||row.batch_standard_operation,part_num:row.part_num,revision_num:row.revision_num},row.batch_recipe_key);
  if(!allowed&&!forceException)throw new Error("Recipe của Batch không hợp lệ cho Job. Dùng Duyệt ngoại lệ nếu đây là thực tế sản xuất đã xảy ra.");
 }
 const cfg=await loadBatchNumberConfig(c,row.batch_standard_operation,row.batch_recipe_key||null);
 const projected=Number(row.total_qty||0)+Number(row.plan_qty||0);
 if(cfg.autoSplit&&cfg.batchSizeQty&&projected>Number(cfg.batchSizeQty)+0.000001&&!forceException)
  throw new Error(`Batch Size vượt cấu hình: ${projected} / ${cfg.batchSizeQty} pcs. Dùng Duyệt ngoại lệ nếu Production thực tế đã chạy.`);
 await c.query(`
  insert into planning_batch_job(batch_id,planning_job_operation_id,job_num,source_operation_code,standard_operation,
   source_seq_snapshot,planning_seq_snapshot,operation_instance_key_snapshot,qty,surface_dm2)
  values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  on conflict(batch_id,planning_job_operation_id) do nothing
 `,[row.batch_id,row.planning_job_operation_id,row.job_num,row.source_operation_code,row.job_standard_operation||row.batch_standard_operation,row.source_seq,row.planning_seq,row.operation_instance_key,row.plan_qty,row.plan_surface]);
 await c.query(`update planning_job_operation set status='PLANNED',recipe_key=coalesce($2,recipe_key),updated_at=now() where id=$1`,[row.planning_job_operation_id,row.batch_recipe_key||row.job_recipe_key||null]);
 await recomputeJobPlanningStatus(c,row.job_num);
 const totals=await refreshBatchTotals(c,Number(row.batch_id));
 await autoAdjustChemicalSchedule(c,Number(row.batch_id),totals.processMinutes,{previousProcessMinutes:Number(row.process_minutes||0)});
 // Production reported this Job as completed outside the planned Batch. Seed the approved actual fact.
 const scheduleQ=await c.query(`select id from planning_schedule where batch_id=$1 and status<>'CANCELLED' order by planned_start desc,id desc limit 1`,[row.batch_id]);
 await c.query(`
  insert into production_execution_job(source_type,source_key,batch_id,schedule_id,planning_job_operation_id,job_num,execution_status,actual_start,actual_end,remark)
  values('BATCH','BATCH:'||$1::bigint::text,$1::bigint,$2::bigint,$3::bigint,$4,$6,
    case when $6='WAITING' then null else coalesce(($5::jsonb->>'actualStart')::timestamptz,now()) end,
    case when $6='DONE' then coalesce(($5::jsonb->>'actualEnd')::timestamptz,now()) else null end,$7)
  on conflict(source_type,source_key,planning_job_operation_id)
  do update set execution_status=$6,
    actual_start=case when $6='WAITING' then null else coalesce(production_execution_job.actual_start,excluded.actual_start) end,
    actual_end=case when $6='DONE' then coalesce(excluded.actual_end,now()) else null end,remark=excluded.remark,updated_at=now()
 `,[row.batch_id,scheduleQ.rows[0]?.id||null,row.planning_job_operation_id,row.job_num,JSON.stringify(item.proposal_json||{}),seedStatus,seedRemark]);
 return totals;
}

async function applyCascade(c:any,impacts:any[],adjustmentId:number){
 if(!Array.isArray(impacts)||!impacts.length)throw new Error("Chưa có preview chỉnh lịch.");
 // First cancel every old active row so the one-active-schedule-per-Batch invariant is preserved.
 const oldRows=new Map<number,any>();
 for(const impact of impacts){
  const q=await c.query(`select * from planning_schedule where id=$1 and status<>'CANCELLED' for update`,[Number(impact.scheduleId)]);
  if(!q.rowCount)throw new Error(`Schedule #${impact.scheduleId} đã thay đổi. Hãy Preview lại.`);
  oldRows.set(Number(impact.scheduleId),q.rows[0]);
 }
 for(const impact of impacts){
  await c.query(`update planning_schedule set status='CANCELLED',note=concat_ws(E'\\n',note,$2),updated_at=now() where id=$1`,[Number(impact.scheduleId),`V464 Daily Adjustment #${adjustmentId}: ${impact.reason}`]);
 }
 const created=[] as any[];
 for(const impact of impacts){
  const old=oldRows.get(Number(impact.scheduleId));
  const ns=new Date(impact.newStart),ne=new Date(impact.newEnd);
  const duration=Math.max(1,Math.round((ne.getTime()-ns.getTime())/60000));
  const scheduleDate=getProductionDateString(ns);
  const ins=await c.query(`
   insert into planning_schedule(batch_id,resource_code,schedule_date,planned_start,planned_end,duration_minutes,sequence_no,status,note)
   values($1,$2,$3,$4,$5,$6,$7,'SCHEDULED',concat_ws(E'\\n',$8,$9)) returning id
  `,[old.batch_id,old.resource_code,scheduleDate,ns.toISOString(),ne.toISOString(),duration,old.sequence_no||0,old.note||null,`Rescheduled from #${impact.scheduleId} by Daily Adjustment #${adjustmentId}`]);
  await c.query(`update planning_batch set planned_start=$2,planned_end=$3,updated_at=now() where id=$1`,[old.batch_id,ns.toISOString(),ne.toISOString()]);
  created.push({oldScheduleId:Number(impact.scheduleId),newScheduleId:Number(ins.rows[0].id),batchId:Number(old.batch_id),reason:impact.reason});
 }
 return created;
}

export async function GET(req:NextRequest){
 const {denied}=await requireApiPermission("adjustment.view");if(denied)return denied;
 const date=clean(req.nextUrl.searchParams.get("date"));
 if(!validDate(date))return NextResponse.json({error:"Ngày sản xuất không hợp lệ."},{status:400});
 const c=await getPool().connect();
 try{return NextResponse.json(await loadAdjustmentData(c,date));}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});}
 finally{c.release();}
}

export async function POST(req:NextRequest){
 const b=await req.json();const action=clean(b.action).toUpperCase();
 const requiredPermission=action==="REPORT_EXTRA_JOB"||action==="ACCEPT_NEXT_MAIN_JOB"?"production.add_job":"adjustment.approve";
 const {denied,ctx}=await requireApiPermission(requiredPermission);if(denied||!ctx)return denied!;
 const date=clean(b.production_date);
 const c=await getPool().connect();
 try{
  await c.query("begin");
  if(action==="SCAN"){
   if(!validDate(date))throw new Error("Ngày sản xuất không hợp lệ.");
   await scanProductionAdjustments(c,date);
   await c.query("commit");
   await notifyInternalChange({dbClient:c,ctx,eventKey:"ADJUSTMENT_SCANNED",summary:`Scanned Daily Production Adjustment · ${date}`,entityType:"ADJUSTMENT_SET",entityId:date,metadata:{productionDate:date}});
   return NextResponse.json({ok:true,...await loadAdjustmentData(c,date)});
  }
  if(action==="ACCEPT_NEXT_MAIN_JOB"){
   if(!validDate(date))throw new Error("Ngày sản xuất không hợp lệ.");
   const batchId=Number(b.batch_id);const jobNum=clean(b.job_num);const eventId=Number(b.event_id||0);
   if(!batchId||!jobNum||!eventId)throw new Error("Thiếu Batch, Job hoặc attention event.");
   const prodScope=await canProductionBatch(c,ctx,batchId);if(!prodScope.allowed){await c.query("rollback");return NextResponse.json({error:`Không có quyền thêm Job khu vực ${prodScope.scopeKey||"của Batch"}.`},{status:403});}
   const eventQ=await c.query(`
    select * from planning_handover_change_event
    where id=$1 and affected_batch_id=$2 and job_num=$3 and change_type='ADD_JOB' and status='NEW' and note like 'PRODUCTION_ADD:%'
    for update
   `,[eventId,batchId,jobNum]);
   if(!eventQ.rowCount)throw new Error("Attention đã được xử lý hoặc không còn hợp lệ.");
   const ensured=await ensureJobForProductionBatch(c,batchId,jobNum);
   const row=ensured.row;
   if(row.in_this_batch){
    await c.query(`update planning_handover_change_event set status='ACKNOWLEDGED',acknowledged_at=now(),acknowledged_by='Production' where id=$1`,[eventId]);
    await c.query("commit");
    return NextResponse.json({ok:true,already:true});
   }
   if(row.other_batch_no)throw new Error(`Job đang thuộc Batch active khác: ${row.other_batch_no}.`);
   if(row.batch_recipe_key){
    const allowed=await recipeAllowedForJob(c,{source_operation_code:row.source_operation_code,standard_operation:row.job_standard_operation||row.batch_standard_operation,part_num:row.part_num,revision_num:row.revision_num},row.batch_recipe_key);
    if(!allowed)throw new Error("Recipe của Batch đích không hợp lệ cho Job.");
   }
   const sizeCfg=await loadBatchNumberConfig(c,row.batch_standard_operation,row.batch_recipe_key||null);
   const projectedQty=Number(row.total_qty||0)+Number(row.plan_qty||0);
   if(sizeCfg.autoSplit&&sizeCfg.batchSizeQty&&projectedQty>Number(sizeCfg.batchSizeQty)+0.000001)
    throw new Error(`Batch Size vượt cấu hình: ${projectedQty} / ${sizeCfg.batchSizeQty} pcs.`);
   const entry=await promoteProductionStEntry(c,row);
   const proposal={reportedFrom:"NEXT_MAIN_ATTENTION",sourceEventId:eventId,sourceBatchNo:eventQ.rows[0].source_batch_no,partNum:row.part_num,revisionNum:row.revision_num,partDescription:row.part_description,qty:Number(row.plan_qty||0),surface:Number(row.plan_surface||0),futureStEntry:entry.futureStEntry,stEntryMain:row.batch_standard_operation,stEntryInstanceKey:row.operation_instance_key,deactivatedEarlier:entry.deactivatedEarlier};
   await addJob(c,{batch_id:batchId,job_num:row.job_num,proposal_json:proposal},false,"WAITING","Added from Previous Main Production attention");
   const preparation=await seedPreparationForProductionAddedJob(c,{productionDate:date,batchId,planningJobOperationId:Number(row.planning_job_operation_id),jobNum:row.job_num,mainOperation:row.batch_standard_operation,remark:"Auto-added preparation for Production-added Job"});
   await c.query(`update planning_handover_change_event set status='ACKNOWLEDGED',acknowledged_at=now(),acknowledged_by='Production',note=concat_ws(E'\n',note,'Accepted into downstream Batch') where id=$1`,[eventId]);
   const nextMainAttentions=await createProductionNextMainAttentions(c,{
    sourceBatchId:batchId,sourceBatchNo:row.batch_no,sourceOperation:row.batch_standard_operation,jobNum:row.job_num,planningSeq:Number(row.planning_seq||0),
    qtyBefore:Number(row.total_qty||0),qtyAfter:projectedQty,surfaceBefore:Number(row.total_surface_dm2||0),surfaceAfter:Number(row.total_surface_dm2||0)+Number(row.plan_surface||0),
    jobQty:Number(row.plan_qty||0),jobSurface:Number(row.plan_surface||0)
   });
   const set=await ensureAdjustmentSet(c,date);
   await c.query(`
    insert into production_adjustment_item(adjustment_set_id,item_type,status,batch_id,planning_job_operation_id,job_num,standard_operation,reason,validation_status,validation_message,proposal_json,approved_at,approved_by,updated_at)
    values($1,'ADD_JOB','APPROVED',$2,$3,$4,$5,$6,'OK',$7,$8::jsonb,now(),'Production',now())
    on conflict(adjustment_set_id,item_type,batch_id,planning_job_operation_id)
    do update set status='APPROVED',reason=excluded.reason,validation_status='OK',validation_message=excluded.validation_message,proposal_json=excluded.proposal_json,approved_at=now(),approved_by='Production',updated_at=now()
   `,[set.id,batchId,Number(row.planning_job_operation_id),row.job_num,row.batch_standard_operation,"Production thêm Job từ chú ý Main trước","Đã thêm vào Batch đích với trạng thái WAITING; không đánh dấu hoàn thành.",JSON.stringify(proposal)]);
   await c.query(`update production_adjustment_set set status='READY',updated_at=now() where id=$1`,[set.id]);
   await c.query("commit");
   await notifyInternalChange({dbClient:c,
    ctx,eventKey:"PRODUCTION_NEXT_MAIN_ACCEPTED",
    summary:`Accepted Production-added Job ${row.job_num} into Batch ${row.batch_no} · ${row.batch_standard_operation}`,
    batchId,batchNo:String(row.batch_no||""),standardOperation:String(row.batch_standard_operation||""),jobNums:[String(row.job_num||"")],
    affectedMains:nextMainAttentions.map((x:any)=>String(x.nextOperation||"")).filter(Boolean),entityType:"BATCH",entityId:batchId,
    metadata:{productionDate:date,sourceEventId:eventId,futureStEntry:entry.futureStEntry}
   });
   return NextResponse.json({ok:true,added:true,futureStEntry:entry.futureStEntry,preparation,addedJob:{
    planningJobOperationId:Number(row.planning_job_operation_id),jobNum:row.job_num,partDescription:row.part_description||"",currentGoodWipQty:Number(row.plan_qty||0),totalSurface:Number(row.plan_surface||0),
    lastLaborOp:row.last_operation||"",nextOperation:row.next_operation||"",priority:row.priority_type||"",supportOperations:preparation.flatMap((x:any)=>x.operations||[]),isAddedJob:true,status:"WAITING",actualStart:null,actualEnd:null,remark:"Added from Previous Main attention"
   },batchTotals:{qty:projectedQty,surface:Number(row.total_surface_dm2||0)+Number(row.plan_surface||0)},nextMainAttentions,nextMainAttention:nextMainAttentions.find((x:any)=>!x.alreadyInNextBatch)||nextMainAttentions[0]||null});
  }
  if(action==="REPORT_EXTRA_JOB"){
   if(!validDate(date))throw new Error("Ngày sản xuất không hợp lệ.");
   let batchId=Number(b.batch_id);const batchNo=clean(b.batch_no),jobNum=clean(b.job_num);
   if(!batchId&&batchNo){const bq=await c.query(`select id from planning_batch where upper(trim(batch_no))=upper(trim($1)) and status<>'CANCELLED' order by created_at desc limit 1`,[batchNo]);batchId=Number(bq.rows[0]?.id||0);}
   if(!batchId||!jobNum)throw new Error("Cần Batch No. và Job Number.");
   const prodScope=await canProductionBatch(c,ctx,batchId);if(!prodScope.allowed){await c.query("rollback");return NextResponse.json({error:`Không có quyền thêm Job khu vực ${prodScope.scopeKey||"của Batch"}.`},{status:403});}
   const set=await ensureAdjustmentSet(c,date);
   const ensured=await ensureJobForProductionBatch(c,batchId,jobNum);
   const row=ensured.row;
   const entry=await promoteProductionStEntry(c,row);
   if(row.in_this_batch)throw new Error("Job đã nằm trong Batch.");
   if(row.other_batch_no)throw new Error(`Job đang thuộc Batch active khác: ${row.other_batch_no}.`);
   if(row.batch_recipe_key){
    const allowed=await recipeAllowedForJob(c,{source_operation_code:row.source_operation_code,standard_operation:row.job_standard_operation||row.batch_standard_operation,part_num:row.part_num,revision_num:row.revision_num},row.batch_recipe_key);
    if(!allowed)throw new Error("Recipe của Batch không hợp lệ cho Job.");
   }
   const sizeCfg=await loadBatchNumberConfig(c,row.batch_standard_operation,row.batch_recipe_key||null);
   const projectedQty=Number(row.total_qty||0)+Number(row.plan_qty||0);
   if(sizeCfg.autoSplit&&sizeCfg.batchSizeQty&&projectedQty>Number(sizeCfg.batchSizeQty)+0.000001)
    throw new Error(`Batch Size vượt cấu hình: ${projectedQty} / ${sizeCfg.batchSizeQty} pcs.`);

   const proposal={actualStart:b.actual_start||null,actualEnd:b.actual_end||null,reportedFrom:"PRODUCTION_EXECUTION",partNum:row.part_num,revisionNum:row.revision_num,partDescription:row.part_description,qty:Number(row.plan_qty||0),surface:Number(row.plan_surface||0),futureStEntry:entry.futureStEntry,stEntryMain:row.batch_standard_operation,stEntryInstanceKey:row.operation_instance_key,deactivatedEarlier:entry.deactivatedEarlier,rawNextOperationAtAdd:row.next_operation||null};
   await addJob(c,{batch_id:batchId,job_num:row.job_num,proposal_json:proposal},false);
   const preparation=await seedPreparationForProductionAddedJob(c,{productionDate:date,batchId,planningJobOperationId:Number(row.planning_job_operation_id),jobNum:row.job_num,mainOperation:row.batch_standard_operation,remark:"Auto-added preparation for Production-added Job"});
   const nextMainAttentions=await createProductionNextMainAttentions(c,{
    sourceBatchId:batchId,sourceBatchNo:row.batch_no,sourceOperation:row.batch_standard_operation,jobNum:row.job_num,planningSeq:Number(row.planning_seq||0),
    qtyBefore:Number(row.total_qty||0),qtyAfter:projectedQty,surfaceBefore:Number(row.total_surface_dm2||0),
    surfaceAfter:Number(row.total_surface_dm2||0)+Number(row.plan_surface||0),jobQty:Number(row.plan_qty||0),jobSurface:Number(row.plan_surface||0)
   });
   // If this Job was itself added because of an upstream Production attention, close that attention now.
   await c.query(`
    update planning_handover_change_event
    set status='ACKNOWLEDGED',acknowledged_at=now(),acknowledged_by='Production',
        note=concat_ws(E'\n',note,'Added to downstream Batch by Production')
    where affected_batch_id=$1 and job_num=$2 and change_type='ADD_JOB' and status='NEW' and note like 'PRODUCTION_ADD:%'
   `,[batchId,row.job_num]);
   await c.query(`
    insert into production_adjustment_item(adjustment_set_id,item_type,status,batch_id,planning_job_operation_id,job_num,standard_operation,
      reason,validation_status,validation_message,proposal_json,approved_at,approved_by,updated_at)
    values($1,'ADD_JOB','APPROVED',$2,$3,$4,$5,$6,'OK',$7,$8::jsonb,now(),'Production',now())
    on conflict(adjustment_set_id,item_type,batch_id,planning_job_operation_id)
    do update set status='APPROVED',reason=excluded.reason,validation_status='OK',validation_message=excluded.validation_message,
      proposal_json=excluded.proposal_json,approved_at=now(),approved_by='Production',updated_at=now()
   `,[set.id,batchId,Number(row.planning_job_operation_id),row.job_num,row.batch_standard_operation,
      "Production đã thêm Job trực tiếp vào Batch","Đã thêm trực tiếp từ Báo cáo sản xuất; không cần planner duyệt.",JSON.stringify(proposal)]);
   await c.query(`update production_adjustment_set set status='READY',updated_at=now() where id=$1`,[set.id]);
   await c.query("commit");
   await notifyInternalChange({dbClient:c,
    ctx,eventKey:"PRODUCTION_JOB_ADDED",
    summary:`Production added Job ${row.job_num} to Batch ${row.batch_no} · ${row.batch_standard_operation} · ${Number(row.plan_qty||0)} pcs`,
    batchId,batchNo:String(row.batch_no||""),standardOperation:String(row.batch_standard_operation||""),jobNums:[String(row.job_num||"")],
    affectedMains:nextMainAttentions.map((x:any)=>String(x.nextOperation||"")).filter(Boolean),entityType:"BATCH",entityId:batchId,
    metadata:{productionDate:date,futureStEntry:entry.futureStEntry,preparationCount:preparation.length}
   });
   return NextResponse.json({ok:true,added:true,futureStEntry:entry.futureStEntry,preparation,addedJob:{
    planningJobOperationId:Number(row.planning_job_operation_id),jobNum:row.job_num,partDescription:row.part_description||"",
    currentGoodWipQty:Number(row.plan_qty||0),totalSurface:Number(row.plan_surface||0),lastLaborOp:row.last_operation||"",
    nextOperation:row.next_operation||"",priority:row.priority_type||"",supportOperations:preparation.flatMap((x:any)=>x.operations||[]),isAddedJob:true,status:"DONE",
    actualStart:b.actual_start||new Date().toISOString(),actualEnd:b.actual_end||new Date().toISOString(),remark:"Added from Production Report"
   },batchTotals:{qty:projectedQty,surface:Number(row.total_surface_dm2||0)+Number(row.plan_surface||0)},nextMainAttentions,nextMainAttention:nextMainAttentions.find((x:any)=>!x.alreadyInNextBatch)||nextMainAttentions[0]||null});
  }
  const itemId=Number(b.item_id);if(!itemId)throw new Error("Adjustment item không hợp lệ.");
  const itemQ=await c.query(`select i.*,s.production_date from production_adjustment_item i join production_adjustment_set s on s.id=i.adjustment_set_id where i.id=$1 for update of i`,[itemId]);
  if(!itemQ.rowCount)throw new Error("Không tìm thấy đề xuất.");
  const item=itemQ.rows[0];
  if(!canPlanningMain(ctx,String(item.standard_operation||""))){await c.query("rollback");return NextResponse.json({error:`Không có quyền điều chỉnh Main ${item.standard_operation||""}.`},{status:403});}
  if(action==="PREVIEW"){
   if(item.item_type!=="CARRY_OVER")throw new Error("Preview thời gian chỉ áp dụng Carry Over.");
   const ps=clean(b.proposed_start)||item.proposed_start;const pe=clean(b.proposed_end)||item.proposed_end;
   if(!ps||!pe||new Date(pe)<=new Date(ps))throw new Error("Proposed Start/End không hợp lệ.");
   const impacts=await buildScheduleCascadePreview(c,{batchId:Number(item.batch_id),newStart:ps,newEnd:pe});
   await c.query(`update production_adjustment_item set proposed_start=$2,proposed_end=$3,proposal_json=coalesce(proposal_json,'{}'::jsonb)||jsonb_build_object('impacts',$4::jsonb),updated_at=now() where id=$1`,[itemId,ps,pe,JSON.stringify(impacts)]);
   await c.query("commit");return NextResponse.json({ok:true,impacts});
  }
  if(action==="REJECT"){
   await c.query(`update production_adjustment_item set status='REJECTED',approved_at=now(),approved_by=$2,updated_at=now() where id=$1`,[itemId,clean(b.approved_by)||"Planner"]);
   await c.query("commit");
   await notifyInternalChange({dbClient:c,ctx,eventKey:"ADJUSTMENT_REJECTED",summary:`Rejected ${item.item_type} adjustment${item.job_num?` · Job ${item.job_num}`:""}${item.standard_operation?` · ${item.standard_operation}`:""}`,batchId:Number(item.batch_id)||null,standardOperation:String(item.standard_operation||""),jobNums:item.job_num?[String(item.job_num)]:[],entityType:"ADJUSTMENT_ITEM",entityId:itemId,metadata:{productionDate:item.production_date}});
   return NextResponse.json({ok:true});
  }
  if(action==="APPROVE"){
   if(item.status!=="PENDING")throw new Error(`Đề xuất đang ở trạng thái ${item.status}.`);
   if(item.item_type==="REMOVE_JOB")await removeJob(c,item);
   else if(item.item_type==="ADD_JOB")await addJob(c,item,Boolean(b.force_exception));
   else if(item.item_type==="CARRY_OVER"){
    const impacts=Array.isArray(item.proposal_json?.impacts)?item.proposal_json.impacts:await buildScheduleCascadePreview(c,{batchId:Number(item.batch_id),newStart:item.proposed_start,newEnd:item.proposed_end});
    const revisions=await applyCascade(c,impacts,itemId);
    item.proposal_json={...(item.proposal_json||{}),impacts,revisions};
   }
   await c.query(`update production_adjustment_item set status='APPROVED',approved_at=now(),approved_by=$2,proposal_json=$3::jsonb,updated_at=now() where id=$1`,[itemId,clean(b.approved_by)||"Planner",JSON.stringify(item.proposal_json||{})]);
   await c.query("commit");
   await notifyInternalChange({dbClient:c,ctx,eventKey:"ADJUSTMENT_APPROVED",summary:`Approved ${item.item_type} adjustment${item.job_num?` · Job ${item.job_num}`:""}${item.standard_operation?` · ${item.standard_operation}`:""}`,batchId:Number(item.batch_id)||null,standardOperation:String(item.standard_operation||""),jobNums:item.job_num?[String(item.job_num)]:[],entityType:"ADJUSTMENT_ITEM",entityId:itemId,metadata:{productionDate:item.production_date}});
   return NextResponse.json({ok:true});
  }
  throw new Error("Action không hỗ trợ.");
 }catch(e){await c.query("rollback");return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});}
 finally{c.release();}
}
