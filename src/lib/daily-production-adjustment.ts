import type {PoolClient} from "pg";

export type AdjustmentItemType="CARRY_OVER"|"REMOVE_JOB"|"ADD_JOB";
export type AdjustmentStatus="PENDING"|"APPROVED"|"REJECTED"|"ERROR";

const clean=(v:unknown)=>String(v??"").trim();
const iso=(v:unknown)=>{if(!v)return null;const d=v instanceof Date?v:new Date(String(v));return Number.isNaN(d.getTime())?null:d.toISOString();};

export function productionWindow(date:string){
 const start=new Date(`${date}T06:00:00+07:00`);
 const end=new Date(start.getTime()+24*60*60*1000);
 return {start:start.toISOString(),end:end.toISOString(),nextStart:end.toISOString()};
}

export async function ensureAdjustmentSet(c:PoolClient,productionDate:string){
 const q=await c.query(`
  insert into production_adjustment_set(production_date,status,generated_at,updated_at)
  values($1,'DRAFT',now(),now())
  on conflict(production_date) do update set generated_at=now(),updated_at=now()
  returning *
 `,[productionDate]);
 return q.rows[0];
}

async function plannerForOperation(c:PoolClient,operation:string){
 const q=await c.query(`
  select w.planner_owner
  from md_schedule_area_operation m
  join md_schedule_area a on a.schedule_area_code=m.schedule_area_code and a.is_active=true
  left join md_planner_work_assignment w on w.schedule_area_code=a.schedule_area_code and w.is_active=true
  where m.is_active=true and upper(trim(m.standard_operation))=upper(trim($1))
  order by a.display_order
  limit 1
 `,[operation]);
 return clean(q.rows[0]?.planner_owner)||null;
}

