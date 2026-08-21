import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(){
 try{
  await requireUser(); const s=createAdminClient();
  const {data:areas,error}=await s.from("md_area").select("*").order("sort_order").order("area_name"); if(error)throw error;
  const {data:maps,error:mapError}=await s.from("md_area_operation_group").select("id,area_id,st_group,is_active").eq("is_active",true); if(mapError)throw mapError;
  const {data:ops,error:opError}=await s.from("md_st_group").select("st_group").eq("is_active",true).order("sort_order"); if(opError)throw opError;
  const groups=[...new Set((ops||[]).map(x=>x.st_group).filter(Boolean))];
  return NextResponse.json({areas:areas||[],mappings:maps||[],groups});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}

export async function POST(req:NextRequest){
 try{
  await requireUser(); const body=await req.json(); const area_code=String(body.area_code||"").trim().toUpperCase(); const area_name=String(body.area_name||"").trim();
  if(!area_code||!area_name)return NextResponse.json({error:"Area Code và Area Name là bắt buộc."},{status:400});
  const s=createAdminClient(); const {data,error}=await s.from("md_area").insert({area_code,area_name,description:String(body.description||"").trim()||null,sort_order:Number(body.sort_order)||0,is_active:true}).select().single(); if(error)throw error;
  return NextResponse.json({ok:true,area:data});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}

export async function PUT(req:NextRequest){
 try{
  await requireUser(); const body=await req.json(); const id=Number(body.id); if(!id)return NextResponse.json({error:"Area ID không hợp lệ."},{status:400});
  const patch:any={updated_at:new Date().toISOString()};
  if(body.area_code!==undefined)patch.area_code=String(body.area_code).trim().toUpperCase();
  if(body.area_name!==undefined)patch.area_name=String(body.area_name).trim();
  if(body.description!==undefined)patch.description=String(body.description||"").trim()||null;
  if(body.sort_order!==undefined)patch.sort_order=Number(body.sort_order)||0;
  if(body.is_active!==undefined)patch.is_active=Boolean(body.is_active);
  const s=createAdminClient(); const {error}=await s.from("md_area").update(patch).eq("id",id); if(error)throw error;
  return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}
