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
 const processMinutes=totalJobs>0
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
       planned_end=$6::timestamptz,
       updated_at=now()
   where id=$1
 `,[batchId,totalJobs,totalQty,totalSurface,processMinutes,endTimestamp]);

 return {totalJobs,totalQty,totalSurface,processMinutes,plannedEnd:endTimestamp};
}

export async function recomputeJobPlanningStatus(c:PoolClient,jobNum:string){
 const q=await c.query(`
   select id,status,planning_seq
   from planning_job_operation
   where job_num=$1 and is_active=true
   order by planning_seq
 `,[jobNum]);

 let firstUnplanned=true;

 for(const r of q.rows){
   if(r.status==="PLANNED")continue;

   const status=firstUnplanned?"ELIGIBLE":"LOCKED";
   firstUnplanned=false;

   await c.query(`
     update planning_job_operation
     set status=$2,updated_at=now()
     where id=$1
   `,[r.id,status]);
 }
}

// =====================================================================
// v264: Recipe có hợp lệ cho 1 Job theo CẤU HÌNH HIỆN TẠI không?
// (không bám recipe cũ p.recipe_key). Hợp lệ khi recipe nằm trong ÍT NHẤT
// 1 trong 3 lớp: Standard Operation → Recipe / Operation Code → Recipe /
// Part + Rev → Recipe. Dùng khi tạo lô & thêm Job vào lô.
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
        select 1 from md_operation_recipe_mapping orm
        where orm.standard_operation=$1
          and orm.recipe_key=$2
          and orm.is_active=true
      )
      or exists(
        select 1 from md_main_operation_recipe ocr
        where ocr.operation_code=$3
          and ocr.recipe_key=$2
          and ocr.is_active=true
      )
      or exists(
        select 1 from md_part_process_recipe ppr
        where ppr.part_num=$4
          and ppr.revision_num=$5
          and ppr.standard_operation=$1
          and ppr.recipe_key=$2
          and ppr.is_active=true
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
