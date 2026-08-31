import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";

import {requireApiUser} from "@/lib/api-auth";
export async function POST(
 req:Request,
 {params}:{params:Promise<{id:string}>}
){
 const denied=await requireApiUser();
 if(denied)return denied;
 const {id}=await params;
 const eventId=Number(id);
 const body=await req.json().catch(()=>({}));
 const acknowledgedBy=String(body.acknowledged_by||"Planner").trim()||"Planner";

 if(!Number.isFinite(eventId))
  return NextResponse.json({error:"Invalid alert id."},{status:400});

 const c=await getPool().connect();
 try{
  const q=await c.query(`
   update planning_handover_change_event
   set status='ACKNOWLEDGED',
       acknowledged_at=now(),
       acknowledged_by=$2
   where id=$1
   returning *
  `,[eventId,acknowledgedBy]);

  if(!q.rowCount)
   return NextResponse.json({error:"Alert not found."},{status:404});

  return NextResponse.json({ok:true,alert:q.rows[0]});
 }catch(e){
  return NextResponse.json(
   {error:e instanceof Error?e.message:String(e)},
   {status:400}
  );
 }finally{
  c.release();
 }
}
