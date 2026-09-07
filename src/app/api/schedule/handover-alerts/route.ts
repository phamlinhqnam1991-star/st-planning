import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";

import {requireApiPermission} from "@/lib/security/api";
export async function GET(req:Request){
 const {denied}=await requireApiPermission("schedule.view");
 if(denied)return denied;
 const url=new URL(req.url);
 const planner=url.searchParams.get("planner")==="2"?"2":"1";

 const c=await getPool().connect();
 try{
  const q=await c.query(`
   select
    e.id,e.source_batch_id,e.source_batch_no,e.source_standard_operation,
    e.source_planner,e.job_num,e.change_type,
    e.next_standard_operation,e.affected_planner,
    e.affected_batch_id,e.affected_batch_no,
    e.affected_schedule_id,e.affected_resource_code,e.affected_planned_start,
    e.source_batch_qty_before,e.source_batch_qty_after,
    e.source_batch_surface_before,e.source_batch_surface_after,
    e.changed_job_qty,e.changed_job_surface,
    e.impact_level,e.status,e.created_at,e.acknowledged_at,e.acknowledged_by,e.note
   from planning_handover_change_event e
   where e.affected_planner=$1
     and e.created_at>=now()-interval '14 days'
   order by
    case e.status when 'NEW' then 0 else 1 end,
    case e.impact_level
     when 'CRITICAL' then 0
     when 'IMPACTED' then 1
     when 'WARNING' then 2
     else 3
    end,
    e.created_at desc
   limit 200
  `,[planner]);

  return NextResponse.json({ok:true,alerts:q.rows});
 }catch(e){
  return NextResponse.json(
   {error:e instanceof Error?e.message:String(e)},
   {status:400}
  );
 }finally{
  c.release();
 }
}
