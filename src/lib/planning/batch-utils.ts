import type {PoolClient} from "pg";

export async function resolveProcessMinutes(
 c:PoolClient,
 recipeKey:string|null,
 totalQty:number,
 totalSurface:number
){
 if(!recipeKey)return null;

 // Generic rule cho MỌI công đoạn:
 // 1) FIXED_HOURS (priority,id) — thời gian cố định.
 // 2) QTY_SURFACE — khoảng Qty + Surface (priority,id).
 const fixed=await c.query(`
   select fixed_hours
   from md_recipe_time_rule
   where recipe_key=$1
     and is_active=true
     and calc_type='FIXED_HOURS'
   order by priority,id
   limit 1
 `,[recipeKey]);

 const fixedHours=Number(fixed.rows[0]?.fixed_hours);
 if(Number.isFinite(fixedHours))return Math.round(fixedHours*60);

 const qtySurface=await c.query(`
   select standard_hours
   from md_recipe_time_rule
   where recipe_key=$1
     and is_active=true
     and calc_type='QTY_SURFACE'
     and (qty_min is null or $2 >= qty_min)
     and (qty_max is null or $2 <= qty_max)
     and (surface_min_dm2 is null or $3 >= surface_min_dm2)
     and (surface_max_dm2 is null or $3 <= surface_max_dm2)
   order by priority,id
   limit 1
 `,[recipeKey,totalQty,totalSurface]);

 const hours=Number(qtySurface.rows[0]?.standard_hours);
 return Number.isFinite(hours)?Math.round(hours*60):null;
}

export async function refreshBatchTotals(c:PoolClient,batchId:number){
 const batchQ=await c.query(`
   select id,recipe_key,planned_start
   from planning_batch
   where id=$1
 `,[batchId]);

 if(!batchQ.rowCount)throw new Error("Không tìm thấy Batch.");

 const totalsQ=await c.query(`
   select
     count(*)::int total_jobs,
     coalesce(sum(qty),0) total_qty,
     coalesce(sum(surface_dm2),0) total_surface
   from planning_batch_job
   where batch_id=$1
 `,[batchId]);

 const totalJobs=Number(totalsQ.rows[0]?.total_jobs||0);
 const totalQty=Number(totalsQ.rows[0]?.total_qty||0);
 const totalSurface=Number(totalsQ.rows[0]?.total_surface||0);
 const recipeKey=batchQ.rows[0].recipe_key||null;
 const processMinutes=recipeKey
   ? await resolveProcessMinutes(c,recipeKey,totalQty,totalSurface)
   : null;

 let endTimestamp:string|null=null;
 const start=batchQ.rows[0].planned_start;
 if(start && processMinutes!=null){
   const d=new Date(start);
   if(!Number.isNaN(d.getTime())){
     d.setMinutes(d.getMinutes()+processMinutes);
     endTimestamp=d.toISOString();
   }
 }

 await c.query(`
   update planning_batch
   set total_jobs=$2,
       total_qty=$3,
       total_surface_dm2=$4,
       process_minutes=$5,
       planned_end=case
         when exists(
           select 1 from planning_schedule s
           where s.batch_id=planning_batch.id
             and s.status<>'CANCELLED'
         ) then planned_end
         else $6::timestamptz
       end,
       updated_at=now()
   where id=$1
 `,[batchId,totalJobs,totalQty,totalSurface,processMinutes,endTimestamp]);

 return {totalJobs,totalQty,totalSurface,processMinutes,plannedEnd:endTimestamp};
}

export async function refreshUnscheduledRecipeBatches(c:PoolClient,recipeKey:string){
 const q=await c.query(`
   select b.id
   from planning_batch b
   where b.recipe_key=$1
     and b.status in ('PLANNED','RELEASED')
     and not exists(
       select 1
       from planning_schedule s
       where s.batch_id=b.id
         and s.status<>'CANCELLED'
     )
   order by b.id
 `,[recipeKey]);

 for(const row of q.rows){
   await refreshBatchTotals(c,Number(row.id));
 }
 return q.rowCount||0;
}