export async function scanProductionAdjustments(c:PoolClient,productionDate:string){
 const set=await ensureAdjustmentSet(c,productionDate);
 const {start,end,nextStart}=productionWindow(productionDate);
 const rowsQ=await c.query(`
  select
   b.id batch_id,b.batch_no,b.standard_operation,b.total_qty,b.process_minutes,
   s.id schedule_id,s.resource_code,s.planned_start,s.planned_end,s.duration_minutes,
   bj.planning_job_operation_id,bj.job_num,bj.qty,bj.surface_dm2,
   coalesce(pej.execution_status,pe.execution_status,'WAITING') execution_status,
   coalesce(pej.actual_start,pe.actual_start) actual_start,
   coalesce(pej.actual_end,pe.actual_end) actual_end,
   p.planning_seq
  from planning_schedule s
  join planning_batch b on b.id=s.batch_id and b.status<>'CANCELLED'
  join planning_batch_job bj on bj.batch_id=b.id
  join planning_job_operation p on p.id=bj.planning_job_operation_id
  left join production_execution pe
    on pe.batch_id=b.id and pe.source_type='BATCH' and pe.source_key='BATCH:'||b.id::text
  left join production_execution_job pej
    on pej.batch_id=b.id and pej.source_type='BATCH' and pej.planning_job_operation_id=bj.planning_job_operation_id
  where s.status<>'CANCELLED'
    and s.planned_start >= $1::timestamptz and s.planned_start < $2::timestamptz
  order by s.planned_start,b.batch_no,bj.job_num
 `,[start,end]);

 const byBatch=new Map<number,any[]>();
 for(const r of rowsQ.rows){const id=Number(r.batch_id);const a=byBatch.get(id)||[];a.push(r);byBatch.set(id,a);}

 // V485: SCAN is a reconciliation snapshot, not an append-only detector.
 // Keep only PENDING auto-generated findings that are still true in the latest
 // Production Report. APPROVED/REJECTED items remain untouched for audit.
 const activeCarryKeys=new Set<string>();
 const activeRemoveKeys=new Set<string>();

 for(const [batchId,rows] of byBatch){
  const first=rows[0];
  const unfinished=rows.filter(r=>r.execution_status!=="DONE");
  if(!unfinished.length)continue;
  const planner=await plannerForOperation(c,first.standard_operation);
  const carryPjo=Number(rows[0].planning_job_operation_id);
  activeCarryKeys.add(`${batchId}:${carryPjo}`);
  const duration=Math.max(1,Number(first.duration_minutes||first.process_minutes||60));
  const proposedStart=new Date(nextStart);
  const proposedEnd=new Date(proposedStart.getTime()+duration*60000);
  await c.query(`
   insert into production_adjustment_item(
    adjustment_set_id,item_type,status,batch_id,schedule_id,planning_job_operation_id,job_num,
    standard_operation,source_planner,old_start,old_end,proposed_start,proposed_end,
    reason,validation_status,validation_message,proposal_json,updated_at
   ) values($1,'CARRY_OVER','PENDING',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'WARNING',$13,$14::jsonb,now())
   on conflict(adjustment_set_id,item_type,batch_id,planning_job_operation_id)
   do update set schedule_id=excluded.schedule_id,old_start=excluded.old_start,old_end=excluded.old_end,
     proposed_start=case when production_adjustment_item.status='PENDING' then coalesce(production_adjustment_item.proposed_start,excluded.proposed_start) else production_adjustment_item.proposed_start end,
     proposed_end=case when production_adjustment_item.status='PENDING' then coalesce(production_adjustment_item.proposed_end,excluded.proposed_end) else production_adjustment_item.proposed_end end,
     source_planner=excluded.source_planner,reason=excluded.reason,validation_message=excluded.validation_message,
     proposal_json=excluded.proposal_json,updated_at=now()
  `,[set.id,batchId,Number(first.schedule_id),carryPjo,clean(unfinished[0].job_num),clean(first.standard_operation),planner,
      first.planned_start,first.planned_end,proposedStart.toISOString(),proposedEnd.toISOString(),
      `${unfinished.length}/${rows.length} Job chưa hoàn thành trước mốc 05:59`,
      `Batch ${first.batch_no}: ${unfinished.length} Job chưa DONE`,JSON.stringify({unfinishedJobs:unfinished.map(r=>({jobNum:r.job_num,status:r.execution_status,qty:Number(r.qty||0)})),resource:first.resource_code})]);

  for(const r of unfinished.filter(x=>x.execution_status==="WAITING")){
   activeRemoveKeys.add(`${batchId}:${Number(r.planning_job_operation_id)}`);
   await c.query(`
    insert into production_adjustment_item(
     adjustment_set_id,item_type,status,batch_id,schedule_id,planning_job_operation_id,job_num,
     standard_operation,source_planner,reason,validation_status,validation_message,proposal_json,updated_at
    ) values($1,'REMOVE_JOB','PENDING',$2,$3,$4,$5,$6,$7,$8,'WARNING',$9,$10::jsonb,now())
    on conflict(adjustment_set_id,item_type,batch_id,planning_job_operation_id)
    do update set reason=excluded.reason,validation_message=excluded.validation_message,proposal_json=excluded.proposal_json,updated_at=now()
   `,[set.id,batchId,Number(first.schedule_id),Number(r.planning_job_operation_id),clean(r.job_num),clean(first.standard_operation),planner,
       `Job ${r.job_num} còn WAITING trong Production Report`,
       "Đề xuất bớt khỏi lô chỉ khi Job thực tế chưa bắt đầu.",JSON.stringify({executionStatus:r.execution_status,qty:Number(r.qty||0),surface:Number(r.surface_dm2||0)})]);
  }
 }

 // Remove stale PENDING findings from an earlier scan. Example: a Batch was
 // WAITING during the first scan, Production later reports DONE, then the next
 // scan must make that Carry Over / Remove Job disappear immediately.
 const pendingQ=await c.query(`
  select id,item_type,batch_id,planning_job_operation_id
  from production_adjustment_item
  where adjustment_set_id=$1 and status='PENDING' and item_type in ('CARRY_OVER','REMOVE_JOB')
 `,[set.id]);
 const staleIds=pendingQ.rows.filter((r:any)=>{
  const key=`${Number(r.batch_id)}:${Number(r.planning_job_operation_id)}`;
  return r.item_type==='CARRY_OVER'?!activeCarryKeys.has(key):!activeRemoveKeys.has(key);
 }).map((r:any)=>Number(r.id)).filter(Boolean);
 if(staleIds.length){
  await c.query(`delete from production_adjustment_item where adjustment_set_id=$1 and status='PENDING' and id=any($2::bigint[])`,[set.id,staleIds]);
 }

 await c.query(`update production_adjustment_set set status='READY',updated_at=now() where id=$1 and status='DRAFT'`,[set.id]);
 return set;
}

