import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";

// v324: lazy All Open Source columns for the legacy board.
// Main Candidate load now runs light (no source_data — it was ~2.8MB of the
// ~3.1MB payload and stalled slow links past 25s). This endpoint fetches
// source_data ONLY for the jobs the board currently shows, in the background,
// so the board renders immediately and source columns populate afterwards.
export const maxDuration=60;

export async function POST(req:NextRequest){
 const {denied}=await requireApiPermission("planning.edit");
 if(denied)return denied;
 const b=await req.json().catch(()=>({}));
 const jobNums=(Array.isArray(b.jobNums)?b.jobNums:[])
  .map((x:unknown)=>String(x??"").trim())
  .filter(Boolean)
  .slice(0,1000);
 if(!jobNums.length)return NextResponse.json({rows:[]});
 const c=await getPool().connect();
 try{
  const q=await c.query(
   `select job_num, source_data
    from open_job_current
    where job_num=any($1::text[])`,
   [jobNums]
  );
  return NextResponse.json({rows:q.rows});
 }catch(e){
  const message=e instanceof Error?e.message:String(e);
  console.error(`[candidates/source] ERROR jobs=${jobNums.length}: ${message}`);
  return NextResponse.json({error:message},{status:500});
 }finally{c.release();}
}
