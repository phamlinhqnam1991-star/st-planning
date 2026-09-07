import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {invalidatePlanningStaticData} from "@/lib/planning/planning-static-cache";
import {invalidateConfigHealth} from "@/lib/config/config-health";
import {requireApiPermission} from "@/lib/security/api";

const clean=(v:unknown)=>String(v??"").trim();

export async function GET(req:NextRequest){
 const {denied}=await requireApiPermission("config.view");if(denied)return denied;
 const fresh=new URL(req.url).searchParams.has("fresh");
 const c=await getPool().connect();

 try{
  const [areasQ,mapsQ,groupsQ]=await Promise.all([
   c.query(`
    select id,area_code,area_name,description,sort_order,is_active
    from md_area
    order by sort_order,area_name
   `),
   c.query(`
    select id,area_id,st_group,is_active
    from md_area_operation_group
    where is_active=true
    order by area_id,st_group
   `),
   c.query(`
    select st_group
    from md_st_group
    where is_active=true
    order by sort_order,st_group
   `)
  ]);

  return NextResponse.json({
   areas:areasQ.rows,
   mappings:mapsQ.rows,
   groups:[...new Set(groupsQ.rows.map(x=>x.st_group).filter(Boolean))]
  },{headers:{"Cache-Control":fresh?"no-store":"public, max-age=30, s-maxage=30, stale-while-revalidate=120"}});
 }catch(e){
  return NextResponse.json(
   {error:e instanceof Error?e.message:String(e)},
   {status:500}
  );
 }finally{
  c.release();
 }
}

export async function POST(req:NextRequest){
 const {denied}=await requireApiPermission("config.edit");if(denied)return denied;
 const body=await req.json().catch(()=>({}));
 const areaCode=clean(body.area_code).toUpperCase();
 const areaName=clean(body.area_name);
 const description=clean(body.description)||null;
 const sortOrder=Number(body.sort_order)||0;

 if(!areaCode||!areaName)
  return NextResponse.json(
   {error:"Area Code và Area Name là bắt buộc."},
   {status:400}
  );

 const c=await getPool().connect();

 try{
  const q=await c.query(`
   insert into md_area(
    area_code,area_name,description,sort_order,is_active
   )
   values($1,$2,$3,$4,true)
   returning id,area_code,area_name,description,sort_order,is_active
  `,[areaCode,areaName,description,sortOrder]);

  invalidatePlanningStaticData();
  invalidateConfigHealth();
  return NextResponse.json({ok:true,area:q.rows[0]});
 }catch(e){
  return NextResponse.json(
   {error:e instanceof Error?e.message:String(e)},
   {status:500}
  );
 }finally{
  c.release();
 }
}

export async function PUT(req:NextRequest){
 const {denied}=await requireApiPermission("config.edit");if(denied)return denied;
 const body=await req.json().catch(()=>({}));
 const id=Number(body.id);

 if(!id)
  return NextResponse.json({error:"Area ID không hợp lệ."},{status:400});

 const fields:string[]=[];
 const values:any[]=[];

 function add(column:string,value:any){
  values.push(value);
  fields.push(`${column}=$${values.length}`);
 }

 if(body.area_code!==undefined)
  add("area_code",clean(body.area_code).toUpperCase());

 if(body.area_name!==undefined)
  add("area_name",clean(body.area_name));

 if(body.description!==undefined)
  add("description",clean(body.description)||null);

 if(body.sort_order!==undefined)
  add("sort_order",Number(body.sort_order)||0);

 if(body.is_active!==undefined)
  add("is_active",Boolean(body.is_active));

 if(!fields.length)
  return NextResponse.json({ok:true});

 values.push(id);
 const c=await getPool().connect();

 try{
  await c.query(`
   update md_area
   set ${fields.join(",")},updated_at=now()
   where id=$${values.length}
  `,values);
  invalidatePlanningStaticData();
  invalidateConfigHealth();

  return NextResponse.json({ok:true});
 }catch(e){
  return NextResponse.json(
   {error:e instanceof Error?e.message:String(e)},
   {status:500}
  );
 }finally{
  c.release();
 }
}
