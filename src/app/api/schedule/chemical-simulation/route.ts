import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {simulateChemicalDay} from "@/lib/chemical-line-schedule-server";

// =====================================================================
// Simulation cả ngày Chemical Line:
// Nhập danh sách lô (chỉ cần Recipe) + giờ bắt đầu mong muốn →
// hệ thống tự đề xuất FB + Loading Start cho từng lô theo thứ tự,
// tôn trọng lịch đã lưu, chuỗi Loading nối tiếp, NDT ≥ 1:30,
// tối đa 3 Process cùng lúc. Đọc-only — không ghi database.
// =====================================================================
import {requireApiUser} from "@/lib/api-auth";
export async function POST(req:Request){
 const denied=await requireApiUser();
 if(denied)return denied;
 const b=await req.json().catch(()=>({}));
 const desiredStart=new Date(String(b.desired_start||""));
 const allowedOperations=Array.isArray(b.allowed_operations)?b.allowed_operations.map((x:any)=>String(x||"").trim()).filter(Boolean):[];
 const runs=Array.isArray(b.runs)?b.runs.map((r:any)=>({
  recipe_key:String(r?.recipe_key||"").trim(),
  desired_start:r?.desired_start?String(r.desired_start):undefined,
  preferred_fb:r?.preferred_fb?String(r.preferred_fb):undefined,
  continuation_from:r?.continuation_from?String(r.continuation_from):undefined,
  batch_id:r?.batch_id?String(r.batch_id):undefined,
  manual_chain:Boolean(r?.manual_chain),
  chain_from_run:r?.chain_from_run!=null?Number(r.chain_from_run):undefined,
  chain_source_schedule_id:r?.chain_source_schedule_id!=null?Number(r.chain_source_schedule_id):undefined,
  overrides:r?.overrides?{
   processStart:r.overrides.processStart?String(r.overrides.processStart):null,
   ndtStart:r.overrides.ndtStart?String(r.overrides.ndtStart):null,
   unloadingStart:r.overrides.unloadingStart?String(r.overrides.unloadingStart):null
  }:undefined
 })).filter((r:any)=>r.recipe_key):[];

 if(Number.isNaN(desiredStart.getTime()))
  return NextResponse.json({error:"Giờ bắt đầu mong muốn không hợp lệ."},{status:400});
 if(!runs.length)
  return NextResponse.json({error:"Nhập ít nhất 1 lô (Recipe)."},{status:400});

 const c=await getPool().connect();
 try{
  const result=await simulateChemicalDay(c,{desiredStart,runs,allowedOperations});
  return NextResponse.json({ok:true,runs:result});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }finally{
  c.release();
 }
}
