import { NextRequest,NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import {invalidatePlanningStaticData} from "@/lib/planning/planning-static-cache";
import {invalidateConfigHealth} from "@/lib/config/config-health";
import {requireApiPermission} from "@/lib/security/api";
const clean=(v:unknown)=>String(v??"").trim();
export async function POST(req:NextRequest){
 const {denied}=await requireApiPermission("master.edit");if(denied)return denied;
 try{const b=await req.json();const code=clean(b.st_group).toUpperCase(),name=clean(b.group_name)||code,desc=clean(b.description)||null;
  if(!code)return NextResponse.json({error:"ST Group không được để trống."},{status:400});
  const c=await getPool().connect();try{
   const n=await c.query("select coalesce(max(sort_order),0)+1 n from md_st_group");
   await c.query(`insert into md_st_group(st_group,group_name,description,sort_order,is_active) values($1,$2,$3,$4,true)
    on conflict(st_group) do update set group_name=excluded.group_name,description=excluded.description,is_active=true,updated_at=now()`,[code,name,desc,n.rows[0].n]);
  }finally{c.release()} invalidatePlanningStaticData(); invalidateConfigHealth(); return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}
export async function PATCH(req:NextRequest){
 const {denied}=await requireApiPermission("master.edit");if(denied)return denied;
 try{const b=await req.json();const code=clean(b.st_group),name=clean(b.group_name),desc=clean(b.description)||null;
  if(!code||!name)return NextResponse.json({error:"Thiếu ST Group / Group Name."},{status:400});
  const c=await getPool().connect();try{await c.query("update md_st_group set group_name=$2,description=$3,is_active=true,updated_at=now() where st_group=$1",[code,name,desc])}finally{c.release()}
  invalidatePlanningStaticData();
  invalidateConfigHealth();
  return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}
export async function DELETE(req:NextRequest){
 const {denied}=await requireApiPermission("master.edit");if(denied)return denied;
 try{const b=await req.json();const code=clean(b.st_group);const c=await getPool().connect();try{
   const used=await c.query(`select
    (select count(*) from md_st_operation_mapping where st_group=$1 and is_active) mapping_count,
    (select count(*) from md_operation_master where st_group=$1 and is_active) operation_count`,[code]);
   const x=used.rows[0]; if(Number(x.mapping_count)+Number(x.operation_count)>0)
    return NextResponse.json({error:`Không thể deactivate: ST Group đang được dùng (Mapping ${x.mapping_count}, Operation Master ${x.operation_count}). Hãy chuyển các liên kết trước.`},{status:409});
   await c.query("update md_st_group set is_active=false,updated_at=now() where st_group=$1",[code]);
  }finally{c.release()}invalidatePlanningStaticData();invalidateConfigHealth();return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}
