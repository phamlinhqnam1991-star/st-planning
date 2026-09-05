import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";
import {resolvePlanningView} from "@/lib/planning/planning-view-server";
import {loadPlanningCandidates} from "@/lib/planning/candidate-data";

export const maxDuration=30;

// v335: Refresh only Jobs affected by Create/Add Batch. This endpoint uses
// the exact same Candidate resolver as the full board, but constrains the SQL
// by job_num so creating a Batch never reloads the whole Planning tab.
export async function POST(req:NextRequest){
 const {denied,ctx}=await requireApiPermission("planning.edit");
 if(denied)return denied;

 const body=(await req.json().catch(()=>({}))) as Record<string,unknown>;
 const rawJobNums:unknown[]=Array.isArray(body.jobNums)?body.jobNums:[];
 const normalizedJobNums:string[]=rawJobNums
  .map((x:unknown)=>String(x??"").trim())
  .filter((x:string)=>x.length>0);
 const jobNums:string[]=Array.from(new Set<string>(normalizedJobNums)).slice(0,1000);

 if(!jobNums.length)return NextResponse.json({candidates:[],affectedJobNums:[]});

 const areaId=String(body.areaId??"").trim();
 const op=String(body.op??"").trim();
 if(op&&ctx?.scopes.PLANNING_MAIN.size&&!ctx.scopes.PLANNING_MAIN.has(op.toUpperCase()))return NextResponse.json({error:`Không có quyền sửa Main ${op}.`},{status:403});
 const recipeKey=String(body.recipeKey??"").trim();
 const previousBatchNo=String(body.previousBatchNo??"").trim();

 const c=await getPool().connect();
 try{
  const {stViewParams}=await resolvePlanningView(c,op,areaId);
  const data=await loadPlanningCandidates(c,{
   areaId,op,recipeKey,previousBatchNo,
   requestedPage:1,pageSize:null,stViewParams,light:true,deltaJobNums:jobNums
  });

  return NextResponse.json({
   candidates:Array.isArray(data.candidates)?data.candidates:[],
   affectedJobNums:jobNums
  },{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){
  return NextResponse.json(
   {error:e instanceof Error?e.message:String(e)},
   {status:500}
  );
 }finally{
  c.release();
 }
}
