"use client";
import {useMemo,useState} from "react";

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
 total_surface_dm2:number;planned_start:string;planned_end:string;duration_minutes:number;plan_source?:string|null;
};
type Draft={standardOperation:string;recipeKey:string;resourceCode:string;date:string;startTime:string;duration:string};

const blank=(date:string,resourceCode=""):Draft=>({
 standardOperation:"",recipeKey:"",resourceCode,date,startTime:"",duration:""
});
function parseHHMM(v:string){const m=v.trim().match(/^(\d{1,3}):(\d{2})$/);if(!m)return null;const n=Number(m[1])*60+Number(m[2]);return Number(m[2])<60&&n>0?n:null}
function fmt(v:unknown,d=2){const n=Number(v||0);return Number.isFinite(n)?new Intl.NumberFormat("vi-VN",{maximumFractionDigits:d}).format(n):"0"}
function time(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleTimeString("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"})}

export function ManualScheduleGrid({
 scheduleAreas,operations,resources,recipes,scheduledRows,date,planner
}:{
 scheduleAreas:ScheduleArea[];operations:OperationOption[];resources:ResourceOption[];recipes:RecipeOption[];
 scheduledRows:ScheduledRow[];date:string;planner:"1"|"2";
}){
 const [rowCounts,setRowCounts]=useState<Record<string,number>>(()=>Object.fromEntries(
  scheduleAreas.map(a=>[a.schedule_area_code,Math.max(1,Number(a.default_rows)||20)])
 ));
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});
 const [busy,setBusy]=useState("");const [message,setMessage]=useState("");

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
  });
 }
 const key=(a:string,i:number)=>`${a}::${i}`;
 function draft(a:ScheduleArea,i:number){
  return drafts[key(a.schedule_area_code,i)]||blank(date,a.resource_code||"");
 }
 function patch(a:ScheduleArea,i:number,x:Partial<Draft>){
  const k=key(a.schedule_area_code,i);
  setDrafts(p=>({...p,[k]:{...(p[k]||blank(date,a.resource_code||"")),...x}}));
 }
 function addRow(a:ScheduleArea){setRowCounts(p=>({...p,[a.schedule_area_code]:(p[a.schedule_area_code]||20)+1}))}
 function removeRow(a:ScheduleArea){
  const count=rowCounts[a.schedule_area_code]||20;if(count<=1)return;
  const last=count-1;const k=key(a.schedule_area_code,last);
  setDrafts(p=>{const n={...p};delete n[k];return n});
  setRowCounts(p=>({...p,[a.schedule_area_code]:count-1}));
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
   const res=await fetch("/api/schedule/manual-grid",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
    schedule_area_code:a.schedule_area_code,standard_operation:r.standardOperation,recipe_key:r.recipeKey||null,
    resource_code:r.resourceCode,planning_date:r.date,planned_start:plannedStart,duration_minutes:duration,plan_source:"MANUAL_GRID"
   })});
   const d=await res.json();if(!res.ok)throw new Error(d.error||"Save failed");
   setMessage(`${d.batchNo} · ${a.schedule_area_name} đã tạo.`);
   setDrafts(p=>({...p,[k]:blank(date,a.resource_code||"")}));
   setTimeout(()=>location.reload(),500);
  }catch(e){setMessage(e instanceof Error?e.message:"Save failed")}finally{setBusy("")}
 }

 return <section className="erp-table-panel section schedule-area-direct-grid">
  <div className="erp-panel-head">
   <div><b>Direct Schedule Grid · Planner {planner} · Schedule Area</b>
    <small className="planning-sub">Mặc định 20 dòng/khu vực. + Row / − Row chỉ thay đổi số dòng nhập trên view; không tạo Batch rác.</small></div>
   <span>{scheduleAreas.length} areas</span>
  </div>
  {message&&<div className="notice">{message}</div>}
  <div className="schedule-area-grid-stack">
   {scheduleAreas.map(a=>{
    const aOps=areaOps(a),aResources=areaResources(a),actual=scheduledFor(a),count=rowCounts[a.schedule_area_code]||20;
    return <div className="schedule-area-grid-block" key={a.schedule_area_code}>
     <div className="schedule-area-grid-title">
      <div><b>{a.schedule_area_name}</b><small>{a.schedule_area_code} · {aOps.length?aOps.map(x=>x.standard_operation).join(" / "):"CHƯA MAP OPERATION"}</small></div>
      <div className="schedule-area-row-actions">
       <span>{actual.length} scheduled · {count} input rows</span>
       <button type="button" className="btn small" onClick={()=>removeRow(a)}>− Row</button>
       <button type="button" className="btn small primary" onClick={()=>addRow(a)}>+ Row</button>
      </div>
     </div>
     {!aOps.length&&<div className="schedule-area-unmapped">Khu vực chưa có Standard Operation. Vào Cấu hình → Schedule Area Mapping để thêm.</div>}
     <div className="table-wrap">
      <table className="erp-table schedule-area-entry-table">
       <thead><tr><th>#</th><th>Batch</th><th>Standard Operation</th><th>Recipe / Paint</th><th>Resource</th><th>Date</th><th>Start</th><th>Duration</th><th>Jobs</th><th>pcs</th><th>dm²</th><th></th></tr></thead>
       <tbody>
        {actual.map((x,i)=><tr key={`actual-${x.id}`} className="schedule-area-existing">
         <td>{i+1}</td><td><b>{x.batch_no}</b></td><td><b>{x.standard_operation}</b></td>
         <td>{x.recipe_no||"—"}</td><td><b>{x.resource_code}</b></td>
         <td>{new Date(x.planned_start).toLocaleDateString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}</td>
         <td className="mono">{time(x.planned_start)}</td>
         <td className="mono">{String(Math.floor(Number(x.duration_minutes||0)/60)).padStart(2,"0")}:{String(Number(x.duration_minutes||0)%60).padStart(2,"0")}</td>
         <td>{x.total_jobs}</td><td>{fmt(x.total_qty,0)}</td><td>{fmt(x.total_surface_dm2)}</td>
         <td><a className="btn small" href={`/planning/batches/${x.batch_id}?returnTo=schedule&date=${encodeURIComponent(date)}`}>Fill / Jobs</a></td>
        </tr>)}
        {Array.from({length:count},(_,i)=>{const r=draft(a,i),k=key(a.schedule_area_code,i);return <tr key={k} className="schedule-area-empty-row">
         <td>{actual.length+i+1}</td><td><span className="muted">AUTO</span></td>
         <td><select className="input" value={r.standardOperation} onChange={e=>patch(a,i,{standardOperation:e.target.value,recipeKey:""})}>
          <option value="">Operation...</option>{aOps.map(o=><option key={o.standard_operation}>{o.standard_operation}</option>)}
         </select></td>
         <td><select className="input" value={r.recipeKey} onChange={e=>patch(a,i,{recipeKey:e.target.value})}>
          <option value="">Set later</option>{recipes.map(x=><option key={x.recipe_key} value={x.recipe_key}>{x.recipe_no||x.recipe_key} · {x.recipe_name||"—"}</option>)}
         </select></td>
         <td><select className="input" value={r.resourceCode} onChange={e=>patch(a,i,{resourceCode:e.target.value})}>
          <option value="">Resource...</option>{aResources.map(x=><option key={x.resource_code} value={x.resource_code}>{x.resource_code}</option>)}
         </select></td>
         <td><input className="input" type="date" value={r.date} onChange={e=>patch(a,i,{date:e.target.value})}/></td>
         <td><input className="input mono" type="time" value={r.startTime} onChange={e=>patch(a,i,{startTime:e.target.value})}/></td>
         <td><input className="input mono" placeholder="HH:MM" value={r.duration} onChange={e=>patch(a,i,{duration:e.target.value})}/></td>
         <td>0</td><td>0</td><td>0</td>
         <td><button className="btn small primary" disabled={busy===k||!aOps.length} onClick={()=>save(a,i)}>{busy===k?"...":"Save"}</button></td>
        </tr>})}
       </tbody>
      </table>
     </div>
    </div>
   })}
  </div>
 </section>
}
