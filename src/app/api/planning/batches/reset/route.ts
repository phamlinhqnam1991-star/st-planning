import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {recomputeJobPlanningStatus} from "@/lib/planning/batch-utils";
import {notifyInternalChange} from "@/lib/internal-chat/server";

import {requireApiPermission} from "@/lib/security/api";
export async function POST(){
 const {denied,ctx}=await requireApiPermission("planning.edit");
 if(denied||!ctx)return denied!;
 const c=await getPool().connect();

 try{
  await c.query("begin");

  const running=await c.query(`
    select count(*)::int count
    from planning_schedule
    where status in ('RUNNING','COMPLETED')
  `);

  if(Number(running.rows[0]?.count||0)>0){
   throw new Error(
    "Không thể Reset All: đang có Schedule RUNNING/COMPLETED. Hãy xử lý các lô đã chạy trước."
   );
  }

  const batchCountQ=await c.query(`
    select count(*)::int count
    from planning_batch
    where status<>'CANCELLED'
  `);

  const jobCountQ=await c.query(`
    select count(distinct job_num)::int count
    from planning_batch_job
    where batch_id in (
      select id from planning_batch where status<>'CANCELLED'
    )
  `);

  // Remove active schedules first so the reset batches disappear from Board Điều Độ.
  await c.query(`
    update planning_schedule
    set status='CANCELLED',updated_at=now()
    where status<>'CANCELLED'
  `);

  // Detach every Job from every active Batch.
  await c.query(`
    delete from planning_batch_job
    where batch_id in (
      select id
      from planning_batch
      where status<>'CANCELLED'
    )
  `);

  // Keep history / batch numbers, but make every current Batch inactive.
  await c.query(`
    update planning_batch
    set status='CANCELLED',updated_at=now()
    where status<>'CANCELLED'
  `);

  // Rebuild all current planning chains from the first unplanned operation.
  const jobs=await c.query(`
    select distinct job_num
    from planning_job_operation
    where is_active=true
    order by job_num
  `);

  await c.query(`
    update planning_job_operation
    set status='LOCKED',updated_at=now()
    where is_active=true
  `);

  for(const row of jobs.rows){
   await recomputeJobPlanningStatus(c,String(row.job_num));
  }

  await c.query("commit");
  await notifyInternalChange({ctx,eventKey:"BATCH_RESET_ALL",summary:`Reset all active Planning Batches · ${Number(batchCountQ.rows[0]?.count||0)} Batch · ${Number(jobCountQ.rows[0]?.count||0)} Job released`,entityType:"PLANNING",entityId:"RESET_ALL",metadata:{resetBatches:Number(batchCountQ.rows[0]?.count||0),releasedJobs:Number(jobCountQ.rows[0]?.count||0)}});

  return NextResponse.json({
   ok:true,
   resetBatches:Number(batchCountQ.rows[0]?.count||0),
   releasedJobs:Number(jobCountQ.rows[0]?.count||0)
  });
 }catch(error){
  await c.query("rollback");

  return NextResponse.json(
   {error:error instanceof Error?error.message:String(error)},
   {status:400}
  );
 }finally{
  c.release();
 }
}
