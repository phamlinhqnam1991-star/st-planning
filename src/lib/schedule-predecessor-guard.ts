import type {PoolClient} from "pg";

function clean(v:unknown){return String(v??"").trim();}
function fmtDateTime(v:unknown){
 const d=new Date(String(v??""));
 if(Number.isNaN(d.getTime()))return "—";
 return new Intl.DateTimeFormat("vi-VN",{
  timeZone:"Asia/Ho_Chi_Minh",
  day:"2-digit",month:"2-digit",year:"numeric",
  hour:"2-digit",minute:"2-digit",hour12:false
 }).format(d);
}

type GuardRow={
 job_num:string;
 current_operation:string|null;
 previous_operation:string|null;
 previous_batch_id:number|null;
 previous_batch_no:string|null;
 previous_schedule_id:number|null;
 previous_schedule_status:string|null;
 previous_resource_code:string|null;
 previous_planned_start:string|null;
 previous_planned_end:string|null;
};

/**
 * Scheduling add-only predecessor lock (V432).
 *
 * A Planning Batch may be READY because its Previous Main already has a Batch,
 * even when that previous Batch is still unscheduled. That is correct for the
 * Planning Chain, but Scheduling has a stricter physical-time gate:
 *
 * - First Main (no Previous Main) may be scheduled normally.
 * - Otherwise every Job in the Batch must have the immediate Previous Main
 *   scheduled (non-CANCELLED, planned_end present).
 * - Current planned_start must be >= Previous Main planned_end for every Job.
 *
 * This helper is intentionally called only from POST /api/schedule (adding an
 * existing Planning Batch to Scheduling). It is NOT used by PATCH/Edit,
 * trial day shift, Planning Chain READY/WAIT, or Chemical simulation/proposal.
 */
