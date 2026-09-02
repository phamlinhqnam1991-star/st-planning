import type {PoolClient} from "pg";

export type ProcessTimeRuleCondition={
 source_column:string;
 source_value:string;
};

export type ProcessTimeRuleRow={
 id:number;
 recipe_key:string;
 calc_type:"FIXED_HOURS"|"QTY_SURFACE";
 priority:number;
 qty_min:number|null;
 qty_max:number|null;
 surface_min_dm2:number|null;
 surface_max_dm2:number|null;
 fixed_hours:number|null;
 standard_hours:number|null;
 conditions:ProcessTimeRuleCondition[];
};

export type ProcessTimeResolveContext={
 /** Batch đã tồn tại: resolver tự đọc All Open Job của mọi Job trong Batch. */
 batchId?:number|null;
 /** Batch đang tạo: truyền danh sách Job Number trước khi planning_batch_job tồn tại. */
 jobNums?:string[]|null;
 /** Dùng cho caller đã có sẵn dữ liệu All Open Job, tránh query DB lại. */
 jobData?:Record<string,unknown>[]|null;
};

export const cleanProcessValue=(v:unknown)=>String(v??"").trim();

export function processConditionMatches(
 cond:ProcessTimeRuleCondition,
 row:Record<string,unknown>
){
 return cleanProcessValue(row?.[cond.source_column])===cleanProcessValue(cond.source_value);
}

/**
 * Chọn Process Time Rule đã match.
 * Thứ tự:
 *   1) Rule có NHIỀU điều kiện Open Job match hơn;
 *   2) Priority nhỏ hơn;
 *   3) ID nhỏ hơn.
 *
 * Rule có điều kiện chỉ match khi TẤT CẢ Job trong Batch đều thỏa TẤT CẢ điều kiện.
 * Batch có giá trị trộn (vd Program=A320 + A350) sẽ không match rule Program=A320
 * và tự rơi về rule không điều kiện nếu có.
 */
function sortProcessRulesBySpecificity(a:ProcessTimeRuleRow,b:ProcessTimeRuleRow){
 const ca=Array.isArray(a.conditions)?a.conditions.length:0;
 const cb=Array.isArray(b.conditions)?b.conditions.length:0;
 if(ca!==cb)return cb-ca;
 const pa=Number(a.priority)||100;
 const pb=Number(b.priority)||100;
 if(pa!==pb)return pa-pb;
 return Number(a.id)-Number(b.id);
}

/**
 * Chọn đúng Process Time Rule theo cùng semantics của resolver.
 * Export để Batch Compatibility dùng CHUNG một nguồn rule, tránh tạo một
 * implementation khác giữa UI-lock và lúc tính Process Time.
 */
export function selectProcessTimeRuleFromRules(
 rules:ProcessTimeRuleRow[],
 totalQty:number,
 totalSurface:number,
 jobData:Record<string,unknown>[]=[]
):ProcessTimeRuleRow|null{
 const fixed=rules.filter(r=>r.calc_type==="FIXED_HOURS");
 const modeRules=fixed.length
  ? fixed
  : rules.filter(r=>
     r.calc_type==="QTY_SURFACE" &&
     (r.qty_min==null||totalQty>=Number(r.qty_min)) &&
     (r.qty_max==null||totalQty<=Number(r.qty_max)) &&
     (r.surface_min_dm2==null||totalSurface>=Number(r.surface_min_dm2)) &&
     (r.surface_max_dm2==null||totalSurface<=Number(r.surface_max_dm2))
    );

 const matched=modeRules.filter(r=>{
  const conds=Array.isArray(r.conditions)?r.conditions:[];
  if(!conds.length)return true;
  if(!jobData.length)return false;
  return jobData.every(row=>conds.every(cond=>processConditionMatches(cond,row)));
 }).sort(sortProcessRulesBySpecificity);

 return matched[0]||null;
}

export function selectProcessMinutesFromRules(
 rules:ProcessTimeRuleRow[],
 totalQty:number,
 totalSurface:number,
 jobData:Record<string,unknown>[]=[]
):number|null{
 const winner=selectProcessTimeRuleFromRules(rules,totalQty,totalSurface,jobData);
 if(!winner)return null;
 const hours=winner.calc_type==="FIXED_HOURS"
  ?Number(winner.fixed_hours)
  :Number(winner.standard_hours);
 return Number.isFinite(hours)&&hours>0?Math.round(hours*60):null;
}

