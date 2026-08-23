import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";

const clean=(v:unknown)=>String(v??"").trim().toUpperCase();

export async function POST(req:Request){
 const body=await req.json().catch(()=>({}));
 const standardOperation=clean(body.standard_operation);
 const batchPrefix=clean(body.batch_prefix);

 if(!standardOperation)
  return NextResponse.json({error:"Thiếu Standard Operation."},{status:400});

 if(!/^[A-Z0-9]{3}$/.test(batchPrefix))
  return NextResponse.json({error:"Batch Prefix phải đúng 3 ký tự A-Z hoặc 0-9."},{status:400});

 const c=await getPool().connect();
 try{
  const q=await c.query(`
   update md_operation_master
   set batch_prefix=$2,updated_at=now()
   where standard_operation=$1 and is_active=true
   returning standard_operation,batch_prefix
  `,[standardOperation,batchPrefix]);

  if(!q.rowCount)
   return NextResponse.json({error:`Không tìm thấy ${standardOperation}.`},{status:404});

  return NextResponse.json({ok:true,...q.rows[0]});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{
  c.release();
 }
}
