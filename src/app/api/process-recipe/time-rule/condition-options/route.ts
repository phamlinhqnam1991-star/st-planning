import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";

const clean=(v:unknown)=>String(v??"").trim();

// Dropdown source for Process Time conditions.
// No column -> list All Open Job columns.
// With column -> active unique values of that column.
export async function GET(req:NextRequest){
 const {denied}=await requireApiPermission("config.view");if(denied)return denied;
 try{
  const url=new URL(req.url);
  const column=clean(url.searchParams.get("column"));
  const q=clean(url.searchParams.get("q"));
  const limit=Math.min(2000,Math.max(1,Number(url.searchParams.get("limit"))||1000));
  const c=await getPool().connect();
  try{
   if(!column){
    const columns=await c.query(`
      select source_column,count(*)::int value_count
      from md_open_job_column_value
      where is_active=true
      group by source_column
      order by source_column
    `);
    return NextResponse.json({columns:columns.rows});
   }

   const params:any[]=[column];
   let qSql="";
   if(q){
    params.push(`%${q}%`);
    qSql=`and (source_value ilike $2 or coalesce(display_name,'') ilike $2)`;
   }
   params.push(limit+1);
   const limPos=params.length;
   const rows=await c.query(`
     select source_value,coalesce(nullif(display_name,''),source_value) display_name
     from md_open_job_column_value
     where is_active=true
       and source_column=$1
       ${qSql}
     order by source_value
     limit $${limPos}
   `,params);
   const truncated=rows.rows.length>limit;
   return NextResponse.json({
    column,
    rows:rows.rows.slice(0,limit),
    truncated,
    limit
   });
  }finally{c.release()}
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }
}
