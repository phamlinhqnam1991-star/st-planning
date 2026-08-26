import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {ensureOperationCodePlanningOrderSchema} from "@/lib/operation-code-planning-order";

export async function POST(req:Request){
 let c:any=null;
 try{
  const body=await req.json();
  const operationCode=String(body?.operation_code||"").trim().toUpperCase();
  const raw=body?.planning_sort_order;
  const order=raw===""||raw===null||raw===undefined?null:Number(raw);

  if(!operationCode)
   return NextResponse.json({error:"Thiếu Operation Code."},{status:400});

  if(order!==null && (!Number.isInteger(order)||order<0))
   return NextResponse.json({error:"Planning Order phải là số nguyên >= 0."},{status:400});

  c=await getPool().connect();
  await ensureOperationCodePlanningOrderSchema(c);

  const q=await c.query(`
   update public.md_operation
      set planning_sort_order=$2,
          updated_at=now()
    where upper(trim(operation_code))=$1
      and is_active=true
    returning operation_code,operation_name,planning_sort_order
  `,[operationCode,order]);

  if(!q.rowCount)
   return NextResponse.json({error:`Không tìm thấy Operation Code ${operationCode}.`},{status:404});

  return NextResponse.json({ok:true,row:q.rows[0]});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{
  if(c)c.release();
 }
}
