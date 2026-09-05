import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {substituteTemplate} from "@/lib/batch-key-recipe";
import {bestRecipeMatch,mergeJobData} from "@/lib/planning/live-recipe";
import {getCachedLiveRecipeContext} from "@/lib/planning/planning-static-cache";
import {autoAdjustChemicalSchedule} from "@/lib/chemical-line-schedule-server";
import {resolveProcessMinutes,recomputeJobPlanningStatus} from "@/lib/planning/batch-utils";
import {assertSameRecipeConditionGroup,normalizeCompatibilityColumns} from "@/lib/planning/batch-compatibility";
import type {BatchCompatibilityRuleCondition} from "@/lib/planning/batch-compatibility";
import {allocateBatchNumbers,loadBatchNumberConfig} from "@/lib/planning/batch-number";

import {requireApiUser} from "@/lib/api-auth";
const clean=(v:unknown)=>String(v??"").trim();

function splitRowsByQty(rows:any[],batchSize:number|null){
 if(!(batchSize&&batchSize>0))return [rows.map(r=>({...r}))];
 const batches:any[][]=[];
 let current:any[]=[];
 let used=0;
 const EPS=1e-9;
 for(const row of rows){
  const fullQty=Math.max(0,Number(row.plan_qty||0));
  const fullSurface=Math.max(0,Number(row.plan_surface||0));
  if(fullQty<=EPS){
   if(!current.length)current=[];
   current.push({...row,plan_qty:0,plan_surface:fullSurface});
   continue;
  }
  let remain=fullQty;
  while(remain>EPS){
   if(used>=batchSize-EPS){batches.push(current);current=[];used=0;}
   const take=Math.min(remain,batchSize-used);
   const surface=fullQty>0?fullSurface*(take/fullQty):0;
   current.push({...row,plan_qty:take,plan_surface:surface});
   used+=take;remain-=take;
   if(used>=batchSize-EPS){batches.push(current);current=[];used=0;}
  }
 }
 if(current.length)batches.push(current);
 return batches.length?batches:[[]];
}

// v331: batched writes — 1 INSERT + 1 UPDATE cho MỌI Job thay vì 2×N
// round-trip nối tiếp (N = số Job chọn trong 1 lần tạo/thêm Batch).
// Trên DB mạng (Supabase/Vercel), mỗi round-trip ~10-50ms, N=50 → tiết kiệm
// hàng giây.
async function insertBatchJobs(c:any,batchId:number,rows:any[]){
 if(!rows.length)return;
 await c.query(`
  insert into planning_batch_job(
   batch_id,planning_job_operation_id,job_num,
   source_operation_code,standard_operation,
   source_seq_snapshot,planning_seq_snapshot,operation_instance_key_snapshot,
   qty,surface_dm2
  )
  select $1,x.id,x.job_num,x.source_operation_code,x.standard_operation,
         x.source_seq,x.planning_seq,x.operation_instance_key,x.qty,x.surface
  from unnest(
   $2::bigint[],$3::text[],$4::text[],$5::text[],
   $6::int[],$7::int[],$8::text[],$9::numeric[],$10::numeric[]
  ) as x(id,job_num,source_operation_code,standard_operation,
         source_seq,planning_seq,operation_instance_key,qty,surface)
 `,[
  batchId,
  rows.map(r=>r.id),
  rows.map(r=>String(r.job_num||"")),
  rows.map(r=>String(r.source_operation_code||"")),
  rows.map(r=>String(r.standard_operation||"")),
  rows.map(r=>Number(r.source_seq)||0),
  rows.map(r=>Number(r.planning_seq)||0),
  rows.map(r=>String(r.operation_instance_key||"")),
  rows.map(r=>Number(r.plan_qty)||0),
  rows.map(r=>Number(r.plan_surface)||0)
 ]);
}

async function markOpsPlanned(c:any,ids:number[],recipeKey:string|null){
 if(!ids.length)return;
 await c.query(`
  update planning_job_operation
     set status='PLANNED',
         recipe_key=coalesce($2,recipe_key),
         updated_at=now()
   where id=any($1::bigint[])
 `,[ids,recipeKey]);
}


