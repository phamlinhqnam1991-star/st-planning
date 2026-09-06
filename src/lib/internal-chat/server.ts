import {randomUUID} from "node:crypto";
import {getPool} from "@/lib/db";
import type {AccessContext} from "@/lib/security/access";

const clean=(v:unknown)=>String(v??"").trim();


export async function emitInternalChatRealtime(c:any,userId:string|null|undefined,eventKey:string):Promise<void>{
 try{
  await c.query(`
   insert into system_change_event(event_id,at_ms,source_tab_id,method,path,domains,created_by_user_id)
   values($1,$2,'server-internal-chat','SYSTEM','/api/internal-chat/system',$3::text[],$4)
   on conflict(event_id) do nothing
  `,[`chat-${randomUUID()}`,Date.now(),["CHAT"],clean(userId)||null]);
 }catch{/* Realtime feed is fail-open. Chat/business changes must never fail because migration 086/feed is unavailable. */}
}

export type InternalChangeNotification={
 ctx:AccessContext;
 dbClient?:any;
 eventKey:string;
 summary:string;
 batchId?:number|null;
 batchNo?:string|null;
 standardOperation?:string|null;
 jobNums?:string[];
 affectedMains?:string[];
 entityType?:string|null;
 entityId?:string|number|null;
 metadata?:Record<string,unknown>;
};

async function plannerForMain(c:any,main:unknown):Promise<string|null>{
 const op=clean(main);
 if(!op)return null;
 const q=await c.query(`
  select coalesce(w.planner_owner,a.planner_owner) planner_owner
  from md_schedule_area_operation m
  join md_schedule_area a on a.schedule_area_code=m.schedule_area_code and a.is_active=true
  left join md_planner_work_assignment w on w.schedule_area_code=a.schedule_area_code and w.is_active=true
  where m.is_active=true and upper(trim(m.standard_operation))=upper(trim($1))
  order by a.display_order,a.schedule_area_code
  limit 1
 `,[op]);
 const owner=clean(q.rows[0]?.planner_owner);
 return owner==="1"||owner==="2"?owner:null;
}

async function plannerMapForMains(c:any,mains:string[]){
 const normalized=[...new Set(mains.map(x=>clean(x).toUpperCase()).filter(Boolean))];
 if(!normalized.length)return new Map<string,string|null>();
 const q=await c.query(`
  select x.main,
         coalesce(w.planner_owner,a.planner_owner) planner_owner
  from unnest($1::text[]) x(main)
  left join lateral(
   select m.schedule_area_code
   from md_schedule_area_operation m
   join md_schedule_area sa on sa.schedule_area_code=m.schedule_area_code and sa.is_active=true
   where m.is_active=true and upper(trim(m.standard_operation))=upper(trim(x.main))
   order by sa.display_order,sa.schedule_area_code
   limit 1
  ) map on true
  left join md_schedule_area a on a.schedule_area_code=map.schedule_area_code
  left join md_planner_work_assignment w on w.schedule_area_code=map.schedule_area_code and w.is_active=true
 `,[normalized]);
 const result=new Map<string,string|null>();
 for(const row of q.rows){
  const main=clean(row.main).toUpperCase();
  const owner=clean(row.planner_owner);
  result.set(main,owner==="1"||owner==="2"?owner:null);
 }
 return result;
}

async function downstreamFromBatch(c:any,batchId:number){
 const q=await c.query(`
  select distinct upper(trim(p2.standard_operation)) next_main
  from planning_batch_job bj
  join planning_job_operation cur on cur.id=bj.planning_job_operation_id
  join planning_job_operation p2
    on p2.job_num=cur.job_num
   and p2.is_active=true
   and p2.planning_seq>cur.planning_seq
  where bj.batch_id=$1
    and nullif(trim(p2.standard_operation),'') is not null
  order by 1
 `,[batchId]);
 return q.rows.map((r:any)=>clean(r.next_main)).filter(Boolean);
}

