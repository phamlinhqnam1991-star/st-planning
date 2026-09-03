"use client";

import {safeJson} from "@/lib/fetch-json";
import {useEffect,useMemo,useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";

type NextBreakdown={
 operation:string;
 qty:number;
 surface:number;
 paint:string|null;
};

type Batch={
 id:number;
 batch_no:string;
 standard_operation:string;
 recipe_no:string|null;
 recipe_name:string|null;
 total_jobs:number;
 total_qty:number;
 total_surface_dm2:number;
 process_minutes:number|null;
 next_main_operations:string|null;
 next_main_breakdown:NextBreakdown[]|null;
 schedule_id:number|null;
 schedule_date:string|null;
 scheduled_resource_code:string|null;
 scheduled_planned_start:string|null;
 scheduled_planned_end:string|null;
 schedule_status:string|null;
 handover_alert_count?:number;
};

type HandoverAlert={
 id:number;
 source_batch_id:number;
 source_batch_no:string;
 source_standard_operation:string;
 source_planner:string|null;
 job_num:string;
 change_type:"ADD_JOB"|"REMOVE_JOB";
 next_standard_operation:string|null;
 affected_planner:string|null;
 affected_batch_id:number|null;
 affected_batch_no:string|null;
 affected_schedule_id:number|null;
 affected_resource_code:string|null;
 affected_planned_start:string|null;
 source_batch_qty_before:number;
 source_batch_qty_after:number;
 source_batch_surface_before:number;
 source_batch_surface_after:number;
 changed_job_qty:number;
 changed_job_surface:number;
 impact_level:"INFO"|"WARNING"|"IMPACTED"|"CRITICAL";
 status:"NEW"|"ACKNOWLEDGED";
 created_at:string;
 acknowledged_at:string|null;
 acknowledged_by:string|null;
 note:string|null;
};

type Resource={
 resource_code:string;
 resource_name:string;
 resource_group:string;
};

type OperationOption={
 standard_operation:string;
 batch_prefix:string|null;
};

type RecipeOption={
 recipe_key:string;
 recipe_no:string|null;
 recipe_name:string|null;
 process_family:string|null;
 mapped_standard_operations?:string[]|null;
};

type ScheduleArea={
 schedule_area_code:string;
 schedule_area_name:string;
 resource_group:string|null;
 resource_code:string|null;
 display_order:number;
 default_rows:number;
 planner_owner:string;
 operations:{standard_operation:string}[];
};

function hhmm(m:any){
 const n=Number(m||0);
 if(!n)return "";
 return `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
}

function formatNumber(value:unknown,maxDecimals=2){
 const n=Number(value??0);
 if(!Number.isFinite(n))return "0";
 return new Intl.NumberFormat("vi-VN",{maximumFractionDigits:maxDecimals}).format(n);
}

function localInput(date:string){
 return `${date}T07:00`;
}

function scheduleDateLabel(v:string|null){
 if(!v)return "";
 const d=new Date(v);
 if(Number.isNaN(d.getTime()))return String(v).slice(0,10);
 return d.toLocaleDateString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"});
}

function scheduleTimeLabel(v:string|null){
 if(!v)return "—";
 const d=new Date(v);
 if(Number.isNaN(d.getTime()))return "—";
 return d.toLocaleTimeString("en-GB",{
  timeZone:"Asia/Ho_Chi_Minh",
  hour:"2-digit",
  minute:"2-digit"
 });
}

function parseHHMM(value:string){
 const m=value.trim().match(/^(\d{1,3}):(\d{2})$/);
 if(!m)return null;
 const h=Number(m[1]);
 const min=Number(m[2]);
 if(!Number.isFinite(h)||!Number.isFinite(min)||h<0||min<0||min>59)return null;
 const total=h*60+min;
 return total>0?total:null;
}

function operationColorClass(operation:string){
 const op=String(operation||"").trim().toUpperCase();

 const map:Record<string,string>={
  "CMSA":"op-color-01",
  "CHEMMILL":"op-color-02",
  "CPBILP":"op-color-03",
  "CPBILP-A":"op-color-04",
  "PIONBL":"op-color-05",
  "RWK":"op-color-06",
  "V_A-SHPN":"op-color-07",
  "MANUALSP":"op-color-08",
  "CLASP":"op-color-09",
  "BSAUNSLD":"op-color-10",
  "TSAUNSLD":"op-color-11",
  "BSASLD":"op-color-12",
  "TSASLD":"op-color-13",
  "CCNV-IM":"op-color-14",
  "CCNV-IA":"op-color-15",
  "ANOD/CCNV FB":"op-color-16",
  "V_PASS/BRTG":"op-color-17",
  "FMSKG-CM":"op-color-18",
  "SIPC":"op-color-19",
  "SI-SEAL":"op-color-20",
  "STRIP":"op-color-21",
  "HE-BAKE AFTER PLATING":"op-color-22",
  "HE-BAKE BEFORE BLASTING":"op-color-23",
  "A-DBLST":"op-color-24",
  "M-DBLST":"op-color-25",
  "PLA-ZINI":"op-color-26",
  "HE-BAKE":"op-color-27",
  "PLA-CC":"op-color-28",
  "PRIMER":"op-color-29",
  "PRIMER2":"op-color-30",
  "PRIMER3":"op-color-31",
  "TOPCOAT1":"op-color-32",
  "TOPCOAT2":"op-color-33",
  "ANTI-ABRASION":"op-color-34",
  "PAINT MARKING":"op-color-35",
  "VARNISH":"op-color-36"
 };

 return map[op]||"op-color-default";
}

function groupByOperation(items:Batch[]){
 const map=new Map<string,Batch[]>();

 for(const batch of items){
  const key=String(batch.standard_operation||"UNMAPPED");
  const list=map.get(key)||[];
  list.push(batch);
  map.set(key,list);
 }

 return [...map.entries()]
  .sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}))
  .map(([operation,rows])=>({
   operation,
   items:[...rows].sort((a,b)=>
    String(a.batch_no).localeCompare(String(b.batch_no),undefined,{numeric:true})
   )
  }));
}

function groupByScheduleArea(items:Batch[],areas:ScheduleArea[]){
 // v232: khu gộp — area có resource_group nhưng không resource_code (vd PAINTING).
 // Batch thuộc lane con (CAB1/2/3) được gom vào khu chung để chọn cabin tùy ý.
 const hubByGroup=new Map<string,ScheduleArea>();
 for(const area of areas){
  if(area.resource_group&&!area.resource_code&&!hubByGroup.has(area.resource_group))hubByGroup.set(area.resource_group,area);
 }
 function effectiveArea(area:ScheduleArea|null):ScheduleArea|null{
  if(!area)return null;
  if(area.resource_code&&area.resource_group){const hub=hubByGroup.get(area.resource_group);if(hub)return hub;}
  return area;
 }

 const operationToArea=new Map<string,ScheduleArea>();

 for(const area of areas){
  for(const mapping of area.operations||[]){
   const op=String(mapping.standard_operation||"").trim().toUpperCase();
   if(op&&!operationToArea.has(op))operationToArea.set(op,area);
  }
 }

 const map=new Map<string,{
  area:ScheduleArea|null;
  items:Batch[];
 }>();

 for(const batch of items){
  const op=String(batch.standard_operation||"").trim().toUpperCase();
  const area=effectiveArea(operationToArea.get(op)||null);
  const key=area?.schedule_area_code||"UNMAPPED";

  const current=map.get(key)||{area,items:[]};
  current.items.push(batch);
  map.set(key,current);
 }

 return [...map.entries()]
  .map(([key,value])=>({
   key,
   area:value.area,
   items:[...value.items].sort((a,b)=>
    String(a.standard_operation).localeCompare(
     String(b.standard_operation),
     undefined,
     {numeric:true}
    )||
    String(a.batch_no).localeCompare(
     String(b.batch_no),
     undefined,
     {numeric:true}
    )
   )
  }))
  .sort((a,b)=>{
   if(a.key==="UNMAPPED")return 1;
   if(b.key==="UNMAPPED")return -1;
   return Number(a.area?.display_order||9999)-Number(b.area?.display_order||9999);
  });
}

export default function ScheduleBoardClient({
 batches,resources,operations,recipes,scheduleAreas,handoverAlerts,planner,date
}:{
 batches:Batch[];
 resources:Resource[];
 operations:OperationOption[];
 recipes:RecipeOption[];
 scheduleAreas:ScheduleArea[];
 handoverAlerts:HandoverAlert[];
 planner:"1"|"2";
 date:string;
}){
 const [batchId,setBatchId]=useState("");
 const [resource,setResource]=useState("");
 const [start,setStart]=useState(localInput(date));
 const [durationText,setDurationText]=useState("");
 const [busy,setBusy]=useState(false);
 const [msg,setMsg]=useState("");
 usePopupMessage(msg);
 const [emptyOperation,setEmptyOperation]=useState("");
 const [emptyRecipe,setEmptyRecipe]=useState("");
 const [creatingEmpty,setCreatingEmpty]=useState(false);
 const [alerts,setAlerts]=useState<HandoverAlert[]>(handoverAlerts);
 const [ackBusy,setAckBusy]=useState<number|null>(null);
 const [showAcknowledged,setShowAcknowledged]=useState(false);

 const batch=useMemo(
  ()=>batches.find(x=>String(x.id)===batchId),
  [batches,batchId]
 );

 const unscheduled=useMemo(
  ()=>batches.filter(x=>!x.schedule_id),
  [batches]
 );

 const scheduled=useMemo(
  ()=>batches.filter(x=>Boolean(x.schedule_id)),
  [batches]
 );

 const unscheduledGroups=useMemo(
  ()=>groupByScheduleArea(unscheduled,scheduleAreas),
  [unscheduled,scheduleAreas]
 );

 const scheduledGroups=useMemo(
  ()=>groupByOperation(scheduled),
  [scheduled]
 );

 const emptyRecipeOptions=useMemo(()=>{
  const op=String(emptyOperation||"").trim().toUpperCase();
  if(!op)return [];
  return recipes.filter(recipe=>(recipe.mapped_standard_operations||[]).some(mapped=>String(mapped||"").trim().toUpperCase()===op));
 },[emptyOperation,recipes]);

 useEffect(()=>{
  setDurationText(hhmm(batch?.process_minutes));
 },[batchId,batch?.process_minutes]);

 useEffect(()=>{
  let cancelled=false;

  const refreshAlerts=async()=>{
   try{
    const r=await fetch(`/api/schedule/handover-alerts?planner=${planner}`,{
     cache:"no-store"
    });
    const d=await safeJson(r);
    if(!cancelled&&r.ok&&Array.isArray(d.alerts))setAlerts(d.alerts);
   }catch{}
  };

  const timer=window.setInterval(refreshAlerts,15000);
  return ()=>{
   cancelled=true;
   window.clearInterval(timer);
  };
 },[planner]);

 const newAlerts=useMemo(
  ()=>alerts.filter(x=>x.status==="NEW"),
  [alerts]
 );

 const visibleAlerts=useMemo(
  ()=>showAcknowledged?alerts:newAlerts,
  [alerts,newAlerts,showAcknowledged]
 );

 const configuredDuration=Number(batch?.process_minutes||0);
 const enteredDuration=parseHHMM(durationText);
 const durationIsValid=enteredDuration!==null;

 function ensureDurationForBatch(b:Batch){
  const fromInput=parseHHMM(durationText);
  if(fromInput)return fromInput;
  const configured=Number(b.process_minutes||0);
  return configured>0?configured:null;
 }

 async function scheduleBatch(targetBatch:Batch,targetResource:string){
  const duration=ensureDurationForBatch(targetBatch);

  if(!duration){
   setMsg("Batch chưa có Process Time. Hãy nhập Duration HH:MM.");
   return;
  }

  if(!start){
   setMsg("Hãy chọn Start Time.");
   return;
  }

  setBusy(true);
  setMsg("");

  try{
   const plannedStart=new Date(`${start}:00+07:00`).toISOString();
   const isMove=Boolean(targetBatch.schedule_id);

   const response=await fetch("/api/schedule",{
    method:isMove?"PATCH":"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify(
     isMove
      ? {
         scheduleId:Number(targetBatch.schedule_id),
         resourceCode:targetResource,
         plannedStart,
         durationMinutes:duration
        }
      : {
         batchId:Number(targetBatch.id),
         resourceCode:targetResource,
         plannedStart,
         durationMinutes:duration
        }
    )
   });

   const data=await safeJson(response);
   if(!response.ok)throw new Error(data.error||"Schedule failed");

   location.reload();
  }catch(error){
   setMsg(error instanceof Error?error.message:"Schedule failed");
  }finally{
   setBusy(false);
  }
 }

 async function acknowledgeAlert(alertId:number){
  setAckBusy(alertId);
  try{
   const r=await fetch(`/api/schedule/handover-alerts/${alertId}/ack`,{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({acknowledged_by:`Planner ${planner}`})
   });
   const d=await safeJson(r);
   if(!r.ok)throw new Error(d.error||"Acknowledge failed");

   setAlerts(prev=>prev.map(x=>
    x.id===alertId
     ? {...x,status:"ACKNOWLEDGED",acknowledged_at:new Date().toISOString(),acknowledged_by:`Planner ${planner}`}
     : x
   ));
  }catch(error){
   setMsg(error instanceof Error?error.message:"Acknowledge failed");
  }finally{
   setAckBusy(null);
  }
 }

 async function createEmptyBatch(){
  if(!emptyOperation){
   setMsg("Chọn Standard Operation để tạo lô trống.");
   return;
  }

  setCreatingEmpty(true);
  setMsg("");

  try{
   const response=await fetch("/api/planning/batch",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
     create_empty:true,
     planning_job_operation_ids:[],
     standard_operation:emptyOperation,
     recipe_key:emptyRecipe||null,
     planning_date:date
    })
   });

   const data=await safeJson(response);
   if(!response.ok)throw new Error(data.error||"Create Empty Batch failed");

   setMsg(`${data.batchNo} created · EMPTY · sẵn sàng điều độ trước và Fill Job sau.`);
   setTimeout(()=>location.reload(),700);
  }catch(error){
   setMsg(error instanceof Error?error.message:"Create Empty Batch failed");
  }finally{
   setCreatingEmpty(false);
  }
 }

 async function add(){
  if(!batchId||!resource||!start)return;

  if(!durationIsValid){
   setMsg("Duration phải theo định dạng HH:MM và lớn hơn 00:00.");
   return;
  }

  const target=batches.find(x=>String(x.id)===batchId);
  if(!target)return;

  await scheduleBatch(target,resource);
 }

 return <div className="schedule-batch-selection-shell">
  <section className={`handover-alert-panel ${newAlerts.length?"has-new":""}`}>
   <div className="handover-alert-head">
    <div>
     <b>Handover Alerts · Planner {planner}</b>
     <small>Planner khác thay đổi Job có ảnh hưởng tới công đoạn của bạn · tự cập nhật mỗi 15 giây.</small>
    </div>
    <div className="handover-alert-head-actions">
     <span className={`handover-new-count ${newAlerts.length?"active":""}`}>
      {newAlerts.length} New
     </span>
     <button
      className="btn small"
      type="button"
      onClick={()=>setShowAcknowledged(x=>!x)}
     >
      {showAcknowledged?"Hide Acknowledged":"Show Acknowledged"}
     </button>
    </div>
   </div>

   {visibleAlerts.length>0
    ? <div className="handover-alert-list">
       {visibleAlerts.map(a=>{
        const qtyDelta=Number(a.source_batch_qty_after||0)-Number(a.source_batch_qty_before||0);
        const surfaceDelta=Number(a.source_batch_surface_after||0)-Number(a.source_batch_surface_before||0);

        return <article
         className={`handover-alert-item impact-${String(a.impact_level).toLowerCase()} ${a.status==="ACKNOWLEDGED"?"is-acknowledged":""}`}
         key={a.id}
        >
         <div className="handover-alert-title">
          <div>
           <strong>{a.impact_level}</strong>
           <b>{a.change_type==="ADD_JOB"?"Job added":"Job removed"} · {a.job_num}</b>
          </div>
          <time>{new Date(a.created_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}</time>
         </div>

         <div className="handover-alert-grid">
          <span><b>From:</b> {a.source_batch_no} · {a.source_standard_operation}</span>
          <span><b>Next:</b> {a.next_standard_operation||"END"}</span>
          <span>
           <b>Batch Qty:</b>{" "}
           {formatNumber(a.source_batch_qty_before,0)} → {formatNumber(a.source_batch_qty_after,0)}
           {" "}({qtyDelta>=0?"+":""}{formatNumber(qtyDelta,0)})
          </span>
          <span>
           <b>Surface:</b>{" "}
           {formatNumber(a.source_batch_surface_before,2)} → {formatNumber(a.source_batch_surface_after,2)}
           {" "}({surfaceDelta>=0?"+":""}{formatNumber(surfaceDelta,2)} dm²)
          </span>
          <span><b>Changed Job:</b> {formatNumber(a.changed_job_qty,0)} pcs · {formatNumber(a.changed_job_surface,2)} dm²</span>
          <span>
           <b>Affected Batch:</b>{" "}
           {a.affected_batch_no||"Chưa có downstream Batch"}
          </span>
          {a.affected_resource_code&&
           <span>
            <b>Schedule:</b> {a.affected_resource_code}
            {a.affected_planned_start
             ? ` · ${new Date(a.affected_planned_start).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}`
             : ""}
           </span>}
         </div>

         <div className="handover-alert-actions">
          <button
           type="button"
           className="btn small"
           onClick={()=>{window.location.href=`/planning/batches/${a.source_batch_id}?returnTo=schedule&date=${encodeURIComponent(date)}`}}
          >
           Open Source Batch
          </button>

          {a.affected_batch_id&&
           <button
            type="button"
            className="btn small"
            onClick={()=>{window.location.href=`/planning/batches/${a.affected_batch_id}?returnTo=schedule&date=${encodeURIComponent(date)}`}}
           >
            Review My Batch
           </button>}

          {a.status==="NEW"
           ? <button
              type="button"
              className="btn primary small"
              disabled={ackBusy===a.id}
              onClick={()=>acknowledgeAlert(a.id)}
             >
              {ackBusy===a.id?"Saving...":"Acknowledge"}
             </button>
           : <span className="handover-ack-label">
              ✓ Acknowledged{a.acknowledged_by?` by ${a.acknowledged_by}`:""}
             </span>}
         </div>
        </article>
       })}
      </div>
    : <div className="handover-alert-empty">Không có thay đổi handover mới.</div>}
  </section>

  <div className="erp-form-panel schedule-empty-batch-form">
   <div className="schedule-empty-batch-title">
    <div>
     <b>Create Empty Batch · Plan Ahead</b>
     <small>Tạo lô trước → điều độ → Fill Job sau bằng Candidate View của công đoạn.</small>
    </div>
   </div>

   <label>Standard Operation
    <select
     className="input"
     value={emptyOperation}
     onChange={e=>{
      setEmptyOperation(e.target.value);
      setEmptyRecipe("");
     }}
    >
     <option value="">Select Operation...</option>
     {operations.map(op=>
      <option key={op.standard_operation} value={op.standard_operation}>
       {op.standard_operation}{op.batch_prefix?` · ${op.batch_prefix}`:""}
      </option>
     )}
    </select>
   </label>

   <label>Recipe / Paint Recipe
    <select
     className="input"
     value={emptyRecipe}
     onChange={e=>setEmptyRecipe(e.target.value)}
    >
     <option value="">No Recipe / Set later</option>
     {emptyRecipeOptions.map(r=>
      <option key={r.recipe_key} value={r.recipe_key}>
       {r.recipe_no||r.recipe_key} · {r.recipe_name||"—"}
      </option>
     )}
    </select>
   </label>

   <button
    type="button"
    className="btn primary"
    disabled={creatingEmpty||!emptyOperation}
    onClick={createEmptyBatch}
   >
    {creatingEmpty?"Creating...":"Create Empty Batch"}
   </button>
  </div>

  <div className="erp-form-panel schedule-add-form">
   <label>Planning Batch
    <select className="input" value={batchId} onChange={e=>setBatchId(e.target.value)}>
     <option value="">Select Batch...</option>
     {batches.map(b=>
      <option key={b.id} value={b.id}>
       {b.batch_no} · {b.standard_operation} · {b.recipe_no||"No Recipe"}
       {b.schedule_id
        ? ` · SCHEDULED ${scheduleDateLabel(b.scheduled_planned_start||b.schedule_date)} · ${b.scheduled_resource_code||"—"}`
        : ""}
      </option>
     )}
    </select>
   </label>

   <label>Resource
    <select className="input" value={resource} onChange={e=>setResource(e.target.value)}>
     <option value="">Select Resource...</option>
     {resources.map(r=>
      <option key={r.resource_code} value={r.resource_code}>
       {r.resource_name}
      </option>
     )}
    </select>
   </label>

   <label>Start Time
    <input
     className="input"
     type="datetime-local"
     value={start}
     onChange={e=>setStart(e.target.value)}
    />
   </label>

   <label>Duration
    <input
     className="input mono"
     type="text"
     inputMode="numeric"
     placeholder="HH:MM"
     value={durationText}
     onChange={e=>setDurationText(e.target.value)}
    />
    <small className="schedule-duration-hint">
     {configuredDuration>0
      ? `Đề xuất: ${hhmm(configuredDuration)} · Có thể nhập lại`
      : "Chưa có thời gian cấu hình · Nhập HH:MM"}
    </small>
   </label>

   <button
    className="btn primary"
    disabled={busy||!batchId||!resource||!start||!durationIsValid}
    onClick={add}
   >
    {busy?"Scheduling...":batch?.schedule_id?"Move Schedule":"Add Schedule"}
   </button>

  </div>

  <div className="schedule-batch-list-board">
   <div className="schedule-dnd-pool schedule-batch-pool-full">
    <div className="schedule-dnd-pool-head">
     <b>Planning Batches</b>
     <small>
      Chọn Batch để đưa lên form điều độ phía trên. Unscheduled được gom theo Schedule Area và mapping Standard Operation.
     </small>
    </div>

    <div className="schedule-batch-section">
     <div className="schedule-batch-section-title">
      <b>Unscheduled</b>
      <span>{unscheduled.length} Batches</span>
     </div>

     {unscheduledGroups.map(group=>{
      const areaName=group.area?.schedule_area_name||"UNMAPPED";
      const areaCode=group.area?.schedule_area_code||"UNMAPPED";
      const mappedOps=[
       ...new Set(
        group.items.map(x=>String(x.standard_operation||"")).filter(Boolean)
       )
      ];

      return <div
       className={`schedule-operation-group schedule-area-batch-group ${group.key==="UNMAPPED"?"schedule-area-unmapped-group":""}`}
       key={`u-area-${group.key}`}
      >
       <div className="schedule-operation-group-head schedule-area-batch-group-head">
        <div>
         <b>{areaName}</b>
         <small>
          {areaCode}
          {mappedOps.length?` · ${mappedOps.join(" / ")}`:""}
         </small>
        </div>
        <span>{group.items.length} Batches</span>
       </div>

       <div className="schedule-operation-batch-list">
        {group.items.map(b=>
         <div
          key={b.id}
          className={`schedule-operation-batch-card schedule-operation-batch-clickable ${operationColorClass(b.standard_operation)}`}
          role="button"
          tabIndex={0}
          onClick={()=>{window.location.href=`/planning/batches/${b.id}?returnTo=schedule&date=${encodeURIComponent(date)}`}}
          onKeyDown={e=>{
           if(e.key==="Enter"||e.key===" "){
            window.location.href=`/planning/batches/${b.id}?returnTo=schedule&date=${encodeURIComponent(date)}`;
           }
          }}
         >
          <div className="schedule-operation-batch-head">
           <strong>
            {b.batch_no}
            {Number(b.total_jobs||0)===0&&
             <em className="schedule-empty-badge">EMPTY</em>}
            {Number(b.handover_alert_count||0)>0&&
             <em className="schedule-impact-badge">Impact {b.handover_alert_count}</em>}
           </strong>

           <div className="schedule-operation-batch-actions">
            <span className="schedule-batch-operation-label">
             {b.standard_operation}
            </span>
            <span>{b.recipe_no||"—"}</span>
            <button
             type="button"
             className="btn small schedule-card-select-btn"
             onClick={e=>{
              e.stopPropagation();
              setBatchId(String(b.id));
              setDurationText(hhmm(b.process_minutes));
             }}
            >
             Schedule
            </button>
           </div>
          </div>

          <div className="schedule-operation-batch-total">
           <span><b>Total Qty:</b> {formatNumber(b.total_qty,0)}</span>
           <span><b>Total Surface:</b> {formatNumber(b.total_surface_dm2,2)} dm²</span>
          </div>

          <div className="schedule-next-breakdown">
           {(b.next_main_breakdown||[]).map((x,index)=>
            <div
             className="schedule-next-breakdown-row"
             key={`${b.id}-${x.operation}-${index}`}
            >
             <div className="schedule-next-breakdown-op">
              <b>{x.operation||"END"}</b>
              {x.paint&&<small>Paint: {x.paint}</small>}
             </div>
             <span><b>Qty:</b> {formatNumber(x.qty,0)}</span>
             <span><b>Surface:</b> {formatNumber(x.surface,2)} dm²</span>
            </div>
           )}

           {(!b.next_main_breakdown||!b.next_main_breakdown.length)&&
            <div className="schedule-next-breakdown-row">
             <div className="schedule-next-breakdown-op"><b>END</b></div>
             <span><b>Qty:</b> {formatNumber(b.total_qty,0)}</span>
             <span><b>Surface:</b> {formatNumber(b.total_surface_dm2,2)} dm²</span>
            </div>}
          </div>
         </div>
        )}
       </div>
      </div>
     })}

     {!unscheduled.length&&
      <div className="muted schedule-empty-batches">Không còn Batch chưa điều độ.</div>}
    </div>

    <div className="schedule-batch-section">
     <div className="schedule-batch-section-title">
      <b>Scheduled / Move</b>
      <span>{scheduled.length} Batches</span>
     </div>

     {scheduledGroups.map(group=>
      <div
       className={`schedule-operation-group ${operationColorClass(group.operation)}`}
       key={`s-${group.operation}`}
      >
       <div className="schedule-operation-group-head">
        <b>{group.operation}</b>
        <span>{group.items.length} Batches</span>
       </div>

       <div className="schedule-operation-batch-list scheduled">
        {group.items.map(b=>
         <div
          key={b.id}
          className={`schedule-operation-batch-card schedule-operation-batch-clickable is-scheduled ${operationColorClass(group.operation)}`}
          role="button"
          tabIndex={0}
          onClick={()=>{window.location.href=`/planning/batches/${b.id}?returnTo=schedule&date=${encodeURIComponent(date)}`}}
          onKeyDown={e=>{
           if(e.key==="Enter"||e.key===" "){
            window.location.href=`/planning/batches/${b.id}?returnTo=schedule&date=${encodeURIComponent(date)}`;
           }
          }}
         >
          <div className="schedule-operation-batch-head">
           <strong>
            {b.batch_no}
            {Number(b.handover_alert_count||0)>0&&
             <em className="schedule-impact-badge">Impact {b.handover_alert_count}</em>}
           </strong>
           <div className="schedule-operation-batch-actions">
            <span>{b.scheduled_resource_code||"—"}</span>
            <button
             type="button"
             className="btn small schedule-card-select-btn"
             onClick={e=>{
              e.stopPropagation();
              setBatchId(String(b.id));
              setResource(b.scheduled_resource_code||"");
              setDurationText(hhmm(b.process_minutes));
             }}
            >
             Move
            </button>
           </div>
          </div>
          <div className="schedule-scheduled-summary">
           {scheduleDateLabel(b.scheduled_planned_start||b.schedule_date)}
           {" · "}
           {scheduleTimeLabel(b.scheduled_planned_start)}
           {" → "}
           {scheduleTimeLabel(b.scheduled_planned_end)}
          </div>
         </div>
        )}
       </div>
      </div>
     )}
    </div>
   </div>
  </div>
 </div>;
}
