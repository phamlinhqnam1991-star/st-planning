import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";
import {getProductionDateString} from "@/lib/schedule-time";
import {buildScheduleCascadePreview,ensureAdjustmentSet,loadAdjustmentData,scanProductionAdjustments} from "@/lib/daily-production-adjustment";
import {refreshBatchTotals,recomputeJobPlanningStatus,recipeAllowedForJob} from "@/lib/planning/batch-utils";
import {autoAdjustChemicalSchedule} from "@/lib/chemical-line-schedule-server";
import {loadBatchNumberConfig} from "@/lib/planning/batch-number";

const clean=(v:unknown)=>String(v??"").trim();
const validDate=(v:unknown)=>/^\d{4}-\d{2}-\d{2}$/.test(clean(v));

async function findJobForBatch(c:any,batchId:number,jobNum:string){
 const q=await c.query(`
  select b.id batch_id,b.batch_no,b.standard_operation batch_standard_operation,b.recipe_key batch_recipe_key,b.process_minutes,b.total_qty,b.total_surface_dm2,
         p.id planning_job_operation_id,p.job_num,p.source_operation_code,p.standard_operation job_standard_operation,p.recipe_key job_recipe_key,p.status planning_status,
         p.planning_seq,p.source_seq,p.operation_instance_key,
         j.part_num,j.revision_num,j.part_description,j.program,j.priority_type,j.next_operation,j.last_operation,
         coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0) plan_qty,
         coalesce(j.total_surface,coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)*coalesce(j.surface_per_part_dm2,0),0) plan_surface,
         exists(select 1 from planning_batch_job x where x.batch_id=b.id and x.planning_job_operation_id=p.id) in_this_batch,
         (select b2.batch_no from planning_batch_job x2 join planning_batch b2 on b2.id=x2.batch_id and b2.status<>'CANCELLED'
          where x2.planning_job_operation_id=p.id and x2.batch_id<>b.id order by b2.created_at desc limit 1) other_batch_no,
         pr.recipe_no,pr.recipe_name
  from planning_batch b
  join open_job_current j on upper(trim(j.job_num))=upper(trim($2)) and j.is_open=true
  left join lateral(
    select p0.* from planning_job_operation p0
    where p0.job_num=j.job_num and p0.is_active=true and upper(trim(p0.standard_operation))=upper(trim(b.standard_operation))
    order by case p0.status when 'ELIGIBLE' then 0 when 'PLANNED' then 1 else 2 end,p0.planning_seq limit 1
  ) p on true
  left join md_process_recipe pr on pr.recipe_key=p.recipe_key
  where b.id=$1
  limit 1
 `,[batchId,jobNum]);
 return q.rows[0]||null;
}

async function removeJob(c:any,item:any){
 const rowQ=await c.query(`
  select bj.id,bj.job_num,bj.planning_job_operation_id,bj.qty,bj.surface_dm2,p.planning_seq
  from planning_batch_job bj join planning_job_operation p on p.id=bj.planning_job_operation_id
  where bj.batch_id=$1 and bj.planning_job_operation_id=$2 for update of bj,p
 `,[item.batch_id,item.planning_job_operation_id]);
 if(!rowQ.rowCount)throw new Error("Job không còn trong Batch.");
 const row=rowQ.rows[0];
 const exQ=await c.query(`select execution_status from production_execution_job where batch_id=$1 and planning_job_operation_id=$2 order by id desc limit 1`,[item.batch_id,item.planning_job_operation_id]);
 if(exQ.rows[0]?.execution_status&&exQ.rows[0].execution_status!=="WAITING")throw new Error("Chỉ được bớt Job khi Production vẫn WAITING/chưa bắt đầu.");
 const laterQ=await c.query(`select standard_operation from planning_job_operation where job_num=$1 and is_active=true and planning_seq>$2 and status='PLANNED' order by planning_seq limit 1`,[row.job_num,row.planning_seq]);
 if(laterQ.rowCount)throw new Error(`Không thể bớt Job vì công đoạn sau ${laterQ.rows[0].standard_operation} đã PLANNED.`);
 await c.query(`delete from planning_batch_job where id=$1`,[row.id]);
 await c.query(`update planning_job_operation set status='ELIGIBLE',updated_at=now() where id=$1`,[row.planning_job_operation_id]);
 await recomputeJobPlanningStatus(c,row.job_num);
 const bQ=await c.query(`select process_minutes from planning_batch where id=$1`,[item.batch_id]);
 const totals=await refreshBatchTotals(c,Number(item.batch_id));
 await autoAdjustChemicalSchedule(c,Number(item.batch_id),totals.processMinutes,{previousProcessMinutes:Number(bQ.rows[0]?.process_minutes||0)});
 return totals;
}

