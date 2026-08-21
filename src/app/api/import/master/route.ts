import { NextResponse } from "next/server"; import { createAdminClient } from "@/lib/supabase/admin"; import { getPool } from "@/lib/db"; import { importMasterXlsx,seedRoutingConfig } from "@/lib/import/master-import"; import fs from "node:fs/promises"; import path from "node:path"; import os from "node:os";
export const runtime="nodejs"; export const maxDuration=300;
export async function POST(req:Request){
 let batchId=""; let temp=""; try{
  const {path:storagePath,fileName}=await req.json(); if(!storagePath||!String(fileName).toLowerCase().endsWith(".xlsx"))return NextResponse.json({error:"Chỉ chấp nhận file .xlsx"},{status:400});
  const admin=createAdminClient(); const {data:b,error:bErr}=await admin.from("master_import_batch").insert({file_name:fileName,storage_path:storagePath,started_by:null,status:"RUNNING"}).select("id").single(); if(bErr)throw bErr; batchId=b.id;
  const {data:blob,error:dErr}=await admin.storage.from("master-imports").download(storagePath); if(dErr||!blob)throw dErr||new Error("Không tải được file từ Storage");
  temp=path.join(os.tmpdir(),`${batchId}.xlsx`); await fs.writeFile(temp,Buffer.from(await blob.arrayBuffer()));
  const client=await getPool().connect(); try{
   await client.query("begin"); await seedRoutingConfig(client);
   const result=await importMasterXlsx(temp,client,batchId); await client.query("select public.rebuild_st_routing($1)",[batchId]); await client.query("commit");
   await admin.from("master_import_batch").update({status:"SUCCESS",source_rows:result.sourceRows,routing_rows:result.routingRows,new_rows:result.newRows,changed_rows:result.changedRows,unchanged_rows:result.unchangedRows,finished_at:new Date().toISOString()}).eq("id",batchId);
   return NextResponse.json(result);
  }catch(e){await client.query("rollback");throw e}finally{client.release()}
 }catch(e){const msg=e instanceof Error?e.message:String(e); if(batchId){try{await createAdminClient().from("master_import_batch").update({status:"FAILED",error_message:msg,finished_at:new Date().toISOString()}).eq("id",batchId)}catch{}} return NextResponse.json({error:msg},{status:500})}finally{if(temp)try{await fs.unlink(temp)}catch{}}
}
