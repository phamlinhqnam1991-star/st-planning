"use client";
import {safeJson} from "@/lib/fetch-json";
import {useEffect,useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";
import {notifyConfigHealthChanged} from "@/lib/config/config-client";

type Op={standard_operation:string;st_group:string};
type StGroup={st_group:string;area_code:string;area_name:string};
type OperationCode={st_group:string;source_operation_code:string;standard_operation_rule:string;mapping_rule:string};
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
 const [editing,setEditing]=useState<Area|null>(null);
 const [status,setStatus]=useState("");
 usePopupMessage(status);
 const [form,setForm]=useState({
  schedule_area_code:"",schedule_area_name:"",resource_group:"",resource_code:"",
  planner_owner:"BOTH",display_order:"0",default_rows:"20",
  allow_manual_plan:true,allow_auto_plan:true
 });
 const [editForm,setEditForm]=useState({schedule_area_name:"",display_order:"0",default_rows:"20"});
 async function load(fresh=false){
  const url=fresh?`/api/config/schedule-areas?fresh=${Date.now()}`:"/api/config/schedule-areas";
  const r=await fetch(url,fresh?{cache:"no-store"}:undefined);const d=await safeJson(r);
  if(!r.ok){setStatus(d.error||"Load failed");return}
  setAreas(d.areas||[]);setOps(d.operations||[]);setResources(d.resources||[]);setStGroups(d.st_groups||[]);setOperationCodes(d.operation_codes||[]);
 }
 useEffect(()=>{load()},[]);
 async function saveArea(){
  const r=await fetch("/api/config/schedule-areas",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(form)});
  const d=await safeJson(r);if(!r.ok){setStatus(d.error);return}
  setStatus("Đã lưu Schedule Area.");notifyConfigHealthChanged();await load(true);
 }
 function startEdit(a:Area){setEditing(a);setEditForm({schedule_area_name:a.schedule_area_name,display_order:String(a.display_order),default_rows:String(a.default_rows)})}
 async function saveEdit(){
  if(!editing)return;
  const r=await fetch("/api/config/schedule-areas",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({...editing,schedule_area_name:editForm.schedule_area_name,default_rows:Number(editForm.default_rows),display_order:Number(editForm.display_order)})});
  const d=await safeJson(r);if(!r.ok)setStatus(d.error);else{setStatus("Đã cập nhật.");setEditing(null);notifyConfigHealthChanged();await load(true)}
 }
 async function saveOps(){
  const operations=[...document.querySelectorAll<HTMLInputElement>('input[name="schedule-area-op"]:checked')].map(x=>x.value);
  const r=await fetch("/api/config/schedule-areas",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({schedule_area_code:selected,operations})});
  const d=await safeJson(r);if(!r.ok)setStatus(d.error);else{setStatus("Đã lưu Main Operation → Schedule Area.");notifyConfigHealthChanged();await load(true)}
 }
 function toggleStGroup(stGroup:string,checked:boolean){
  const related=ops.filter(x=>x.st_group===stGroup).map(x=>x.standard_operation);
  document.querySelectorAll<HTMLInputElement>('input[name="schedule-area-op"]').forEach(el=>{if(related.includes(el.value))el.checked=checked;});
 }
 const chosen=areas.find(x=>x.schedule_area_code===selected);
 return <div className="erp-config-editor-stack">
  <section className="erp-form-panel erp-editor-panel">
   <div className="erp-panel-head"><div><b>Thêm khu vực điều độ</b><span>Định nghĩa lane/resource dùng trên Scheduling Board.</span></div><span className="erp-record-count">{areas.filter(x=>x.is_active).length} active</span></div>
   <div className="area-form schedule-area-form erp-field-grid">
    <label>Mã lane<input className="input mono" placeholder="Ví dụ CHEM-L1" value={form.schedule_area_code} onChange={e=>setForm({...form,schedule_area_code:e.target.value.toUpperCase()})}/></label>
    <label>Tên hiển thị<input className="input" value={form.schedule_area_name} onChange={e=>setForm({...form,schedule_area_name:e.target.value})}/></label>
    <label>Resource<select className="input" value={form.resource_code} onChange={e=>{const r=resources.find(x=>x.resource_code===e.target.value);setForm({...form,resource_code:e.target.value,resource_group:r?.resource_group||""});}}><option value="">Chỉ dùng nhóm Resource</option>{resources.map(r=><option key={r.resource_code} value={r.resource_code}>{r.resource_code} · {r.resource_name}</option>)}</select></label>
    <label>Resource Group<input className="input" value={form.resource_group} onChange={e=>setForm({...form,resource_group:e.target.value})}/></label>
    <label>Planner<select className="input" value={form.planner_owner} onChange={e=>setForm({...form,planner_owner:e.target.value})}><option value="BOTH">Cả hai Planner</option><option value="1">Planner 1</option><option value="2">Planner 2</option></select></label>
    <label>Thứ tự<input className="input mono" type="number" value={form.display_order} onChange={e=>setForm({...form,display_order:e.target.value})}/></label>
    <label>Số dòng mặc định<input className="input mono" type="number" min="1" max="200" value={form.default_rows} onChange={e=>setForm({...form,default_rows:e.target.value})}/></label>
    <label className="erp-switch-field"><input type="checkbox" checked={form.allow_manual_plan} onChange={e=>setForm({...form,allow_manual_plan:e.target.checked})}/><span><b>Điều độ tay</b><small>Cho phép planner gán trực tiếp Resource/Start/Duration.</small></span></label>
   </div>
   <div className="erp-sticky-action-bar"><div className="erp-action-hint">Sau khi tạo lane, gán Main Operation ở danh sách bên dưới.</div><button className="btn primary" onClick={saveArea}>Lưu khu vực</button></div>
  </section>

  <section className="erp-table-panel">
   <div className="erp-panel-head"><div><b>Schedule Area Master</b><span>Lane, Resource, Planner và Main Operation.</span></div><span>{areas.length} lane</span></div>
   <div className="table-wrap"><table className="erp-table"><thead><tr><th>Thứ tự</th><th>Khu vực điều độ</th><th>Máy / Nhóm</th><th>Planner</th><th>Số dòng</th><th>Điều độ tay</th><th>Main Operation</th><th className="action">Thao tác</th></tr></thead><tbody>
    {areas.map(a=><tr key={a.schedule_area_code}><td className="num mono">{a.display_order}</td><td><b>{a.schedule_area_name}</b><small className="planning-sub mono">{a.schedule_area_code}</small></td><td>{a.resource_code||a.resource_group||"—"}</td><td>{a.planner_owner}</td><td className="num mono">{a.default_rows}</td><td><span className={`badge ${a.allow_manual_plan?"b-ready":""}`}>{a.allow_manual_plan?"Có":"Không"}</span></td><td>{a.operations?.map(x=>x.standard_operation).join(", ")||"—"}</td><td className="action"><div className="row erp-row-actions"><button className="btn small" onClick={()=>setSelected(a.schedule_area_code)}>Gán công đoạn</button><button className="btn small" onClick={()=>startEdit(a)}>Sửa</button></div></td></tr>)}
   </tbody></table></div>
  </section>

  {editing&&<section className="erp-form-panel erp-inline-editor-panel">
   <div className="erp-panel-head"><div><b>Sửa khu vực điều độ</b><span className="mono">{editing.schedule_area_code}</span></div><button className="btn small" onClick={()=>setEditing(null)}>Đóng</button></div>
   <div className="erp-field-grid">
    <label>Tên hiển thị<input className="input" value={editForm.schedule_area_name} onChange={e=>setEditForm({...editForm,schedule_area_name:e.target.value})}/></label>
    <label>Thứ tự<input className="input mono" type="number" value={editForm.display_order} onChange={e=>setEditForm({...editForm,display_order:e.target.value})}/></label>
    <label>Số dòng mặc định<input className="input mono" type="number" min="1" max="200" value={editForm.default_rows} onChange={e=>setEditForm({...editForm,default_rows:e.target.value})}/></label>
   </div>
   <div className="erp-sticky-action-bar"><div className="erp-action-hint">Không thay mapping Main Operation khi sửa thông tin lane.</div><div className="row"><button className="btn primary" onClick={saveEdit}>Lưu thay đổi</button><button className="btn" onClick={()=>setEditing(null)}>Hủy</button></div></div>
  </section>}

  {chosen&&<section className="erp-form-panel erp-inline-editor-panel">
   <div className="erp-panel-head"><div><b>ST Group / Main Operation</b><span>{chosen.schedule_area_name}</span></div><button className="btn small" onClick={()=>setSelected("")}>Đóng</button></div>
   <div className="erp-context-note">ST Group lấy động từ Area Master. Chọn một Group sẽ đánh dấu toàn bộ Main Operation hiện thuộc Group đó; dữ liệu lưu vẫn là Main Operation để không thay logic Scheduling Board / Auto Plan.</div>
   <div className="erp-subsection-head"><b>ST Group</b><span>{stGroups.length} nhóm</span></div>
   <div className="group-grid erp-selection-grid">{stGroups.map(g=>{const related=ops.filter(x=>x.st_group===g.st_group);const codes=operationCodes.filter(x=>x.st_group===g.st_group);const allChecked=related.length>0&&related.every(op=>chosen.operations?.some(x=>x.standard_operation===op.standard_operation));return <label className="check-card" key={g.st_group}><input type="checkbox" disabled={!related.length} defaultChecked={allChecked} onChange={e=>toggleStGroup(g.st_group,e.target.checked)}/><span><b>{g.st_group}</b><small>{g.area_name} · {codes.length} Operation Code · {related.length} Main Operation</small>{codes.length>0&&<small className="mono">{codes.map(x=>x.source_operation_code).join(", ")}</small>}</span></label>})}</div>
   <div className="erp-subsection-head"><b>Main Operation</b><span>{ops.length} công đoạn</span></div>
   <div className="group-grid erp-selection-grid">{ops.map(op=><label className="check-card" key={op.standard_operation}><input name="schedule-area-op" type="checkbox" value={op.standard_operation} defaultChecked={chosen.operations?.some(x=>x.standard_operation===op.standard_operation)}/><span><b>{op.standard_operation}</b><small>{op.st_group}</small></span></label>)}</div>
   <div className="erp-sticky-action-bar"><div className="erp-action-hint">Mapping này quyết định lane nào có thể điều độ từng Main Operation.</div><div className="row"><button className="btn primary" onClick={saveOps}>Lưu gán</button><button className="btn" onClick={()=>setSelected("")}>Hủy</button></div></div>
  </section>}
 </div>;
}
