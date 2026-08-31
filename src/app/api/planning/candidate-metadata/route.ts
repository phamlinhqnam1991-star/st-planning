import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";
import {resolvePlanningView} from "@/lib/planning/planning-view-server";
import {loadPlanningCandidateMetadata} from "@/lib/planning/candidate-data";

export const maxDuration=30;

export async function GET(req:NextRequest){
 const denied=await requireApiUser();
 if(denied)return denied;
 const sp=req.nextUrl.searchParams;
 const areaId=(sp.get("area")||"").trim();
 const op=(sp.get("op")||"").trim();
 const recipeKey=(sp.get("recipe")||"").trim();
 const c=await getPool().connect();
 try{
  const {initialView,serverViews}=await resolvePlanningView(c,op,areaId);
  const metadata=await loadPlanningCandidateMetadata(c,{op,recipeKey});
  return NextResponse.json({...metadata,initialView,serverViews});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{c.release();}
}
