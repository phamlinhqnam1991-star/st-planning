import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {invalidatePlanningStaticData} from "@/lib/planning/planning-static-cache";
import {invalidateConfigHealth} from "@/lib/config/config-health";

export const runtime="nodejs";
export const maxDuration=60;

const clean=(v:unknown)=>String(v??"").trim();
const norm=(v:unknown)=>clean(v).toUpperCase();
const cleanOps=(v:unknown)=>Array.isArray(v)
 ?v.map(norm).filter(Boolean)
 :[];

function manualBridgeKey(previous:string,ops:string[],next:string){
 return `MANUAL|${norm(previous)}|${ops.map(norm).join(">")}|${norm(next)}`;
}

async function readSegment(c:any,id:number){
 const q=await c.query(`
  select s.id,s.previous_main_operation,s.next_main_operation,s.intermediate_signature,
         s.route_count,s.source,coalesce(s.priority,100)::int priority,s.note,s.is_active,
         coalesce(
          jsonb_agg(o.operation_code order by o.sequence_no) filter(where o.id is not null),
          '[]'::jsonb
         ) intermediate_operations
  from md_intermediate_bridge_segment s
  left join md_intermediate_bridge_operation o on o.segment_id=s.id
  where s.id=$1
  group by s.id,s.previous_main_operation,s.next_main_operation,s.intermediate_signature,
           s.route_count,s.source,s.priority,s.note,s.is_active
 `,[id]);
 return q.rows[0]||null;
}

export async function GET(){
 const c=await getPool().connect();
 try{
  const q=await c.query(`
   select s.id,s.previous_main_operation,s.next_main_operation,s.intermediate_signature,
          s.route_count,s.source,coalesce(s.priority,100)::int priority,s.note,s.is_active,
          coalesce(
           jsonb_agg(o.operation_code order by o.sequence_no) filter(where o.id is not null),
           '[]'::jsonb
          ) intermediate_operations
   from md_intermediate_bridge_segment s
   left join md_intermediate_bridge_operation o on o.segment_id=s.id
   where s.source='MANUAL' and s.is_active=true
   group by s.id,s.previous_main_operation,s.next_main_operation,s.intermediate_signature,
            s.route_count,s.source,s.priority,s.note,s.is_active
   order by coalesce(s.priority,100) desc,s.id desc
  `);
  return NextResponse.json({ok:true,segments:q.rows});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{c.release()}
}

export async function POST(req:Request){
 const c=await getPool().connect();
 try{
  const body=await req.json().catch(()=>({}));
  const action=clean(body.action||"save").toLowerCase();
  const id=Number(body.id||0);
  await c.query("begin");

  if(action==="deactivate"){
   if(!Number.isFinite(id)||id<=0)throw new Error("Thiếu Manual Segment id.");
   const q=await c.query(`
    update md_intermediate_bridge_segment
       set is_active=false,updated_at=now()
     where id=$1 and source='MANUAL'
     returning id
   `,[id]);
   if(!q.rowCount)throw new Error("Không tìm thấy Manual Segment đang active.");
   await c.query("commit");
   invalidatePlanningStaticData();
   invalidateConfigHealth();
   return NextResponse.json({ok:true,deactivated:id,planning_chain_rebuild_required:true});
  }

  if(action!=="save")throw new Error(`Action không hỗ trợ: ${action}`);

  const previous=norm(body.previous_main_operation);
  const next=norm(body.next_main_operation);
  const ops=cleanOps(body.intermediate_operations);
  const priority=Math.max(-100000,Math.min(100000,Math.trunc(Number(body.priority??100))||100));
  const note=clean(body.note)||null;

  if(!previous)throw new Error("Chọn Previous Main.");
  if(!next)throw new Error("Chọn Next Main.");
  if(!ops.length)throw new Error("Manual Segment phải có ít nhất 1 Intermediate Operation.");
  if(ops.some(x=>x==="PIONBL"))throw new Error("PIONBL là operation skip; không thêm PIONBL vào Manual Intermediate Sequence.");

  const mainQ=await c.query(`
   select upper(trim(standard_operation)) standard_operation
   from md_planning_operation_scope
   where is_active=true and upper(trim(standard_operation))=any($1::text[])
  `,[[previous,next]]);
  const found=new Set(mainQ.rows.map((r:any)=>norm(r.standard_operation)));
  if(!found.has(previous))throw new Error(`${previous} chưa phải Main Planning active.`);
  if(!found.has(next))throw new Error(`${next} chưa phải Main Planning active.`);

  const signature=ops.join(" → ");
  const bridgeKey=manualBridgeKey(previous,ops,next);
  let segmentId=id;

  if(Number.isFinite(id)&&id>0){
   const q=await c.query(`
    update md_intermediate_bridge_segment
       set bridge_key=$2,
           previous_main_operation=$3,
           next_main_operation=$4,
           intermediate_signature=$5,
           priority=$6,
           note=$7,
           route_count=0,
           is_active=true,
           updated_at=now()
     where id=$1 and source='MANUAL'
     returning id
   `,[id,bridgeKey,previous,next,signature,priority,note]);
   if(!q.rowCount)throw new Error("Không tìm thấy Manual Segment để sửa.");
   segmentId=Number(q.rows[0].id);
  }else{
   const q=await c.query(`
    insert into md_intermediate_bridge_segment(
      bridge_key,previous_main_operation,next_main_operation,intermediate_signature,
      source,route_count,is_active,priority,note,created_at,updated_at
    ) values($1,$2,$3,$4,'MANUAL',0,true,$5,$6,now(),now())
    on conflict(bridge_key) do update set
      previous_main_operation=excluded.previous_main_operation,
      next_main_operation=excluded.next_main_operation,
      intermediate_signature=excluded.intermediate_signature,
      source='MANUAL',route_count=0,is_active=true,priority=excluded.priority,note=excluded.note,updated_at=now()
    returning id
   `,[bridgeKey,previous,next,signature,priority,note]);
   segmentId=Number(q.rows[0].id);
  }

  await c.query(`delete from md_intermediate_bridge_operation where segment_id=$1`,[segmentId]);
  for(let i=0;i<ops.length;i++){
   await c.query(`
    insert into md_intermediate_bridge_operation(segment_id,sequence_no,operation_code)
    values($1,$2,$3)
   `,[segmentId,i+1,ops[i]]);
  }

  await c.query("commit");
  invalidatePlanningStaticData();
  invalidateConfigHealth();
  return NextResponse.json({ok:true,segment:await readSegment(c,segmentId),planning_chain_rebuild_required:true});
 }catch(e){
  try{await c.query("rollback")}catch{}
  const message=e instanceof Error?e.message:String(e);
  const status=message.includes("duplicate key")?409:400;
  return NextResponse.json({error:message},{status});
 }finally{c.release()}
}
