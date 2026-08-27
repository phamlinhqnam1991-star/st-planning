import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";

const nullableNumber=(v:unknown)=>v==null||String(v).trim()===""?null:Number(v);

export async function POST(req:Request){
 const b=await req.json().catch(()=>({}));
 const phase=String(b.phase||"").toUpperCase();
 const duration=Number(b.duration_minutes);
 if(!["LOADING","UNLOADING"].includes(phase)||!Number.isFinite(duration)||duration<=0)
  return NextResponse.json({error:"Phase và Duration hợp lệ là bắt buộc."},{status:400});
 const c=await getPool().connect();
 try{
  const q=await c.query(`insert into md_chemical_handling_time_rule
   (phase,priority,qty_min,qty_max,surface_min_dm2,surface_max_dm2,duration_minutes,note)
   values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,[
    phase,Number(b.priority)||100,nullableNumber(b.qty_min),nullableNumber(b.qty_max),
    nullableNumber(b.surface_min_dm2),nullableNumber(b.surface_max_dm2),Math.round(duration),
    String(b.note||"").trim()||null
   ]);
  return NextResponse.json({ok:true,row:q.rows[0]});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400})}
 finally{c.release()}
}

export async function DELETE(req:Request){
 const id=Number((await req.json().catch(()=>({}))).id);
 if(!id)return NextResponse.json({error:"Missing id"},{status:400});
 const q=await getPool().query(`update md_chemical_handling_time_rule set is_active=false,updated_at=now() where id=$1 returning id`,[id]);
 return NextResponse.json({ok:Boolean(q.rowCount)});
}
