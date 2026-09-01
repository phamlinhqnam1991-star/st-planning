import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";
import {debugPlanningJob} from "@/lib/planning/sync-planning-chains";
import {loadPlanningRouteStatus} from "@/lib/planning/route-status-data";

const clean=(v:unknown)=>String(v??"").trim();

export async function POST(req:Request){
 const denied=await requireApiUser();
 if(denied)return denied;
 try{
  const body:unknown=await req.json().catch(()=>({}));
  const obj=body&&typeof body==="object"?body as Record<string,unknown>:{};
  const jobNum=clean(obj.job_num);
  const candidateId=Number(obj.candidate_id);
  if(!jobNum)return NextResponse.json({error:"Thiếu Job Number."},{status:400});

  const c=await getPool().connect();
  try{
   const debug=await debugPlanningJob(c,jobNum);
   let routeStatus:any[]=[];
   if(Number.isFinite(candidateId)&&candidateId>0){
    const rows=await loadPlanningRouteStatus(c,[Math.trunc(candidateId)]);
    routeStatus=Array.isArray(rows[0]?.route_status)?rows[0].route_status:[];
   }

   // Mirror Planning Board computeSelectableTarget() so the debug conclusion is
   // about the CHECKBOX the planner sees, not only persisted ELIGIBLE rows.
   if(Number.isFinite(candidateId)&&candidateId>0){
    const candidateRow=(debug.persistedChain||[]).find((x:any)=>Number(x.id)===Math.trunc(candidateId));
    const persistedReady=routeStatus.find((x:any)=>
     clean(x.route_status).toUpperCase()==="READY" && Number.isFinite(Number(x.planning_job_operation_id))
    );
    const computedReady=routeStatus.find((x:any)=>clean(x.route_status).toUpperCase()==="READY");
    const ownEligible=candidateRow&&clean(candidateRow.status).toUpperCase()==="ELIGIBLE";
    const ownComputedReady=candidateRow&&computedReady&&
     clean(computedReady.standard_operation).toUpperCase()===clean(candidateRow.standard_operation).toUpperCase();
    const boardSelectable=Boolean(persistedReady||ownEligible||ownComputedReady);
    debug.result.selectable=boardSelectable;
    debug.result.checkboxReason=persistedReady
     ?`Route Matrix có READY persisted: ${persistedReady.standard_operation} · Planning ID ${persistedReady.planning_job_operation_id}.`
     :ownEligible
      ?`Candidate Planning Operation ${candidateRow.standard_operation} đang ELIGIBLE.`
      :ownComputedReady
       ?`Route Matrix tính ${computedReady.standard_operation}=READY và đây là chính Candidate Main hiện tại.`
       :(debug.result.checkboxReason||"Không có READY/ELIGIBLE target để mở checkbox.");
   }
   return NextResponse.json({ok:true,...debug,routeStatus});
  }finally{c.release();}
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }
}
