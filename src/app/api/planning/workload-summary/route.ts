import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";
import {loadPlanningWorkloadSummary} from "@/lib/planning/workload-summary";

export async function GET(req:Request){
 const denied=await requireApiUser();
 if(denied)return denied;

 const url=new URL(req.url);
 const areaIdRaw=String(url.searchParams.get("areaId")||"").trim();
 const op=String(url.searchParams.get("op")||"").trim();
 const areaId=areaIdRaw?Number(areaIdRaw):null;
 if(areaIdRaw&&(!Number.isFinite(areaId)||Number(areaId)<=0)){
  return NextResponse.json({error:"areaId không hợp lệ."},{status:400});
 }

 const c=await getPool().connect();
 try{
  const result=await loadPlanningWorkloadSummary(c,{areaId:areaId||null,areaIdRaw,op});
  return NextResponse.json(result);
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{c.release();}
}
