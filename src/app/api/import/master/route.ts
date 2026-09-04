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
  const batchQ=await getPool().query(`
    insert into master_import_batch(file_name,storage_path,started_by,status)
    values($1,$2,null,'RUNNING')
    returning id
  `,[fileName,storagePath]);
  batchId=String(batchQ.rows[0]?.id||"");
  if(!batchId)throw new Error("Không tạo được Master Import Batch.");
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

   await getPool().query(`
    update master_import_batch
    set status='SUCCESS',source_rows=$2,routing_rows=$3,new_rows=$4,changed_rows=$5,
        unchanged_rows=$6,finished_at=now()
    where id=$1
   `,[batchId,result.sourceRows,result.routingRows,result.newRows,result.changedRows,result.unchangedRows]);
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
   try{await getPool().query(`update master_import_batch set status='FAILED',error_message=$2,finished_at=now() where id=$1`,[batchId,msg])}catch{}
  }
  return NextResponse.json({error:msg},{status:500});
 }finally{
  if(temp)try{await fs.unlink(temp)}catch{}
 }
}