async function addJob(c:any,item:any,forceException:boolean){
 const row=await findJobForBatch(c,Number(item.batch_id),clean(item.job_num));
 if(!row||!row.planning_job_operation_id)throw new Error("Job không có Main Operation phù hợp với Batch.");
 if(row.in_this_batch)return {already:true};
 if(row.other_batch_no&&!forceException)throw new Error(`Job đang thuộc Batch active khác: ${row.other_batch_no}.`);
 if(row.batch_recipe_key){
  const allowed=await recipeAllowedForJob(c,{source_operation_code:row.source_operation_code,standard_operation:row.job_standard_operation||row.batch_standard_operation,part_num:row.part_num,revision_num:row.revision_num},row.batch_recipe_key);
  if(!allowed&&!forceException)throw new Error("Recipe của Batch không hợp lệ cho Job. Dùng Duyệt ngoại lệ nếu đây là thực tế sản xuất đã xảy ra.");
 }
 const cfg=await loadBatchNumberConfig(c,row.batch_standard_operation,row.batch_recipe_key||null);
 const projected=Number(row.total_qty||0)+Number(row.plan_qty||0);
 if(cfg.autoSplit&&cfg.batchSizeQty&&projected>Number(cfg.batchSizeQty)+0.000001&&!forceException)
  throw new Error(`Batch Size vượt cấu hình: ${projected} / ${cfg.batchSizeQty} pcs. Dùng Duyệt ngoại lệ nếu Production thực tế đã chạy.`);
 await c.query(`
  insert into planning_batch_job(batch_id,planning_job_operation_id,job_num,source_operation_code,standard_operation,
   source_seq_snapshot,planning_seq_snapshot,operation_instance_key_snapshot,qty,surface_dm2)
  values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  on conflict(batch_id,planning_job_operation_id) do nothing
 `,[row.batch_id,row.planning_job_operation_id,row.job_num,row.source_operation_code,row.job_standard_operation||row.batch_standard_operation,row.source_seq,row.planning_seq,row.operation_instance_key,row.plan_qty,row.plan_surface]);
 await c.query(`update planning_job_operation set status='PLANNED',recipe_key=coalesce($2,recipe_key),updated_at=now() where id=$1`,[row.planning_job_operation_id,row.batch_recipe_key||row.job_recipe_key||null]);
 await recomputeJobPlanningStatus(c,row.job_num);
 const totals=await refreshBatchTotals(c,Number(row.batch_id));
 await autoAdjustChemicalSchedule(c,Number(row.batch_id),totals.processMinutes,{previousProcessMinutes:Number(row.process_minutes||0)});
 // Production reported this Job as completed outside the planned Batch. Seed the approved actual fact.
 const scheduleQ=await c.query(`select id from planning_schedule where batch_id=$1 and status<>'CANCELLED' order by planned_start desc,id desc limit 1`,[row.batch_id]);
 await c.query(`
  insert into production_execution_job(source_type,source_key,batch_id,schedule_id,planning_job_operation_id,job_num,execution_status,actual_start,actual_end,remark)
  values('BATCH','BATCH:'||$1::bigint::text,$1::bigint,$2::bigint,$3::bigint,$4,'DONE',coalesce(($5::jsonb->>'actualStart')::timestamptz,now()),coalesce(($5::jsonb->>'actualEnd')::timestamptz,now()),'Added by Daily Production Adjustment')
  on conflict(source_type,source_key,planning_job_operation_id)
  do update set execution_status='DONE',actual_start=coalesce(production_execution_job.actual_start,excluded.actual_start),actual_end=coalesce(excluded.actual_end,now()),remark=excluded.remark,updated_at=now()
 `,[row.batch_id,scheduleQ.rows[0]?.id||null,row.planning_job_operation_id,row.job_num,JSON.stringify(item.proposal_json||{})]);
 return totals;
}

