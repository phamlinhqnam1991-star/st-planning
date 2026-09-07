import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {refreshBatchTotals,recomputeJobPlanningStatus} from "@/lib/planning/batch-utils";
import {autoAdjustChemicalSchedule} from "@/lib/chemical-line-schedule-server";

import {requireApiPermission} from "@/lib/security/api";
import {canPlanningMain} from "@/lib/security/scope-db";
import {notifyInternalChange} from "@/lib/internal-chat/server";
const clean=(v:unknown)=>String(v??"").trim();

async function getBatch(c:any,batchId:number,forUpdate=false){
 const q=await c.query(`
   select id,batch_no,standard_operation,recipe_key,recipe_mapping_id,status,process_minutes,
          total_jobs,total_qty,total_surface_dm2,planned_start
   from planning_batch
   where id=$1
   ${forUpdate?"for update":""}
 `,[batchId]);
 return q.rows[0]||null;
}

async function recipeAllowedForBatch(c:any,batchId:number,recipeKey:string){
 const batch=await getBatch(c,batchId,false);
 if(!batch)return false;

 const rows=await c.query(`
   select
     bj.job_num,
     bj.source_operation_code,
     bj.standard_operation,
     j.part_num,j.revision_num
   from planning_batch_job bj
   left join open_job_current j on j.job_num=bj.job_num
   where bj.batch_id=$1
 `,[batchId]);

 if(!rows.rowCount)return false;

 for(const r of rows.rows){
   const allowed=await c.query(`
     select 1
     where
       exists(
         select 1
         from md_main_operation_recipe ocr
         where ocr.operation_code=$3
           and ocr.recipe_key=$2
           and ocr.is_active=true
       )
       or exists(
         select 1
         from md_part_process_recipe ppr
         where ppr.part_num=$4
           and ppr.revision_num=$5
           and ppr.standard_operation=$1
           and ppr.recipe_key=$2
           and ppr.is_active=true
       )
     limit 1
   `,[
     batch.standard_operation,
     recipeKey,
     r.source_operation_code,
     r.part_num||"",
     r.revision_num||""
   ]);

   if(!allowed.rowCount)return false;
 }

 return true;
}

export async function GET(
 _req:NextRequest,
 {params}:{params:Promise<{id:string}>}
){
 const {denied}=await requireApiPermission("planning.view");
 if(denied)return denied;
 const {id}=await params;
 const batchId=Number(id);
 if(!Number.isFinite(batchId))
  return NextResponse.json({error:"Batch không hợp lệ."},{status:400});

 const c=await getPool().connect();
 try{
  const batch=await getBatch(c,batchId,false);
  if(!batch)return NextResponse.json({error:"Không tìm thấy Batch."},{status:404});

  const q=await c.query(`
    select distinct r.recipe_key,r.recipe_no,r.recipe_name,r.process_family,r.recipe_group
    from md_process_recipe r
    where r.is_active=true
      and (
        r.recipe_key=$2
        or exists(
          select 1
          from planning_batch_job bj
          join md_main_operation_recipe ocr
            on ocr.operation_code=bj.source_operation_code
           and ocr.recipe_key=r.recipe_key
           and ocr.is_active=true
          where bj.batch_id=$3
        )
        or exists(
          select 1
          from planning_batch_job bj
          join open_job_current j on j.job_num=bj.job_num
          join md_part_process_recipe ppr
            on ppr.part_num=j.part_num
           and ppr.revision_num=j.revision_num
           and ppr.standard_operation=$1
           and ppr.recipe_key=r.recipe_key
           and ppr.is_active=true
          where bj.batch_id=$3
        )
      )
    order by r.process_family,r.recipe_group,r.recipe_no,r.recipe_name
  `,[batch.standard_operation,batch.recipe_key,batchId]);

  return NextResponse.json({
   ok:true,
   batch:{
    id:batch.id,
    batch_no:batch.batch_no,
    standard_operation:batch.standard_operation,
    recipe_key:batch.recipe_key,
    recipe_mapping_id:batch.recipe_mapping_id||null
   },
   recipes:q.rows
  });
 }finally{
  c.release();
 }
}

