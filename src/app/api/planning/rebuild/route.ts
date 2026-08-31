import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {syncPlanningChains} from "@/lib/planning/sync-planning-chains";
import {invalidateConfigHealth} from "@/lib/config/config-health";

import {requireApiUser} from "@/lib/api-auth";
export const runtime="nodejs";
export const maxDuration=300;

export async function POST(){
 const denied=await requireApiUser();
 if(denied)return denied;
 const c=await getPool().connect();
 try{
   await c.query("begin");
   // v288 rebuilds the canonical live chain directly from each Job AllOperation
   // and reconciles Batch/Schedule history during the same build. No second
   // status-repair pass is needed.
   const result=await syncPlanningChains(c);
   await c.query("commit");
   invalidateConfigHealth();
   return NextResponse.json({ok:true,...result});
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
