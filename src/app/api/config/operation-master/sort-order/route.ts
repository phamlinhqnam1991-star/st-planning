import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {ensurePlanningSortOrderSchema} from "@/lib/planning-sort-order";

export async function POST(req:Request){
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
  await ensurePlanningSortOrderSchema(c);

  const q=await c.query(`
    update md_operation_master
       set planning_sort_order=$2,updated_at=now()
     where upper(trim(standard_operation))=$1
       and is_active=true
     returning standard_operation,planning_sort_order
  `,[operation,order]);
  if(!q.rowCount)return NextResponse.json({error:`Không tìm thấy ${operation} trong Operation Master.`},{status:404});
  return NextResponse.json({ok:true,row:q.rows[0]});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{if(c)c.release();}
}