export async function PATCH(
 req:NextRequest,
 {params}:{params:Promise<{id:string}>}
){
 const {denied,ctx}=await requireApiPermission("planning.edit");
 if(denied||!ctx)return denied!;
 const {id}=await params;
 const batchId=Number(id);
 const body=await req.json().catch(()=>({}));
 const recipeKey=clean(body.recipe_key)||null;
 const allowScheduledRecipeEdit=body.allow_scheduled_recipe_edit===true;

 if(!Number.isFinite(batchId))
  return NextResponse.json({error:"Batch không hợp lệ."},{status:400});

 const c=await getPool().connect();
 try{
  await c.query("begin");

  const batch=await getBatch(c,batchId,true);
  if(!batch)throw new Error("Không tìm thấy Batch.");
  if(!canPlanningMain(ctx,batch.standard_operation)){await c.query("rollback");return NextResponse.json({error:`Không có quyền sửa Main ${batch.standard_operation}.`},{status:403});}

  if(!["PLANNED","RELEASED"].includes(batch.status))
   throw new Error("Chỉ Batch PLANNED/RELEASED mới được sửa Recipe.");

  const scheduleQ=await c.query(`
    select status
    from planning_schedule
    where batch_id=$1
      and status<>'CANCELLED'
    limit 1
  `,[batchId]).catch(()=>({rowCount:0,rows:[]} as any));

  if(scheduleQ.rowCount){
   const scheduleStatus=String(scheduleQ.rows[0]?.status||"");

   if(["RUNNING","COMPLETED"].includes(scheduleStatus))
    throw new Error("Batch RUNNING/COMPLETED không được sửa Recipe.");

   if(!allowScheduledRecipeEdit)
    throw new Error("Batch đã được điều độ. Hãy sửa Recipe từ Board Điều Độ.");
  }

  if(recipeKey){
   const rq=await c.query(`
     select recipe_key
     from md_process_recipe
     where recipe_key=$1 and is_active=true
   `,[recipeKey]);
   if(!rq.rowCount)throw new Error("Recipe không tồn tại hoặc đã ngưng sử dụng.");

   const allowed=await recipeAllowedForBatch(c,batchId,recipeKey);
   if(!allowed)
    throw new Error("Recipe này không hợp lệ cho tất cả Job trong Batch.");
  }

  await c.query(`
    update planning_batch
    set recipe_key=$2,
        recipe_mapping_id=null,
        compatibility_conditions=null,
        updated_at=now()
    where id=$1
  `,[batchId,recipeKey]);

  // Batch Recipe is the selected recipe for the same planned operation.
  await c.query(`
    update planning_job_operation p
    set recipe_key=$2,
        recipe_mapping_id=null,
        compatibility_conditions=null,
        updated_at=now()
    from planning_batch_job bj
    where bj.batch_id=$1
      and bj.planning_job_operation_id=p.id
  `,[batchId,recipeKey]);

  const totals=await refreshBatchTotals(c,batchId);

  // Nếu Batch đã nằm trên Chemical Line: Recipe mới làm thay đổi Standard
  // Process thì cập nhật timeline; Process Duration do planner override vẫn giữ.
  await autoAdjustChemicalSchedule(c,batchId,totals.processMinutes,{
   previousProcessMinutes:Number(batch.process_minutes||0)
  });

  await c.query("commit");
  await notifyInternalChange({dbClient:c,
   ctx,eventKey:"BATCH_RECIPE_CHANGED",summary:`Changed Recipe of Batch ${batch.batch_no} · ${batch.standard_operation}`,
   batchId,batchNo:String(batch.batch_no||""),standardOperation:String(batch.standard_operation||""),
   entityType:"BATCH",entityId:batchId,metadata:{previousRecipeKey:batch.recipe_key||null,newRecipeKey:recipeKey}
  });
  return NextResponse.json({ok:true,...totals});
 }catch(e){
  await c.query("rollback");
  return NextResponse.json(
   {error:e instanceof Error?e.message:String(e)},
   {status:400}
  );
 }finally{
  c.release();
 }
}

