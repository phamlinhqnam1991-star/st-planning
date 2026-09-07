import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";
import {syncPlanningChains} from "@/lib/planning/sync-planning-chains";
import {notifyInternalChange} from "@/lib/internal-chat/server";

export const runtime="nodejs";
export const maxDuration=120;

const clean=(v:unknown)=>String(v??"").trim();
const HOLD_REASONS=new Set(["DMR","QUALITY","MATERIAL","CUSTOMER","OTHER"]);


async function loadHoldState(c:any,id:number){
 const q=await c.query(`
  select id,job_num,standard_operation,status,is_active,is_hold,hold_reason,hold_note,held_at,held_by
  from planning_job_operation
  where id=$1
  limit 1
 `,[id]);
 return q.rows[0]||null;
}

export async function POST(req:NextRequest){
 const {denied,ctx:user}=await requireApiPermission("planning.edit");if(denied||!user)return denied!;
 const body=await req.json().catch(()=>({}));
 const id=Number(body.planning_job_operation_id||0);
 const reason=clean(body.reason).toUpperCase();
 const note=clean(body.note)||null;
 if(!Number.isFinite(id)||id<=0)
  return NextResponse.json({error:"Planning Operation không hợp lệ."},{status:400});
 if(!HOLD_REASONS.has(reason))
  return NextResponse.json({error:"Chọn Hold Reason hợp lệ."},{status:400});

 const c=await getPool().connect();
 try{
  await c.query("begin");
  const q=await c.query(`
   select p.id,p.job_num,p.standard_operation,p.status,p.is_active,p.is_hold,
          exists(
           select 1
           from planning_batch_job bj
           join planning_batch b on b.id=bj.batch_id
           where bj.planning_job_operation_id=p.id
             and b.status<>'CANCELLED'
          ) has_active_batch
   from planning_job_operation p
   where p.id=$1
   for update
  `,[id]);
  if(!q.rowCount)throw new Error("Planning Operation không tồn tại.");
  const row=q.rows[0];
  if(!row.is_active)throw new Error("Planning Operation không còn active.");
  if(row.has_active_batch)throw new Error(`Job ${row.job_num} · ${row.standard_operation} đã có Batch. Job Hold chỉ áp dụng trước khi vào Batch.`);

  await c.query(`
   update planning_job_operation
      set is_hold=true,
          hold_reason=$2,
          hold_note=$3,
          held_at=now(),
          held_by=$4,
          updated_at=now()
    where id=$1
  `,[id,reason,note,clean(user?.email)||clean(user?.userId)||"USER"]);
  const state=await loadHoldState(c,id);
  await c.query("commit");
  await notifyInternalChange({dbClient:c,ctx:user,eventKey:"JOB_HOLD",summary:`HOLD Job ${row.job_num} · ${row.standard_operation} · ${reason}`,standardOperation:String(row.standard_operation||""),jobNums:[String(row.job_num||"")],entityType:"JOB_MAIN",entityId:id,metadata:{reason,note}});
  return NextResponse.json({ok:true,action:"HOLD",state});
 }catch(error){
  await c.query("rollback");
  return NextResponse.json({error:error instanceof Error?error.message:String(error)},{status:400});
 }finally{c.release();}
}

export async function DELETE(req:NextRequest){
 const {denied,ctx}=await requireApiPermission("planning.edit");if(denied||!ctx)return denied!;
 const body=await req.json().catch(()=>({}));
 const id=Number(body.planning_job_operation_id||0);
 if(!Number.isFinite(id)||id<=0)
  return NextResponse.json({error:"Planning Operation không hợp lệ."},{status:400});

 const c=await getPool().connect();
 try{
  await c.query("begin");
  const q=await c.query(`
   select id,job_num,standard_operation,is_active,is_hold
   from planning_job_operation
   where id=$1
   for update
  `,[id]);
  if(!q.rowCount)throw new Error("Planning Operation không tồn tại.");
  const row=q.rows[0];
  if(!row.is_active)throw new Error("Planning Operation không còn active.");

  await c.query(`
   update planning_job_operation
      set is_hold=false,
          hold_reason=null,
          hold_note=null,
          held_at=null,
          held_by=null,
          updated_at=now()
    where id=$1
  `,[id]);

  // Recompute only this Job so Release Hold returns to the correct READY/WAIT
  // position without rebuilding every open Job.
  await syncPlanningChains(c,{jobNums:[String(row.job_num)]});
  const state=await loadHoldState(c,id);
  await c.query("commit");
  await notifyInternalChange({dbClient:c,ctx,eventKey:"JOB_RELEASED",summary:`Released HOLD Job ${row.job_num} · ${row.standard_operation}`,standardOperation:String(row.standard_operation||""),jobNums:[String(row.job_num||"")],entityType:"JOB_MAIN",entityId:id});
  return NextResponse.json({ok:true,action:"RELEASE",state,job_num:row.job_num});
 }catch(error){
  await c.query("rollback");
  return NextResponse.json({error:error instanceof Error?error.message:String(error)},{status:400});
 }finally{c.release();}
}
