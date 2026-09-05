import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";

import {refreshBatchTotals,recomputeJobPlanningStatus} from "@/lib/planning/batch-utils";
import {autoAdjustChemicalSchedule} from "@/lib/chemical-line-schedule-server";
import {loadLiveRecipeContext,bestRecipeMatch,mergeJobData} from "@/lib/planning/live-recipe";
import {recipeAllowedForJob} from "@/lib/planning/batch-utils";
import {assertSameRecipeConditionGroup} from "@/lib/planning/batch-compatibility";
import {loadBatchNumberConfig} from "@/lib/planning/batch-number";

import {requireApiPermission} from "@/lib/security/api";
import {canPlanningMain} from "@/lib/security/scope-db";
async function plannerForOperationDb(c:any,operation:unknown):Promise<"1"|"2"|null>{
 const op=String(operation??"").trim();
 if(!op)return null;
 const q=await c.query(`
  select w.planner_owner
  from md_schedule_area_operation m
  join md_schedule_area a
    on a.schedule_area_code=m.schedule_area_code and a.is_active=true
  left join md_planner_work_assignment w
    on w.schedule_area_code=a.schedule_area_code and w.is_active=true
  where m.is_active=true and upper(trim(m.standard_operation))=upper(trim($1))
  order by a.display_order
  limit 1
 `,[op]);
 const owner=String(q.rows[0]?.planner_owner||"");
 return owner==="1"||owner==="2"?owner:null;
}

const clean=(v:unknown)=>String(v??"").trim();



async function nextMainOperationForJob(c:any,jobNum:string,planningSeq:number){
 const q=await c.query(`
  select standard_operation
  from planning_job_operation
  where job_num=$1
    and is_active=true
    and planning_seq>$2
  order by planning_seq
  limit 1
 `,[jobNum,planningSeq]);

 return q.rows[0]?.standard_operation||null;
}

async function findDownstreamImpact(c:any,jobNum:string,nextOperation:string|null){
 if(!nextOperation)return {
  affected_batch_id:null,
  affected_batch_no:null,
  affected_schedule_id:null,
  affected_resource_code:null,
  affected_planned_start:null,
  impact_level:"INFO"
 };

 const q=await c.query(`
  select
    b.id affected_batch_id,
    b.batch_no affected_batch_no,
    s.id affected_schedule_id,
    s.resource_code affected_resource_code,
    s.planned_start affected_planned_start,
    case
      when s.id is not null
       and s.planned_start<=now()+interval '60 minutes'
       then 'CRITICAL'
      when s.id is not null then 'IMPACTED'
      else 'WARNING'
    end impact_level
  from planning_batch_job bj
  join planning_batch b
    on b.id=bj.batch_id
   and b.status<>'CANCELLED'
  left join lateral (
    select ps.id,ps.resource_code,ps.planned_start
    from planning_schedule ps
    where ps.batch_id=b.id
      and ps.status<>'CANCELLED'
    order by ps.planned_start desc,ps.id desc
    limit 1
  ) s on true
  where bj.job_num=$1
    and bj.standard_operation=$2
  order by
    case when s.id is not null then 0 else 1 end,
    b.created_at desc,
    b.id desc
  limit 1
 `,[jobNum,nextOperation]);

 return q.rows[0]||{
  affected_batch_id:null,
  affected_batch_no:null,
  affected_schedule_id:null,
  affected_resource_code:null,
  affected_planned_start:null,
  impact_level:"INFO"
 };
}

