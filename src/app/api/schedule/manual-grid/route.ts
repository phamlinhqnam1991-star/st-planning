import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {assertResourceAndChemicalCapacity,chemicalScheduleColumns,resolveChemicalScheduleWindow} from "@/lib/chemical-line-schedule-server";
import {resolveProcessMinutes} from "@/lib/planning/batch-utils";
import {allocateBatchNumbers,loadBatchNumberConfig} from "@/lib/planning/batch-number";

import {requireApiPermission} from "@/lib/security/api";
import {scopeAllows} from "@/lib/security/access";
import {canScheduleResource} from "@/lib/security/scope-db";
import {notifyInternalChange} from "@/lib/internal-chat/server";
const clean=(v:unknown)=>String(v??"").trim();
const asDate=(v:unknown)=>{
 const d=new Date(String(v??""));
 return Number.isNaN(d.getTime())?null:d;
};
// Planner override giờ bắt đầu Process/NDT/Unloading (ISO hoặc null = tự động).
function parseOverrides(body:any){
 return {
  processStart:body.process_start_override?asDate(body.process_start_override):null,
  ndtStart:body.ndt_start_override?asDate(body.ndt_start_override):null,
  unloadingStart:body.unloading_start_override?asDate(body.unloading_start_override):null,
  loadingMinutes:body.loading_minutes_override==null||body.loading_minutes_override===""
   ?null
   :(Number.isFinite(Number(body.loading_minutes_override))?Math.max(0,Number(body.loading_minutes_override)):null)
 };
}

