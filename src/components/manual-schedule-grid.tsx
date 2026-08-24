"use client";
import {useMemo,useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";

type OperationOption={standard_operation:string;st_group:string;batch_prefix:string|null};
type ResourceOption={resource_code:string;resource_name:string;resource_group:string};
type RecipeOption={recipe_key:string;recipe_no:string|null;recipe_name:string|null;process_family:string|null};
type ScheduleArea={
 schedule_area_code:string;schedule_area_name:string;resource_group:string|null;resource_code:string|null;
 display_order:number;default_rows:number;planner_owner:string;allow_manual_plan:boolean;allow_auto_plan:boolean;
 operations:{standard_operation:string}[];
};
type ScheduledRow={
 id:number;batch_id:number;batch_no:string;standard_operation:string;recipe_key:string|null;recipe_no:string|null;
 recipe_name:string|null;resource_code:string;resource_group:string;total_jobs:number;total_qty:number;
 total_surface_dm2:number;planned_start:string;planned_end:string;duration_minutes:number;sequence_no:number;
 plan_source?:string|null;
};
type PlanningBatch={
 id:number;batch_no:string;standard_operation:string;recipe_key:string|null;recipe_no:string|null;recipe_name:string|null;
 total_jobs:number;total_qty:number;total_surface_dm2:number;process_minutes:number|null;
 schedule_id:number|null;
};
type Draft={
 standardOperation:string;recipeKey:string;resourceCode:string;date:string;startTime:string;duration:string;
 batchId:number|null;batchNo:string;totalJobs:number;totalQty:number;totalSurfaceDm2:number;
};

const blank=(date:string,resourceCode=""):Draft=>({
 standardOperation:"",recipeKey:"",resourceCode,date,startTime:"",duration:"",
 batchId:null,batchNo:"",totalJobs:0,totalQty:0,totalSurfaceDm2:0
});
function parseHHMM(v:string){const m=v.trim().match(/^(\d{1,3}):(\d{2})$/);if(!m)return null;const n=Number(m[1])*60+Number(m[2]);return Number(m[2])<60&&n>0?n:null}
function fmt(v:unknown,d=2){const n=Number(v||0);return Number.isFinite(n)?new Intl.NumberFormat("vi-VN",{maximumFractionDigits:d}).format(n):"0"}
function time(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleTimeString("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"})}

