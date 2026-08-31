import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {invalidatePlanningStaticData} from "@/lib/planning/planning-static-cache";
import {invalidateConfigHealth} from "@/lib/config/config-health";

const clean=(v:unknown)=>String(v??"").trim();

// =====================================================================
// Open Job Column Values
// Bảng giá trị unique theo từng cột trong All Open Job.
// GET  : danh sách (lọc cột / tìm giá trị / phân trang)
// POST : {action:'rebuild'} quét lại toàn bộ, hoặc thêm tay 1 giá trị mới
// PATCH: sửa display_name / bật tắt is_active
// DELETE: inactivate 1 giá trị
// =====================================================================

export async function GET(req:NextRequest){
 try{
  const url=new URL(req.url);
  const column=clean(url.searchParams.get("column"));
  const q=clean(url.searchParams.get("q"));
  const page=Math.max(1,Number(url.searchParams.get("page"))||1);
  const pageSize=Math.min(200,Math.max(1,Number(url.searchParams.get("pageSize"))||50));
  const includeInactive=url.searchParams.get("includeInactive")==="1";

  const params:any[]=[];
  const conds=["1=1"];
  if(!includeInactive)conds.push("v.is_active=true");
  if(column){params.push(column);conds.push(`v.source_column=$${params.length}`);}
  if(q){params.push(`%${q}%`);conds.push(`(v.source_column ilike $${params.length} or v.source_value ilike $${params.length} or v.display_name ilike $${params.length})`);}

  const c=await getPool().connect();
  try{
   const totalQ=await c.query(`select count(*)::int n from md_open_job_column_value v where ${conds.join(" and ")}`,params);
   const listQ=await c.query(`
     select v.id,v.source_column,v.source_value,v.display_name,
            v.seen_count,v.last_seen_at,v.is_active,v.created_at,v.updated_at
     from md_open_job_column_value v
     where ${conds.join(" and ")}
     order by v.source_column,v.source_value
     offset ${(page-1)*pageSize} limit ${pageSize}
   `,params);
   const columnsQ=await c.query(`
     select source_column,count(*)::int value_count
     from md_open_job_column_value
     where is_active=true
     group by source_column
     order by source_column
   `);
   return NextResponse.json({rows:listQ.rows,total:Number(totalQ.rows[0]?.n||0),page,pageSize,columns:columnsQ.rows});
  }finally{c.release()}
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }
}

export async function POST(req:NextRequest){
 try{
  const b=await req.json();
  const c=await getPool().connect();
  try{
   if(b.action==="rebuild"){
    await c.query(`select public.rebuild_open_job_column_values()`);
    invalidatePlanningStaticData();
    invalidateConfigHealth();
    return NextResponse.json({ok:true,rebuild:true});
   }

   const sourceColumn=clean(b.source_column);
   const sourceValue=clean(b.source_value);
   const displayName=clean(b.display_name)||null;

   if(!sourceColumn||!sourceValue)
    return NextResponse.json({error:"Source Column và Source Value là bắt buộc."},{status:400});

   await c.query(`
     insert into md_open_job_column_value(source_column,source_value,display_name,seen_count,last_seen_at,is_active)
     values($1,$2,$3,0,now(),true)
     on conflict(source_column,source_value)
     do update set
       display_name=coalesce(excluded.display_name,md_open_job_column_value.display_name),
       is_active=true,
       updated_at=now()
   `,[sourceColumn,sourceValue,displayName]);
   invalidatePlanningStaticData();
   invalidateConfigHealth();

   return NextResponse.json({ok:true});
  }finally{c.release()}
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }
}

export async function PATCH(req:NextRequest){
 try{
  const b=await req.json();
  const id=Number(b.id);
  if(!Number.isFinite(id))
   return NextResponse.json({error:"ID không hợp lệ."},{status:400});

  const c=await getPool().connect();
  try{
   await c.query(`
     update md_open_job_column_value
     set display_name=coalesce($2,display_name),
         is_active=coalesce($3,is_active),
         updated_at=now()
     where id=$1
   `,[id,b.display_name==null?null:clean(b.display_name),b.is_active==null?null:Boolean(b.is_active)]);
   invalidatePlanningStaticData();
   invalidateConfigHealth();
   return NextResponse.json({ok:true});
  }finally{c.release()}
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }
}

export async function DELETE(req:NextRequest){
 try{
  const b=await req.json();
  const id=Number(b.id);
  if(!Number.isFinite(id))
   return NextResponse.json({error:"ID không hợp lệ."},{status:400});

  const c=await getPool().connect();
  try{
   await c.query(`
     update md_open_job_column_value
     set is_active=false,updated_at=now()
     where id=$1
   `,[id]);
   invalidatePlanningStaticData();
   invalidateConfigHealth();
   return NextResponse.json({ok:true});
  }finally{c.release()}
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }
}
