import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";
import {ensureOperationReviewTable} from "@/lib/config/unconfigured-operations";
import {invalidateConfigHealth} from "@/lib/config/config-health";

const clean=(v:unknown)=>String(v??"").trim();

export async function POST(req:Request){
 const {denied}=await requireApiPermission("config.edit");if(denied)return denied;
 const b=await req.json().catch(()=>({}));
 const operationCode=clean(b.operation_code).toUpperCase();
 const decision=clean(b.decision).toUpperCase();
 const note=clean(b.note)||null;
 if(!operationCode)return NextResponse.json({error:"Operation Code là bắt buộc."},{status:400});
 if(!["NOT_ST","UNREVIEWED"].includes(decision))return NextResponse.json({error:"Review decision không hợp lệ."},{status:400});

 const c=await getPool().connect();
 try{
  await c.query("begin");
  await ensureOperationReviewTable(c);
  if(decision==="NOT_ST"){
   const active=await c.query(`
    select operation_type from public.md_st_operation_scope
    where is_active=true and upper(trim(operation_code))=$1
    limit 1
   `,[operationCode]);
   if(active.rowCount){
    await c.query("rollback");
    return NextResponse.json({error:`${operationCode} đang thuộc active ST Scope (${active.rows[0].operation_type}). Hãy bỏ/deactivate cấu hình ST trước khi đánh dấu Not ST.`},{status:409});
   }
   await c.query(`
    insert into public.md_operation_review(operation_code,decision,note,reviewed_by,updated_at)
    values($1,'NOT_ST',$2,'Configuration Operation Inbox',now())
    on conflict(operation_code) do update set decision='NOT_ST',note=excluded.note,reviewed_by=excluded.reviewed_by,updated_at=now()
   `,[operationCode,note]);
  }else{
   await c.query(`delete from public.md_operation_review where upper(trim(operation_code))=$1`,[operationCode]);
  }
  await c.query("commit");
  invalidateConfigHealth();
  return NextResponse.json({ok:true,operation_code:operationCode,decision});
 }catch(e){
  try{await c.query("rollback")}catch{}
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{c.release()}
}
