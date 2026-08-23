import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {syncPlanningChains} from "@/lib/planning/sync-planning-chains";

export const runtime="nodejs";
export const maxDuration=300;

export async function POST(){
 const c=await getPool().connect();
 try{
   await c.query("begin");
   const result=await syncPlanningChains(c);
   await c.query("commit");
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
