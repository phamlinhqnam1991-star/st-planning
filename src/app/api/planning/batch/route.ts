import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";

const clean=(v:unknown)=>String(v??"").trim();
const num=(v:unknown)=>{
 const n=Number(v);
 return Number.isFinite(n)?n:null;
};

async function resolveProcessMinutes(
 c:any,
 recipeKey:string|null,
 totalQty:number,
 totalSurface:number
){
 if(!recipeKey)return null;

 const recipe=await c.query(`
   select process_family
   from md_process_recipe
   where recipe_key=$1 and is_active=true
 `,[recipeKey]);

 if(!recipe.rowCount)return null;
 const family=String(recipe.rows[0].process_family||"");

 if(family==="CHEMICAL_LINE"){
   const q=await c.query(`
     select fixed_hours
     from md_recipe_time_rule
     where recipe_key=$1
       and is_active=true
       and calc_type='FIXED_HOURS'
     order by priority,id
     limit 1
   `,[recipeKey]);

   const hours=Number(q.rows[0]?.fixed_hours);
   return Number.isFinite(hours)?Math.round(hours*60):null;
 }

 if(family==="PAINT"){
   const q=await c.query(`
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

   const hours=Number(q.rows[0]?.standard_hours);
   return Number.isFinite(hours)?Math.round(hours*60):null;
 }

 return null;
}

export async function POST(req:NextRequest){
 const body=await req.json();
 const ids=Array.isArray(body.planning_job_operation_ids)
   ? body.planning_job_operation_ids.map(Number).filter(Number.isFinite)
   : [];

 if(!ids.length)
   return NextResponse.json({error:"Chọn ít nhất 1 Candidate Job."},{status:400});

 const standardOperation=clean(body.standard_operation);
 let recipeKey=clean(body.recipe_key)||null;
 const planningDate=clean(body.planning_date);
 const plannedStart=clean(body.planned_start);
 const priority=Math.max(1,Number(body.priority)||100);
 const note=clean(body.note)||null;

 if(!standardOperation)
   return NextResponse.json({error:"Standard Operation là bắt buộc."},{status:400});

 const c=await getPool().connect();
 try{
   await c.query("begin");

   const q=await c.query(`
     select
       p.id,p.job_num,p.source_operation_code,p.standard_operation,p.st_group,p.recipe_key,p.status,
       p.source_seq,p.planning_seq,p.operation_instance_key,
       j.part_num,j.revision_num,
       coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0) plan_qty,
       coalesce(j.total_surface,
                coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)
                * coalesce(j.surface_per_part_dm2,0),0) plan_surface
     from planning_job_operation p
     join open_job_current j on j.job_num=p.job_num
     where p.id=any($1::bigint[])
       and p.is_active=true
       and j.is_open=true
     for update of p
   `,[ids]);

   if(q.rowCount!==ids.length)
     throw new Error("Một số Candidate Job không còn hợp lệ.");

   for(const r of q.rows){
     if(r.status!=="ELIGIBLE")
       throw new Error(`Job ${r.job_num} không còn ELIGIBLE.`);
     if(r.standard_operation!==standardOperation)
       throw new Error(`Job ${r.job_num} không cùng Standard Operation.`);
   }

   const resolved=[...new Set(q.rows.map((r:any)=>r.recipe_key).filter(Boolean))];

   if(!recipeKey){
     if(resolved.length===1)recipeKey=resolved[0];
     else if(resolved.length>1)
       throw new Error("Các Job đang có Recipe khác nhau. Hãy chọn đúng Recipe.");
   }

   if(recipeKey){
     for(const r of q.rows){
       if(r.recipe_key && r.recipe_key!==recipeKey)
         throw new Error(`Job ${r.job_num} có Recipe khác Recipe của Batch.`);

       if(!r.recipe_key){
         const allowed=await c.query(`
           select 1
           from md_operation_code_recipe
           where operation_code=$1
             and recipe_key=$2
             and is_active=true
           limit 1
         `,[r.source_operation_code,recipeKey]);

         if(!allowed.rowCount)
           throw new Error(
             `Recipe đã chọn không hợp lệ cho Operation Code ${r.source_operation_code} / Job ${r.job_num}.`
           );
       }
     }
   }

   const totalQty=q.rows.reduce((a:number,r:any)=>a+Number(r.plan_qty||0),0);
   const totalSurface=q.rows.reduce((a:number,r:any)=>a+Number(r.plan_surface||0),0);
   const processMinutes=await resolveProcessMinutes(c,recipeKey,totalQty,totalSurface);

   const areaQ=await c.query(`
     select a.id
     from md_area_operation_group ag
     join md_area a on a.id=ag.area_id and a.is_active=true
     where ag.st_group=$1 and ag.is_active=true
     limit 1
   `,[q.rows[0]?.st_group||""]);
   const areaId=areaQ.rows[0]?.id||null;

   let startTimestamp:string|null=null;
   let endTimestamp:string|null=null;

   if(planningDate && plannedStart){
     startTimestamp=`${planningDate}T${plannedStart}:00+07:00`;
     if(processMinutes!=null){
       const d=new Date(startTimestamp);
       if(!Number.isNaN(d.getTime())){
         d.setMinutes(d.getMinutes()+processMinutes);
         endTimestamp=d.toISOString();
       }
     }
   }

   const batchQ=await c.query(`
     insert into planning_batch(
       planning_date,area_id,standard_operation,recipe_key,
       total_jobs,total_qty,total_surface_dm2,process_minutes,
       planned_start,planned_end,priority,status,note
     )
     values(
       coalesce(nullif($1,'')::date,current_date),
       $2,$3,$4,$5,$6,$7,$8,
       $9::timestamptz,$10::timestamptz,$11,'PLANNED',$12
     )
     returning id
   `,[
     planningDate,areaId,standardOperation,recipeKey,
     q.rows.length,totalQty,totalSurface,processMinutes,
     startTimestamp,endTimestamp,priority,note
   ]);

   const batchId=batchQ.rows[0].id;
   const batchNo=`PB-${String(batchId).padStart(6,"0")}`;

   await c.query(`
     update planning_batch
     set batch_no=$2,updated_at=now()
     where id=$1
   `,[batchId,batchNo]);

   for(const r of q.rows){
     await c.query(`
       insert into planning_batch_job(
         batch_id,planning_job_operation_id,job_num,
         source_operation_code,standard_operation,
         source_seq_snapshot,planning_seq_snapshot,operation_instance_key_snapshot,
         qty,surface_dm2
       )
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     `,[
       batchId,r.id,r.job_num,r.source_operation_code,r.standard_operation,
       r.source_seq,r.planning_seq,r.operation_instance_key,
       r.plan_qty,r.plan_surface
     ]);

     await c.query(`
       update planning_job_operation
       set status='PLANNED',
           recipe_key=coalesce(recipe_key,$2),
           updated_at=now()
       where id=$1
     `,[r.id,recipeKey]);

     const nextQ=await c.query(`
       select id
       from planning_job_operation
       where job_num=$1
         and is_active=true
         and planning_seq>(
           select planning_seq from planning_job_operation where id=$2
         )
         and status='LOCKED'
       order by planning_seq
       limit 1
     `,[r.job_num,r.id]);

     if(nextQ.rowCount){
       await c.query(`
         update planning_job_operation
         set status='ELIGIBLE',updated_at=now()
         where id=$1
       `,[nextQ.rows[0].id]);
     }
   }

   await c.query("commit");

   return NextResponse.json({
     ok:true,
     batchId,
     batchNo,
     totalJobs:q.rows.length,
     totalQty,
     totalSurface,
     processMinutes,
     plannedEnd:endTimestamp
   });
 }catch(e){
   await c.query("rollback");
   return NextResponse.json(
     {error:e instanceof Error?e.message:String(e)},
     {status:500}
   );
 }finally{
   c.release();
 }
}
