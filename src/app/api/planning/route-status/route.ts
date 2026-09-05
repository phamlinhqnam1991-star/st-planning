import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";
import {loadPlanningRouteStatus} from "@/lib/planning/route-status-data";

const MAX_IDS_PER_REQUEST=60;

export async function POST(req:Request){
 const {denied}=await requireApiPermission("planning.edit");
 if(denied)return denied;
 const body:unknown=await req.json().catch(()=>({}));
 const raw:unknown[]=
  body && typeof body==="object" && Array.isArray((body as {candidateIds?:unknown}).candidateIds)
   ? (body as {candidateIds:unknown[]}).candidateIds
   : [];
 const candidateIds:number[]=[...new Set<number>(
  raw
   .map((value):number=>Number(value))
   .filter((value):value is number=>Number.isFinite(value))
   .map((value):number=>Math.trunc(value))
 )].slice(0,MAX_IDS_PER_REQUEST);
 if(!candidateIds.length)return NextResponse.json({rows:[]});

 const c=await getPool().connect();
 try{
  const rows=await loadPlanningRouteStatus(c,candidateIds);
  return NextResponse.json({rows});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{c.release();}
}