export async function loadAdjustmentData(c:PoolClient,productionDate:string){
 const setQ=await c.query(`select * from production_adjustment_set where production_date=$1`,[productionDate]);
 const set=setQ.rows[0]||null;
 if(!set)return {set:null,items:[]};
 const q=await c.query(`
  select i.*,b.batch_no,b.recipe_key,b.total_qty,b.total_surface_dm2,s.resource_code,
         pr.recipe_no,pr.recipe_name,
         coalesce(oj.part_num,'') part_num,coalesce(oj.revision_num,'') revision_num,
         coalesce(oj.current_good_wip_qty,oj.prod_qty,0) job_qty
  from production_adjustment_item i
  join planning_batch b on b.id=i.batch_id
  left join planning_schedule s on s.id=i.schedule_id
  left join md_process_recipe pr on pr.recipe_key=b.recipe_key
  left join open_job_current oj on oj.job_num=i.job_num and oj.is_open=true
  where i.adjustment_set_id=$1
  order by case i.item_type when 'CARRY_OVER' then 1 when 'REMOVE_JOB' then 2 else 3 end,i.batch_id,i.job_num,i.id
 `,[set.id]);
 return {set,items:q.rows.map((r:any)=>({...r,old_start:iso(r.old_start),old_end:iso(r.old_end),proposed_start:iso(r.proposed_start),proposed_end:iso(r.proposed_end)}))};
}

export type CascadeImpact={
 scheduleId:number;batchId:number;batchNo:string;standardOperation:string;planner:string|null;resource:string;
 oldStart:string;oldEnd:string;newStart:string;newEnd:string;reason:"CARRY_OVER"|"DEPENDENCY"|"RESOURCE";jobNums:string[];
};