async function applyCascade(c:any,impacts:any[],adjustmentId:number){
 if(!Array.isArray(impacts)||!impacts.length)throw new Error("Chưa có preview chỉnh lịch.");
 // First cancel every old active row so the one-active-schedule-per-Batch invariant is preserved.
 const oldRows=new Map<number,any>();
 for(const impact of impacts){
  const q=await c.query(`select * from planning_schedule where id=$1 and status<>'CANCELLED' for update`,[Number(impact.scheduleId)]);
  if(!q.rowCount)throw new Error(`Schedule #${impact.scheduleId} đã thay đổi. Hãy Preview lại.`);
  oldRows.set(Number(impact.scheduleId),q.rows[0]);
 }
 for(const impact of impacts){
  await c.query(`update planning_schedule set status='CANCELLED',note=concat_ws(E'\\n',note,$2),updated_at=now() where id=$1`,[Number(impact.scheduleId),`V464 Daily Adjustment #${adjustmentId}: ${impact.reason}`]);
 }
 const created=[] as any[];
 for(const impact of impacts){
  const old=oldRows.get(Number(impact.scheduleId));
  const ns=new Date(impact.newStart),ne=new Date(impact.newEnd);
  const duration=Math.max(1,Math.round((ne.getTime()-ns.getTime())/60000));
  const scheduleDate=getProductionDateString(ns);
  const ins=await c.query(`
   insert into planning_schedule(batch_id,resource_code,schedule_date,planned_start,planned_end,duration_minutes,sequence_no,status,note)
   values($1,$2,$3,$4,$5,$6,$7,'SCHEDULED',concat_ws(E'\\n',$8,$9)) returning id
  `,[old.batch_id,old.resource_code,scheduleDate,ns.toISOString(),ne.toISOString(),duration,old.sequence_no||0,old.note||null,`Rescheduled from #${impact.scheduleId} by Daily Adjustment #${adjustmentId}`]);
  await c.query(`update planning_batch set planned_start=$2,planned_end=$3,updated_at=now() where id=$1`,[old.batch_id,ns.toISOString(),ne.toISOString()]);
  created.push({oldScheduleId:Number(impact.scheduleId),newScheduleId:Number(ins.rows[0].id),batchId:Number(old.batch_id),reason:impact.reason});
 }
 return created;
}

export async function GET(req:NextRequest){
 const denied=await requireApiUser();if(denied)return denied;
 const date=clean(req.nextUrl.searchParams.get("date"));
 if(!validDate(date))return NextResponse.json({error:"Ngày sản xuất không hợp lệ."},{status:400});
 const c=await getPool().connect();
 try{return NextResponse.json(await loadAdjustmentData(c,date));}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});}
 finally{c.release();}
}

