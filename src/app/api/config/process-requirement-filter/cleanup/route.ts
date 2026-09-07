import {NextResponse} from "next/server";
import {revalidateTag} from "next/cache";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";
import {invalidateLiveRecipeContext} from "@/lib/planning/planning-static-cache";

export async function POST(req:Request){
 const {denied}=await requireApiPermission("config.edit");
 if(denied)return denied;
 try{
  const body=await req.json().catch(()=>({}));
  if(String(body.confirmation||"").trim().toUpperCase()!=="TRUNCATE")
   return NextResponse.json({error:"Enter TRUNCATE exactly to confirm."},{status:400});
  const c=await getPool().connect();
  try{
   const beforeQ=await c.query(`select pg_total_relation_size('public.md_process_requirement')::bigint bytes`);
   await c.query("truncate table public.md_process_requirement");
   const afterQ=await c.query(`select pg_total_relation_size('public.md_process_requirement')::bigint bytes`);
   invalidateLiveRecipeContext();
   revalidateTag("config-recipe",{expire:0});
   return NextResponse.json({ok:true,beforeBytes:Number(beforeQ.rows[0]?.bytes||0),afterBytes:Number(afterQ.rows[0]?.bytes||0)});
  }finally{c.release();}
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:String(error)},{status:500});}
}