// v335: return one ready-to-render Target Batch row so the client can update
// its dropdown immediately without fetching /deferred-data or reloading the board.
async function loadBatchTarget(c:any,batchId:number){
 const q=await c.query(`
  select
   b.id,b.batch_no,b.standard_operation,b.recipe_key,b.recipe_mapping_id,
   b.total_jobs,b.total_qty,b.total_surface_dm2,b.process_minutes,b.status,
   r.recipe_no,r.recipe_name,
   sch.schedule_id,sch.schedule_status,sch.resource_code,
   sch.schedule_start,sch.schedule_end
  from planning_batch b
  left join md_process_recipe r on r.recipe_key=b.recipe_key
  left join lateral (
   select
    ps.id schedule_id,ps.status schedule_status,ps.resource_code,
    ps.planned_start schedule_start,ps.planned_end schedule_end
   from planning_schedule ps
   where ps.batch_id=b.id and ps.status<>'CANCELLED'
   order by ps.planned_start desc,ps.id desc
   limit 1
  ) sch on true
  where b.id=$1
  limit 1
 `,[batchId]);
 return q.rows[0]||null;
}



export async function POST(req:NextRequest){
 const denied=await requireApiUser();
 if(denied)return denied;
 const body=await req.json();
 const ids=Array.isArray(body.planning_job_operation_ids)
   ? body.planning_job_operation_ids.map(Number).filter(Number.isFinite)
   : [];
 const createEmpty=body.create_empty===true;
 const targetBatchId=Number(body.target_batch_id||0);
 const requestedCompatibilityConditionColumns:string[]|undefined=Array.isArray(body.compatibility_condition_columns)
   ? normalizeCompatibilityColumns(body.compatibility_condition_columns)
   : undefined;

 if(!ids.length && !createEmpty)
   return NextResponse.json({error:"Chọn ít nhất 1 Candidate Job."},{status:400});

 const standardOperation=clean(body.standard_operation);
 let recipeKey=clean(body.recipe_key)||null;
 let recipeMappingId=Number(body.recipe_mapping_id||0)>0?Number(body.recipe_mapping_id):null;
 let compatibilityConditionsToPersist:BatchCompatibilityRuleCondition[]|null=null;
 const planningDate=clean(body.planning_date);
 const plannedStart=clean(body.planned_start);
 const priority=Math.max(1,Number(body.priority)||100);
 const note=clean(body.note)||null;

 if(!standardOperation)
   return NextResponse.json({error:"Standard Operation là bắt buộc."},{status:400});

 const c=await getPool().connect();
 try{
   await c.query("begin");

   // EMPTY BATCH / PLAN-AHEAD:
   // Create the planning container before WIP exists. It can be scheduled now,
   // then filled later through the same Candidate Engine used by Batch Detail.
   if(createEmpty){
     const opQ=await c.query(`
       select standard_operation,st_group
       from md_operation_master
       where standard_operation=$1 and is_active=true
       limit 1
     `,[standardOperation]);
     if(!opQ.rowCount)throw new Error(`Operation Master chưa có ${standardOperation}.`);
     const batchConfig=await loadBatchNumberConfig(c,standardOperation,recipeKey);

     if(recipeKey){
       const recipeQ=await c.query(`
         select recipe_key
         from md_process_recipe
         where recipe_key=$1
           and is_active=true
         limit 1
       `,[recipeKey]);
       if(!recipeQ.rowCount)
         throw new Error("Recipe không hợp lệ hoặc đã ngưng sử dụng.");
     }

     const effectiveDateQ=await c.query(`
       select coalesce(
         nullif($1,'')::date,
         (now() at time zone 'Asia/Ho_Chi_Minh')::date
       ) planning_date
     `,[planningDate]);
     const effectivePlanningDate=effectiveDateQ.rows[0].planning_date;

     const [batchNo]=await allocateBatchNumbers(c,batchConfig,1);

     const areaQ=await c.query(`
       select a.id
       from md_area_operation_group ag
       join md_area a on a.id=ag.area_id and a.is_active=true
       where ag.st_group=$1 and ag.is_active=true
       limit 1
     `,[opQ.rows[0].st_group||""]);
     const areaId=areaQ.rows[0]?.id||null;

     // Empty Batch has no Qty/Surface yet. Duration may still come from a
     // fixed Recipe rule; otherwise planner enters Duration on Scheduling.
     const processMinutes=await resolveProcessMinutes(c,recipeKey,0,0);

     const batchQ=await c.query(`
       insert into planning_batch(
         batch_no,planning_date,area_id,standard_operation,recipe_key,recipe_mapping_id,
         total_jobs,total_qty,total_surface_dm2,process_minutes,
         priority,status,note,plan_source
       )
       values($1,$2::date,$3,$4,$5,$6,0,0,0,$7,$8,'PLANNED',$9,'MANUAL_GRID')
       returning id,batch_no,planning_date
     `,[
       batchNo,effectivePlanningDate,areaId,standardOperation,recipeKey,recipeMappingId,
       processMinutes,priority,note||'EMPTY PLAN-AHEAD BATCH'
     ]);

     const batchTarget=await loadBatchTarget(c,Number(batchQ.rows[0].id));
     await c.query("commit");

     return NextResponse.json({
       ok:true,
       empty:true,
       batchId:batchQ.rows[0].id,
       batchNo,
       totalJobs:0,
       totalQty:0,
       totalSurface:0,
       processMinutes,
       affectedJobNums:[],
       batchTarget
     });
   }

   const q=await c.query(`
     select
       p.id,p.job_num,p.source_operation_code,p.standard_operation,p.st_group,p.recipe_key,p.status,p.is_hold,
       p.source_seq,p.planning_seq,p.operation_instance_key,
       j.part_num,j.revision_num,
       j.source_data,
       coalesce(j.source_data,'{}'::jsonb) || (to_jsonb(j)-'source_data') condition_data,
       mf.primer1 part_master_primer1,
       mf.primer2 part_master_primer2,
       mf.primer3 part_master_primer3,
       mf.topcoat1 part_master_topcoat1,
       mf.topcoat2 part_master_topcoat2,
       mf.antiabration part_master_antiabration,
       mf.varinish_name part_master_varnish,
       pr.recipe_no,
       coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0) plan_qty,
       coalesce(j.total_surface,
                coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)
                * coalesce(j.surface_per_part_dm2,0),0) plan_surface
     from planning_job_operation p
     join open_job_current j on j.job_num=p.job_num
     left join md_material_finish mf
       on mf.part_num=j.part_num
      and mf.revision_num=j.revision_num
      and mf.is_active=true
     left join md_process_recipe pr
       on pr.recipe_key=p.recipe_key
      and pr.is_active=true
     where p.id=any($1::bigint[])
       and p.is_active=true
       and j.is_open=true
     for update of p
   `,[ids]);

   if(q.rowCount!==ids.length)
     throw new Error("Một số Candidate Job không còn hợp lệ.");

   for(const r of q.rows){
     if(r.is_hold)
       throw new Error(`Job ${r.job_num} · ${r.standard_operation} đang HOLD. Bỏ Hold trước khi thêm vào Batch.`);
     if(r.status!=="ELIGIBLE")
       throw new Error(`Job ${r.job_num} không còn ELIGIBLE.`);
     if(r.standard_operation!==standardOperation)
       throw new Error(`Job ${r.job_num} không cùng Standard Operation.`);
   }

   let targetBatch:any=null;
   if(targetBatchId){
     const targetQ=await c.query(`
      select
       b.id,b.batch_no,b.standard_operation,b.recipe_key,b.recipe_mapping_id,b.status,
       b.total_jobs,b.total_qty,b.total_surface_dm2,b.process_minutes,
       b.planned_start,b.planned_end,
       ps.id schedule_id,ps.status schedule_status,
       ps.duration_minutes,ps.planned_start schedule_start,ps.planned_end schedule_end,
       ps.resource_code
      from planning_batch b
      left join lateral (
       select s.*
       from planning_schedule s
       where s.batch_id=b.id
         and s.status<>'CANCELLED'
       order by s.planned_start desc,s.id desc
       limit 1
      ) ps on true
      where b.id=$1
      for update of b
     `,[targetBatchId]);

     if(!targetQ.rowCount)
       throw new Error("Target Batch không tồn tại.");

     targetBatch=targetQ.rows[0];

     if(["CANCELLED","COMPLETED"].includes(String(targetBatch.status||"").toUpperCase()))
       throw new Error(`Batch ${targetBatch.batch_no} đã ${targetBatch.status}, không thể thêm Job.`);

     if(targetBatch.standard_operation!==standardOperation)
       throw new Error(
        `Batch ${targetBatch.batch_no} thuộc ${targetBatch.standard_operation}, `+
        `không phải ${standardOperation}.`
       );

     if(targetBatch.recipe_key){
       if(recipeKey && recipeKey!==targetBatch.recipe_key)
        throw new Error(`Recipe đang chọn khác Recipe của ${targetBatch.batch_no}.`);
       recipeKey=targetBatch.recipe_key;
     }
     if(Number(targetBatch.recipe_mapping_id||0)>0)recipeMappingId=Number(targetBatch.recipe_mapping_id);
   }

   // v266: recipe + Mã lô mẫu + Prefix của từng Job theo CẤU HÌNH HIỆN TẠI
   // (paint theo Part → Operation Code theo điều kiện/ưu tiên). Rule đã gộp vào đây.
   // v331: dùng live recipe context CACHE 60s (giống candidates route) thay vì
   // đọc lại 5 bảng recipe/master mỗi lần tạo Batch.
   const recipeCtx=await getCachedLiveRecipeContext(c);
   const matches=q.rows.map((r:any)=>({
     row:r,
     match:bestRecipeMatch(recipeCtx,{
       standardOperation:r.standard_operation,
       sourceOperationCode:r.source_operation_code,
       partNum:r.part_num,
       revisionNum:r.revision_num,
       sourceData:r.source_data||null,
       ruleSuggestion:null
     })
   }));
   const resolved:string[]=Array.from(new Set<string>(
     matches.map(x=>x.match.recipeKey).filter((x):x is string=>typeof x==="string"&&x.length>0)
   ));
   const matchByOperationId=new Map<number,(typeof matches)[number]>(matches.map(x=>[Number(x.row.id),x]));
   const anchorMatch=matchByOperationId.get(Number(ids[0]))||matches[0]||null;
   // The Batch is anchored to the exact Recipe Rule that matched the first Job.
   // Planner may later uncheck conditions and allow Jobs that matched another
   // rule of the SAME Recipe, but the original rule remains the Batch profile.
   if(!targetBatch && Number(anchorMatch?.match.recipeMappingId||0)>0){
     recipeMappingId=Number(anchorMatch!.match.recipeMappingId);
   }

   let suggestedBatchKey:string|null=null;

   if(!recipeKey){
     if(resolved.length===1){
       recipeKey=resolved[0];
     }else if(resolved.length>1){
       throw new Error("Các Job đang có Recipe khác nhau. Hãy chọn đúng Recipe.");
     }
   }

   // v336 Batch Compatibility Lock — recipe trên UI chỉ là lớp hướng dẫn.
   // Server luôn kiểm tra lại live Recipe để không thể bypass checkbox/drag lock.
   if(recipeKey){
     const recipeMismatch=matches.filter(x=>clean(x.match.recipeKey)!==recipeKey);
     if(recipeMismatch.length){
       throw new Error(
        `Các Job không cùng Recipe với Batch: `+
        recipeMismatch.map(x=>String(x.row.job_num||"")).filter(Boolean).join(", ")
       );
     }

     const anchorRow=q.rows.find((r:any)=>Number(r.id)===Number(ids[0]))||q.rows[0];
     compatibilityConditionsToPersist=await assertSameRecipeConditionGroup(c,{
      recipeKey,
      recipeMappingId,
      jobs:q.rows.map((r:any)=>({
       job_num:String(r.job_num||""),
       source_operation_code:String(r.source_operation_code||""),
       recipe_mapping_id:matchByOperationId.get(Number(r.id))?.match.recipeMappingId||null,
       condition_data:mergeJobData(recipeCtx,{partNum:r.part_num,revisionNum:r.revision_num,sourceData:(r.condition_data||{}) as Record<string,unknown>})
      })),
      anchorJobNum:String(anchorRow?.job_num||""),
      targetBatchId:targetBatch?Number(targetBatch.id):null,
      requestedConditionColumns:requestedCompatibilityConditionColumns
     });
   }

   // Mã lô mẫu + Prefix từ mapping của các Job dùng ĐÚNG recipe của lô.
   if(recipeKey){
     const keyMatches=matches.filter(x=>x.match.recipeKey===recipeKey);
     const batchKeys:string[]=Array.from(new Set<string>(
       keyMatches.map(x=>substituteTemplate(
         x.match.batchKeyTemplate,
         mergeJobData(recipeCtx,{partNum:x.row.part_num,revisionNum:x.row.revision_num,sourceData:x.row.source_data||null})
       )).filter((x):x is string=>typeof x==="string"&&x.length>0)
     ));
     if(batchKeys.length>1){
       throw new Error(
        `Các Job có Mã lô mẫu khác nhau (${batchKeys.join(" | ")}). Một Batch chỉ gom Job cùng Mã lô.`
       );
     }
     if(batchKeys.length===1)suggestedBatchKey=batchKeys[0];
   }

   if(recipeKey){
     // v331: set-based check — 1 query cho MỌI job thay vì 1 query/job (trước
     // đây N job = N round-trip nối tiếp). Điều kiện giữ nguyên semantics của
     // recipeAllowedForJob: Operation Code → Recipe (ưu tiên) hoặc Part+Rev
     // → Recipe (fallback), cả hai phải có md_process_recipe active.
     const disallowedQ=await c.query(`
      select p.job_num
      from planning_job_operation p
      join open_job_current j on j.job_num=p.job_num
      where p.id=any($1::bigint[])
        and not (
          exists(
            select 1 from md_main_operation_recipe ocr
            where upper(trim(ocr.operation_code))=upper(trim(p.source_operation_code))
              and ocr.recipe_key=$2
              and ocr.is_active=true
              and exists(
                select 1 from md_process_recipe r
                where r.recipe_key=ocr.recipe_key and r.is_active=true
              )
          )
          or exists(
            select 1 from md_part_process_recipe ppr
            where ppr.part_num=j.part_num
              and ppr.revision_num=j.revision_num
              and ppr.standard_operation=p.standard_operation
              and ppr.recipe_key=$2
              and ppr.is_active=true
              and exists(
                select 1 from md_process_recipe r
                where r.recipe_key=ppr.recipe_key and r.is_active=true
              )
          )
        )
      order by p.job_num
     `,[ids,recipeKey]);

     if(disallowedQ.rowCount)
       throw new Error(
         `Recipe đã chọn không hợp lệ cho Job: `+
         disallowedQ.rows.map((x:any)=>x.job_num).join(", ")+
         ` (theo cấu hình hiện tại).`
       );
   }

   // Add selected Jobs to an existing Batch when requested.
   // Manual and future Auto Batch can share the same membership rules.
   if(targetBatch){
     const duplicateQ=await c.query(`
      select bj.job_num,bj.standard_operation
      from planning_batch_job bj
      join planning_batch b on b.id=bj.batch_id
      where bj.planning_job_operation_id=any($1::bigint[])
        and b.status<>'CANCELLED'
     `,[ids]);

     if(duplicateQ.rowCount)
       throw new Error(
        `Một số Job đã nằm trong Batch của công đoạn này: `+
        duplicateQ.rows.map((x:any)=>x.job_num).join(", ")
       );



     if(recipeKey&&compatibilityConditionsToPersist!==null){
       await c.query(`
        update planning_batch
        set compatibility_conditions=$2::jsonb,
            recipe_mapping_id=coalesce(recipe_mapping_id,$3),
            updated_at=now()
        where id=$1
       `,[targetBatch.id,JSON.stringify(compatibilityConditionsToPersist),recipeMappingId]);
     }

     await insertBatchJobs(c,targetBatch.id,q.rows);
     await markOpsPlanned(c,q.rows.map((r:any)=>r.id),recipeKey);
     // v342: UNSCHEDULED Batch is already a valid handoff. Unlock only the
     // immediate next Main; all later Main Planning operations remain WAIT.
     for(const r of q.rows){
       await recomputeJobPlanningStatus(c,String(r.job_num||""));
     }

     const totalsQ=await c.query(`
      select
       count(*)::int total_jobs,
       coalesce(sum(qty),0)::numeric total_qty,
       coalesce(sum(surface_dm2),0)::numeric total_surface
      from planning_batch_job
      where batch_id=$1
     `,[targetBatch.id]);

     const newTotalJobs=Number(totalsQ.rows[0]?.total_jobs||0);
     const newTotalQty=Number(totalsQ.rows[0]?.total_qty||0);
     const newTotalSurface=Number(totalsQ.rows[0]?.total_surface||0);
     const newProcessMinutes=await resolveProcessMinutes(
      c,recipeKey,newTotalQty,newTotalSurface,{batchId:Number(targetBatch.id)}
     );

     await c.query(`
      update planning_batch
         set total_jobs=$2,
             total_qty=$3,
             total_surface_dm2=$4,
             process_minutes=$5,
             recipe_key=coalesce($6,recipe_key),
             recipe_mapping_id=coalesce(recipe_mapping_id,$7),
             batch_key=coalesce(batch_key,$8),
             updated_at=now()
       where id=$1
     `,[
      targetBatch.id,newTotalJobs,newTotalQty,newTotalSurface,
      newProcessMinutes,recipeKey,recipeMappingId,suggestedBatchKey
     ]);

     // v193: Batch đã Schedule trên Chemical Line → tự tính lại Loading/Process/
     // NDT/Unloading theo Qty/Surface mới và kéo dãn lịch (giữ Loading Start).
     if(targetBatch.schedule_id){
      await autoAdjustChemicalSchedule(c,targetBatch.id,newProcessMinutes,{previousProcessMinutes:Number(targetBatch.process_minutes||0)}).catch((e:any)=>{
       throw new Error(`Thêm Job làm thay đổi thời gian Chemical Line: ${e instanceof Error?e.message:String(e)}`);
      });
     }

     const affectedJobNums=q.rows.map((r:any)=>String(r.job_num||"")).filter(Boolean);
     const batchTarget=await loadBatchTarget(c,Number(targetBatch.id));
     await c.query("commit");

     return NextResponse.json({
      ok:true,
      addedToExisting:true,
      batchId:targetBatch.id,
      batchNo:targetBatch.batch_no,
      scheduled:Boolean(targetBatch.schedule_id),
      scheduleId:targetBatch.schedule_id||null,
      totalJobs:newTotalJobs,
      totalQty:newTotalQty,
      totalSurface:newTotalSurface,
      processMinutes:newProcessMinutes,
      affectedJobNums,
      batchTarget
     });
   }

   const totalQty=q.rows.reduce((a:number,r:any)=>a+Number(r.plan_qty||0),0);
   const totalSurface=q.rows.reduce((a:number,r:any)=>a+Number(r.plan_surface||0),0);
   const areaQ=await c.query(`
     select a.id
     from md_area_operation_group ag
     join md_area a on a.id=ag.area_id and a.is_active=true
     where ag.st_group=$1 and ag.is_active=true
     limit 1
   `,[q.rows[0]?.st_group||""]);
   const areaId=areaQ.rows[0]?.id||null;

   let startTimestamp:string|null=null;
   if(planningDate && plannedStart)startTimestamp=`${planningDate}T${plannedStart}:00+07:00`;

   const effectiveDateQ=await c.query(`
     select coalesce(nullif($1,'')::date,(now() at time zone 'Asia/Ho_Chi_Minh')::date) planning_date
   `,[planningDate]);
   const effectivePlanningDate=effectiveDateQ.rows[0].planning_date;

   // ===============================================================
   // V460 BATCH NUMBER + AUTO SPLIT
   // Batch number is now fully configured per Main Operation:
   // Prefix + numeric sequence. No DDMM/DDMMM token is injected by code.
   // Example: Prefix XXX_ + Start 1 + Padding 5 => XXX_00001.
   // ===============================================================
   const batchConfig=await loadBatchNumberConfig(c,standardOperation,recipeKey);
   const splitSize=batchConfig.autoSplit?batchConfig.batchSizeQty:null;
   const allocationBatches=splitRowsByQty(q.rows,splitSize);
   const batchNos=await allocateBatchNumbers(c,batchConfig,allocationBatches.length);

   const createdBatches:any[]=[];
   for(let i=0;i<allocationBatches.length;i++){
     const allocationRows=allocationBatches[i];
     const batchQty=allocationRows.reduce((a:number,r:any)=>a+Number(r.plan_qty||0),0);
     const batchSurface=allocationRows.reduce((a:number,r:any)=>a+Number(r.plan_surface||0),0);
     const batchProcessMinutes=await resolveProcessMinutes(
       c,recipeKey,batchQty,batchSurface,{jobNums:[...new Set(allocationRows.map((r:any)=>String(r.job_num||"")))]}
     );
     let batchEndTimestamp:string|null=null;
     if(startTimestamp&&batchProcessMinutes!=null){
       const d=new Date(startTimestamp);
       if(!Number.isNaN(d.getTime())){d.setMinutes(d.getMinutes()+batchProcessMinutes);batchEndTimestamp=d.toISOString();}
     }
     const batchQ=await c.query(`
       insert into planning_batch(
         batch_no,planning_date,area_id,standard_operation,recipe_key,recipe_mapping_id,batch_key,
         total_jobs,total_qty,total_surface_dm2,process_minutes,
         planned_start,planned_end,priority,status,note,plan_source,compatibility_conditions
       )
       values(
         $1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,$11,
         $12::timestamptz,$13::timestamptz,$14,'PLANNED',$15,'PLANNING_BOARD',$16::jsonb
       )
       returning id,batch_no,planning_date
     `,[
       batchNos[i],effectivePlanningDate,areaId,standardOperation,recipeKey,recipeMappingId,suggestedBatchKey,
       new Set(allocationRows.map((r:any)=>String(r.job_num||""))).size,batchQty,batchSurface,batchProcessMinutes,
       startTimestamp,batchEndTimestamp,priority,note,
       JSON.stringify(compatibilityConditionsToPersist||[])
     ]);
     const batchId=Number(batchQ.rows[0].id);
     await insertBatchJobs(c,batchId,allocationRows);
     createdBatches.push({batchId,batchNo:batchNos[i],totalQty:batchQty,totalSurface:batchSurface,processMinutes:batchProcessMinutes,plannedEnd:batchEndTimestamp});
   }

   await markOpsPlanned(c,q.rows.map((r:any)=>r.id),recipeKey);
   // v342: creating a Batch (still UNSCHEDULED) unlocks only the immediate
   // next Main Planning operation for each Job. Next-next stays WAIT.
   for(const r of q.rows){
     await recomputeJobPlanningStatus(c,String(r.job_num||""));
   }

   const affectedJobNums=q.rows.map((r:any)=>String(r.job_num||"")).filter(Boolean);
   const firstBatch=createdBatches[0];
   const batchTarget=firstBatch?await loadBatchTarget(c,Number(firstBatch.batchId)):null;
   await c.query("commit");

   return NextResponse.json({
    ok:true,
    batchId:firstBatch?.batchId||null,
    batchNo:firstBatch?.batchNo||"",
    batchNos:createdBatches.map(x=>x.batchNo),
    batches:createdBatches,
    autoSplit:createdBatches.length>1,
    batchKey:suggestedBatchKey,
    totalJobs:q.rows.length,
    totalQty,
    totalSurface,
    processMinutes:createdBatches.length===1?createdBatches[0].processMinutes:null,
    plannedEnd:createdBatches.length===1?createdBatches[0].plannedEnd:null,
    affectedJobNums,
    batchTarget
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