async function loadProcessConditionJobData(
 c:PoolClient,
 ctx:ProcessTimeResolveContext
):Promise<Record<string,unknown>[]>{
 if(Array.isArray(ctx.jobData))return ctx.jobData;

 if(ctx.batchId!=null&&Number.isFinite(Number(ctx.batchId))){
  const q=await c.query(`
    select distinct on (j.job_num)
      coalesce(j.source_data,'{}'::jsonb) || (to_jsonb(j)-'source_data') condition_data
    from planning_batch_job bj
    join open_job_current j on j.job_num=bj.job_num
    where bj.batch_id=$1
    order by j.job_num
  `,[Number(ctx.batchId)]);
  return q.rows.map(r=>(r.condition_data||{}) as Record<string,unknown>);
 }

 const jobNums=[...new Set((ctx.jobNums||[]).map(x=>cleanProcessValue(x)).filter(Boolean))];
 if(jobNums.length){
  const q=await c.query(`
    select coalesce(j.source_data,'{}'::jsonb) || (to_jsonb(j)-'source_data') condition_data
    from open_job_current j
    where j.job_num=any($1::text[])
    order by j.job_num
  `,[jobNums]);
  return q.rows.map(r=>(r.condition_data||{}) as Record<string,unknown>);
 }

 return [];
}

export async function loadProcessTimeRules(
 c:PoolClient,
 recipeKey:string|null
):Promise<ProcessTimeRuleRow[]>{
 if(!recipeKey)return [];
 const q=await c.query(`
   select
     t.id,t.recipe_key,t.calc_type,t.priority,
     t.qty_min,t.qty_max,t.surface_min_dm2,t.surface_max_dm2,
     t.fixed_hours,t.standard_hours,
     coalesce((
       select jsonb_agg(
         jsonb_build_object(
           'source_column',cnd.source_column,
           'source_value',cnd.source_value
         )
         order by cnd.condition_order,cnd.id
       )
       from md_recipe_time_rule_condition cnd
       where cnd.rule_id=t.id
         and cnd.is_active=true
     ),'[]'::jsonb) conditions
   from md_recipe_time_rule t
   where t.recipe_key=$1
     and t.is_active=true
   order by t.priority,t.id
 `,[recipeKey]);
 return q.rows.map((r:any)=>({
  ...r,
  id:Number(r.id),
  priority:Number(r.priority)||100,
  qty_min:r.qty_min==null?null:Number(r.qty_min),
  qty_max:r.qty_max==null?null:Number(r.qty_max),
  surface_min_dm2:r.surface_min_dm2==null?null:Number(r.surface_min_dm2),
  surface_max_dm2:r.surface_max_dm2==null?null:Number(r.surface_max_dm2),
  fixed_hours:r.fixed_hours==null?null:Number(r.fixed_hours),
  standard_hours:r.standard_hours==null?null:Number(r.standard_hours),
  conditions:Array.isArray(r.conditions)?r.conditions:[]
 })) as ProcessTimeRuleRow[];
}

export async function resolveProcessMinutes(
 c:PoolClient,
 recipeKey:string|null,
 totalQty:number,
 totalSurface:number,
 context:ProcessTimeResolveContext={}
){
 if(!recipeKey)return null;

 // Load tất cả active rule cùng các điều kiện Open Job của từng rule.
 // API cấu hình bảo đảm một Recipe chỉ có một Calculation Mode active;
 // fallback FIXED-first vẫn giữ tương thích dữ liệu cũ nếu DB từng có 2 mode.
 const rules=await loadProcessTimeRules(c,recipeKey);
 if(!rules.length)return null;

 const hasConditionalRule=rules.some(r=>r.conditions.length>0);
 const jobData=hasConditionalRule
  ?await loadProcessConditionJobData(c,context)
  :[];

 return selectProcessMinutesFromRules(rules,totalQty,totalSurface,jobData);
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
   ? await resolveProcessMinutes(c,recipeKey,totalQty,totalSurface,{batchId})
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

 // v342: sequential READY. The active suffix starts at the physical Current
 // Main, so the first unplanned Main is READY. Every later unplanned Main stays
 // LOCKED until the continuous previous chain has a non-cancelled Batch.
 // A Batch may be UNSCHEDULED or SCHEDULED; both count as planned handoff.
 // Historical out-of-sequence PLANNED rows are preserved but never reopen a
 // gate that was already closed by an earlier unplanned Main.
 let sequentialGateOpen=true;
 for(const r of q.rows){
   let status:string;
   if(Boolean(r.is_planned)){
     status="PLANNED";
   }else if(sequentialGateOpen){
     status="ELIGIBLE";
     sequentialGateOpen=false;
   }else{
     status="LOCKED";
   }

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
