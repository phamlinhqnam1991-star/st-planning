import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";
import {loadStDashboardData} from "@/lib/dashboard-st-workload";

export async function GET(){
 const denied=await requireApiUser();
 if(denied)return denied;
 const c=await getPool().connect();
 try{
  // Scheduling Board reuses the SAME canonical Dashboard workload engine.
  // The client narrows these Main rows by each Schedule Area's configured
  // operation set; no Scheduling-specific workload formula is introduced.
  const data=await loadStDashboardData(c);
  return NextResponse.json({generatedAt:data.generatedAt,mainRows:data.mainRows});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{c.release();}
}
