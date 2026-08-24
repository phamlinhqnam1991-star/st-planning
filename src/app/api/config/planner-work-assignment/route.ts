import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";

const clean=(v:unknown)=>String(v??"").trim();

async function ensureSchema(c:any){
 await c.query(`
  create table if not exists public.md_planner_work_assignment(
   schedule_area_code text primary key
    references public.md_schedule_area(schedule_area_code) on delete cascade,
   planner_owner text not null default 'UNASSIGNED'
    check(planner_owner in ('1','2','UNASSIGNED')),
   note text,
   updated_by text,
   is_active boolean not null default true,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
  )
 `);

 await c.query(`
  insert into public.md_planner_work_assignment(
   schedule_area_code,planner_owner,is_active
  )
  select
   a.schedule_area_code,
   case
    when a.planner_owner in ('1','2') then a.planner_owner
    else 'UNASSIGNED'
   end,
   true
  from public.md_schedule_area a
  on conflict(schedule_area_code) do nothing
 `);
}

export async function GET(){
 let c:any=null;

 try{
  c=await getPool().connect();
  await ensureSchema(c);

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

export async function PUT(req:Request){
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
  await ensureSchema(c);

  const areaQ=await c.query(`
   select schedule_area_code,schedule_area_name
   from md_schedule_area
   where schedule_area_code=$1
    and is_active=true
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
