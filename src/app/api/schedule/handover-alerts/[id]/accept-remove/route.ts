import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {getAccessContext} from "@/lib/security/access";
import {notifyInternalChange} from "@/lib/internal-chat/server";
import {canProductionBatch,canScheduleResource} from "@/lib/security/scope-db";
import {acceptDownstreamRemove} from "@/lib/production-remove-before-start";

export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}){
 const ctx=await getAccessContext();
 if(!ctx)return NextResponse.json({error:"Unauthorized"},{status:401});
 if(!ctx.active||(!ctx.permissions.has("schedule.edit")&&!ctx.permissions.has("production.add_job")))
  return NextResponse.json({error:"Cần quyền schedule.edit hoặc production.add_job để Accept & Remove Job."},{status:403});
 const {id}=await params;const eventId=Number(id);
 if(!Number.isFinite(eventId)||eventId<=0)return NextResponse.json({error:"Invalid alert id."},{status:400});
 const c=await getPool().connect();
 try{
  await c.query("begin");
  const preQ=await c.query(`select affected_batch_id,affected_resource_code,next_standard_operation from planning_handover_change_event where id=$1 for share`,[eventId]);
  if(!preQ.rowCount)throw new Error("Remove impact not found.");
  const pre=preQ.rows[0];
  let scoped=false;
  if(ctx.permissions.has("schedule.edit")){
   const x=await canScheduleResource(c,ctx,String(pre.affected_resource_code||""),String(pre.next_standard_operation||""));scoped=scoped||x.allowed;
  }
  if(ctx.permissions.has("production.add_job")&&pre.affected_batch_id){
   const x=await canProductionBatch(c,ctx,Number(pre.affected_batch_id));scoped=scoped||x.allowed;
  }
  if(!scoped){await c.query("rollback");return NextResponse.json({error:"Không có quyền xử lý lô/khu vực bị ảnh hưởng."},{status:403});}
  const result=await acceptDownstreamRemove(c,eventId,ctx.displayName||ctx.email||"Shift");
  await c.query("commit");
  const e=result.event;
  await notifyInternalChange({dbClient:c,
   ctx,eventKey:"PRODUCTION_REMOVE_ACCEPTED",
   summary:`Accepted upstream Remove · Job ${e.job_num} removed from ${e.affected_batch_no||"downstream Batch"} · ${e.next_standard_operation||""}`,
   batchId:Number(e.affected_batch_id)||null,batchNo:String(e.affected_batch_no||""),standardOperation:String(e.next_standard_operation||""),jobNums:[String(e.job_num||"")],
   entityType:"HANDOVER_EVENT",entityId:eventId,metadata:{sourceBatchNo:e.source_batch_no,sourceOperation:e.source_standard_operation,alreadyAbsent:result.already}
  });
  return NextResponse.json({ok:true,already:result.already,alert:e,batchTotals:result.totals});
 }catch(e){
  await c.query("rollback");
  const message=e instanceof Error?e.message:String(e);
  return NextResponse.json({error:message},{status:message.startsWith("CONFLICT")?409:400});
 }finally{c.release();}
}
