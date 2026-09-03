import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";

// =====================================================================
// GET /api/schedule/rows?date=YYYY-MM-DD
// Trả về toàn bộ lịch (chưa CANCELLED) của ngày — dùng để cập nhật lưới
// điều độ sau khi Save/Edit/Delete/Move mà KHÔNG tải lại trang (giữ các
// dòng đang nhập dở của planner).
// =====================================================================
import {requireApiUser} from "@/lib/api-auth";
export async function GET(req:Request){
 const denied=await requireApiUser();
 if(denied)return denied;
 const url=new URL(req.url);
 const date=String(url.searchParams.get("date")||"");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))
  return NextResponse.json({error:"Thiếu tham số date (YYYY-MM-DD)."},{status:400});

 const c=await getPool().connect();
 try{
  const q=await c.query(`
   select
    s.id,s.batch_id,s.resource_code,s.schedule_date,s.planned_start,s.planned_end,
    s.duration_minutes,s.sequence_no,s.status,s.plan_source,
    s.loading_start,s.loading_end,s.loading_duration_minutes,
    s.process_start,s.process_end,s.process_duration_minutes,
    s.ndt_start,s.ndt_end,s.ndt_duration_minutes,
    s.unloading_start,s.unloading_end,s.unloading_duration_minutes,
    coalesce(b.batch_no,'LEGACY-'||s.batch_id::text) batch_no,
    b.standard_operation,b.recipe_key,
    pr.recipe_no,pr.recipe_name,
    coalesce(b.total_jobs,0) total_jobs,
    coalesce(b.total_qty,0) total_qty,
    coalesce(b.total_surface_dm2,0) total_surface_dm2,
    coalesce(sr.resource_name,s.resource_code) resource_name,
    coalesce(sr.resource_group,'UNMAPPED') resource_group,
    coalesce(sr.sort_order,9999) resource_sort_order
   from planning_schedule s
   left join planning_batch b on b.id=s.batch_id
   left join md_process_recipe pr on pr.recipe_key=b.recipe_key and pr.is_active=true
   left join md_schedule_resource sr on sr.resource_code=s.resource_code
   where s.status<>'CANCELLED'
     and (
       s.schedule_date=$1::date
       or (s.planned_start at time zone 'Asia/Ho_Chi_Minh')::date=$1::date
       or (
         s.planned_start < (($1::date + interval '1 day' + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
         and s.planned_end > (($1::date + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
       )
     )
   order by
    coalesce(sr.sort_order,9999),
    s.sequence_no,
    s.planned_start,
    s.id
  `,[date]);
  const activeQ=await c.query(`
   select distinct batch_id
   from planning_schedule
   where status<>'CANCELLED'
     and batch_id is not null
  `);
  return NextResponse.json({
   rows:q.rows,
   activeScheduledBatchIds:activeQ.rows.map((r:any)=>Number(r.batch_id)).filter((id:number)=>Number.isFinite(id)&&id>0)
  });
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{
  c.release();
 }
}
