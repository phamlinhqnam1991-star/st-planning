import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
export async function PUT(req:NextRequest){
 try{
  await requireUser(); const {area_id,groups}=await req.json(); const areaId=Number(area_id); if(!areaId||!Array.isArray(groups))return NextResponse.json({error:"Dữ liệu không hợp lệ."},{status:400});
  const clean=[...new Set(groups.map((x:unknown)=>String(x).trim()).filter(Boolean))]; const s=createAdminClient();
  const {data:current,error}=await s.from("md_area_operation_group").select("st_group").eq("area_id",areaId).eq("is_active",true); if(error)throw error;
  const currentGroups=(current||[]).map(x=>x.st_group); const remove=currentGroups.filter(x=>!clean.includes(x));
  if(remove.length){const {error:e}=await s.from("md_area_operation_group").delete().eq("area_id",areaId).in("st_group",remove);if(e)throw e}
  for(const st_group of clean){const {error:e}=await s.from("md_area_operation_group").upsert({area_id:areaId,st_group,is_active:true,updated_at:new Date().toISOString()},{onConflict:"st_group"});if(e)throw e}
  return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}
