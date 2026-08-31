import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {invalidateConfigHealth} from "@/lib/config/config-health";

const clean=(v:unknown)=>String(v??"").trim().toUpperCase();

export async function POST(req:Request){
 const body=await req.json().catch(()=>({}));
 const operation=String(body.standard_operation||"").trim();
 const prefix=clean(body.batch_prefix);

 if(!operation)
  return NextResponse.json({error:"Thiếu Standard Operation."},{status:400});

 if(!/^[A-Z0-9]{3}$/.test(prefix))
  return NextResponse.json(
   {error:"Batch Prefix phải đúng 3 ký tự A-Z hoặc 0-9."},
   {status:400}
  );

 const c=await getPool().connect();
 try{
  const q=await c.query(`
   update md_operation_master
   set batch_prefix=$2,updated_at=now()
   where standard_operation=$1
     and is_active=true
   returning standard_operation,batch_prefix
  `,[operation,prefix]);

  if(!q.rowCount)
   return NextResponse.json({error:"Không tìm thấy Standard Operation."},{status:404});

  invalidateConfigHealth();
  return NextResponse.json({ok:true,row:q.rows[0]});
 }catch(e){
  return NextResponse.json(
   {error:e instanceof Error?e.message:String(e)},
   {status:400}
  );
 }finally{
  c.release();
 }
}
