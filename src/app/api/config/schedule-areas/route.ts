import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {invalidateConfigHealth} from "@/lib/config/config-health";

const clean=(v:unknown)=>String(v??"").trim();

export async function GET(req:Request){
 const fresh=new URL(req.url).searchParams.has("fresh");
 const c=await getPool().connect();
 try{
  // Backfill Operation Master from existing DIRECT mappings.
  // This also repairs mappings created before automatic synchronization existed.
  await c.query(`
   with latest_direct as (
    select distinct on (upper(trim(standard_operation_rule)))
      trim(standard_operation_rule) standard_operation,
      trim(st_group) st_group
    from md_st_operation_mapping
    where is_active=true
      and mapping_rule='DIRECT'
      and nullif(trim(standard_operation_rule),'') is not null
    order by
      upper(trim(standard_operation_rule)),
      updated_at desc,
      id desc
   )
   insert into md_operation_master(
    standard_operation,
    st_group,
    is_active
   )
   select standard_operation,st_group,true
   from latest_direct
   on conflict(standard_operation)
   do update set
    st_group=excluded.st_group,
    is_active=true,
    updated_at=now()
  `);

  const [areas,ops,resources,stGroups,operationCodes]=await Promise.all([
   c.query(`
    select a.*,
      coalesce(jsonb_agg(
       jsonb_build_object('id',m.id,'standard_operation',m.standard_operation)
       order by m.standard_operation
      ) filter(where m.id is not null),'[]'::jsonb) operations
    from md_schedule_area a
    left join md_schedule_area_operation m
      on m.schedule_area_code=a.schedule_area_code and m.is_active=true
    group by a.schedule_area_code
    order by a.display_order,a.schedule_area_code
   `),
   c.query(`select standard_operation,st_group from md_operation_master where is_active=true order by st_group,standard_operation`),
   c.query(`select resource_code,resource_name,resource_group from md_schedule_resource where is_active=true order by sort_order,resource_code`),
   c.query(`
    select g.st_group,a.area_code,a.area_name
    from md_area_operation_group g
    join md_area a on a.id=g.area_id and a.is_active=true
    join md_st_group sg on sg.st_group=g.st_group and sg.is_active=true
    where g.is_active=true
    order by a.sort_order,a.area_name,sg.sort_order,g.st_group
   `),
   c.query(`
    select
     st_group,
     source_operation_code,
     standard_operation_rule,
     mapping_rule
    from md_st_operation_mapping
    where is_active=true
    order by st_group,sort_order,id
   `)
  ]);
  return NextResponse.json({
   areas:areas.rows,
   operations:ops.rows,
   resources:resources.rows,
   st_groups:stGroups.rows,
   operation_codes:operationCodes.rows
  },{headers:{"Cache-Control":fresh?"no-store":"public, max-age=30, s-maxage=30, stale-while-revalidate=120"}});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }finally{c.release()}
}

export async function POST(req:Request){
 const b=await req.json().catch(()=>({}));
 const code=clean(b.schedule_area_code).toUpperCase();
 const name=clean(b.schedule_area_name);
 if(!code||!name)return NextResponse.json({error:"Schedule Area Code / Name là bắt buộc."},{status:400});
 const c=await getPool().connect();
 try{
  const q=await c.query(`
   insert into md_schedule_area(
    schedule_area_code,schedule_area_name,resource_group,resource_code,
    planner_owner,display_order,default_rows,allow_manual_plan,allow_auto_plan,is_active
   ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
   on conflict(schedule_area_code) do update set
    schedule_area_name=excluded.schedule_area_name,
    resource_group=excluded.resource_group,
    resource_code=excluded.resource_code,
    planner_owner=excluded.planner_owner,
    display_order=excluded.display_order,
    default_rows=excluded.default_rows,
    allow_manual_plan=excluded.allow_manual_plan,
    allow_auto_plan=excluded.allow_auto_plan,
    is_active=true,updated_at=now()
   returning *
  `,[code,name,clean(b.resource_group)||null,clean(b.resource_code)||null,
     ["1","2","BOTH"].includes(String(b.planner_owner))?String(b.planner_owner):"BOTH",
     Number(b.display_order)||0,Math.min(200,Math.max(1,Number(b.default_rows)||20)),
     b.allow_manual_plan!==false,b.allow_auto_plan!==false]);
  invalidateConfigHealth();
  return NextResponse.json({ok:true,area:q.rows[0]});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400})}
 finally{c.release()}
}

export async function PATCH(req:Request){
 const b=await req.json().catch(()=>({}));
 const code=clean(b.schedule_area_code).toUpperCase();
 if(!code)return NextResponse.json({error:"Thiếu Schedule Area Code."},{status:400});
 const c=await getPool().connect();
 try{
  const q=await c.query(`
   update md_schedule_area set
    schedule_area_name=coalesce($2,schedule_area_name),
    resource_group=$3,resource_code=$4,
    planner_owner=$5,display_order=$6,default_rows=$7,
    allow_manual_plan=$8,allow_auto_plan=$9,is_active=$10,updated_at=now()
   where schedule_area_code=$1 returning *
  `,[code,clean(b.schedule_area_name)||null,clean(b.resource_group)||null,clean(b.resource_code)||null,
     ["1","2","BOTH"].includes(String(b.planner_owner))?String(b.planner_owner):"BOTH",
     Number(b.display_order)||0,Math.min(200,Math.max(1,Number(b.default_rows)||20)),
     b.allow_manual_plan!==false,b.allow_auto_plan!==false,b.is_active!==false]);
  invalidateConfigHealth();
  return NextResponse.json({ok:true,area:q.rows[0]});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400})}
 finally{c.release()}
}

export async function PUT(req:Request){
 const b=await req.json().catch(()=>({}));
 const code=clean(b.schedule_area_code).toUpperCase();
 const operations=Array.isArray(b.operations)?[...new Set(b.operations.map((x:unknown)=>clean(x)).filter(Boolean))]:[];
 if(!code)return NextResponse.json({error:"Thiếu Schedule Area Code."},{status:400});
 const c=await getPool().connect();
 try{
  await c.query("begin");
  await c.query(`delete from md_schedule_area_operation where schedule_area_code=$1`,[code]);
  for(const op of operations){
   await c.query(`
    insert into md_schedule_area_operation(schedule_area_code,standard_operation,is_active)
    values($1,$2,true)
   `,[code,op]);
  }
  await c.query("commit");
  invalidateConfigHealth();
  return NextResponse.json({ok:true});
 }catch(e){
  await c.query("rollback");
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }finally{c.release()}
}
