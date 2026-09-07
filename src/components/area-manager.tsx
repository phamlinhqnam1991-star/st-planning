"use client";
import {safeJson} from "@/lib/fetch-json";
import {useEffect,useMemo,useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";
import {notifyConfigHealthChanged} from "@/lib/config/config-client";
type Area={id:number;area_code:string;area_name:string;description:string|null;sort_order:number;is_active:boolean};
type Mapping={id:number;area_id:number;st_group:string;is_active:boolean};
function apiError(d:any,fallback="Có lỗi xảy ra."){
 if(typeof d?.error==="string")return d.error;
 if(typeof d?.message==="string")return d.message;
 if(d?.error&&typeof d.error.message==="string")return d.error.message;
 try{return JSON.stringify(d?.error||d)||fallback}catch{return fallback}
}
export function AreaManager(){
 const [areas,setAreas]=useState<Area[]>([]),[maps,setMaps]=useState<Mapping[]>([]),[groups,setGroups]=useState<string[]>([]),[selected,setSelected]=useState<number|null>(null),[status,setStatus]=useState("");
 const [editing,setEditing]=useState<Area|null>(null);
 usePopupMessage(status);
 const [form,setForm]=useState({area_code:"",area_name:"",description:"",sort_order:"0"});
 const [editForm,setEditForm]=useState({area_code:"",area_name:"",description:"",sort_order:"0"});
 async function load(fresh=false){const r=await fetch(fresh?`/api/area?fresh=${Date.now()}`:"/api/area",fresh?{cache:"no-store"}:undefined);const d=await safeJson(r);if(!r.ok){setStatus(`Lỗi: ${apiError(d)}`);return}setAreas(d.areas);setMaps(d.mappings);setGroups(d.groups)}
 useEffect(()=>{load()},[]);
 const assigned=useMemo(()=>new Map(maps.map(x=>[x.st_group,x.area_id])),[maps]);
 const selectedGroups=selected?groups.filter(g=>assigned.get(g)===selected):[];
 async function add(){setStatus("");const r=await fetch("/api/area",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(form)});const d=await safeJson(r);if(!r.ok){setStatus(`Lỗi: ${apiError(d)}`);return}setForm({area_code:"",area_name:"",description:"",sort_order:"0"});setStatus("Đã thêm Area.");notifyConfigHealthChanged();await load(true)}
 async function toggle(a:Area){const r=await fetch("/api/area",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({id:a.id,is_active:!a.is_active})});const d=await safeJson(r);if(!r.ok)setStatus(`Lỗi: ${apiError(d)}`);else{notifyConfigHealthChanged();await load(true)}}
 function startEdit(a:Area){setEditing(a);setEditForm({area_code:a.area_code,area_name:a.area_name,description:a.description||"",sort_order:String(a.sort_order)})}
 async function saveEdit(){if(!editing)return;const r=await fetch("/api/area",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({id:editing.id,area_name:editForm.area_name,area_code:editForm.area_code,description:editForm.description,sort_order:Number(editForm.sort_order)})});const d=await safeJson(r);if(!r.ok)setStatus(`Lỗi: ${apiError(d)}`);else{setStatus("Đã cập nhật Area.");setEditing(null);notifyConfigHealthChanged();await load(true)}}
 async function saveGroups(){if(!selected)return;const checked=[...document.querySelectorAll<HTMLInputElement>('input[name="stgroup"]:checked')].map(x=>x.value);const r=await fetch("/api/area/groups",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({area_id:selected,groups:checked})});const d=await safeJson(r);if(!r.ok)setStatus(`Lỗi: ${apiError(d)}`);else{setStatus("Đã lưu ST Group → Area.");notifyConfigHealthChanged();await load(true)}}
 return <div className="erp-config-editor-stack">
  <section className="erp-form-panel erp-editor-panel">
   <div className="erp-panel-head"><div><b>Thêm khu vực vật lý</b><span>Khu vực chứa ST Group; dùng làm nguồn cho cấu hình điều độ phía sau.</span></div><span className="erp-record-count">{areas.filter(x=>x.is_active).length} active</span></div>
   <div className="area-form erp-field-grid">
    <label>Mã khu<input className="input mono" placeholder="Ví dụ CHEM" value={form.area_code} onChange={e=>setForm({...form,area_code:e.target.value.toUpperCase()})}/></label>
    <label>Tên khu vực<input className="input" value={form.area_name} onChange={e=>setForm({...form,area_name:e.target.value})}/></label>
    <label className="erp-field-span-2">Mô tả<input className="input" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
    <label>Thứ tự<input className="input mono" type="number" value={form.sort_order} onChange={e=>setForm({...form,sort_order:e.target.value})}/></label>
   </div>
   <div className="erp-sticky-action-bar"><div className="erp-action-hint">Tạo Area trước, sau đó gán ST Group vào Area ở bảng bên dưới.</div><button className="btn primary" onClick={add}>Thêm khu vực</button></div>
  </section>

  <section className="erp-table-panel">
   <div className="erp-panel-head"><div><b>Area Master</b><span>Khu vực vật lý và ST Group đang được gán.</span></div><span>{areas.length} khu vực</span></div>
   <div className="table-wrap"><table className="erp-table"><thead><tr><th>Mã khu</th><th>Tên khu vực</th><th>Mô tả</th><th>ST Group</th><th>Trạng thái</th><th className="action">Thao tác</th></tr></thead><tbody>{areas.map(a=><tr key={a.id}><td className="mono"><b>{a.area_code}</b></td><td><b>{a.area_name}</b></td><td>{a.description||"—"}</td><td>{maps.filter(m=>m.area_id===a.id).map(m=>m.st_group).join(", ")||"—"}</td><td><span className={`badge ${a.is_active?"b-ready":""}`}>{a.is_active?"Active":"Inactive"}</span></td><td className="action"><div className="row erp-row-actions"><button className="btn small" onClick={()=>{setSelected(a.id);setStatus("")}}>Gán nhóm</button><button className="btn small" onClick={()=>startEdit(a)}>Sửa</button><button className={a.is_active?"btn danger-btn small":"btn small"} onClick={()=>toggle(a)}>{a.is_active?"Ngưng":"Kích hoạt"}</button></div></td></tr>)}</tbody></table></div>
  </section>

  {editing&&<section className="erp-form-panel erp-inline-editor-panel">
   <div className="erp-panel-head"><div><b>Sửa Area</b><span className="mono">{editing.area_code}</span></div><button className="btn small" onClick={()=>setEditing(null)}>Đóng</button></div>
   <div className="area-form erp-field-grid">
    <label>Mã khu<input className="input mono" value={editForm.area_code} onChange={e=>setEditForm({...editForm,area_code:e.target.value.toUpperCase()})}/></label>
    <label>Tên khu vực<input className="input" value={editForm.area_name} onChange={e=>setEditForm({...editForm,area_name:e.target.value})}/></label>
    <label className="erp-field-span-2">Mô tả<input className="input" value={editForm.description} onChange={e=>setEditForm({...editForm,description:e.target.value})}/></label>
    <label>Thứ tự<input className="input mono" type="number" value={editForm.sort_order} onChange={e=>setEditForm({...editForm,sort_order:e.target.value})}/></label>
   </div>
   <div className="erp-sticky-action-bar"><div className="erp-action-hint">Chỉ cập nhật thông tin Area; mapping ST Group được quản lý riêng.</div><div className="row"><button className="btn primary" onClick={saveEdit}>Lưu thay đổi</button><button className="btn" onClick={()=>setEditing(null)}>Hủy</button></div></div>
  </section>}

  {selected&&<section className="erp-form-panel erp-inline-editor-panel">
   <div className="erp-panel-head"><div><b>Gán ST Group</b><span>{areas.find(a=>a.id===selected)?.area_name}</span></div><button className="btn small" onClick={()=>setSelected(null)}>Đóng</button></div>
   <div className="erp-context-note">Một ST Group chỉ thuộc một Area. Nếu chọn Group đang thuộc Area khác, hệ thống sẽ chuyển Group sang Area này.</div>
   <div className="group-grid erp-selection-grid">{groups.map(g=><label className="check-card" key={`${selected}-${g}`}><input name="stgroup" type="checkbox" value={g} defaultChecked={selectedGroups.includes(g)}/><span><b>{g}</b>{assigned.get(g)&&assigned.get(g)!==selected?<small>Hiện tại: {areas.find(a=>a.id===assigned.get(g))?.area_name}</small>:<small>{selectedGroups.includes(g)?"Đang thuộc Area này":"Chưa gán"}</small>}</span></label>)}</div>
   <div className="erp-sticky-action-bar"><div className="erp-action-hint">Thay đổi này ảnh hưởng mapping Area → ST Group cho Planning/Scheduling.</div><div className="row"><button className="btn primary" onClick={saveGroups}>Lưu gán nhóm</button><button className="btn" onClick={()=>setSelected(null)}>Hủy</button></div></div>
  </section>}
 </div>
}
