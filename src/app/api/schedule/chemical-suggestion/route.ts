import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {assertResourceAndChemicalCapacity,resolveChemicalScheduleWindow} from "@/lib/chemical-line-schedule-server";

import {requireApiUser} from "@/lib/api-auth";
export async function POST(req:Request){
 const denied=await requireApiUser();
 if(denied)return denied;
 const b=await req.json().catch(()=>({}));
 const batchId=Number(b.batch_id||0);const requested=new Date(String(b.planned_start||""));
 const manualDuration=Number(b.duration_minutes||0);const recipeKey=String(b.recipe_key||"").trim();
 if(Number.isNaN(requested.getTime())||manualDuration<=0)
  return NextResponse.json({error:"Start và Process Duration hợp lệ là bắt buộc."},{status:400});
 const overrides={
  processStart:b.process_start_override?new Date(String(b.process_start_override)):null,
  ndtStart:b.ndt_start_override?new Date(String(b.ndt_start_override)):null,
  unloadingStart:b.unloading_start_override?new Date(String(b.unloading_start_override)):null
 };
 const c=await getPool().connect();
 try{
  await c.query("begin");
  const batchQ=batchId?await c.query(`select b.total_qty,b.total_surface_dm2,b.process_minutes,r.recipe_no
   from planning_batch b left join md_process_recipe r on r.recipe_key=b.recipe_key and r.is_active=true where b.id=$1`,[batchId]):null;
  const recipeQ=!batchId&&recipeKey?await c.query(`select recipe_no from md_process_recipe where recipe_key=$1 and is_active=true`,[recipeKey]):null;
  const batch=batchQ?.rows[0]||{};const recipeNo=batch.recipe_no||recipeQ?.rows[0]?.recipe_no||null;
  const resources=(await c.query(`select resource_code,resource_group,max_concurrent from md_schedule_resource
   where resource_group='CHEMICAL_LINE' and is_active=true order by sort_order,resource_code`)).rows;
  for(let offset=0;offset<=7*24*60;offset+=15){
   const loadingStart=new Date(requested.getTime()+offset*60000);
   const window=await resolveChemicalScheduleWindow(c,{loadingStart,processMinutes:manualDuration,
    totalQty:Number(batch.total_qty||0),totalSurfaceDm2:Number(batch.total_surface_dm2||0),recipeNo,overrides});
   for(const resource of resources){
    try{
     await assertResourceAndChemicalCapacity(c,{resourceCode:resource.resource_code,resourceGroup:"CHEMICAL_LINE",window,maxConcurrent:Number(resource.max_concurrent||3)});
     await c.query("rollback");
     return NextResponse.json({ok:true,resource_code:resource.resource_code,planned_start:loadingStart.toISOString(),planned_end:window.unloadingEnd.toISOString(),delayed_minutes:offset});
    }catch{}
   }
  }
  throw new Error("Không tìm thấy Flybar available trong 7 ngày tiếp theo.");
 }catch(e){await c.query("rollback").catch(()=>{});return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400})}
 finally{c.release()}
}
