"use client";

import {useEffect,useMemo,useState} from "react";

type Batch={
 id:number;batch_no:string;standard_operation:string;
 recipe_no:string|null;recipe_name:string|null;total_jobs:number;
 total_qty:number;total_surface_dm2:number;process_minutes:number|null;
 schedule_id:number|null;
 schedule_date:string|null;
 scheduled_resource_code:string|null;
 scheduled_planned_start:string|null;
 scheduled_planned_end:string|null;
 schedule_status:string|null;
};
type Resource={resource_code:string;resource_name:string;resource_group:string};

function hhmm(m:any){
 const n=Number(m||0);
 if(!n)return "";
 return `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
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
function parseHHMM(value:string){
 const m=value.trim().match(/^(\d{1,3}):(\d{2})$/);
 if(!m)return null;
 const h=Number(m[1]);
 const min=Number(m[2]);
 if(!Number.isFinite(h)||!Number.isFinite(min)||h<0||min<0||min>59)return null;
 const total=h*60+min;
 return total>0?total:null;
}

export default function ScheduleBoardClient({
 batches,resources,date
}:{batches:Batch[];resources:Resource[];date:string}){
 const [batchId,setBatchId]=useState("");
 const [resource,setResource]=useState("");
 const [start,setStart]=useState(localInput(date));
 const [durationText,setDurationText]=useState("");
 const [busy,setBusy]=useState(false);
 const [msg,setMsg]=useState("");
 const [dragBatchId,setDragBatchId]=useState<number|null>(null);
 const [dragOverResource,setDragOverResource]=useState("");

 const batch=useMemo(()=>batches.find(x=>String(x.id)===batchId),[batches,batchId]);
 const unscheduled=useMemo(()=>batches.filter(x=>!x.schedule_id),[batches]);
 const scheduled=useMemo(()=>batches.filter(x=>Boolean(x.schedule_id)),[batches]);

 useEffect(()=>{
  setDurationText(hhmm(batch?.process_minutes));
 },[batchId,batch?.process_minutes]);

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
   setMsg("Batch chưa có Process Time. Hãy nhập Duration HH:MM trước khi kéo thả.");
   return;
  }

  if(!start){
   setMsg("Hãy chọn Start Time trước khi kéo thả.");
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

   const data=await response.json();
   if(!response.ok)throw new Error(data.error||"Schedule failed");

   location.reload();
  }catch(error){
   setMsg(error instanceof Error?error.message:"Schedule failed");
  }finally{
   setBusy(false);
   setDragBatchId(null);
   setDragOverResource("");
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

 function dragStart(e:React.DragEvent,b:Batch){
  setDragBatchId(b.id);
  e.dataTransfer.effectAllowed=b.schedule_id?"move":"copy";
  e.dataTransfer.setData("application/x-st-batch",String(b.id));
 }

 function dropOnResource(e:React.DragEvent,targetResource:string){
  e.preventDefault();
  const id=Number(e.dataTransfer.getData("application/x-st-batch")||dragBatchId);
  const target=batches.find(x=>x.id===id);
  if(!target)return;
  setResource(targetResource);
  setBatchId(String(target.id));
  void scheduleBatch(target,targetResource);
 }

 return <div className="schedule-dnd-shell">
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
     {resources.map(r=><option key={r.resource_code} value={r.resource_code}>
      {r.resource_name}
     </option>)}
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

   <label>
    Duration
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

   {msg&&<div className="notice schedule-message">{msg}</div>}
  </div>

  <div className="schedule-dnd-board">
   <div className="schedule-dnd-pool">
    <div className="schedule-dnd-pool-head">
     <b>Drag Planning Batches</b>
     <small>Kéo Batch vào Resource. Start Time và Duration dùng giá trị phía trên.</small>
    </div>

    <div className="schedule-dnd-section">
     <b>Unscheduled</b>
     <div className="schedule-dnd-batches">
      {unscheduled.map(b=>
       <button
        type="button"
        key={b.id}
        className={`schedule-dnd-batch ${dragBatchId===b.id?"is-dragging":""}`}
        draggable
        onDragStart={e=>dragStart(e,b)}
        onDragEnd={()=>setDragBatchId(null)}
        onClick={()=>{
         setBatchId(String(b.id));
         setDurationText(hhmm(b.process_minutes));
        }}
       >
        <strong>{b.batch_no}</strong>
        <span>{b.standard_operation} · {b.recipe_no||"—"}</span>
       </button>
      )}
      {!unscheduled.length&&<small className="muted">Không còn Batch chưa điều độ.</small>}
     </div>
    </div>

    <div className="schedule-dnd-section">
     <b>Scheduled / Move</b>
     <div className="schedule-dnd-batches">
      {scheduled.map(b=>
       <button
        type="button"
        key={b.id}
        className={`schedule-dnd-batch scheduled ${dragBatchId===b.id?"is-dragging":""}`}
        draggable
        onDragStart={e=>dragStart(e,b)}
        onDragEnd={()=>setDragBatchId(null)}
        onClick={()=>{
         setBatchId(String(b.id));
         setResource(b.scheduled_resource_code||"");
         setDurationText(hhmm(b.process_minutes));
        }}
       >
        <strong>{b.batch_no}</strong>
        <span>{b.scheduled_resource_code||"—"} · {scheduleDateLabel(b.scheduled_planned_start||b.schedule_date)}</span>
       </button>
      )}
     </div>
    </div>
   </div>

   <div className="schedule-dnd-resources">
    {resources.map(r=>
     <div
      key={r.resource_code}
      className={`schedule-dnd-resource ${dragOverResource===r.resource_code?"is-over":""}`}
      onDragOver={e=>{
       if(dragBatchId===null)return;
       e.preventDefault();
       e.dataTransfer.dropEffect="move";
       setDragOverResource(r.resource_code);
      }}
      onDragLeave={()=>setDragOverResource("")}
      onDrop={e=>dropOnResource(e,r.resource_code)}
     >
      <b>{r.resource_code}</b>
      <span>{r.resource_name}</span>
      <small>Drop Batch here</small>
     </div>
    )}
   </div>
  </div>
 </div>
}