export async function recomputeJobPlanningStatus(c:PoolClient,jobNum:string){
 const q=await c.query(`
   with live as (
     select
       p.*,
       count(*) over(
         partition by upper(trim(p.standard_operation)),upper(trim(p.source_operation_code))
       ) source_main_count
     from planning_job_operation p
     where p.job_num=$1
       and p.is_active=true
       and upper(trim(p.standard_operation))<>'PIONBL'
   )
   select
     p.id,p.status,p.planning_seq,p.source_seq,
     p.operation_instance_key,p.source_operation_code,p.standard_operation,
     p.previous_standard_operation_snapshot,
     exists(
       select 1
       from planning_batch_job bj
       join planning_batch b
         on b.id=bj.batch_id
        and b.status<>'CANCELLED'
       where bj.job_num=p.job_num
         and (
           bj.planning_job_operation_id=p.id
           or (
             bj.source_seq_snapshot=p.source_seq
             and upper(trim(bj.source_operation_code))=upper(trim(p.source_operation_code))
             and upper(trim(bj.standard_operation))=upper(trim(p.standard_operation))
           )
           or (
             nullif(trim(bj.operation_instance_key_snapshot),'') is not null
             and upper(trim(bj.operation_instance_key_snapshot))=
                 upper(trim(p.operation_instance_key))
           )
           or (
             p.source_main_count=1
             and upper(trim(bj.source_operation_code))=upper(trim(p.source_operation_code))
             and upper(trim(bj.standard_operation))=upper(trim(p.standard_operation))
           )
         )
     ) is_planned
   from live p
   order by p.planning_seq,p.source_seq,p.id
 `,[jobNum]);

 // v312: syncPlanningChains() already resolved physical position from
 // LastLaborOp + NextOperation and keeps only Current Main + future Main(s)
 // active. Every active unbatched Main is plan-ahead READY. Batch/Schedule
 // history changes the displayed/working state but never gates later Main(s).
 for(const r of q.rows){
   const status=Boolean(r.is_planned)?"PLANNED":"ELIGIBLE";

   if(r.status===status)continue;

   await c.query(`
     update planning_job_operation
     set status=$2,updated_at=now()
     where id=$1
   `,[r.id,status]);
 }

}

// =====================================================================
// v280: Recipe có hợp lệ cho 1 Job theo cấu hình hiện tại không?
// Chỉ dùng hai nguồn: Operation Code → Recipe (ưu tiên) hoặc Part + Revision
// → Recipe (fallback). Không dùng Standard Operation → Recipe cũ để tự cho phép.
// =====================================================================
export async function recipeAllowedForJob(
  c:PoolClient,
  row:{source_operation_code?:string;standard_operation?:string;part_num?:string|null;revision_num?:string|null},
  recipeKey:string
):Promise<boolean>{
  const q=await c.query(`
    select 1
    where
      exists(
        select 1 from md_main_operation_recipe ocr
        where upper(trim(ocr.operation_code))=upper(trim($3))
          and ocr.recipe_key=$2
          and ocr.is_active=true
          and exists(
            select 1 from md_process_recipe r
            where r.recipe_key=ocr.recipe_key and r.is_active=true
          )
      )
      or exists(
        select 1 from md_part_process_recipe ppr
        where ppr.part_num=$4
          and ppr.revision_num=$5
          and ppr.standard_operation=$1
          and ppr.recipe_key=$2
          and ppr.is_active=true
          and exists(
            select 1 from md_process_recipe r
            where r.recipe_key=ppr.recipe_key and r.is_active=true
          )
      )
    limit 1
  `,[
    String(row.standard_operation||""),
    recipeKey,
    String(row.source_operation_code||""),
    String(row.part_num||""),
    String(row.revision_num||"")
  ]);
  return (q.rowCount||0)>0;
}