async function createCrossPlannerEvent(
 c:any,
 args:{
  sourceBatchId:number;
  sourceBatchNo:string;
  sourceOperation:string;
  jobNum:string;
  planningSeq:number;
  changeType:"ADD_JOB"|"REMOVE_JOB";
  qtyBefore:number;
  qtyAfter:number;
  surfaceBefore:number;
  surfaceAfter:number;
  jobQty:number;
  jobSurface:number;
 }
){
 const sourcePlanner=await plannerForOperationDb(c,args.sourceOperation);
 const nextOperation=await nextMainOperationForJob(c,args.jobNum,args.planningSeq);
 const affectedPlanner=await plannerForOperationDb(c,nextOperation);

 if(!sourcePlanner||!affectedPlanner||sourcePlanner===affectedPlanner)return;

 const impact=await findDownstreamImpact(c,args.jobNum,nextOperation);

 await c.query(`
  insert into planning_handover_change_event(
   source_batch_id,source_batch_no,source_standard_operation,source_planner,
   job_num,change_type,
   next_standard_operation,affected_planner,
   affected_batch_id,affected_batch_no,
   affected_schedule_id,affected_resource_code,affected_planned_start,
   source_batch_qty_before,source_batch_qty_after,
   source_batch_surface_before,source_batch_surface_after,
   changed_job_qty,changed_job_surface,
   impact_level,status,note
  )
  values(
   $1,$2,$3,$4,
   $5,$6,
   $7,$8,
   $9,$10,$11,$12,$13,
   $14,$15,$16,$17,$18,$19,
   $20,'NEW',$21
  )
 `,[
  args.sourceBatchId,args.sourceBatchNo,args.sourceOperation,sourcePlanner,
  args.jobNum,args.changeType,
  nextOperation,affectedPlanner,
  impact.affected_batch_id||null,impact.affected_batch_no||null,
  impact.affected_schedule_id||null,impact.affected_resource_code||null,
  impact.affected_planned_start||null,
  args.qtyBefore,args.qtyAfter,args.surfaceBefore,args.surfaceAfter,
  args.jobQty,args.jobSurface,
  impact.impact_level||"INFO",
  `${args.changeType}: ${args.jobNum} · ${args.sourceOperation} → ${nextOperation}`
 ]);
}

