import {NextResponse} from "next/server";
import {revalidateTag} from "next/cache";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createAdminClient} from "@/lib/supabase/admin";
import {ensureImportStorageBucket,IMPORT_STORAGE_BUCKET} from "@/lib/storage/import-storage";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";
import {invalidateLiveRecipeContext} from "@/lib/planning/planning-static-cache";
import {rebuildProcessRequirementsOnly} from "@/lib/import/process-requirement-rebuild";

export const runtime="nodejs";
export const maxDuration=300;

function normalizeStoragePath(value:unknown){
 const storagePath=String(value??"").trim().replace(/^\/+/,"");
 if(!storagePath||storagePath.includes("..")||storagePath.includes("\\"))return "";
 return storagePath;
}

export async function POST(req:Request){
 const {denied}=await requireApiPermission("import.execute");
 if(denied)return denied;
 let temp="";
 let storagePath="";
 const admin=createAdminClient();
 try{
  const body=await req.json().catch(()=>({}));
  storagePath=normalizeStoragePath(body.path);
  const fileName=String(body.fileName??"").trim();
  const confirmation=String(body.confirmation??"").trim().toUpperCase();
  if(confirmation!=="REBUILD")return NextResponse.json({error:"Enter REBUILD exactly to confirm."},{status:400});
  if(!storagePath||!storagePath.startsWith("master/")||!fileName.toLowerCase().endsWith(".xlsx"))
   return NextResponse.json({error:"Chỉ chấp nhận file Master .xlsx hợp lệ."},{status:400});

  await ensureImportStorageBucket(admin);
  const {data:blob,error:downloadError}=await admin.storage.from(IMPORT_STORAGE_BUCKET).download(storagePath);
  if(downloadError||!blob)throw downloadError||new Error("Không tải được file Master từ Storage.");
  temp=path.join(os.tmpdir(),`process_requirement_${Date.now()}_${Math.random().toString(36).slice(2)}.xlsx`);
  await fs.writeFile(temp,Buffer.from(await blob.arrayBuffer()));

  const c=await getPool().connect();
  try{
   const result=await rebuildProcessRequirementsOnly(temp,c);
   invalidateLiveRecipeContext();
   revalidateTag("config-recipe",{expire:0});
   return NextResponse.json({ok:true,...result});
  }finally{c.release();}
 }catch(error){
  return NextResponse.json({error:error instanceof Error?error.message:String(error)},{status:500});
 }finally{
  if(temp)try{await fs.unlink(temp)}catch{}
  // This upload is only a temporary rebuild source; remove it after processing to avoid Storage growth.
  if(storagePath)try{await admin.storage.from(IMPORT_STORAGE_BUCKET).remove([storagePath])}catch{}
 }
}
