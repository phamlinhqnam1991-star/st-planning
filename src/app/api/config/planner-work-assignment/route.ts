import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {invalidateConfigHealth} from "@/lib/config/config-health";
import {requireApiPermission} from "@/lib/security/api";
import {notifyInternalChange} from "@/lib/internal-chat/server";

const clean=(v:unknown)=>String(v??"").trim();

export async function GET(req:Request){
 const {denied}=await requireApiPermission("config.view");if(denied)return denied;
 const fresh=new URL(req.url).searchParams.has("fresh");
 let c:any=null;

 try{
  c=await getPool().connect();

  const q=await c.query(`
   select
    a.schedule_area_code,
    a.schedule_area_name,
    a.display_order,
    coalesce(w.planner_owner,'UNASSIGNED') planner_owner,
    w.note,
    w.updated_by,
    w.updated_at
   from md_schedule_area a
   left join md_planner_work_assignment w
    on w.schedule_area_code=a.schedule_area_code
   and w.is_active=true
   where a.is_active=true
   order by a.display_order,a.schedule_area_code
  `);

  return NextResponse.json({
   ok:true,
   areas:q.rows
  },{headers:{"Cache-Control":fresh?"no-store":"public, max-age=30, s-maxage=30, stale-while-revalidate=120"}});
 }catch(e){
  return NextResponse.json(
   {
    ok:false,
    error:e instanceof Error?e.message:String(e)
   },
   {status:500}
  );
 }finally{
  if(c)c.release();
 }
}

export async function PUT(req:Request){
 const {denied,ctx}=await requireApiPermission("config.edit");if(denied||!ctx)return denied!;
 let c:any=null;

 try{
  const b=await req.json().catch(()=>({}));
  const code=clean(b.schedule_area_code).toUpperCase();
  const owner=clean(b.planner_owner).toUpperCase();

  if(!code||!["1","2","UNASSIGNED"].includes(owner)){
   return NextResponse.json(
    {
     ok:false,
     error:"Schedule Area / Planner không hợp lệ."
    },
    {status:400}
   );
  }

  c=await getPool().connect();

  const areaQ=await c.query(`
   select a.schedule_area_code,a.schedule_area_name,coalesce(w.planner_owner,'UNASSIGNED') previous_planner_owner
   from md_schedule_area a
   left join md_planner_work_assignment w on w.schedule_area_code=a.schedule_area_code and w.is_active=true
   where a.schedule_area_code=$1
    and a.is_active=true
   limit 1
  `,[code]);

  if(!areaQ.rowCount){
   return NextResponse.json(
    {
     ok:false,
     error:`Không tìm thấy Schedule Area ${code}.`
    },
    {status:404}
   );
  }

  const q=await c.query(`
   insert into md_planner_work_assignment(
    schedule_area_code,
    planner_owner,
    note,
    updated_by,
    is_active,
    updated_at
   )
   values($1,$2,$3,$4,true,now())
   on conflict(schedule_area_code)
   do update set
    planner_owner=excluded.planner_owner,
    note=excluded.note,
    updated_by=excluded.updated_by,
    is_active=true,
    updated_at=now()
   returning *
  `,[
   code,
   owner,
   clean(b.note)||null,
   clean(b.updated_by)||"Planner"
  ]);

  const mainsQ=await c.query(`select standard_operation from md_schedule_area_operation where schedule_area_code=$1 and is_active=true order by standard_operation`,[code]);
  invalidateConfigHealth();
  await notifyInternalChange({
   ctx,eventKey:"PLANNER_ASSIGNMENT_CHANGED",
   summary:`Planner Assignment ${areaQ.rows[0].schedule_area_name||code}: Planner ${areaQ.rows[0].previous_planner_owner||"UNASSIGNED"} → Planner ${owner}`,
   affectedMains:mainsQ.rows.map((r:any)=>String(r.standard_operation||"")).filter(Boolean),entityType:"SCHEDULE_AREA",entityId:code,
   metadata:{scheduleAreaCode:code,previousPlanner:areaQ.rows[0].previous_planner_owner||"UNASSIGNED",plannerOwner:owner}
  });
  return NextResponse.json({
   ok:true,
   assignment:q.rows[0]
  });
 }catch(e){
  return NextResponse.json(
   {
    ok:false,
    error:e instanceof Error?e.message:String(e)
   },
   {status:500}
  );
 }finally{
  if(c)c.release();
 }
}
