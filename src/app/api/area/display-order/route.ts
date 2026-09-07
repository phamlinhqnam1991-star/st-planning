import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {invalidatePlanningStaticData} from "@/lib/planning/planning-static-cache";
import {invalidateConfigHealth} from "@/lib/config/config-health";
import {requireApiPermission} from "@/lib/security/api";

export async function PUT(req:NextRequest){
 const {denied}=await requireApiPermission("config.edit");if(denied)return denied;
 const body=await req.json().catch(()=>({}));
 const ids=Array.isArray(body.area_ids)?body.area_ids.map((x:unknown)=>Number(x)).filter((x:number)=>Number.isInteger(x)&&x>0):[];
 if(!ids.length)return NextResponse.json({error:"Danh sách Area không hợp lệ."},{status:400});
 if(new Set(ids).size!==ids.length)return NextResponse.json({error:"Danh sách Area bị trùng."},{status:400});
 const c=await getPool().connect();
 try{
  await c.query("begin");
  const q=await c.query(`select id from public.md_area where id=any($1::bigint[]) and is_active=true`,[ids]);
  if(q.rowCount!==ids.length)throw new Error("Có Area không tồn tại hoặc đã Inactive. Tải lại cấu hình rồi thử lại.");
  for(let i=0;i<ids.length;i++)await c.query(`update public.md_area set sort_order=$1,updated_at=now() where id=$2`,[(i+1)*10,ids[i]]);
  await c.query("commit");
  invalidatePlanningStaticData();invalidateConfigHealth();
  return NextResponse.json({ok:true,count:ids.length});
 }catch(e){await c.query("rollback").catch(()=>{});return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});}
 finally{c.release();}
}