export async function GET(
 req:NextRequest,
 {params}:{params:Promise<{id:string}>}
){
 const {denied}=await requireApiPermission("planning.view");
 if(denied)return denied;
 const {id}=await params;
 const batchId=Number(id);
 const jobNum=clean(req.nextUrl.searchParams.get("job_num"));
 if(!Number.isFinite(batchId)||!jobNum)
  return NextResponse.json({error:"Batch hoặc Job Number không hợp lệ."},{status:400});
 const c=await getPool().connect();
 try{
  const batchQ=await c.query(`
   select b.id,b.batch_no,b.standard_operation,b.recipe_key,b.total_qty,b.total_surface_dm2,b.status,
          r.recipe_no,r.recipe_name
   from planning_batch b
   left join md_process_recipe r on r.recipe_key=b.recipe_key
   where b.id=$1
  `,[batchId]);
  if(!batchQ.rowCount)return NextResponse.json({error:"Không tìm thấy Batch."},{status:404});
  const batch=batchQ.rows[0];
  const jobQ=await c.query(`
   select j.job_num,j.part_num,j.revision_num,j.part_description,j.program,j.priority_type,
          j.next_operation,j.last_operation,j.current_good_wip_qty,j.prod_qty,j.total_surface,j.surface_per_part_dm2,
          p.id planning_job_operation_id,p.source_operation_code,p.standard_operation,p.recipe_key,p.status planning_status,
          p.planning_seq,p.source_seq,
          pr.recipe_no,pr.recipe_name,
          exists(select 1 from planning_batch_job x where x.batch_id=$1 and x.planning_job_operation_id=p.id) in_this_batch,
          (select b2.batch_no from planning_batch_job x2 join planning_batch b2 on b2.id=x2.batch_id and b2.status<>'CANCELLED'
             where x2.planning_job_operation_id=p.id and x2.batch_id<>$1 order by b2.created_at desc limit 1) other_batch_no
   from open_job_current j
   left join lateral(
    select p0.* from planning_job_operation p0
    where p0.job_num=j.job_num and p0.is_active=true
      and upper(trim(p0.standard_operation))=upper(trim($2))
    order by case p0.status when 'ELIGIBLE' then 0 when 'PLANNED' then 1 else 2 end,p0.planning_seq
    limit 1
   ) p on true
   left join md_process_recipe pr on pr.recipe_key=p.recipe_key
   where upper(trim(j.job_num))=upper(trim($3)) and j.is_open=true
   limit 1
  `,[batchId,batch.standard_operation,jobNum]);
  if(!jobQ.rowCount)return NextResponse.json({error:`Không tìm thấy Job ${jobNum} trong All Open Job.`},{status:404});
  const job=jobQ.rows[0];
  const issues:string[]=[];
  const batchConfig=await loadBatchNumberConfig(c,batch.standard_operation,batch.recipe_key||null);
  const jobQty=Number(job.current_good_wip_qty||job.prod_qty||0);
  const projectedQty=Number(batch.total_qty||0)+jobQty;
  const batchSizeExceeded=Boolean(batchConfig.autoSplit&&batchConfig.batchSizeQty&&projectedQty>Number(batchConfig.batchSizeQty)+0.000001);
  if(batchSizeExceeded)issues.push(`Batch Size vượt cấu hình: ${projectedQty} / ${batchConfig.batchSizeQty} pcs (${batchConfig.batchSizeSource}).`);
  if(!job.planning_job_operation_id)issues.push(`Job không có Main Operation ${batch.standard_operation} trong Planning Chain.`);
  if(job.in_this_batch)issues.push("Job đã có trong Batch này.");
  if(job.other_batch_no)issues.push(`Job đang thuộc Batch active khác: ${job.other_batch_no}.`);
  if(job.planning_status&&job.planning_status!=="ELIGIBLE")issues.push(`Planning status hiện tại là ${job.planning_status}, không phải ELIGIBLE.`);
  let recipeCompatible=true;
  if(job.planning_job_operation_id&&batch.recipe_key){
   recipeCompatible=await recipeAllowedForJob(c,{
    source_operation_code:job.source_operation_code,standard_operation:job.standard_operation,
    part_num:job.part_num,revision_num:job.revision_num
   },batch.recipe_key);
   if(!recipeCompatible)issues.push(`Recipe của Batch không hợp lệ cho Job ${job.job_num}.`);
  }
  return NextResponse.json({ok:true,batch,job,recipeCompatible,batchConfig,projectedQty,batchSizeExceeded,canAdd:issues.length===0,issues});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{c.release();}
}

export async function POST(
 req:NextRequest,
 {params}:{params:Promise<{id:string}>}
){
 const {denied,ctx}=await requireApiPermission("planning.edit");
 if(denied||!ctx)return denied!;
 const {id}=await params;
 const batchId=Number(id);
 const b=await req.json();
 let ids=Array.isArray(b.planning_job_operation_ids)
   ? b.planning_job_operation_ids.map(Number).filter(Number.isFinite)
   : [];
 const jobNum=clean(b.job_num);

 if(!Number.isFinite(batchId))
   return NextResponse.json({error:"Batch không hợp lệ."},{status:400});

 if(!ids.length&&jobNum){
   const lookup=await getPool().query(`
     select p.id
     from planning_batch b
     join planning_job_operation p
       on upper(trim(p.standard_operation))=upper(trim(b.standard_operation))
      and p.is_active=true and upper(trim(p.job_num))=upper(trim($2))
     join open_job_current j on j.job_num=p.job_num and j.is_open=true
     where b.id=$1
     order by case p.status when 'ELIGIBLE' then 0 when 'PLANNED' then 1 else 2 end,p.planning_seq
     limit 1
   `,[batchId,jobNum]);
   if(lookup.rowCount)ids=[Number(lookup.rows[0].id)];
 }
 if(!ids.length)
   return NextResponse.json({error:"Không tìm thấy Job phù hợp với Main Operation của Batch."},{status:400});

 const c=await getPool().connect();
 try{
   await c.query("begin");

   const batchQ=await c.query(`
     select id,batch_no,standard_operation,recipe_key,recipe_mapping_id,status,process_minutes,
            coalesce(total_qty,0) total_qty,
            coalesce(total_surface_dm2,0) total_surface_dm2
     from planning_batch
     where id=$1
     for update
   `,[batchId]);

   if(!batchQ.rowCount)throw new Error("Không tìm thấy Batch.");
  const scopeOp=String(batchQ.rows[0]?.standard_operation||batchQ.rows[0]?.batch_standard_operation||"");
  if(!canPlanningMain(ctx,scopeOp)){await c.query("rollback");return NextResponse.json({error:`Không có quyền sửa Main ${scopeOp}.`},{status:403});}
   const batch=batchQ.rows[0];

   if(!["PLANNED","RELEASED"].includes(batch.status))
     throw new Error("Batch hiện tại không cho phép thêm Job.");

   const q=await c.query(`
     select
       p.id,p.job_num,p.source_operation_code,p.standard_operation,p.recipe_key,p.status,
       p.source_seq,p.planning_seq,p.operation_instance_key,
       j.part_num,j.revision_num,
       j.source_data,
       coalesce(j.source_data,'{}'::jsonb) || (to_jsonb(j)-'source_data') condition_data,
       mf.primer1 part_master_primer1,
       mf.primer2 part_master_primer2,
       mf.primer3 part_master_primer3,
       mf.topcoat1 part_master_topcoat1,
       mf.topcoat2 part_master_topcoat2,
       mf.antiabration part_master_antiabration,
       mf.varinish_name part_master_varnish,
       pr.recipe_no,
       coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0) plan_qty,
       coalesce(
         j.total_surface,
         coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)
           * coalesce(j.surface_per_part_dm2,0),
         0
       ) plan_surface
     from planning_job_operation p
     join open_job_current j on j.job_num=p.job_num
     left join md_material_finish mf
       on mf.part_num=j.part_num
      and mf.revision_num=j.revision_num
      and mf.is_active=true
     left join md_process_recipe pr
       on pr.recipe_key=p.recipe_key
      and pr.is_active=true
     where p.id=any($1::bigint[])
       and p.is_active=true
       and j.is_open=true
     for update of p
   `,[ids]);

   if(q.rowCount!==ids.length)
     throw new Error("Một số Job không còn hợp lệ.");

   const batchSizeConfig=await loadBatchNumberConfig(c,batch.standard_operation,batch.recipe_key||null);
   const incomingQty=q.rows.reduce((sum:number,r:any)=>sum+Number(r.plan_qty||0),0);
   if(batchSizeConfig.autoSplit&&batchSizeConfig.batchSizeQty&&Number(batch.total_qty||0)+incomingQty>Number(batchSizeConfig.batchSizeQty)+0.000001)
     throw new Error(`Batch Size vượt cấu hình: ${Number(batch.total_qty||0)+incomingQty} / ${batchSizeConfig.batchSizeQty} pcs (${batchSizeConfig.batchSizeSource}).`);

   // v352: resolve BOTH Recipe and the exact Recipe Rule (mapping_id) for
   // every incoming Job. Same Recipe may have many condition rules.
   const recipeCtx=await loadLiveRecipeContext(c);
   for(const r of q.rows){
     const match=bestRecipeMatch(recipeCtx,{
       standardOperation:r.standard_operation,
       sourceOperationCode:r.source_operation_code,
       partNum:r.part_num,
       revisionNum:r.revision_num,
       sourceData:r.source_data||null,
       ruleSuggestion:null
     });
     r.live_recipe_key=match.recipeKey;
     r.recipe_mapping_id=match.recipeMappingId;
     if(!batch.recipe_key&&!r.recipe_key&&match.recipeKey)r.recipe_key=match.recipeKey;
   }



   for(const r of q.rows){
     if(r.status!=="ELIGIBLE")
       throw new Error(`Job ${r.job_num} không còn ELIGIBLE.`);

     if(r.standard_operation!==batch.standard_operation)
       throw new Error(`Job ${r.job_num} không cùng công đoạn ${batch.standard_operation}.`);

     if(batch.recipe_key){
       // v266: kiểm tra theo cấu hình HIỆN TẠI — recipe của lô phải nằm trong
       // các recipe được phép của Job (Standard Operation → Recipe /
       // Operation Code → Recipe / Part + Rev → Recipe).
       const allowed=await recipeAllowedForJob(c,{
         source_operation_code:r.source_operation_code,
         standard_operation:r.standard_operation,
         part_num:r.part_num,
         revision_num:r.revision_num
       },batch.recipe_key);

       if(!allowed)
         throw new Error(
           `Recipe Batch không hợp lệ cho Job ${r.job_num} (theo cấu hình hiện tại).`
         );
     }
   }

   const incomingRecipeKeys=[...new Set(q.rows.map((r:any)=>clean(r.recipe_key)).filter(Boolean))];
   const compatibilityRecipeKey=String(clean(batch.recipe_key)||(incomingRecipeKeys.length===1?incomingRecipeKeys[0]:""));
   if(compatibilityRecipeKey){
     const selectedCompatibilityConditions=await assertSameRecipeConditionGroup(c,{
       recipeKey:compatibilityRecipeKey,
       recipeMappingId:Number(batch.recipe_mapping_id||q.rows[0]?.recipe_mapping_id||0)||null,
       jobs:q.rows.map((r:any)=>({
         job_num:String(r.job_num||""),
         source_operation_code:String(r.source_operation_code||""),
         recipe_mapping_id:Number(r.recipe_mapping_id||0)||null,
         condition_data:mergeJobData(recipeCtx,{partNum:r.part_num,revisionNum:r.revision_num,sourceData:(r.condition_data||{}) as Record<string,unknown>})
       })),
       anchorJobNum:String(q.rows[0]?.job_num||""),
       targetBatchId:batchId
     });
     await c.query(`
       update planning_batch
       set compatibility_conditions=$2::jsonb,
           recipe_mapping_id=coalesce(recipe_mapping_id,$3),
           updated_at=now()
       where id=$1
     `,[batchId,JSON.stringify(selectedCompatibilityConditions),Number(batch.recipe_mapping_id||q.rows[0]?.recipe_mapping_id||0)||null]);
   }

   for(const r of q.rows){
     await c.query(`
       insert into planning_batch_job(
         batch_id,planning_job_operation_id,job_num,
         source_operation_code,standard_operation,
         source_seq_snapshot,planning_seq_snapshot,operation_instance_key_snapshot,
         qty,surface_dm2
       )
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict(batch_id,planning_job_operation_id) do nothing
     `,[
       batchId,r.id,r.job_num,r.source_operation_code,r.standard_operation,
       r.source_seq,r.planning_seq,r.operation_instance_key,
       r.plan_qty,r.plan_surface
     ]);

     await c.query(`
       update planning_job_operation
       set status='PLANNED',
           recipe_key=coalesce($2,recipe_key),
           updated_at=now()
       where id=$1
     `,[r.id,batch.recipe_key||r.recipe_key||null]);

     await recomputeJobPlanningStatus(c,r.job_num);
   }

   // v262: Batch chưa có Recipe nhưng giờ MỌI Job trong lô có cùng Recipe
   // (tự chọn theo cấu hình) → gắn Recipe đó cho lô để có thời gian Process.
   if(!batch.recipe_key){
     const recipeKeys=[...new Set(q.rows.map((r:any)=>r.recipe_key).filter(Boolean))];
     if(recipeKeys.length===1){
       await c.query(`
         update planning_batch
         set recipe_key=$2,
             recipe_mapping_id=coalesce(recipe_mapping_id,$3),
             updated_at=now()
         where id=$1
       `,[batchId,recipeKeys[0],Number(q.rows[0]?.recipe_mapping_id||0)||null]);
       batch.recipe_key=recipeKeys[0];
       batch.recipe_mapping_id=Number(q.rows[0]?.recipe_mapping_id||0)||null;
     }
   }

   const totals=await refreshBatchTotals(c,batchId);

   // v193: Batch đã Schedule trên Chemical Line → tự tính lại Loading/Process/
   // NDT/Unloading theo Qty/Surface mới và kéo dãn lịch (giữ Loading Start).
   await autoAdjustChemicalSchedule(c,batchId,totals.processMinutes,{previousProcessMinutes:Number(batch.process_minutes||0)}).catch((e:any)=>{
     throw new Error(`Thêm Job làm thay đổi thời gian Chemical Line: ${e instanceof Error?e.message:String(e)}`);
   });

   // v342: recomputeJobPlanningStatus above performs the sequential handoff:
   // this exact operation stays PLANNED, only the immediate next unplanned
   // Main becomes READY, and all later Main(s) stay WAIT.

   for(const r of q.rows){
     await createCrossPlannerEvent(c,{
       sourceBatchId:batchId,
       sourceBatchNo:batch.batch_no,
       sourceOperation:batch.standard_operation,
       jobNum:r.job_num,
       planningSeq:Number(r.planning_seq||0),
       changeType:"ADD_JOB",
       qtyBefore:Number(batch.total_qty||0),
       qtyAfter:Number(totals.totalQty||0),
       surfaceBefore:Number(batch.total_surface_dm2||0),
       surfaceAfter:Number(totals.totalSurface||0),
       jobQty:Number(r.plan_qty||0),
       jobSurface:Number(r.plan_surface||0)
     });
   }

   await c.query("commit");

   return NextResponse.json({ok:true,...totals});
 }catch(e){
   await c.query("rollback");
   return NextResponse.json(
     {error:e instanceof Error?e.message:String(e)},
     {status:500}
   );
 }finally{
   c.release();
 }
}

export async function DELETE(
 req:NextRequest,
 {params}:{params:Promise<{id:string}>}
){
 const {denied,ctx}=await requireApiPermission("planning.edit");
 if(denied||!ctx)return denied!;
 const {id}=await params;
 const batchId=Number(id);
 const b=await req.json();
 const batchJobId=Number(b.batch_job_id);

 if(!Number.isFinite(batchId)||!Number.isFinite(batchJobId))
   return NextResponse.json({error:"Batch Job không hợp lệ."},{status:400});

 const c=await getPool().connect();
 try{
   await c.query("begin");

   const batchQ=await c.query(`
     select id,batch_no,standard_operation,status,process_minutes,
            coalesce(total_qty,0) total_qty,
            coalesce(total_surface_dm2,0) total_surface_dm2
     from planning_batch
     where id=$1
     for update
   `,[batchId]);
   if(!batchQ.rowCount)throw new Error("Không tìm thấy Batch.");
  const scopeOp=String(batchQ.rows[0]?.standard_operation||batchQ.rows[0]?.batch_standard_operation||"");
  if(!canPlanningMain(ctx,scopeOp)){await c.query("rollback");return NextResponse.json({error:`Không có quyền sửa Main ${scopeOp}.`},{status:403});}
   const batch=batchQ.rows[0];
   if(!["PLANNED","RELEASED"].includes(batch.status))
     throw new Error("Batch hiện tại không cho phép bỏ Job.");

   const rowQ=await c.query(`
     select
       bj.id,bj.job_num,bj.planning_job_operation_id,
       bj.qty,bj.surface_dm2,
       p.planning_seq,p.standard_operation
     from planning_batch_job bj
     join planning_job_operation p on p.id=bj.planning_job_operation_id
     where bj.id=$1 and bj.batch_id=$2
     for update of bj,p
   `,[batchJobId,batchId]);

   if(!rowQ.rowCount)throw new Error("Không tìm thấy Job trong Batch.");
   const row=rowQ.rows[0];

   // Do not allow breaking a chain that already has a later PLANNED operation.
   const laterQ=await c.query(`
     select standard_operation
     from planning_job_operation
     where job_num=$1
       and is_active=true
       and planning_seq>$2
       and status='PLANNED'
     order by planning_seq
     limit 1
   `,[row.job_num,row.planning_seq]);

   if(laterQ.rowCount)
     throw new Error(
       `Không thể bỏ Job vì công đoạn sau ${laterQ.rows[0].standard_operation} đã được PLANNED.`
     );

   await c.query(`
     delete from planning_batch_job
     where id=$1 and batch_id=$2
   `,[batchJobId,batchId]);

   await c.query(`
     update planning_job_operation
     set status='ELIGIBLE',updated_at=now()
     where id=$1
   `,[row.planning_job_operation_id]);

   // Lock all later unplanned operations, then make the first unplanned one ELIGIBLE.
   await recomputeJobPlanningStatus(c,row.job_num);

   const totals=await refreshBatchTotals(c,batchId);

   // v193: bớt Job → thu lại thời gian Chemical Line theo Qty/Surface mới.
   await autoAdjustChemicalSchedule(c,batchId,totals.processMinutes,{previousProcessMinutes:Number(batch.process_minutes||0)}).catch((e:any)=>{
     throw new Error(`Bỏ Job làm thay đổi thời gian Chemical Line: ${e instanceof Error?e.message:String(e)}`);
   });

   await createCrossPlannerEvent(c,{
     sourceBatchId:batchId,
     sourceBatchNo:batch.batch_no,
     sourceOperation:batch.standard_operation,
     jobNum:row.job_num,
     planningSeq:Number(row.planning_seq||0),
     changeType:"REMOVE_JOB",
     qtyBefore:Number(batch.total_qty||0),
     qtyAfter:Number(totals.totalQty||0),
     surfaceBefore:Number(batch.total_surface_dm2||0),
     surfaceAfter:Number(totals.totalSurface||0),
     jobQty:Number(row.qty||0),
     jobSurface:Number(row.surface_dm2||0)
   });

   await c.query("commit");

   return NextResponse.json({ok:true,...totals});
 }catch(e){
   await c.query("rollback");
   return NextResponse.json(
     {error:e instanceof Error?e.message:String(e)},
     {status:500}
   );
 }finally{
   c.release();
 }
}