export async function POST(req:Request){
 const {denied,ctx}=await requireApiPermission("schedule.edit");
 if(denied||!ctx)return denied!;
 const body=await req.json().catch(()=>({}));
 const requestedScheduleArea=clean(body.schedule_area_code).toUpperCase();
 const requestedStGroup=clean(body.st_group);
 let standardOperation=clean(body.standard_operation);
 const recipeKey=clean(body.recipe_key)||null;
 const resourceCode=clean(body.resource_code);
 const planningDate=clean(body.planning_date);
 const start=asDate(body.planned_start);
 const duration=Number(body.duration_minutes);
 const note=clean(body.note)||null;

 if(!resourceCode||!planningDate||!start)
  return NextResponse.json({error:"Resource / Date / Start là bắt buộc."},{status:400});
 if(requestedScheduleArea&&!scopeAllows(ctx,"SCHEDULE_AREA",requestedScheduleArea))return NextResponse.json({error:`Không có quyền Điều độ Schedule Area ${requestedScheduleArea}.`},{status:403});
 if(!Number.isFinite(duration)||duration<=0)
  return NextResponse.json({error:"Duration phải lớn hơn 0 phút."},{status:400});

 const c=await getPool().connect();
 try{
  await c.query("begin");

  // Bỏ cột Std Op ở giao diện → hệ thống tự xác định Operation từ Recipe
  // (mapping Recipe → Main Operation, ưu tiên op thuộc đúng Schedule Area).
  if(!standardOperation){
   if(!recipeKey)
    throw new Error("Dòng chưa có Operation — hãy chọn Recipe để hệ thống tự tìm Operation, hoặc kéo lô từ Unscheduled vào dòng.");
   const derivedQ=await c.query(`
    select coalesce(nullif(trim(m.standard_operation),''),nullif(trim(m.operation_code),'')) standard_operation
    from md_main_operation_recipe m
    join md_schedule_area_operation ao
      on upper(trim(ao.standard_operation))=upper(trim(coalesce(nullif(trim(m.standard_operation),''),nullif(trim(m.operation_code),''))))
     and ao.schedule_area_code=$2
     and ao.is_active=true
    where m.recipe_key=$1
      and m.is_active=true
    order by (m.is_default=false),m.priority,m.operation_code
    limit 1
   `,[recipeKey,requestedScheduleArea]);
   if(!derivedQ.rowCount)
    throw new Error(`Recipe này chưa được map Operation trong vùng ${requestedScheduleArea}. Hãy chọn Operation ngay trên dòng (ô xổ xuống cạnh Recipe), hoặc vào Cấu hình → Process Recipe → mục Operation Code → Recipe Mapping để map.`);
   standardOperation=String(derivedQ.rows[0].standard_operation);
  }

  const opQ=await c.query(`
   select o.standard_operation,o.st_group,o.batch_prefix
   from md_operation_master o
   where upper(o.standard_operation)=upper($1)
     and o.is_active=true
   limit 1
  `,[standardOperation]);
  if(!opQ.rowCount)throw new Error(`Operation Master chưa có ${standardOperation}.`);

  const op=opQ.rows[0];
  if(!requestedScheduleArea){const scope=await canScheduleResource(c,ctx,resourceCode,op.standard_operation);if(!scope.allowed){await c.query("rollback");return NextResponse.json({error:`Không có quyền Điều độ Schedule Area ${scope.scopeKey||resourceCode}.`},{status:403});}}

  if(recipeKey){
   const recipeMapQ=await c.query(`
    select 1
    from md_main_operation_recipe m
    where m.recipe_key=$1
      and m.is_active=true
      and upper(trim(coalesce(nullif(trim(m.standard_operation),''),nullif(trim(m.operation_code),''))))=upper(trim($2))
    limit 1
   `,[recipeKey,op.standard_operation]);
   if(!recipeMapQ.rowCount)
    throw new Error(`Recipe đã chọn không thuộc Main Operation ${op.standard_operation} / khu vực điều độ hiện tại.`);
  }

  if(requestedScheduleArea){
   const areaMapQ=await c.query(`
    select a.schedule_area_code,a.resource_group,a.resource_code
    from md_schedule_area a
    join md_schedule_area_operation m
      on m.schedule_area_code=a.schedule_area_code
     and m.standard_operation=$2
     and m.is_active=true
    where a.schedule_area_code=$1
      and a.is_active=true
      and a.allow_manual_plan=true
    limit 1
   `,[requestedScheduleArea,op.standard_operation]);

   if(!areaMapQ.rowCount)
    throw new Error(
     `Standard Operation ${op.standard_operation} chưa được map vào Schedule Area ${requestedScheduleArea}.`
    );

   const area=areaMapQ.rows[0];
   if(area.resource_code && clean(area.resource_code)!==resourceCode)
    throw new Error(`${requestedScheduleArea} chỉ cho Resource ${area.resource_code}.`);

   if(area.resource_group){
    const rg=await c.query(`
     select 1 from md_schedule_resource
     where resource_code=$1 and resource_group=$2 and is_active=true
     limit 1
    `,[resourceCode,area.resource_group]);
    if(!rg.rowCount)
     throw new Error(`${resourceCode} không thuộc Resource Group ${area.resource_group}.`);
   }
  }

  if(
   requestedStGroup &&
   clean(op.st_group).toUpperCase()!==requestedStGroup.toUpperCase()
  ){
   throw new Error(
    `Standard Operation ${op.standard_operation} không thuộc ST Group ${requestedStGroup}.`
   );
  }

  const batchConfig=await loadBatchNumberConfig(c,standardOperation,recipeKey);

  let recipeNo:string|null=null;
  if(recipeKey){
   const rq=await c.query(`
    select recipe_key,recipe_no
    from md_process_recipe
    where recipe_key=$1 and is_active=true
    limit 1
   `,[recipeKey]);
   if(!rq.rowCount)throw new Error("Recipe không hợp lệ hoặc đã ngưng sử dụng.");
   recipeNo=rq.rows[0].recipe_no;
  }

  const resourceQ=await c.query(`
   select resource_code,resource_group,max_concurrent,launch_interval_minutes
   from md_schedule_resource
   where resource_code=$1 and is_active=true
   limit 1
  `,[resourceCode]);
  if(!resourceQ.rowCount)throw new Error("Resource không hợp lệ.");
  const resource=resourceQ.rows[0];

  const effectiveDateQ=await c.query(`select $1::date planning_date`,[planningDate]);
  const effectiveDate=effectiveDateQ.rows[0].planning_date;

  const [batchNo]=await allocateBatchNumbers(c,batchConfig,1);

  const areaQ=await c.query(`
   select a.id
   from md_area_operation_group ag
   join md_area a on a.id=ag.area_id and a.is_active=true
   where ag.st_group=$1 and ag.is_active=true
   limit 1
  `,[op.st_group||""]);
  const areaId=areaQ.rows[0]?.id||null;

  // Standard Process luôn lấy từ cấu hình Recipe. Duration nhập trên Manual Grid
  // chỉ là thời gian điều độ thực tế/override, không được ghi ngược vào master Process.
  const configuredProcessMinutes=await resolveProcessMinutes(c,recipeKey,0,0);

  let effectiveStart=start;
  let chemicalWindow:Awaited<ReturnType<typeof resolveChemicalScheduleWindow>>|null=null;
  let autoAdjusted:null|{from:string;to:string;reason:string}=null;
  // Lô liên kết (không Loading, loading_minutes_override=0): loại LÔ NGUỒN khỏi kiểm tra trùng
  // FB — lô liên kết bám NDT End (hoặc Unloading End) của lô nguồn, CÙNG FB, chồng phần
  // Unloading 30' của nguồn là ĐÚNG quy tắc liên kết (không phải lỗi trùng FB).
  let excludeScheduleIds:number[]|null=null;
  if(resource.resource_group==="CHEMICAL_LINE"&&body.loading_minutes_override===0){
   const exclQ=await c.query(`
    select s.id from planning_schedule s
    where s.resource_code=$1 and s.status<>'CANCELLED'
      and abs(extract(epoch from (coalesce(s.ndt_end,s.planned_end) - $2::timestamptz)))<=300
   `,[resourceCode,start]);
   if(exclQ.rowCount)excludeScheduleIds=exclQ.rows.map((r:any)=>Number(r.id));
  }
  if(resource.resource_group==="CHEMICAL_LINE"){
   const processMin=Math.round(duration);
   const ov=parseOverrides(body);
   const tryWindow=async(ls:Date)=>{
    const w=await resolveChemicalScheduleWindow(c,{loadingStart:ls,processMinutes:processMin,totalQty:0,totalSurfaceDm2:0,recipeNo,overrides:ov});
    await assertResourceAndChemicalCapacity(c,{resourceCode,resourceGroup:resource.resource_group,window:w,maxConcurrent:Number(resource.max_concurrent||3),excludeScheduleIds:excludeScheduleIds??undefined});
    return w;
   };
   try{
    chemicalWindow=await tryWindow(effectiveStart);
   }catch(firstErr){
    // Save bị cấn giờ (lô khác chiếm FB / quá 3 Process…) → TỰ ĐẨY Loading Start về sau
    // (15 phút/bước, tối đa 7 ngày) cho tới khi hết cấn; vẫn tôn trọng mọi ràng buộc.
    let ok=false;
    for(let step=1;step<=7*24*4;step++){
     try{
      const cand=new Date(start.getTime()+step*15*60000);
      chemicalWindow=await tryWindow(cand);
      effectiveStart=cand;ok=true;break;
     }catch{}
    }
    if(!ok)throw firstErr instanceof Error?firstErr:new Error(String(firstErr));
    autoAdjusted={from:start.toISOString(),to:effectiveStart.toISOString(),reason:firstErr instanceof Error?firstErr.message:"bị cấn giờ"};
   }
  }
  const end=chemicalWindow?.unloadingEnd||new Date(effectiveStart.getTime()+Math.round(duration)*60000);

  const overlap=chemicalWindow?{rowCount:0}:await c.query(`
   select 1
   from planning_schedule
   where resource_code=$1
     and status<>'CANCELLED'
     and planned_start<$3
     and planned_end>$2
   limit 1
  `,[resourceCode,start,end]);
  if(overlap.rowCount)throw new Error(`${resourceCode} is occupied in this time range`);

  const batchQ=await c.query(`
   insert into planning_batch(
    batch_no,planning_date,area_id,standard_operation,recipe_key,
    total_jobs,total_qty,total_surface_dm2,process_minutes,
    planned_start,planned_end,priority,status,note,plan_source
   ) values(
    $1,$2::date,$3,$4,$5,
    0,0,0,$6,$7,$8,100,'PLANNED',$9,'MANUAL_GRID'
   )
   returning id,batch_no
  `,[batchNo,effectiveDate,areaId,op.standard_operation,recipeKey,configuredProcessMinutes,effectiveStart,end,note||'MANUAL SCHEDULE GRID']);

  const batchId=Number(batchQ.rows[0].id);
  const columns=chemicalWindow?chemicalScheduleColumns(chemicalWindow):null;
  const scheduleQ=await c.query(`
   insert into planning_schedule(
    batch_id,resource_code,schedule_date,planned_start,planned_end,
    duration_minutes,status,note,plan_source,
    loading_start,loading_end,loading_duration_minutes,
    process_start,process_end,process_duration_minutes,
    ndt_start,ndt_end,ndt_duration_minutes,
    unloading_start,unloading_end,unloading_duration_minutes
   ) values(
    $1,$2,((($3::timestamptz at time zone 'Asia/Ho_Chi_Minh') - interval '6 hours')::date),$3,$4,
    $5,'SCHEDULED',$6,'MANUAL_GRID',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
   ) returning *
  `,[batchId,resourceCode,effectiveStart,end,columns?.durationMinutes||Math.round(duration),note,
    columns?.loadingStart||null,columns?.loadingEnd||null,columns?.loadingDurationMinutes||null,
    columns?.processStart||null,columns?.processEnd||null,columns?.processDurationMinutes||null,
    columns?.ndtStart||null,columns?.ndtEnd||null,columns?.ndtDurationMinutes||null,
    columns?.unloadingStart||null,columns?.unloadingEnd||null,columns?.unloadingDurationMinutes||null]);

  await c.query("commit");
  await notifyInternalChange({dbClient:c,
   ctx,eventKey:"MANUAL_SCHEDULE_CREATED",summary:`Created manual Schedule Batch ${batchNo} · ${op.standard_operation} on ${resourceCode} · ${effectiveStart.toISOString()} → ${end.toISOString()}`,
   batchId,batchNo,standardOperation:String(op.standard_operation||""),entityType:"SCHEDULE",entityId:scheduleQ.rows[0]?.id||batchId,
   metadata:{resourceCode,planningDate,plannedStart:effectiveStart.toISOString(),plannedEnd:end.toISOString(),planSource:"MANUAL_GRID",autoAdjusted}
  });
  return NextResponse.json({
   ok:true,
   batchId,
   batchNo,
   schedule:scheduleQ.rows[0],
   planSource:"MANUAL_GRID",
   autoAdjusted
  });
 }catch(e){
  await c.query("rollback");
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }finally{
  c.release();
 }
}
