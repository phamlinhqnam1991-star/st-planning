import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {invalidateConfigHealth} from "@/lib/config/config-health";
const clean=(v:unknown)=>String(v??"").trim();

export async function POST(req:NextRequest){
 try{
  const b=await req.json(),op=clean(b.standard_operation),key=clean(b.recipe_key);
  if(!op||!key)return NextResponse.json({error:"Standard Operation và Recipe là bắt buộc."},{status:400});
  const c=await getPool().connect();
  try{
   await c.query(`insert into md_operation_recipe_mapping(standard_operation,recipe_key,source_slot,is_default,is_active)
     values($1,$2,$3,$4,true)
     on conflict(standard_operation,recipe_key) do update set source_slot=excluded.source_slot,is_default=excluded.is_default,is_active=true,updated_at=now()`,
     [op,key,clean(b.source_slot)||null,Boolean(b.is_default)]);
  }finally{c.release()}
  invalidateConfigHealth();
  return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}

export async function DELETE(req:NextRequest){
 try{
  const b=await req.json(),op=clean(b.standard_operation),key=clean(b.recipe_key);
  const c=await getPool().connect();
  try{await c.query("update md_operation_recipe_mapping set is_active=false,updated_at=now() where standard_operation=$1 and recipe_key=$2",[op,key])}
  finally{c.release()}
  invalidateConfigHealth();
  return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}