async function downstreamFromJobs(c:any,jobNums:string[],sourceMain:string){
 const jobs=[...new Set(jobNums.map(clean).filter(Boolean))];
 if(!jobs.length||!sourceMain)return [];
 const q=await c.query(`
  with current_op as (
   select j.job_num,cur.planning_seq
   from unnest($1::text[]) j(job_num)
   join lateral(
    select p.planning_seq
    from planning_job_operation p
    where p.job_num=j.job_num and p.is_active=true
      and upper(trim(p.standard_operation))=upper(trim($2))
    order by p.planning_seq
    limit 1
   ) cur on true
  )
  select distinct upper(trim(p2.standard_operation)) next_main
  from current_op cur
  join planning_job_operation p2
    on p2.job_num=cur.job_num and p2.is_active=true and p2.planning_seq>cur.planning_seq
  where nullif(trim(p2.standard_operation),'') is not null
  order by 1
 `,[jobs,sourceMain]);
 return q.rows.map((r:any)=>clean(r.next_main)).filter(Boolean);
}

/**
 * Best-effort notification channel. It always uses its own DB connection and
 * never throws back into the business transaction, so Chat cannot roll back
 * Planning / Scheduling / Production changes that have already committed.
 */
export async function notifyInternalChange(args:InternalChangeNotification):Promise<void>{
 let ownClient=false;
 let c:any=args.dbClient||null;
 try{
  if(!c){c=await getPool().connect();ownClient=true;}
  try{
   let sourceMain=clean(args.standardOperation);
   let batchNo=clean(args.batchNo);
   if(args.batchId&&(!sourceMain||!batchNo)){
    const bq=await c.query(`select batch_no,standard_operation from planning_batch where id=$1 limit 1`,[args.batchId]);
    sourceMain=sourceMain||clean(bq.rows[0]?.standard_operation);
    batchNo=batchNo||clean(bq.rows[0]?.batch_no);
   }

   const sourcePlanner=await plannerForMain(c,sourceMain);
   let affectedMains=(args.affectedMains||[]).map(clean).filter(Boolean);
   if(!affectedMains.length&&args.batchId){
    affectedMains=await downstreamFromBatch(c,args.batchId);
   }
   if(!affectedMains.length&&args.jobNums?.length&&sourceMain){
    affectedMains=await downstreamFromJobs(c,args.jobNums,sourceMain);
   }
   affectedMains=[...new Set(affectedMains.map(x=>x.toUpperCase()))];

   const ownerMap=await plannerMapForMains(c,affectedMains);
   const otherPlanners=[...new Set(
    affectedMains.map(m=>ownerMap.get(m)||null)
     .filter((p):p is string=>Boolean(p&&p!==sourcePlanner))
   )].sort();
   const isCross=Boolean(sourcePlanner&&otherPlanners.length);
   const affectedPlanner=otherPlanners.join(",")||null;
   const affectedMain=affectedMains.filter(m=>{
    const owner=ownerMap.get(m);return !sourcePlanner||!owner||owner!==sourcePlanner;
   }).join(" / ")||affectedMains.join(" / ")||null;

   const crossText=isCross
    ?` · CROSS-PLANNER: Planner ${sourcePlanner} → ${otherPlanners.map(x=>`Planner ${x}`).join(" / ")}${affectedMain?` · Downstream ${affectedMain}`:""}`
    :"";
   const body=`${args.summary}${crossText}`;
   const messageQ=await c.query(`
    insert into app_chat_message(
     message_type,sender_user_id,sender_display_name,recipient_user_id,body,event_key,is_cross_planner,
     source_main,affected_main,source_planner,affected_planner,entity_type,entity_id,metadata_json
    ) values('SYSTEM',$1,$2,null,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
    returning id
   `,[
    args.ctx.userId,args.ctx.displayName||args.ctx.email,body,clean(args.eventKey)||"SYSTEM_CHANGE",isCross,
    sourceMain||null,affectedMain,sourcePlanner,affectedPlanner,args.entityType||null,
    args.entityId==null?(args.batchId?String(args.batchId):null):String(args.entityId),
    JSON.stringify({
     actorEmail:args.ctx.email,actorRoles:args.ctx.roles,batchId:args.batchId||null,batchNo:batchNo||null,
     jobNums:args.jobNums||[],affectedMains,...(args.metadata||{})
    })
   ]);
   await emitInternalChatRealtime(c,args.ctx.userId,`${clean(args.eventKey)||"SYSTEM_CHANGE"}:${messageQ.rows[0]?.id||""}`);
  }finally{if(ownClient)try{c?.release();}catch{}}
 }catch(error){
  console.error("[internal-chat] notification skipped:",error instanceof Error?error.message:String(error));
 }
}
