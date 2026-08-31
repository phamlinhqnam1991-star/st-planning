import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";
import {getRecentPlanningBatches} from "@/lib/planning/recent-batches";

export const maxDuration=30;

export async function GET(){
 const denied=await requireApiUser();
 if(denied)return denied;
 const c=await getPool().connect();
 try{
  // v315: non-critical Planning data. It is intentionally loaded only after
  // Candidate metadata so these queries never block the first usable board.
  const batchesQ=await getRecentPlanningBatches(c,100);
  const nextOpsQ=await c.query(`
    select upper(trim(j.next_operation)) operation_code,count(*)::int jobs
    from open_job_current j
    where j.is_open=true
      and nullif(trim(coalesce(j.next_operation,'')),'') is not null
    group by upper(trim(j.next_operation))
    order by jobs desc,operation_code`);

  return NextResponse.json({
   availableBatches:batchesQ.rows,
   nextOperations:nextOpsQ.rows
  },{
   headers:{"Cache-Control":"private, no-store"}
  });
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{
  c.release();
 }
}