export async function assertPreviousMainScheduledBeforeAdd(
 c:PoolClient,
 input:{batchId:number;currentStart:Date}
){
 const batchId=Number(input.batchId);
 const currentStart=input.currentStart;
 if(!batchId||Number.isNaN(currentStart.getTime()))return;

 const q=await c.query<GuardRow>(`
  with current_jobs as (
   select
    cbj.job_num,
    coalesce(nullif(trim(cbj.standard_operation),''),nullif(trim(cur.standard_operation),'')) current_operation,
    coalesce(cbj.source_seq_snapshot,cur.source_seq) current_source_seq,
    coalesce(cbj.planning_seq_snapshot,cur.planning_seq) current_planning_seq,
    nullif(trim(cur.previous_standard_operation_snapshot),'') snapshot_previous_operation,
    nullif(trim(cur.previous_source_operation_code_snapshot),'') snapshot_previous_source_operation,
    cur.previous_source_seq_snapshot snapshot_previous_source_seq
   from public.planning_batch_job cbj
   left join public.planning_job_operation cur
    on cur.id=cbj.planning_job_operation_id
   where cbj.batch_id=$1
  ), resolved_previous as (
   select
    cj.*,
    coalesce(cj.snapshot_previous_operation,nullif(trim(prev_live.standard_operation),'')) previous_operation,
    coalesce(cj.snapshot_previous_source_operation,nullif(trim(prev_live.source_operation_code),'')) previous_source_operation,
    coalesce(cj.snapshot_previous_source_seq,prev_live.source_seq) previous_source_seq
   from current_jobs cj
   left join lateral (
    select p2.standard_operation,p2.source_operation_code,p2.source_seq,p2.planning_seq,p2.id
    from public.planning_job_operation p2
    where p2.job_num=cj.job_num
      and p2.is_active=true
      and upper(trim(p2.standard_operation))<>'PIONBL'
      and (
       (cj.current_planning_seq is not null and p2.planning_seq<cj.current_planning_seq)
       or (
        cj.current_planning_seq is null
        and cj.current_source_seq is not null
        and p2.source_seq<cj.current_source_seq
       )
      )
    order by p2.planning_seq desc nulls last,p2.source_seq desc nulls last,p2.id desc
    limit 1
   ) prev_live on true
  )
  select
   rp.job_num,
   rp.current_operation,
   rp.previous_operation,
   prev_batch.previous_batch_id,
   prev_batch.previous_batch_no,
   prev_schedule.previous_schedule_id,
   prev_schedule.previous_schedule_status,
   prev_schedule.previous_resource_code,
   prev_schedule.previous_planned_start,
   prev_schedule.previous_planned_end
  from resolved_previous rp
  left join lateral (
   select
    hb.id previous_batch_id,
    hb.batch_no previous_batch_no
   from public.planning_batch_job hbj
   join public.planning_batch hb
    on hb.id=hbj.batch_id
   and hb.status<>'CANCELLED'
   left join public.planning_job_operation hp
    on hp.id=hbj.planning_job_operation_id
   where hbj.job_num=rp.job_num
     and hbj.batch_id<>$1
     and nullif(trim(coalesce(nullif(hbj.standard_operation,''),hp.standard_operation,'')),'') is not null
     and upper(trim(coalesce(nullif(hbj.standard_operation,''),hp.standard_operation,'')))=
         upper(trim(rp.previous_operation))
     and (
      (
       rp.previous_source_seq is not null
       and coalesce(hbj.source_seq_snapshot,hp.source_seq)=rp.previous_source_seq
      )
      or (
       rp.previous_source_seq is null
       and rp.previous_source_operation is not null
       and upper(trim(coalesce(nullif(hbj.source_operation_code,''),hp.source_operation_code,'')))=
           upper(trim(rp.previous_source_operation))
      )
      or (
       rp.previous_source_seq is null
       and rp.previous_source_operation is null
      )
     )
   order by
    case
     when rp.previous_source_seq is not null
      and coalesce(hbj.source_seq_snapshot,hp.source_seq)=rp.previous_source_seq then 0
     else 1
    end,
    hb.created_at desc,hbj.id desc
   limit 1
  ) prev_batch on rp.previous_operation is not null
  left join lateral (
   select
    ps.id previous_schedule_id,
    ps.status previous_schedule_status,
    ps.resource_code previous_resource_code,
    ps.planned_start previous_planned_start,
    ps.planned_end previous_planned_end
   from public.planning_schedule ps
   where ps.batch_id=prev_batch.previous_batch_id
     and ps.status<>'CANCELLED'
     and ps.planned_start is not null
     and ps.planned_end is not null
   order by ps.planned_start desc,ps.id desc
   limit 1
  ) prev_schedule on true
  order by rp.job_num
 `,[batchId]);

 if(!q.rowCount)return; // Empty/manual Batch has no Job-chain predecessor to guard.

 const rows=q.rows;
 const needsPrevious=rows.filter(r=>clean(r.previous_operation));
 if(!needsPrevious.length)return; // First Main for every Job in this Batch.

 const unscheduled=needsPrevious.filter(r=>!r.previous_schedule_id||!r.previous_planned_end);
 if(unscheduled.length){
  const sample=unscheduled.slice(0,4).map(r=>
   `${r.job_num} · Previous Main ${clean(r.previous_operation)||"—"}${r.previous_batch_no?` · Batch ${r.previous_batch_no}`:""}`
  ).join("; ");
  const more=unscheduled.length>4?` (+${unscheduled.length-4} Job khác)`:"";
  throw new Error(
   `KHÓA ĐIỀU ĐỘ: ${unscheduled.length}/${needsPrevious.length} Job có Previous Main chưa có kế hoạch điều độ. `+
   `${sample}${more}. Hãy Schedule Previous Main trước rồi mới thêm Current Main vào Board Điều Độ.`
  );
 }

 const tooEarly=needsPrevious.filter(r=>{
  const prevEnd=new Date(String(r.previous_planned_end||""));
  return !Number.isNaN(prevEnd.getTime())&&currentStart.getTime()<prevEnd.getTime();
 });
 if(tooEarly.length){
  const latestEnd=tooEarly.reduce<Date|null>((max,r)=>{
   const d=new Date(String(r.previous_planned_end||""));
   if(Number.isNaN(d.getTime()))return max;
   return !max||d>max?d:max;
  },null);
  const sample=tooEarly.slice(0,4).map(r=>
   `${r.job_num} · ${clean(r.previous_operation)||"Previous Main"} End ${fmtDateTime(r.previous_planned_end)}`
  ).join("; ");
  const more=tooEarly.length>4?` (+${tooEarly.length-4} Job khác)`:"";
  throw new Error(
   `KHÓA ĐIỀU ĐỘ: Start Current Main ${fmtDateTime(currentStart)} đang sớm hơn End của Previous Main ở `+
   `${tooEarly.length}/${needsPrevious.length} Job. ${sample}${more}. `+
   `${latestEnd?`Start sớm nhất hợp lệ cho Batch này là ${fmtDateTime(latestEnd)}. `:""}`+
   `Current Main chỉ được thêm vào điều độ sau khi Previous Main hoàn tất.`
  );
 }
}
