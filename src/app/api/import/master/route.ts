import {NextResponse} from "next/server";
import {invalidateConfigHealth} from "@/lib/config/config-health";
import {revalidateTag} from "next/cache";
import {createAdminClient} from "@/lib/supabase/admin";
import {ensureImportStorageBucket,IMPORT_STORAGE_BUCKET} from "@/lib/storage/import-storage";
import {getPool} from "@/lib/db";
import {rebuildAllStRoutingDerived} from "@/lib/st-operation-flow";
import {syncPlanningChains} from "@/lib/planning/sync-planning-chains";
import {startIntermediateBridgeRebuild} from "@/lib/planning/intermediate-bridge-segments";
import {invalidatePlanningStaticData} from "@/lib/planning/planning-static-cache";
import {importMasterXlsx,seedRoutingConfig} from "@/lib/import/master-import";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const runtime="nodejs";
export const maxDuration=300;

async function activeRoutingCodes(client:any){
 const q=await client.query(`select routing_code from md_st_routing_summary where is_active=true order by routing_code`);
 return new Set<string>(q.rows.map((r:any)=>String(r.routing_code)));
}

export async function POST(req:Request){
 let batchId="";
 let temp="";
 try{
  const {path:storagePath,fileName}=await req.json();
  if(!storagePath||!String(fileName).toLowerCase().endsWith(".xlsx"))return NextResponse.json({error:"Chỉ chấp nhận file .xlsx"},{status:400});
  const admin=createAdminClient();
  await ensureImportStorageBucket(admin);
  const {data:b,error:bErr}=await admin.from("master_import_batch").insert({file_name:fileName,storage_path:storagePath,started_by:null,status:"RUNNING"}).select("id").single();
  if(bErr)throw bErr;
  batchId=b.id;
  const {data:blob,error:dErr}=await admin.storage.from(IMPORT_STORAGE_BUCKET).download(storagePath);
  if(dErr||!blob)throw dErr||new Error("Không tải được file từ Storage");
  temp=path.join(os.tmpdir(),`${batchId}.xlsx`);
  await fs.writeFile(temp,Buffer.from(await blob.arrayBuffer()));

  const client=await getPool().connect();
  try{
   await client.query("begin");
   await seedRoutingConfig(client);
   const oldCodes=await activeRoutingCodes(client);
   const result=await importMasterXlsx(temp,client,batchId);

   // v298: rebuild the standardized routing first, but do NOT run full Bridge
   // discovery in this request. Compare deterministic routing codes before/after
   // import and enqueue only NEW/REMOVED signatures for an incremental Bridge run.
   await rebuildAllStRoutingDerived(client);
   const newCodes=await activeRoutingCodes(client);
   const affected=[...new Set<string>([
    ...[...oldCodes].filter(x=>!newCodes.has(x)),
    ...[...newCodes].filter(x=>!oldCodes.has(x))
   ])].sort();
   const bridgeRebuildRun=affected.length
    ?await startIntermediateBridgeRebuild(client,{mode:"INCREMENTAL",routingCodes:affected,chunkSize:150,cancelExisting:true})
    :null;

   // Planning Chain consumes the last ACTIVE Bridge snapshot. The incremental
   // Bridge run is published later by short client-driven requests.
   await syncPlanningChains(client);
   await client.query("commit");

   await admin.from("master_import_batch").update({
    status:"SUCCESS",source_rows:result.sourceRows,routing_rows:result.routingRows,
    new_rows:result.newRows,changed_rows:result.changedRows,unchanged_rows:result.unchangedRows,
    finished_at:new Date().toISOString()
   }).eq("id",batchId);
   invalidatePlanningStaticData();
   invalidateConfigHealth();
   // v341: refresh cache danh sách requirement code (MD:REQ:*) sau import master.
   revalidateTag("config-recipe",{expire:0});
   return NextResponse.json({...result,bridgeRebuildRun,affectedRoutingCodes:affected.length});
  }catch(e){
   await client.query("rollback");throw e;
  }finally{client.release()}
 }catch(e){
  const msg=e instanceof Error?e.message:String(e);
  if(batchId){
   try{await createAdminClient().from("master_import_batch").update({status:"FAILED",error_message:msg,finished_at:new Date().toISOString()}).eq("id",batchId)}catch{}
  }
  return NextResponse.json({error:msg},{status:500});
 }finally{
  if(temp)try{await fs.unlink(temp)}catch{}
 }
}
