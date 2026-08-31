import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";

import {requireApiUser} from "@/lib/api-auth";
export async function PUT(req:Request){
 const denied=await requireApiUser();
 if(denied)return denied;
 const body=await req.json().catch(()=>({}));
 const ids=Array.isArray(body.schedule_ids)
  ? body.schedule_ids.map(Number).filter(Number.isFinite)
  : [];

 if(!ids.length)
  return NextResponse.json({error:"Không có Schedule để sắp xếp."},{status:400});

 const unique=[...new Set(ids)];
 const c=await getPool().connect();

 try{
  await c.query("begin");

  const q=await c.query(`
   select id,status
   from planning_schedule
   where id=any($1::bigint[])
     and status<>'CANCELLED'
   for update
  `,[unique]);

  if(q.rowCount!==unique.length)
   throw new Error("Một số Schedule không còn tồn tại.");

  for(let i=0;i<unique.length;i++){
   await c.query(`
    update planning_schedule
    set sequence_no=$2,updated_at=now()
    where id=$1
   `,[unique[i],(i+1)*10]);
  }

  await c.query("commit");
  return NextResponse.json({ok:true});
 }catch(e){
  await c.query("rollback");
  return NextResponse.json(
   {error:e instanceof Error?e.message:String(e)},
   {status:400}
  );
 }finally{
  c.release();
 }
}
