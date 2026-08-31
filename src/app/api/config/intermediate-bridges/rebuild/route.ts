import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {
 cancelIntermediateBridgeRebuild,
 finalizeIntermediateBridgeRebuild,
 getIntermediateBridgeRebuildOverview,
 markIntermediateBridgeRebuildFailed,
 processIntermediateBridgeRebuildChunk,
 startIntermediateBridgeRebuild,
 type BridgeRebuildMode
} from "@/lib/planning/intermediate-bridge-segments";
import {invalidatePlanningStaticData} from "@/lib/planning/planning-static-cache";
import {invalidateConfigHealth} from "@/lib/config/config-health";

export const runtime="nodejs";
// Every request is intentionally short; Vercel Hobby's normal timeout is enough.
export const maxDuration=60;

const cleanCodes=(v:unknown)=>Array.isArray(v)?v.map(x=>String(x??"").trim().toUpperCase()).filter(Boolean):[];

export async function GET(){
 const c=await getPool().connect();
 try{
  return NextResponse.json({ok:true,...await getIntermediateBridgeRebuildOverview(c)});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{c.release()}
}

export async function POST(req:Request){
 const c=await getPool().connect();
 let runId="";
 try{
  const body=await req.json().catch(()=>({}));
  const action=String(body.action||"start").toLowerCase();
  runId=String(body.run_id||"");
  await c.query("begin");

  if(action==="start"){
   const mode=(String(body.mode||"FULL").toUpperCase()==="INCREMENTAL"?"INCREMENTAL":"FULL") as BridgeRebuildMode;
   const run=await startIntermediateBridgeRebuild(c,{
    mode,
    routingCodes:cleanCodes(body.routing_codes),
    chunkSize:Number(body.chunk_size||150),
    cancelExisting:Boolean(body.cancel_existing)
   });
   await c.query("commit");
   return NextResponse.json({ok:true,run,resumed:run.processedRoutings>0});
  }

  if(!runId){
   await c.query("rollback");
   return NextResponse.json({error:"Thiếu run_id."},{status:400});
  }

  if(action==="process"){
   const result=await processIntermediateBridgeRebuildChunk(c,runId,Number(body.chunk_size||0)||undefined);
   await c.query("commit");
   return NextResponse.json({ok:true,...result});
  }

  if(action==="finalize"){
   const result=await finalizeIntermediateBridgeRebuild(c,runId);
   await c.query("commit");
   invalidatePlanningStaticData();
   invalidateConfigHealth();
   return NextResponse.json({ok:true,...result,planning_chain_rebuild_required:true});
  }

  if(action==="cancel"){
   const run=await cancelIntermediateBridgeRebuild(c,runId);
   await c.query("commit");
   return NextResponse.json({ok:true,run});
  }

  await c.query("rollback");
  return NextResponse.json({error:`Action không hỗ trợ: ${action}`},{status:400});
 }catch(e){
  try{await c.query("rollback")}catch{}
  const message=e instanceof Error?e.message:String(e);
  if(runId){
   try{
    await c.query("begin");
    await markIntermediateBridgeRebuildFailed(c,runId,message);
    await c.query("commit");
   }catch{
    try{await c.query("rollback")}catch{}
   }
  }
  return NextResponse.json({error:message},{status:500});
 }finally{c.release()}
}