export async function POST(req:NextRequest){
 const denied=await requireApiUser();if(denied)return denied;
 const b=await req.json();const action=clean(b.action).toUpperCase();
 const date=clean(b.production_date);
 const c=await getPool().connect();
 try{
  await c.query("begin");
  if(action==="SCAN"){
   if(!validDate(date))throw new Error("Ngày sản xuất không hợp lệ.");
   await scanProductionAdjustments(c,date);
   await c.query("commit");return NextResponse.json({ok:true,...await loadAdjustmentData(c,date)});
  }
  if(action==="REPORT_EXTRA_JOB"){
   if(!validDate(date))throw new Error("Ngày sản xuất không hợp lệ.");
   let batchId=Number(b.batch_id);const batchNo=clean(b.batch_no),jobNum=clean(b.job_num);
   if(!batchId&&batchNo){const bq=await c.query(`select id from planning_batch where upper(trim(batch_no))=upper(trim($1)) and status<>'CANCELLED' order by created_at desc limit 1`,[batchNo]);batchId=Number(bq.rows[0]?.id||0);}
   if(!batchId||!jobNum)throw new Error("Cần Batch No. và Job Number.");
   const set=await ensureAdjustmentSet(c,date);const row=await findJobForBatch(c,batchId,jobNum);
   if(!row)throw new Error(`Không tìm thấy Job ${jobNum}.`);
   if(!row.planning_job_operation_id)throw new Error(`Job không có Main ${row.batch_standard_operation||"của Batch"}.`);
   if(row.in_this_batch)throw new Error("Job đã nằm trong Batch.");
   if(row.other_batch_no)throw new Error(`Job đang thuộc Batch active khác: ${row.other_batch_no}.`);
   if(row.batch_recipe_key){
    const allowed=await recipeAllowedForJob(c,{source_operation_code:row.source_operation_code,standard_operation:row.job_standard_operation||row.batch_standard_operation,part_num:row.part_num,revision_num:row.revision_num},row.batch_recipe_key);
    if(!allowed)throw new Error("Recipe của Batch không hợp lệ cho Job.");
   }
   const sizeCfg=await loadBatchNumberConfig(c,row.batch_standard_operation,row.batch_recipe_key||null);
   const projectedQty=Number(row.total_qty||0)+Number(row.plan_qty||0);
   if(sizeCfg.autoSplit&&sizeCfg.batchSizeQty&&projectedQty>Number(sizeCfg.batchSizeQty)+0.000001)
    throw new Error(`Batch Size vượt cấu hình: ${projectedQty} / ${sizeCfg.batchSizeQty} pcs.`);

   const proposal={actualStart:b.actual_start||null,actualEnd:b.actual_end||null,reportedFrom:"PRODUCTION_EXECUTION",partNum:row.part_num,revisionNum:row.revision_num,partDescription:row.part_description,qty:Number(row.plan_qty||0),surface:Number(row.plan_surface||0)};
   await addJob(c,{batch_id:batchId,job_num:row.job_num,proposal_json:proposal},false);
   await c.query(`
    insert into production_adjustment_item(adjustment_set_id,item_type,status,batch_id,planning_job_operation_id,job_num,standard_operation,
      reason,validation_status,validation_message,proposal_json,approved_at,approved_by,updated_at)
    values($1,'ADD_JOB','APPROVED',$2,$3,$4,$5,$6,'OK',$7,$8::jsonb,now(),'Production',now())
    on conflict(adjustment_set_id,item_type,batch_id,planning_job_operation_id)
    do update set status='APPROVED',reason=excluded.reason,validation_status='OK',validation_message=excluded.validation_message,
      proposal_json=excluded.proposal_json,approved_at=now(),approved_by='Production',updated_at=now()
   `,[set.id,batchId,Number(row.planning_job_operation_id),row.job_num,row.batch_standard_operation,
      "Production đã thêm Job trực tiếp vào Batch","Đã thêm trực tiếp từ Báo cáo sản xuất; không cần planner duyệt.",JSON.stringify(proposal)]);
   await c.query(`update production_adjustment_set set status='READY',updated_at=now() where id=$1`,[set.id]);
   await c.query("commit");
   return NextResponse.json({ok:true,added:true,addedJob:{
    planningJobOperationId:Number(row.planning_job_operation_id),jobNum:row.job_num,partDescription:row.part_description||"",
    currentGoodWipQty:Number(row.plan_qty||0),totalSurface:Number(row.plan_surface||0),lastLaborOp:row.last_operation||"",
    nextOperation:row.next_operation||"",priority:row.priority_type||"",supportOperations:[],isAddedJob:true,status:"DONE",
    actualStart:b.actual_start||new Date().toISOString(),actualEnd:b.actual_end||new Date().toISOString(),remark:"Added from Production Report"
   },batchTotals:{qty:projectedQty,surface:Number(row.total_surface_dm2||0)+Number(row.plan_surface||0)}});
  }
  const itemId=Number(b.item_id);if(!itemId)throw new Error("Adjustment item không hợp lệ.");
  const itemQ=await c.query(`select i.*,s.production_date from production_adjustment_item i join production_adjustment_set s on s.id=i.adjustment_set_id where i.id=$1 for update of i`,[itemId]);
  if(!itemQ.rowCount)throw new Error("Không tìm thấy đề xuất.");
  const item=itemQ.rows[0];
  if(action==="PREVIEW"){
   if(item.item_type!=="CARRY_OVER")throw new Error("Preview thời gian chỉ áp dụng Carry Over.");
   const ps=clean(b.proposed_start)||item.proposed_start;const pe=clean(b.proposed_end)||item.proposed_end;
   if(!ps||!pe||new Date(pe)<=new Date(ps))throw new Error("Proposed Start/End không hợp lệ.");
   const impacts=await buildScheduleCascadePreview(c,{batchId:Number(item.batch_id),newStart:ps,newEnd:pe});
   await c.query(`update production_adjustment_item set proposed_start=$2,proposed_end=$3,proposal_json=coalesce(proposal_json,'{}'::jsonb)||jsonb_build_object('impacts',$4::jsonb),updated_at=now() where id=$1`,[itemId,ps,pe,JSON.stringify(impacts)]);
   await c.query("commit");return NextResponse.json({ok:true,impacts});
  }
  if(action==="REJECT"){
   await c.query(`update production_adjustment_item set status='REJECTED',approved_at=now(),approved_by=$2,updated_at=now() where id=$1`,[itemId,clean(b.approved_by)||"Planner"]);
   await c.query("commit");return NextResponse.json({ok:true});
  }
  if(action==="APPROVE"){
   if(item.status!=="PENDING")throw new Error(`Đề xuất đang ở trạng thái ${item.status}.`);
   if(item.item_type==="REMOVE_JOB")await removeJob(c,item);
   else if(item.item_type==="ADD_JOB")await addJob(c,item,Boolean(b.force_exception));
   else if(item.item_type==="CARRY_OVER"){
    const impacts=Array.isArray(item.proposal_json?.impacts)?item.proposal_json.impacts:await buildScheduleCascadePreview(c,{batchId:Number(item.batch_id),newStart:item.proposed_start,newEnd:item.proposed_end});
    const revisions=await applyCascade(c,impacts,itemId);
    item.proposal_json={...(item.proposal_json||{}),impacts,revisions};
   }
   await c.query(`update production_adjustment_item set status='APPROVED',approved_at=now(),approved_by=$2,proposal_json=$3::jsonb,updated_at=now() where id=$1`,[itemId,clean(b.approved_by)||"Planner",JSON.stringify(item.proposal_json||{})]);
   await c.query("commit");return NextResponse.json({ok:true});
  }
  throw new Error("Action không hỗ trợ.");
 }catch(e){await c.query("rollback");return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});}
 finally{c.release();}
}