export async function buildScheduleCascadePreview(c:PoolClient,args:{batchId:number;newStart:string;newEnd:string}){
 const seedQ=await c.query(`
  select s.id schedule_id,s.batch_id,b.batch_no,b.standard_operation,s.resource_code,s.planned_start,s.planned_end,
         array_agg(distinct bj.job_num) job_nums
  from planning_schedule s join planning_batch b on b.id=s.batch_id
  left join planning_batch_job bj on bj.batch_id=b.id
  where s.batch_id=$1 and s.status<>'CANCELLED'
  group by s.id,s.batch_id,b.batch_no,b.standard_operation,s.resource_code,s.planned_start,s.planned_end
  order by s.id desc limit 1
 `,[args.batchId]);
 if(!seedQ.rowCount)throw new Error("Batch chưa có lịch active để điều chỉnh.");
 const seed=seedQ.rows[0];
 const plans=new Map<number,CascadeImpact>();
 const queue:number[]=[];
 const add=async(row:any,newStart:string,newEnd:string,reason:CascadeImpact["reason"],jobs:string[])=>{
  const id=Number(row.schedule_id||row.id);const existing=plans.get(id);
  const oldStart=iso(row.planned_start)!;const oldEnd=iso(row.planned_end)!;
  const candidateStart=new Date(newStart),candidateEnd=new Date(newEnd);
  if(existing){
   if(candidateStart.getTime()<=new Date(existing.newStart).getTime())return;
  }
  const planner=await plannerForOperation(c,clean(row.standard_operation));
  plans.set(id,{scheduleId:id,batchId:Number(row.batch_id),batchNo:clean(row.batch_no),standardOperation:clean(row.standard_operation),planner,
   resource:clean(row.resource_code),oldStart,oldEnd,newStart:candidateStart.toISOString(),newEnd:candidateEnd.toISOString(),reason,jobNums:jobs});
  queue.push(id);
 };
 await add(seed,args.newStart,args.newEnd,"CARRY_OVER",seed.job_nums||[]);
 let guard=0;
 while(queue.length&&guard++<200){
  const id=queue.shift()!;const cur=plans.get(id)!;
  const curEnd=new Date(cur.newEnd);
  // Cross-Main dependency: each Job's immediate next Main cannot start before this Main's effective end.
  const depQ=await c.query(`
   select distinct ns.id schedule_id,ns.batch_id,nb.batch_no,nb.standard_operation,ns.resource_code,ns.planned_start,ns.planned_end,bj2.job_num
   from planning_batch_job bj1
   join planning_job_operation p1 on p1.id=bj1.planning_job_operation_id
   join lateral(
    select p2.id,p2.standard_operation
    from planning_job_operation p2
    where p2.job_num=bj1.job_num and p2.is_active=true and p2.planning_seq>p1.planning_seq
    order by p2.planning_seq limit 1
   ) nxt on true
   join planning_batch_job bj2 on bj2.job_num=bj1.job_num and bj2.planning_job_operation_id=nxt.id
   join planning_batch nb on nb.id=bj2.batch_id and nb.status<>'CANCELLED'
   join planning_schedule ns on ns.batch_id=nb.id and ns.status<>'CANCELLED'
   where bj1.batch_id=$1
  `,[cur.batchId]);
  for(const r of depQ.rows){
   const current=plans.get(Number(r.schedule_id));
   const start=new Date(current?.newStart||r.planned_start);const end=new Date(current?.newEnd||r.planned_end);
   if(start>=curEnd)continue;
   const duration=Math.max(60000,end.getTime()-start.getTime());
   await add(r,curEnd.toISOString(),new Date(curEnd.getTime()+duration).toISOString(),"DEPENDENCY",[clean(r.job_num)]);
  }
  // Resource cascade: only push schedules that are at/after the changed block and overlap its new window.
  const resQ=await c.query(`
   select s.id schedule_id,s.batch_id,b.batch_no,b.standard_operation,s.resource_code,s.planned_start,s.planned_end,
          array_agg(distinct bj.job_num) job_nums
   from planning_schedule s join planning_batch b on b.id=s.batch_id
   left join planning_batch_job bj on bj.batch_id=b.id
   where s.resource_code=$1 and s.status<>'CANCELLED' and s.id<>$2
     and s.planned_start >= $3::timestamptz and s.planned_start < $4::timestamptz
   group by s.id,s.batch_id,b.batch_no,b.standard_operation,s.resource_code,s.planned_start,s.planned_end
   order by s.planned_start,s.id
  `,[cur.resource,id,cur.oldStart,cur.newEnd]);
  let cursor=curEnd;
  for(const r of resQ.rows){
   const rid=Number(r.schedule_id);const existing=plans.get(rid);
   const st=new Date(existing?.newStart||r.planned_start);const en=new Date(existing?.newEnd||r.planned_end);
   if(st>=cursor){cursor=en>cursor?en:cursor;continue;}
   const duration=Math.max(60000,en.getTime()-st.getTime());
   const ne=new Date(cursor.getTime()+duration);
   await add(r,cursor.toISOString(),ne.toISOString(),"RESOURCE",r.job_nums||[]);
   cursor=ne;
  }
 }
 return [...plans.values()].sort((a,b)=>new Date(a.newStart).getTime()-new Date(b.newStart).getTime()||a.scheduleId-b.scheduleId);
}
