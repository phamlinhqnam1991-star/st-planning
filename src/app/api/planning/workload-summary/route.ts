import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";
import {loadPlanningWorkloadSummary} from "@/lib/planning/workload-summary";

export async function GET(req:Request){
 const {denied,ctx}=await requireApiPermission("planning.view");
 if(denied||!ctx)return denied!;

 const url=new URL(req.url);
 const areaIdRaw=String(url.searchParams.get("areaId")||"").trim();
 const op=String(url.searchParams.get("op")||"").trim();
 const areaId=areaIdRaw?Number(areaIdRaw):null;
 if(areaIdRaw&&(!Number.isFinite(areaId)||Number(areaId)<=0)){
  return NextResponse.json({error:"areaId không hợp lệ."},{status:400});
 }

 const c=await getPool().connect();
 try{
  if(op&&ctx.scopes.PLANNING_MAIN.size&&!ctx.scopes.PLANNING_MAIN.has(op.toUpperCase()))return NextResponse.json({error:`Không có quyền xem Main ${op}.`},{status:403});
  const result=await loadPlanningWorkloadSummary(c,{areaId:areaId||null,areaIdRaw,op});
  if(ctx.scopes.PLANNING_MAIN.size){
   result.rows=result.rows.filter((r:any)=>ctx.scopes.PLANNING_MAIN.has(String(r.standard_operation||"").toUpperCase()));
   const zero=()=>({jobs:0,qty:0,surface:0});
   const totals:any={READY:zero(),READY_PREV_SCHEDULED:zero(),READY_PREV_UNSCHEDULED:zero(),WAIT:zero(),HOLD:zero()};
   const add=(target:any,metric:any)=>{
    target.jobs+=Number(metric?.jobs||0);
    target.qty+=Number(metric?.qty||0);
    target.surface+=Number(metric?.surface||0);
   };
   for(const r of result.rows as any[]){
    add(totals.READY,r.ready);
    add(totals.READY_PREV_SCHEDULED,r.readyPrevScheduled);
    add(totals.READY_PREV_UNSCHEDULED,r.readyPrevUnscheduled);
    add(totals.WAIT,r.wait);
    add(totals.HOLD,r.hold);
   }
   result.totals=totals;
  }
  return NextResponse.json(result);
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{c.release();}
}