export function ManualScheduleGrid({
 scheduleAreas,operations,resources,recipes,scheduledRows,planningBatches,date,planner
}:{
 scheduleAreas:ScheduleArea[];operations:OperationOption[];resources:ResourceOption[];recipes:RecipeOption[];
 scheduledRows:ScheduledRow[];planningBatches:PlanningBatch[];date:string;planner:"1"|"2";
}){
 const [rowCounts,setRowCounts]=useState<Record<string,number>>(()=>Object.fromEntries(
  scheduleAreas.map(a=>[a.schedule_area_code,Math.max(1,Number(a.default_rows)||20)])
 ));
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});
 const [busy,setBusy]=useState("");
 const [rowBusy,setRowBusy]=useState("");
 const [actionBusy,setActionBusy]=useState("");
 const [editingScheduleId,setEditingScheduleId]=useState<number|null>(null);
 const [editDraft,setEditDraft]=useState({
  recipeKey:"",
  resourceCode:"",
  date:"",
  startTime:"",
  duration:""
 });
 const [message,setMessage]=useState("");
 usePopupMessage(message);

 const opMap=useMemo(()=>new Map(operations.map(o=>[o.standard_operation.toUpperCase(),o])),[operations]);

 function areaOps(a:ScheduleArea){
  const allowed=new Set((a.operations||[]).map(x=>x.standard_operation.toUpperCase()));
  return operations.filter(o=>allowed.has(o.standard_operation.toUpperCase()));
 }
 function areaResources(a:ScheduleArea){
  if(a.resource_code)return resources.filter(r=>r.resource_code===a.resource_code);
  if(a.resource_group)return resources.filter(r=>r.resource_group===a.resource_group);
  return resources;
 }
 function scheduledFor(a:ScheduleArea){
  const allowed=new Set((a.operations||[]).map(x=>x.standard_operation.toUpperCase()));
  return scheduledRows.filter(r=>{
   if(a.resource_code&&r.resource_code===a.resource_code)return true;
   if(a.resource_group&&r.resource_group===a.resource_group&&allowed.has(r.standard_operation.toUpperCase()))return true;
   return allowed.has(r.standard_operation.toUpperCase());
  }).sort((x,y)=>{
   const sx=Number(x.sequence_no||0);
   const sy=Number(y.sequence_no||0);

   if(sx>0||sy>0){
    const ax=sx>0?sx:999999;
    const ay=sy>0?sy:999999;
    if(ax!==ay)return ax-ay;
   }

   return new Date(x.planned_start).getTime()-new Date(y.planned_start).getTime();
  });
 }
 function unscheduledFor(a:ScheduleArea){
  const allowed=new Set((a.operations||[]).map(x=>String(x.standard_operation||"").toUpperCase()));
  return planningBatches
   .filter(b=>!b.schedule_id&&allowed.has(String(b.standard_operation||"").toUpperCase()))
   .sort((x,y)=>
    String(x.standard_operation).localeCompare(String(y.standard_operation),undefined,{numeric:true})||
    String(x.batch_no).localeCompare(String(y.batch_no),undefined,{numeric:true})
   );
 }
 const key=(a:string,i:number)=>`${a}::${i}`;
 function draft(a:ScheduleArea,i:number){
  return drafts[key(a.schedule_area_code,i)]||blank(date,a.resource_code||"");
 }
 function patch(a:ScheduleArea,i:number,x:Partial<Draft>){
  const k=key(a.schedule_area_code,i);
  setDrafts(p=>({...p,[k]:{...(p[k]||blank(date,a.resource_code||"")),...x}}));
 }
 function selectUnscheduledBatch(a:ScheduleArea,b:PlanningBatch){
  // Use the first empty input row in this Schedule Area. This is the same
  // hand-off point that Auto Schedule can call later; it does NOT recreate Batch.
  const count=rowCounts[a.schedule_area_code]||Math.max(1,Number(a.default_rows)||20);
  let target=0;
  for(let i=0;i<count;i++){
   const r=drafts[key(a.schedule_area_code,i)];
   if(!r?.batchId&&!r?.standardOperation){target=i;break}
  }
  const hh=b.process_minutes&&Number(b.process_minutes)>0
   ?`${String(Math.floor(Number(b.process_minutes)/60)).padStart(2,"0")}:${String(Number(b.process_minutes)%60).padStart(2,"0")}`
   :"";
  patch(a,target,{
   batchId:b.id,batchNo:b.batch_no,standardOperation:b.standard_operation,
   recipeKey:b.recipe_key||"",resourceCode:a.resource_code||"",date,startTime:"",duration:hh,
   totalJobs:Number(b.total_jobs||0),totalQty:Number(b.total_qty||0),totalSurfaceDm2:Number(b.total_surface_dm2||0)
  });
  setMessage(`${b.batch_no}: đã đưa xuống dòng ${target+1}. Chọn Resource / Start / Duration rồi Schedule.`);
 }
 function clearDraft(a:ScheduleArea,i:number){
  const k=key(a.schedule_area_code,i);
  setDrafts(p=>({...p,[k]:blank(date,a.resource_code||"")}));
 }
 async function persistRowCount(a:ScheduleArea,nextCount:number){
  const safeCount=Math.min(200,Math.max(1,nextCount));
  setRowBusy(a.schedule_area_code);

  try{
   const res=await fetch("/api/config/schedule-areas",{
    method:"PATCH",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
     schedule_area_code:a.schedule_area_code,
     schedule_area_name:a.schedule_area_name,
     resource_group:a.resource_group,
     resource_code:a.resource_code,
     planner_owner:a.planner_owner,
     display_order:a.display_order,
     default_rows:safeCount,
     allow_manual_plan:a.allow_manual_plan,
     allow_auto_plan:a.allow_auto_plan,
     is_active:true
    })
   });

   const text=await res.text();
   let data:any={};

   if(text){
    try{data=JSON.parse(text)}catch{}
   }

   if(!res.ok){
    throw new Error(data.error||`Không lưu được số dòng (${res.status}).`);
   }

   setRowCounts(p=>({...p,[a.schedule_area_code]:safeCount}));
   setMessage(`${a.schedule_area_name}: đã lưu ${safeCount} dòng mặc định.`);
   return true;
  }catch(e){
   setMessage(e instanceof Error?e.message:"Không lưu được số dòng.");
   return false;
  }finally{
   setRowBusy("");
  }
 }

 async function addRow(a:ScheduleArea){
  const count=rowCounts[a.schedule_area_code]||Math.max(1,Number(a.default_rows)||20);
  await persistRowCount(a,count+1);
 }

 async function removeRow(a:ScheduleArea){
  const count=rowCounts[a.schedule_area_code]||Math.max(1,Number(a.default_rows)||20);
  if(count<=1)return;

  const ok=await persistRowCount(a,count-1);
  if(!ok)return;

  const last=count-1;
  const k=key(a.schedule_area_code,last);

  setDrafts(p=>{
   const n={...p};
   delete n[k];
   return n;
  });
 }
 function beginEdit(row:ScheduledRow){
  const start=new Date(row.planned_start);
  const localDate=start.toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"});
  const localTime=start.toLocaleTimeString("en-GB",{
   timeZone:"Asia/Ho_Chi_Minh",
   hour:"2-digit",
   minute:"2-digit"
  });

  setEditingScheduleId(row.id);
  setEditDraft({
   recipeKey:row.recipe_key||"",
   resourceCode:row.resource_code||"",
   date:localDate,
   startTime:localTime,
   duration:`${String(Math.floor(Number(row.duration_minutes||0)/60)).padStart(2,"0")}:${String(Number(row.duration_minutes||0)%60).padStart(2,"0")}`
  });
  setMessage("");
 }

 async function saveEdit(a:ScheduleArea,row:ScheduledRow){
  const duration=parseHHMM(editDraft.duration);

  if(!editDraft.resourceCode||!editDraft.date||!editDraft.startTime||!duration){
   setMessage("Edit: Resource / Date / Start / Duration là bắt buộc.");
   return;
  }

  setActionBusy(`edit-${row.id}`);
  setMessage("");

  try{
   const plannedStart=
    new Date(`${editDraft.date}T${editDraft.startTime}:00+07:00`).toISOString();

   const scheduleRes=await fetch("/api/schedule",{
    method:"PATCH",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
     scheduleId:row.id,
     resourceCode:editDraft.resourceCode,
     plannedStart,
     durationMinutes:duration
    })
   });

   const scheduleData=await scheduleRes.json();

   if(!scheduleRes.ok)
    throw new Error(scheduleData.error||"Không sửa được Schedule.");

   if((editDraft.recipeKey||"")!==(row.recipe_key||"")){
    const recipeRes=await fetch(`/api/planning/batch/${row.batch_id}`,{
     method:"PATCH",
     headers:{"content-type":"application/json"},
     body:JSON.stringify({
      recipe_key:editDraft.recipeKey||null,
      allow_scheduled_recipe_edit:true
     })
    });

    const recipeData=await recipeRes.json();

    if(!recipeRes.ok)
     throw new Error(
      `Schedule đã cập nhật nhưng Recipe chưa đổi: ${recipeData.error||"Recipe update failed"}`
     );
   }

   setEditingScheduleId(null);
   location.reload();
  }catch(e){
   setMessage(e instanceof Error?e.message:"Không sửa được Batch.");
  }finally{
   setActionBusy("");
  }
 }

 async function deleteBatch(row:ScheduledRow){
  const ok=window.confirm(
   `Xóa ${row.batch_no}?\\n\\nSchedule sẽ bị hủy. Job trong Batch sẽ quay lại Candidate/Eligible nếu Planning Chain cho phép.`
  );

  if(!ok)return;

  setActionBusy(`delete-${row.batch_id}`);
  setMessage("");

  try{
   const res=await fetch(`/api/planning/batch/${row.batch_id}`,{
    method:"DELETE"
   });

   const data=await res.json();

   if(!res.ok)
    throw new Error(data.error||"Không xóa được Batch.");

   location.reload();
  }catch(e){
   setMessage(e instanceof Error?e.message:"Không xóa được Batch.");
  }finally{
   setActionBusy("");
  }
 }

 async function moveBatch(actual:ScheduledRow[],index:number,direction:-1|1){
  const target=index+direction;
  if(target<0||target>=actual.length)return;

  const reordered=[...actual];
  [reordered[index],reordered[target]]=[reordered[target],reordered[index]];

  setActionBusy(`order-${actual[index].id}`);
  setMessage("");

  try{
   const res=await fetch("/api/schedule/order",{
    method:"PUT",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
     schedule_ids:reordered.map(x=>x.id)
    })
   });

   const data=await res.json();

   if(!res.ok)
    throw new Error(data.error||"Không lưu được thứ tự.");

   location.reload();
  }catch(e){
   setMessage(e instanceof Error?e.message:"Không lưu được thứ tự.");
  }finally{
   setActionBusy("");
  }
 }

 async function save(a:ScheduleArea,i:number){
  const r=draft(a,i),duration=parseHHMM(r.duration);
  const allowed=areaOps(a).some(o=>o.standard_operation===r.standardOperation);
  if(!r.standardOperation||!allowed){setMessage(`${a.schedule_area_name}: chọn Standard Operation đã mapping.`);return}
  if(!r.resourceCode||!r.date||!r.startTime){setMessage(`${a.schedule_area_name}: chọn Resource / Date / Start.`);return}
  if(!duration){setMessage("Duration phải HH:MM và > 00:00.");return}
  const k=key(a.schedule_area_code,i);setBusy(k);setMessage("");
  try{
   const plannedStart=new Date(`${r.date}T${r.startTime}:00+07:00`).toISOString();
   // Existing Planning Board Batch: schedule the same batch_id. New manual row:
   // create empty Batch + Schedule through manual-grid. Auto Schedule will reuse
   // the existing-Batch /api/schedule contract later.
   const existingBatch=Boolean(r.batchId);
   const endpoint=existingBatch?"/api/schedule":"/api/schedule/manual-grid";
   const payload=existingBatch
    ?{batchId:r.batchId,resourceCode:r.resourceCode,plannedStart,durationMinutes:duration,planSource:"MANUAL_EXISTING_BATCH"}
    :{schedule_area_code:a.schedule_area_code,standard_operation:r.standardOperation,recipe_key:r.recipeKey||null,
      resource_code:r.resourceCode,planning_date:r.date,planned_start:plannedStart,duration_minutes:duration,plan_source:"MANUAL_GRID"};
   const res=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
   const d=await res.json();if(!res.ok)throw new Error(d.error||"Save failed");
   setMessage(existingBatch
    ?`${r.batchNo} · ${a.schedule_area_name} đã Schedule, không tạo Batch mới.`
    :`${d.batchNo} · ${a.schedule_area_name} đã tạo.`);
   setDrafts(p=>({...p,[k]:blank(date,a.resource_code||"")}));
   setTimeout(()=>location.reload(),500);
  }catch(e){setMessage(e instanceof Error?e.message:"Save failed")}finally{setBusy("")}
 }

 return <section className="erp-table-panel section schedule-area-direct-grid">
  <div className="erp-panel-head">
   <div><b>Direct Schedule Grid · Planner {planner} · Schedule Area</b>
    <small className="planning-sub">Click Batch ở Unscheduled để đưa Batch đã có vào dòng trống rồi gán lịch; NEW dùng để tạo lô trống thủ công. Cả hai dùng chung Scheduling Engine, sẵn đường cho Auto Schedule.</small></div>
   <span>{scheduleAreas.length} areas</span>
  </div>
  <div className="schedule-area-grid-stack">
   {scheduleAreas.map(a=>{
    const aOps=areaOps(a),aResources=areaResources(a),actual=scheduledFor(a),unscheduledArea=unscheduledFor(a),count=rowCounts[a.schedule_area_code]||20;
    return <div className="schedule-area-grid-block" key={a.schedule_area_code}>
     <div className="schedule-area-grid-title">
      <div><b>{a.schedule_area_name}</b><small>{a.schedule_area_code} · {aOps.length?aOps.map(x=>x.standard_operation).join(" / "):"CHƯA MAP OPERATION"}</small></div>
      <div className="schedule-area-row-actions">
       <span>{actual.length} scheduled · {count} input rows</span>
       <button
        type="button"
        className="btn small"
        disabled={rowBusy===a.schedule_area_code||count<=1}
        onClick={()=>removeRow(a)}
       >
        − Row
       </button>
       <button
        type="button"
        className="btn small primary"
        disabled={rowBusy===a.schedule_area_code||count>=200}
        onClick={()=>addRow(a)}
       >
        {rowBusy===a.schedule_area_code?"Saving...":"+ Row"}
       </button>
      </div>
     </div>

     {unscheduledArea.length>0&&
      <div className="schedule-area-unscheduled-strip">
       <div className="schedule-area-unscheduled-strip-head">
        <b>Unscheduled Batches</b>
        <span>{unscheduledArea.length} Batches</span>
       </div>
       <div className="schedule-area-unscheduled-cards">
        {unscheduledArea.map(b=>
         <button
          type="button"
          className="schedule-area-unscheduled-card"
          key={`area-unscheduled-${b.id}`}
          onClick={()=>selectUnscheduledBatch(a,b)}
         >
          <strong>{b.batch_no}</strong>
          <span>{b.standard_operation}{b.recipe_no?` · ${b.recipe_no}`:""}</span>
          <small>
           {fmt(b.total_qty,0)} pcs · {fmt(b.total_surface_dm2)} dm²
           {Number(b.total_jobs||0)===0?" · EMPTY":""}
          </small>
         </button>
        )}
       </div>
      </div>}

     {!aOps.length&&<div className="schedule-area-unmapped">Khu vực chưa có Standard Operation. Vào Cấu hình → Schedule Area Mapping để thêm.</div>}
     <div className="table-wrap">
      <table className="erp-table schedule-area-entry-table">
       <thead><tr><th>#</th><th>Batch</th><th>Standard Operation</th><th>Recipe / Paint</th><th>Resource</th><th>Date</th><th>Start</th><th>Duration</th><th>Jobs</th><th>pcs</th><th>dm²</th><th>Actions</th></tr></thead>
       <tbody>
        {actual.map((x,i)=>{
         const editing=editingScheduleId===x.id;
         const editResources=areaResources(a);

         return <tr key={`actual-${x.id}`} className={`schedule-area-existing ${editing?"is-editing":""}`}>
          <td>{i+1}</td>
          <td><b>{x.batch_no}</b></td>
          <td><b>{x.standard_operation}</b></td>

          <td>
           {editing
            ? <select
               className="input"
               value={editDraft.recipeKey}
               onChange={e=>setEditDraft(v=>({...v,recipeKey:e.target.value}))}
              >
               <option value="">No Recipe / Set later</option>
               {recipes.map(recipe=>
                <option key={recipe.recipe_key} value={recipe.recipe_key}>
                 {recipe.recipe_no||recipe.recipe_key} · {recipe.recipe_name||"—"}
                </option>
               )}
              </select>
            : x.recipe_no||"—"}
          </td>

          <td>
           {editing
            ? <select
               className="input"
               value={editDraft.resourceCode}
               onChange={e=>setEditDraft(v=>({...v,resourceCode:e.target.value}))}
              >
               <option value="">Resource...</option>
               {editResources.map(r=>
                <option key={r.resource_code} value={r.resource_code}>
                 {r.resource_code}
                </option>
               )}
              </select>
            : <b>{x.resource_code}</b>}
          </td>

          <td>
           {editing
            ? <input
               className="input"
               type="date"
               value={editDraft.date}
               onChange={e=>setEditDraft(v=>({...v,date:e.target.value}))}
              />
            : new Date(x.planned_start).toLocaleDateString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}
          </td>

          <td className="mono">
           {editing
            ? <input
               className="input mono"
               type="time"
               value={editDraft.startTime}
               onChange={e=>setEditDraft(v=>({...v,startTime:e.target.value}))}
              />
            : time(x.planned_start)}
          </td>

          <td className="mono">
           {editing
            ? <input
               className="input mono"
               value={editDraft.duration}
               placeholder="HH:MM"
               onChange={e=>setEditDraft(v=>({...v,duration:e.target.value}))}
              />
            : <>
               {String(Math.floor(Number(x.duration_minutes||0)/60)).padStart(2,"0")}
               :
               {String(Number(x.duration_minutes||0)%60).padStart(2,"0")}
              </>}
          </td>

          <td>{x.total_jobs}</td>
          <td>{fmt(x.total_qty,0)}</td>
          <td>{fmt(x.total_surface_dm2)}</td>

          <td>
           <div className="schedule-batch-control-actions">
            {editing
             ? <>
                <button
                 type="button"
                 className="btn small primary"
                 disabled={actionBusy===`edit-${x.id}`}
                 onClick={()=>saveEdit(a,x)}
                >
                 {actionBusy===`edit-${x.id}`?"Saving...":"Save Edit"}
                </button>
                <button
                 type="button"
                 className="btn small"
                 disabled={Boolean(actionBusy)}
                 onClick={()=>setEditingScheduleId(null)}
                >
                 Cancel
                </button>
               </>
             : <>
                <button
                 type="button"
                 className="btn small schedule-order-btn"
                 title="Đưa lô lên"
                 disabled={i===0||Boolean(actionBusy)}
                 onClick={()=>moveBatch(actual,i,-1)}
                >
                 ↑
                </button>
                <button
                 type="button"
                 className="btn small schedule-order-btn"
                 title="Đưa lô xuống"
                 disabled={i===actual.length-1||Boolean(actionBusy)}
                 onClick={()=>moveBatch(actual,i,1)}
                >
                 ↓
                </button>
                <button
                 type="button"
                 className="btn small"
                 disabled={Boolean(actionBusy)}
                 onClick={()=>beginEdit(x)}
                >
                 Edit
                </button>
                <a
                 className="btn small"
                 href={`/planning/batches/${x.batch_id}?returnTo=schedule&date=${encodeURIComponent(date)}`}
                >
                 Fill / Jobs
                </a>
                <button
                 type="button"
                 className="btn small danger-btn"
                 disabled={actionBusy===`delete-${x.batch_id}`}
                 onClick={()=>deleteBatch(x)}
                >
                 {actionBusy===`delete-${x.batch_id}`?"Deleting...":"Delete"}
                </button>
               </>}
           </div>
          </td>
         </tr>
        })}
        {Array.from({length:count},(_,i)=>{const r=draft(a,i),k=key(a.schedule_area_code,i);return <tr key={k} className="schedule-area-empty-row">
         <td>{actual.length+i+1}</td><td>{r.batchId?<b>{r.batchNo}</b>:<span className="muted">NEW</span>}</td>
         <td><select className="input" disabled={Boolean(r.batchId)} value={r.standardOperation} onChange={e=>patch(a,i,{standardOperation:e.target.value,recipeKey:""})}>
          <option value="">Operation...</option>{aOps.map(o=><option key={o.standard_operation}>{o.standard_operation}</option>)}
         </select></td>
         <td><select className="input" disabled={Boolean(r.batchId&&r.recipeKey)} value={r.recipeKey} onChange={e=>patch(a,i,{recipeKey:e.target.value})}>
          <option value="">Set later</option>{recipes.map(x=><option key={x.recipe_key} value={x.recipe_key}>{x.recipe_no||x.recipe_key} · {x.recipe_name||"—"}</option>)}
         </select></td>
         <td><select className="input" value={r.resourceCode} onChange={e=>patch(a,i,{resourceCode:e.target.value})}>
          <option value="">Resource...</option>{aResources.map(x=><option key={x.resource_code} value={x.resource_code}>{x.resource_code}</option>)}
         </select></td>
         <td><input className="input" type="date" value={r.date} onChange={e=>patch(a,i,{date:e.target.value})}/></td>
         <td><input className="input mono" type="time" value={r.startTime} onChange={e=>patch(a,i,{startTime:e.target.value})}/></td>
         <td><input className="input mono" placeholder="HH:MM" value={r.duration} onChange={e=>patch(a,i,{duration:e.target.value})}/></td>
         <td>{r.batchId?r.totalJobs:0}</td><td>{r.batchId?fmt(r.totalQty,0):0}</td><td>{r.batchId?fmt(r.totalSurfaceDm2):0}</td>
         <td><div className="schedule-row-actions">
          <button className="btn small primary" disabled={busy===k||!aOps.length} onClick={()=>save(a,i)}>{busy===k?"...":r.batchId?"Schedule":"Save"}</button>
          {r.batchId&&<button className="btn small" type="button" onClick={()=>clearDraft(a,i)}>Clear</button>}
         </div></td>
        </tr>})}
       </tbody>
      </table>
     </div>
    </div>
   })}
  </div>
 </section>
}
