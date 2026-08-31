/**
 * Single source for "is this Batch actually scheduled?" checks.
 *
 * planning_schedule has no is_active column in the current schema. The active
 * schedule definition is therefore: non-cancelled row with planned_start set,
 * attached to a non-cancelled Batch.
 */
export async function isBatchActuallyScheduled(c:any,batchId:number){
 const q=await c.query(`
   select exists(
     select 1
     from planning_batch b
     join planning_schedule ps
       on ps.batch_id=b.id
      and ps.status<>'CANCELLED'
      and ps.planned_start is not null
     where b.id=$1
       and b.status<>'CANCELLED'
   ) scheduled
 `,[batchId]);
 return Boolean(q.rows[0]?.scheduled);
}

/**
 * Resolve Schedule history for one canonical source occurrence.
 * Exact source occurrence is preferred. Legacy snapshots from old/broken
 * chains can still match by instance key, or by Source+Main only when caller
 * has already established that occurrence is unique in the route.
 */
export async function isPlanningOccurrenceActuallyScheduled(
 c:any,
 args:{
  jobNum:string;
  planningJobOperationId?:number|null;
  operationInstanceKey?:string|null;
  standardOperation:string;
  sourceOperationCode:string;
  sourceSeq:number;
  allowUniqueSourceFallback?:boolean;
 }
){
 const q=await c.query(`
   select exists(
     select 1
     from planning_batch_job bj
     join planning_batch b
       on b.id=bj.batch_id
      and b.status<>'CANCELLED'
     join planning_schedule ps
       on ps.batch_id=b.id
      and ps.status<>'CANCELLED'
      and ps.planned_start is not null
     where bj.job_num=$1
       and (
         (
           bj.source_seq_snapshot=$6
           and upper(trim(bj.source_operation_code))=upper(trim($5))
           and upper(trim(bj.standard_operation))=upper(trim($4))
         )
         or (
           $2::bigint is not null
           and bj.planning_job_operation_id=$2
         )
         or (
           nullif(trim($3),'') is not null
           and nullif(trim(bj.operation_instance_key_snapshot),'') is not null
           and upper(trim(bj.operation_instance_key_snapshot))=upper(trim($3))
         )
         or (
           $7::boolean=true
           and upper(trim(bj.source_operation_code))=upper(trim($5))
           and upper(trim(bj.standard_operation))=upper(trim($4))
         )
       )
   ) scheduled
 `,[
  args.jobNum,
  args.planningJobOperationId??null,
  args.operationInstanceKey??null,
  args.standardOperation,
  args.sourceOperationCode,
  args.sourceSeq,
  args.allowUniqueSourceFallback===true
 ]);
 return Boolean(q.rows[0]?.scheduled);
}
