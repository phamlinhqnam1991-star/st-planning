import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {invalidatePlanningStaticData} from "@/lib/planning/planning-static-cache";
import {invalidateConfigHealth} from "@/lib/config/config-health";
import {requireApiPermission} from "@/lib/security/api";

export async function POST(req:Request){
 const {denied}=await requireApiPermission("config.edit");if(denied)return denied;
 let c:any=null;
 try{
  const body=await req.json();
  const operation=String(body?.standard_operation||"").trim().toUpperCase();
  const raw=body?.planning_sort_order;
  const order=raw===""||raw===null||raw===undefined?null:Number(raw);

  if(!operation)return NextResponse.json({error:"Thiếu Operation Code."},{status:400});
  if(order!==null && (!Number.isInteger(order)||order<0))
   return NextResponse.json({error:"Planning Order phải là số nguyên >= 0."},{status:400});

  c=await getPool().connect();
  await c.query("begin");
  const q=await c.query(`
    update md_operation_master
       set planning_sort_order=$2,updated_at=now()
     where upper(trim(standard_operation))=$1
       and is_active=true
     returning standard_operation,planning_sort_order
  `,[operation,order]);
  if(!q.rowCount){await c.query("rollback");return NextResponse.json({error:`Không tìm thấy ${operation} trong Operation Master.`},{status:404});}
  // Main Operation order must stay aligned with the matrix/Planning scope.
  await c.query(`
   insert into md_planning_operation_scope(standard_operation,sort_order,is_active,updated_at)
   values($1,coalesce($2,(select coalesce(max(sort_order),0)+10 from md_planning_operation_scope)),true,now())
   on conflict(standard_operation) do update set
    sort_order=coalesce($2,md_planning_operation_scope.sort_order),is_active=true,updated_at=now()
  `,[q.rows[0].standard_operation,order]);
  await c.query("commit");
  invalidatePlanningStaticData();
  invalidateConfigHealth();
  return NextResponse.json({ok:true,row:q.rows[0]});
 }catch(e){
  if(c){try{await c.query("rollback")}catch{}}
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{if(c)c.release();}
}
