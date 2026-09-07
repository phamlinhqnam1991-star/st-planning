import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";

const clean=(v:unknown)=>String(v??"").trim();

/**
 * v285 - Dependent Recipe Name suggestions.
 *
 * Source-column dropdowns still come from Open Job Column Values, but the
 * relationship Recipe No -> Recipe Name must be resolved from the SAME row in
 * open_job_current. md_open_job_column_value only stores independent unique
 * lists and cannot tell which two values belonged to the same Job.
 */
export async function GET(req:NextRequest){
 const {denied}=await requireApiPermission("config.view");
 if(denied)return denied;
 try{
  const url=new URL(req.url);
  const noColumn=clean(url.searchParams.get("recipeNoColumn"));
  const noValue=clean(url.searchParams.get("recipeNo"));
  const nameColumn=clean(url.searchParams.get("recipeNameColumn"));

  if(!noColumn||!noValue||!nameColumn){
   return NextResponse.json({rows:[]});
  }

  const c=await getPool().connect();
  try{
   // Validate only that both source columns are active. Comparison is
   // case/space-insensitive because source headings can come from Excel.
   const columnsQ=await c.query(`
     select upper(trim(source_column)) source_column
     from md_open_job_column_value
     where is_active=true
       and upper(trim(source_column)) in (upper(trim($1)),upper(trim($2)))
     group by upper(trim(source_column))
   `,[noColumn,nameColumn]);
   const activeColumns=new Set(columnsQ.rows.map((r:any)=>String(r.source_column)));
   if(!activeColumns.has(noColumn.trim().toUpperCase())||!activeColumns.has(nameColumn.trim().toUpperCase())){
    return NextResponse.json({rows:[]});
   }

   const q=await c.query(`
     with job_values as (
       select
         coalesce(nullif(trim(o.source_data ->> $1),''),nullif(trim(to_jsonb(o) ->> $1),'')) as recipe_no_value,
         coalesce(nullif(trim(o.source_data ->> $2),''),nullif(trim(to_jsonb(o) ->> $2),'')) as recipe_name_value
       from open_job_current o
       where coalesce(o.is_open,true)=true
     ), matched as (
       select recipe_name_value,count(*)::int seen_count
       from job_values
       where recipe_name_value is not null
         and upper(trim(recipe_no_value))=upper(trim($3))
       group by recipe_name_value
     ), normalized as (
       select distinct on (upper(trim(m.recipe_name_value)))
         m.recipe_name_value as value,
         m.seen_count
       from matched m
       order by upper(trim(m.recipe_name_value)),m.seen_count desc,m.recipe_name_value
     )
     select
       n.value,
       coalesce(nullif(trim(v.display_name),''),n.value) as label,
       n.seen_count
     from normalized n
     left join lateral (
       select x.display_name
       from md_open_job_column_value x
       where x.is_active=true
         and upper(trim(x.source_column))=upper(trim($2))
         and upper(trim(x.source_value))=upper(trim(n.value))
       order by x.updated_at desc,x.id desc
       limit 1
     ) v on true
     order by n.value
     limit 1000
   `,[noColumn,nameColumn,noValue]);

   return NextResponse.json({
    rows:q.rows.map((r:any)=>(
     {value:String(r.value),label:String(r.label||r.value),seen_count:Number(r.seen_count||0)}
    ))
   });
  }finally{c.release()}
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }
}
