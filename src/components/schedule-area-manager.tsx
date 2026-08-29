"use client";
import {safeJson} from "@/lib/fetch-json";
import {useEffect,useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";

type Op={standard_operation:string;st_group:string};
type StGroup={st_group:string;area_code:string;area_name:string};
type OperationCode={
 st_group:string;
 source_operation_code:string;
 standard_operation_rule:string;
 mapping_rule:string;
};
type Resource={resource_code:string;resource_name:string;resource_group:string};
type Area={
 schedule_area_code:string;schedule_area_name:string;resource_group:string|null;resource_code:string|null;
 planner_owner:string;display_order:number;default_rows:number;allow_manual_plan:boolean;allow_auto_plan:boolean;
 is_active:boolean;operations:{id:number;standard_operation:string}[];
};

export function ScheduleAreaManager(){
 const [areas,setAreas]=useState<Area[]>([]);
 const [ops,setOps]=useState<Op[]>([]);
 const [resources,setResources]=useState<Resource[]>([]);
 const [stGroups,setStGroups]=useState<StGroup[]>([]);
 const [operationCodes,setOperationCodes]=useState<OperationCode[]>([]);
 const [selected,setSelected]=useState<string>("");
 const [status,setStatus]=useState("");
 usePopupMessage(status);
 const [form,setForm]=useState({
  schedule_area_code:"",schedule_area_name:"",resource_group:"",resource_code:"",
  planner_owner:"BOTH",display_order:"0",default_rows:"20",
  allow_manual_plan:true,allow_auto_plan:true
 });
 async function load(){
  const r=await fetch("/api/config/schedule-areas",{cache:"no-store"});const d=await safeJson(r);
  if(!r.ok){setStatus(d.error||"Load failed");return}
  setAreas(d.areas||[]);
  setOps(d.operations||[]);
  setResources(d.resources||[]);
  setStGroups(d.st_groups||[]);
  setOperationCodes(d.operation_codes||[]);
 }
 useEffect(()=>{load()},[]);
 async function saveArea(){
  const r=await fetch("/api/config/schedule-areas",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(form)});
  const d=await safeJson(r);if(!r.ok){setStatus(d.error);return}
  setStatus("Đã lưu Schedule Area.");await load();
 }
 async function edit(a:Area){
  const rows=prompt("Default rows",String(a.default_rows));if(rows===null)return;
  const order=prompt("Display order",String(a.display_order));if(order===null)return;
  const name=prompt("Schedule Area Name",a.schedule_area_name);if(name===null)return;
  const r=await fetch("/api/config/schedule-areas",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({
   ...a,schedule_area_name:name,default_rows:Number(rows),display_order:Number(order)
  })});
  const d=await safeJson(r);if(!r.ok)setStatus(d.error);else{setStatus("Đã cập nhật.");await load()}
 }
 async function saveOps(){
  const operations=[...document.querySelectorAll<HTMLInputElement>('input[name="schedule-area-op"]:checked')].map(x=>x.value);
  const r=await fetch("/api/config/schedule-areas",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({schedule_area_code:selected,operations})});
  const d=await safeJson(r);if(!r.ok)setStatus(d.error);else{setStatus("Đã lưu Standard Operation → Schedule Area.");await load()}
 }
 function toggleStGroup(stGroup:string,checked:boolean){
  const related=ops.filter(x=>x.st_group===stGroup).map(x=>x.standard_operation);
  document.querySelectorAll<HTMLInputElement>('input[name="schedule-area-op"]').forEach(el=>{
   if(related.includes(el.value))el.checked=checked;
  });
 }
 const chosen=areas.find(x=>x.schedule_area_code===selected);
 return <>
  <div className="card">
   <h2 style={{marginTop:0}}>+ Schedule Area</h2>
   <div className="area-form schedule-area-form">
    <input className="input" placeholder="Code" value={form.schedule_area_code} onChange={e=>setForm({...form,schedule_area_code:e.target.value})}/>
    <input className="input" placeholder="Tên hiển thị" value={form.schedule_area_name} onChange={e=>setForm({...form,schedule_area_name:e.target.value})}/>
    <select className="input" value={form.resource_code} onChange={e=>{
     const r=resources.find(x=>x.resource_code===e.target.value);
     setForm({...form,resource_code:e.target.value,resource_group:r?.resource_group||""});
    }}><option value="">Resource / group only</option>{resources.map(r=><option key={r.resource_code} value={r.resource_code}>{r.resource_code} · {r.resource_name}</option>)}</select>
    <input className="input" placeholder="Resource Group" value={form.resource_group} onChange={e=>setForm({...form,resource_group:e.target.value})}/>
    <select className="input" value={form.planner_owner} onChange={e=>setForm({...form,planner_owner:e.target.value})}>
     <option value="BOTH">Both planners</option><option value="1">Planner 1</option><option value="2">Planner 2</option>
    </select>
    <input className="input" type="number" placeholder="Order" value={form.display_order} onChange={e=>setForm({...form,display_order:e.target.value})}/>
    <input className="input" type="number" min="1" max="200" placeholder="Số dòng mặc định" value={form.default_rows} onChange={e=>setForm({...form,default_rows:e.target.value})}/>
    <label><input type="checkbox" checked={form.allow_manual_plan} onChange={e=>setForm({...form,allow_manual_plan:e.target.checked})}/> Manual</label>
    <label><input type="checkbox" checked={form.allow_auto_plan} onChange={e=>setForm({...form,allow_auto_plan:e.target.checked})}/> Auto future</label>
    <button className="btn primary" onClick={saveArea}>Lưu khu vực</button>
   </div>
  </div>

  <div className="card section table-wrap">
   <table className="erp-table"><thead><tr>
    <th>Thứ tự</th><th>Khu vực điều độ</th><th>Máy / Nhóm</th><th>Planner</th><th>Số dòng mặc định</th>
    <th>Điều độ tay</th><th>Tự động</th><th>Công đoạn đã gán</th><th>Thao tác</th>
   </tr></thead><tbody>
    {areas.map(a=><tr key={a.schedule_area_code}>
     <td>{a.display_order}</td><td><b>{a.schedule_area_name}</b><small className="planning-sub">{a.schedule_area_code}</small></td>
     <td>{a.resource_code||a.resource_group||"—"}</td><td>{a.planner_owner}</td><td>{a.default_rows}</td>
     <td>{a.allow_manual_plan?"Yes":"No"}</td><td>{a.allow_auto_plan?"Yes":"No"}</td>
     <td>{a.operations?.map(x=>x.standard_operation).join(", ")||"—"}</td>
     <td><button className="btn small" onClick={()=>setSelected(a.schedule_area_code)}>Gán công đoạn</button>{" "}
      <button className="btn small" onClick={()=>edit(a)}>Sửa</button></td>
    </tr>)}
   </tbody></table>
  </div>

  {chosen&&<div className="card section">
   <h2 style={{marginTop:0}}>ST Group / Standard Operation → {chosen.schedule_area_name}</h2>
   <p className="muted">ST Group lấy động từ Area Master. Chọn ST Group sẽ tự chọn toàn bộ Standard Operation hiện thuộc Group đó; mapping lưu xuống vẫn là Standard Operation để giữ nguyên logic Board Điều Độ / Auto Plan hiện tại.</p>
   <h3>ST Groups from Area Master</h3>
   <div className="group-grid">
    {stGroups.map(g=>{
     const related=ops.filter(x=>x.st_group===g.st_group);
     const codes=operationCodes.filter(x=>x.st_group===g.st_group);
     const allChecked=related.length>0&&related.every(op=>chosen.operations?.some(x=>x.standard_operation===op.standard_operation));
     return <label className="check-card" key={g.st_group}>
      <input
       type="checkbox"
       disabled={!related.length}
       defaultChecked={allChecked}
       onChange={e=>toggleStGroup(g.st_group,e.target.checked)}
      />
      <span>
       <b>{g.st_group}</b>
       <small className="planning-sub">
        {g.area_name} · {codes.length} Operation Code · {related.length} Standard Operation
       </small>
       {codes.length>0&&
        <small className="planning-sub">
         Codes: {codes.map(x=>x.source_operation_code).join(", ")}
        </small>}
      </span>
     </label>
    })}
   </div>
   <h3 style={{marginTop:18}}>Standard Operations</h3>
   <div className="group-grid">
    {ops.map(op=><label className="check-card" key={op.standard_operation}>
     <input name="schedule-area-op" type="checkbox" value={op.standard_operation}
      defaultChecked={chosen.operations?.some(x=>x.standard_operation===op.standard_operation)}/>
     <span><b>{op.standard_operation}</b></span>
    </label>)}
   </div>
   <div className="row" style={{marginTop:16}}>
    <button className="btn primary" onClick={saveOps}>Lưu gán</button>
    <button className="btn" onClick={()=>setSelected("")}>Close</button>
   </div>
  </div>}
 </>;
}