export async function DELETE(
 _req:NextRequest,
 {params}:{params:Promise<{id:string}>}
){
 const {denied,ctx}=await requireApiPermission("planning.edit");
 if(denied||!ctx)return denied!;
 const {id}=await params;
 const batchId=Number(id);

 if(!Number.isFinite(batchId))
  return NextResponse.json({error:"Batch không hợp lệ."},{status:400});

 const c=await getPool().connect();
 try{
  await c.query("begin");

  const batch=await getBatch(c,batchId,true);
  if(!batch)throw new Error("Không tìm thấy Batch.");
  if(!canPlanningMain(ctx,batch.standard_operation)){await c.query("rollback");return NextResponse.json({error:`Không có quyền sửa Main ${batch.standard_operation}.`},{status:403});}

  if(!["PLANNED","RELEASED"].includes(batch.status))
   throw new Error("Chỉ Batch PLANNED/RELEASED mới được xóa.");

  const jobsQ=await c.query(`
    select
      bj.id batch_job_id,
      bj.job_num,
      bj.planning_job_operation_id,
      p.planning_seq,
      p.standard_operation
    from planning_batch_job bj
    join planning_job_operation p
      on p.id=bj.planning_job_operation_id
    where bj.batch_id=$1
    order by bj.id
    for update of bj,p
  `,[batchId]);

  // Protect sequence integrity: do not remove an earlier Batch when the
  // same Job already has a later operation in another active Batch.
  for(const row of jobsQ.rows){
   const later=await c.query(`
     select p2.standard_operation,b2.batch_no
     from planning_job_operation p2
     join planning_batch_job bj2
       on bj2.planning_job_operation_id=p2.id
     join planning_batch b2
       on b2.id=bj2.batch_id
      and b2.status<>'CANCELLED'
     where p2.job_num=$1
       and p2.is_active=true
       and p2.planning_seq>$2
       and b2.id<>$3
     order by p2.planning_seq
     limit 1
   `,[row.job_num,row.planning_seq,batchId]);

   if(later.rowCount){
    throw new Error(
     `Không thể xóa ${batch.batch_no}: Job ${row.job_num} đã được plan công đoạn sau `+
     `${later.rows[0].standard_operation} trong ${later.rows[0].batch_no}.`
    );
   }
  }

  // Cancel schedule, if the Batch was scheduled but has not progressed.
  const running=await c.query(`
    select status
    from planning_schedule
    where batch_id=$1
      and status in ('RUNNING','COMPLETED')
    limit 1
  `,[batchId]).catch(()=>({rowCount:0,rows:[]} as any));

  if(running.rowCount)
   throw new Error("Batch đang RUNNING/COMPLETED nên không thể xóa.");

  await c.query(`
    update planning_schedule
    set status='CANCELLED',updated_at=now()
    where batch_id=$1 and status<>'CANCELLED'
  `,[batchId]).catch(()=>null);

  const affected=[...new Set(jobsQ.rows.map((r:any)=>String(r.job_num)))];

  // Free the unique planning_job_operation_id so each operation can be placed
  // into a new Batch after this Batch is cancelled.
  await c.query(`
    delete from planning_batch_job
    where batch_id=$1
  `,[batchId]);

  await c.query(`
    update planning_batch
    set status='CANCELLED',updated_at=now()
    where id=$1
  `,[batchId]);

  // The jobs from the deleted Batch become unplanned again.
  for(const row of jobsQ.rows){
   await c.query(`
     update planning_job_operation
     set status='ELIGIBLE',updated_at=now()
     where id=$1
   `,[row.planning_job_operation_id]);
  }

  // Recompute the remaining chain for each affected Job.
  for(const jobNum of affected){
   await recomputeJobPlanningStatus(c,jobNum);
  }

  await c.query("commit");
  await notifyInternalChange({dbClient:c,
   ctx,eventKey:"BATCH_DELETED",summary:`Deleted Batch ${batch.batch_no} · ${batch.standard_operation} · released ${affected.length} Job`,
   batchId,batchNo:String(batch.batch_no||""),standardOperation:String(batch.standard_operation||""),jobNums:affected,
   entityType:"BATCH",entityId:batchId,metadata:{releasedJobs:affected.length}
  });

  return NextResponse.json({
   ok:true,
   batchNo:batch.batch_no,
   releasedJobs:affected.length
  });
 }catch(e){
  await c.query("rollback");
  return NextResponse.json(
   {error:e instanceof Error?e.message:String(e)},
   {status:400}
  );
 }finally{
  c.release();
 }
}
