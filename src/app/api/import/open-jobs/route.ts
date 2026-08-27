import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {getPool} from "@/lib/db";
import {importOpenJobsXlsx} from "@/lib/import/open-job-import";
import {syncPlanningChains} from "@/lib/planning/sync-planning-chains";
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
   const {data:blob,error:downloadError}=await admin.storage
     .from("master-imports")
     .download(storagePath);

   if(downloadError||!blob)
     throw downloadError||new Error("Không tải được All Open Job từ Storage.");

   temp=path.join(os.tmpdir(),`${batchId}-all-open-job.xlsx`);
   await fs.writeFile(temp,Buffer.from(await blob.arrayBuffer()));

   const client=await getPool().connect();
   try{
     await client.query("begin");

     const result=await importOpenJobsXlsx(temp,client,batchId);
     const planning=await syncPlanningChains(client);

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

     return NextResponse.json({...result,planning});
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
