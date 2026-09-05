import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";
import {loadStWorkloadQuickView,type StWorkloadQuickViewStatus} from "@/lib/dashboard-st-workload";

const ALLOWED=new Set<StWorkloadQuickViewStatus>([
 "READY_PREV_SCHEDULED","READY_PREV_UNSCHEDULED","WAIT_NEXT_MAIN","WAIT_FUTURE_MAIN","HOLD"
]);

export async function GET(req:NextRequest){
 const {denied}=await requireApiPermission("schedule.view");
 if(denied)return denied;
 const url=new URL(req.url);
 const standardOperation=String(url.searchParams.get("standardOperation")||"").trim();
 const recipeKey=String(url.searchParams.get("recipeKey")||"").trim()||null;
 const previousMain=String(url.searchParams.get("previousMain")||"").trim()||null;
 const status=String(url.searchParams.get("status")||"").trim() as StWorkloadQuickViewStatus;
 if(!standardOperation||!ALLOWED.has(status))return NextResponse.json({error:"Thiếu Main Operation hoặc workload bucket không hợp lệ."},{status:400});
 const c=await getPool().connect();
 try{
  const data=await loadStWorkloadQuickView(c,{standardOperation,recipeKey,status,previousMain});
  return NextResponse.json(data);
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{c.release();}
}
