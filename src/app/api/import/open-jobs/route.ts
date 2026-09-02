import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {ensureImportStorageBucket,IMPORT_STORAGE_BUCKET} from "@/lib/storage/import-storage";
import {getPool} from "@/lib/db";
import {importOpenJobsXlsx} from "@/lib/import/open-job-import";
import {syncPlanningChains} from "@/lib/planning/sync-planning-chains";
import {invalidatePlanningStaticData} from "@/lib/planning/planning-static-cache";
import {invalidateConfigHealth} from "@/lib/config/config-health";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const runtime="nodejs";
export const maxDuration=300;

export async function POST(req:Request){
 let batchId="";
 let temp="";

 try{
   const {path:storagePath,fileName}=await req.json();

   if(!storagePath||!String(fileName).toLowerCase().endsWith(".xlsx"))
     return NextResponse.json({error:"Chỉ chấp nhận file .xlsx"},{status:400});

   const c=await getPool().connect();
   try{
     const q=await c.query(`
       insert into open_job_import_batch(file_name,storage_path,status)
       values($1,$2,'RUNNING')
       returning id
     `,[fileName,storagePath]);
     batchId=q.rows[0].id;
   }finally{c.release()}

   const admin=createAdminClient();
   await ensureImportStorageBucket(admin);
   const {data:blob,error:downloadError}=await admin.storage
     .from(IMPORT_STORAGE_BUCKET)
     .download(storagePath);

   if(downloadError||!blob)
     throw downloadError||new Error("Không tải được All Open Job từ Storage.");

   temp=path.join(os.tmpdir(),`${batchId}-all-open-job.xlsx`);
   await fs.writeFile(temp,Buffer.from(await blob.arrayBuffer()));

   const client=await getPool().connect();
   try{
     await client.query("begin");

     const result=await importOpenJobsXlsx(temp,client,batchId);

     // v377: only rebuild live Planning Chains for NEW / CHANGED Jobs.
     // UNCHANGED Jobs are intentionally skipped; CLOSED Jobs only deactivate
     // their live chain. Historical Batch/Schedule records remain untouched.
     const planning=await syncPlanningChains(client,{
       jobNums:result.affectedOpenJobNums,
       closedJobNums:result.closedJobNums
     });

     // Detect RAW NextOperation codes introduced/reached by this import that do
     // not yet have an active ST Scope or active Intermediate Bridge. They are
     // not auto-classified: planner configures them once in ST Operation Flow.
     const unconfiguredOperations=result.affectedOpenJobNums.length
       ?(await client.query(`
         select
           upper(trim(j.next_operation)) operation_code,
           count(*)::int affected_jobs
         from open_job_current j
         where j.is_open=true
           and j.job_num=any($1::text[])
           and nullif(trim(coalesce(j.next_operation,'')),'') is not null
           and not exists(
             select 1 from md_st_operation_scope s
             where s.is_active=true
               and upper(trim(s.operation_code))=upper(trim(j.next_operation))
           )
           and not exists(
             select 1
             from md_intermediate_bridge_operation bo
             join md_intermediate_bridge_segment bs
               on bs.id=bo.segment_id and bs.is_active=true
             where upper(trim(bo.operation_code))=upper(trim(j.next_operation))
           )
         group by upper(trim(j.next_operation))
         order by affected_jobs desc,operation_code
       `,[result.affectedOpenJobNums])).rows
       :[];

     // v188: quét lại Open Job Column Values sau mỗi lần import để bảng
     // cấu hình Batch Key / Recipe Rules luôn mới.
     await client.query(`select public.rebuild_open_job_column_values()`);

     await client.query(`
       update open_job_import_batch
       set status='SUCCESS',
           source_rows=$2,
           new_jobs=$3,
           changed_jobs=$4,
           unchanged_jobs=$5,
           closed_jobs=$6,
           finished_at=now()
       where id=$1
     `,[
       batchId,
       result.sourceRows,
       result.newJobs,
       result.changedJobs,
       result.unchangedJobs,
       result.closedJobs
     ]);

     await client.query("commit");
     invalidatePlanningStaticData();
     invalidateConfigHealth();

     const {affectedOpenJobNums,closedJobNums,...publicResult}=result;
     return NextResponse.json({
       ...publicResult,
       planning,
       unconfiguredOperations,
       incrementalSync:{
         affectedOpenJobs:affectedOpenJobNums.length,
         closedJobs:closedJobNums.length,
         unchangedSkipped:result.unchangedJobs
       }
     });
   }catch(e){
     await client.query("rollback");
     throw e;
   }finally{client.release()}

 }catch(e){
   const message=e instanceof Error?e.message:String(e);

   if(batchId){
     const c=await getPool().connect();
     try{
       await c.query(`
         update open_job_import_batch
         set status='FAILED',error_message=$2,finished_at=now()
         where id=$1
       `,[batchId,message]);
     }catch{}
     finally{c.release()}
   }

   return NextResponse.json({error:message},{status:500});
 }finally{
   if(temp)try{await fs.unlink(temp)}catch{}
 }
}
