import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";

const clean=(v:unknown)=>String(v??"").trim().toUpperCase();
const typeOf=(v:unknown)=>clean(v)==="UNMASKING"?"UNMASKING":"MASKING";

export async function POST(req:Request){
 const body=await req.json().catch(()=>({}));
 const standardOperation=clean(body.standard_operation);
 const supportType=typeOf(body.support_type);
 const codes=Array.from(new Set((Array.isArray(body.support_operation_codes)?body.support_operation_codes:[]).map(clean).filter(Boolean)));
 if(!standardOperation)return NextResponse.json({error:"Thiếu Main Operation."},{status:400});
 const c=await getPool().connect();
 try{
  await c.query("begin");
  const main=await c.query(`select 1 from md_operation_master where upper(trim(standard_operation))=$1 and is_active=true limit 1`,[standardOperation]);
  if(!main.rowCount)throw new Error(`Main Operation ${standardOperation} không tồn tại hoặc đã ngưng.`);
  await c.query(`update md_main_support_operation set is_active=false,updated_at=now() where upper(trim(standard_operation))=$1 and support_type=$2 and relation='BEFORE_MAIN'`,[standardOperation,supportType]);
  const storedCodes=codes.length?codes:["__NONE__"];
  for(let i=0;i<storedCodes.length;i++){
   await c.query(`
    insert into md_main_support_operation(standard_operation,support_type,support_operation_code,relation,sort_order,is_active,updated_at)
    values($1,$2,$3,'BEFORE_MAIN',$4,true,now())
    on conflict(standard_operation,support_type,support_operation_code,relation)
    do update set sort_order=excluded.sort_order,is_active=true,updated_at=now()
   `,[standardOperation,supportType,storedCodes[i],(i+1)*10]);
  }
  await c.query("commit");
  return NextResponse.json({ok:true,standard_operation:standardOperation,support_type:supportType,codes});
 }catch(e){await c.query("rollback").catch(()=>{});return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});}
 finally{c.release();}
}
