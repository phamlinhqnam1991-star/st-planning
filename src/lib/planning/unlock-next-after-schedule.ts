/**
 * Schedule handoff (manual + future auto):
 * A scheduled Batch unlocks ONLY the immediate next active Main Planning
 * Operation of each Job contained in that Batch.
 *
 * Do not use planning_seq_snapshot as the primary pivot: snapshots can be stale
 * after chain rebuilds. Resolve the exact current planning_job_operation_id first,
 * then find the immediate next active planning row by current planning_seq/source_seq.
 */
export async function unlockNextAfterScheduledBatch(c:any,batchId:number){
 const jobsQ=await c.query(`
  select distinct
    bj.job_num,
    bj.planning_job_operation_id,
    bj.standard_operation,
    bj.source_operation_code,
    bj.source_seq_snapshot,
    bj.operation_instance_key_snapshot
  from planning_batch_job bj
  where bj.batch_id=$1
 `,[batchId]);

 let unlocked=0;

 for(const row of jobsQ.rows){
  if(!row.job_num)continue;

  // Resolve the current Main row robustly.
  const currentQ=await c.query(`
   select id,planning_seq,source_seq
   from planning_job_operation
   where job_num=$1
     and (
       id=$2
       or (
         operation_instance_key=$3
         and $3 is not null
       )
       or (
         standard_operation=$4
         and source_operation_code=$5
         and (
           source_seq=$6
           or $6 is null
         )
       )
     )
   order by
     case when id=$2 then 0 else 1 end,
     is_active desc,
     updated_at desc,
     id desc
   limit 1
  `,[
   row.job_num,
   row.planning_job_operation_id||null,
   row.operation_instance_key_snapshot||null,
   row.standard_operation||null,
   row.source_operation_code||null,
   row.source_seq_snapshot??null
  ]);

  if(!currentQ.rowCount)continue;

  const current=currentQ.rows[0];

  // Immediate next active Main only. PIONBL is skipped from Planning.
  const nextQ=await c.query(`
   select id
   from planning_job_operation
   where job_num=$1
     and is_active=true
     and standard_operation<>'PIONBL'
     and (
       planning_seq>$2
       or (
         planning_seq=$2
         and source_seq>$3
       )
     )
     and status='LOCKED'
   order by planning_seq,source_seq,id
   limit 1
  `,[row.job_num,Number(current.planning_seq),Number(current.source_seq)]);

  if(!nextQ.rowCount)continue;

  const uq=await c.query(`
   update planning_job_operation
      set status='ELIGIBLE',updated_at=now()
    where id=$1
      and status='LOCKED'
    returning id
  `,[nextQ.rows[0].id]);

  unlocked+=uq.rowCount||0;
 }

 return unlocked;
}

/**
 * Self-heal all historical schedule handoffs.
 * Useful after deploy/rebuild: if the immediate previous Main already has
 * a non-cancelled planning_schedule, the next LOCKED Main becomes ELIGIBLE.
 *
 * This is idempotent and does not unlock the second/third future Main.
 */
export async function healScheduledHandoffs(c:any){
 const q=await c.query(`
  with ordered as (
   select
    p.id,
    p.job_num,
    p.planning_seq,
    p.source_seq,
    p.status,
    lag(p.id) over(
      partition by p.job_num
      order by p.planning_seq,p.source_seq,p.id
    ) previous_id
   from planning_job_operation p
   where p.is_active=true
     and p.standard_operation<>'PIONBL'
  ),
  unlockable as (
   select cur.id
   from ordered cur
   where cur.status='LOCKED'
     and cur.previous_id is not null
     and exists(
       select 1
       from planning_batch_job bj
       join planning_schedule ps
         on ps.batch_id=bj.batch_id
        and ps.status<>'CANCELLED'
       join planning_batch b
         on b.id=bj.batch_id
        and b.status<>'CANCELLED'
       where bj.planning_job_operation_id=cur.previous_id
     )
  )
  update planning_job_operation p
     set status='ELIGIBLE',updated_at=now()
   where p.id in(select id from unlockable)
   returning p.id
 `);

 return q.rowCount||0;
}
