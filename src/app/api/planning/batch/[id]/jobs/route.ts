import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {refreshBatchTotals,recomputeJobPlanningStatus} from "@/lib/planning/batch-utils";

const clean=(v:unknown)=>String(v??"").trim();

export async function POST(
 req:NextRequest,
 {params}:{params:Promise<{id:string}>}
){
 const {id}=await params;
 const batchId=Number(id);
 const b=await req.json();
 const ids=Array.isArray(b.planning_job_operation_ids)
   ? b.planning_job_operation_ids.map(Number).filter(Number.isFinite)
   : [];

 if(!Number.isFinite(batchId)||!ids.length)
   return NextResponse.json({error:"Batch hoặc Candidate Job không hợp lệ."},{status:400});

 const c=await getPool().connect();
 try{
   await c.query("begin");

   const batchQ=await c.query(`
     select id,standard_operation,recipe_key,status
     from planning_batch
     where id=$1
     for update
   `,[batchId]);

   if(!batchQ.rowCount)throw new Error("Không tìm thấy Batch.");
   const batch=batchQ.rows[0];

   if(!["PLANNED","RELEASED"].includes(batch.status))
     throw new Error("Batch hiện tại không cho phép thêm Job.");

   const q=await c.query(`
     select
       p.id,p.job_num,p.source_operation_code,p.standard_operation,p.recipe_key,p.status,
       j.part_num,j.revision_num,
       coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0) plan_qty,
       coalesce(
         j.total_surface,
         coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)
           * coalesce(j.surface_per_part_dm2,0),
         0
       ) plan_surface
     from planning_job_operation p
     join open_job_current j on j.job_num=p.job_num
     where p.id=any($1::bigint[])
       and p.is_active=true
       and j.is_open=true
     for update of p
   `,[ids]);

   if(q.rowCount!==ids.length)
     throw new Error("Một số Job không còn hợp lệ.");

   for(const r of q.rows){
     if(r.status!=="ELIGIBLE")
       throw new Error(`Job ${r.job_num} không còn ELIGIBLE.`);

     if(r.standard_operation!==batch.standard_operation)
       throw new Error(`Job ${r.job_num} không cùng công đoạn ${batch.standard_operation}.`);

     if(batch.recipe_key){
       if(r.recipe_key && r.recipe_key!==batch.recipe_key)
         throw new Error(`Job ${r.job_num} có Recipe khác Batch.`);

       if(!r.recipe_key){
         const allowed=await c.query(`
           select 1
           from md_operation_code_recipe
           where operation_code=$1
             and recipe_key=$2
             and is_active=true
           limit 1
         `,[r.source_operation_code,batch.recipe_key]);

         if(!allowed.rowCount)
           throw new Error(`Recipe Batch không hợp lệ cho Job ${r.job_num}.`);
       }
     }
   }

   for(const r of q.rows){
     await c.query(`
       insert into planning_batch_job(
         batch_id,planning_job_operation_id,job_num,
         source_operation_code,standard_operation,qty,surface_dm2
       )
       values($1,$2,$3,$4,$5,$6,$7)
       on conflict(planning_job_operation_id) do nothing
     `,[
       batchId,r.id,r.job_num,r.source_operation_code,r.standard_operation,
       r.plan_qty,r.plan_surface
     ]);

     await c.query(`
       update planning_job_operation
       set status='PLANNED',
           recipe_key=coalesce(recipe_key,$2),
           updated_at=now()
       where id=$1
     `,[r.id,batch.recipe_key]);

     await recomputeJobPlanningStatus(c,r.job_num);
   }

   const totals=await refreshBatchTotals(c,batchId);
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
     select status from planning_batch where id=$1 for update
   `,[batchId]);
   if(!batchQ.rowCount)throw new Error("Không tìm thấy Batch.");
   if(!["PLANNED","RELEASED"].includes(batchQ.rows[0].status))
     throw new Error("Batch hiện tại không cho phép bỏ Job.");

   const rowQ=await c.query(`
     select
       bj.id,bj.job_num,bj.planning_job_operation_id,
       p.planning_seq
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
