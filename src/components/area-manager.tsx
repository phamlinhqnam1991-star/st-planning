"use client";
import {safeJson} from "@/lib/fetch-json";
import { useEffect,useMemo,useState } from "react";
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
 usePopupMessage(status);
 const [form,setForm]=useState({area_code:"",area_name:"",description:"",sort_order:"0"});
 async function load(fresh=false){const r=await fetch(fresh?`/api/area?fresh=${Date.now()}`:"/api/area",fresh?{cache:"no-store"}:undefined);const d=await safeJson(r);if(!r.ok){setStatus(`Lỗi: ${apiError(d)}`);return}setAreas(d.areas);setMaps(d.mappings);setGroups(d.groups)}
 useEffect(()=>{load()},[]);
 const assigned=useMemo(()=>new Map(maps.map(x=>[x.st_group,x.area_id])),[maps]);
 const selectedGroups=selected?groups.filter(g=>assigned.get(g)===selected):[];
 async function add(){setStatus("");const r=await fetch("/api/area",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(form)});const d=await safeJson(r);if(!r.ok){setStatus(`Lỗi: ${apiError(d)}`);return}setForm({area_code:"",area_name:"",description:"",sort_order:"0"});setStatus("Đã thêm Area.");notifyConfigHealthChanged();await load(true)}
 async function toggle(a:Area){const r=await fetch("/api/area",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({id:a.id,is_active:!a.is_active})});const d=await safeJson(r);if(!r.ok)setStatus(`Lỗi: ${apiError(d)}`);else{notifyConfigHealthChanged();await load(true)}}
 async function edit(a:Area){const name=prompt("Area Name",a.area_name);if(name===null)return;const code=prompt("Area Code",a.area_code);if(code===null)return;const description=prompt("Description",a.description||"");if(description===null)return;const order=prompt("Sort Order",String(a.sort_order));if(order===null)return;const r=await fetch("/api/area",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({id:a.id,area_name:name,area_code:code,description,sort_order:Number(order)})});const d=await safeJson(r);if(!r.ok)setStatus(`Lỗi: ${apiError(d)}`);else{setStatus("Đã cập nhật Area.");notifyConfigHealthChanged();await load(true)}}
 async function saveGroups(){if(!selected)return;const checked=[...document.querySelectorAll<HTMLInputElement>('input[name="stgroup"]:checked')].map(x=>x.value);const r=await fetch("/api/area/groups",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({area_id:selected,groups:checked})});const d=await safeJson(r);if(!r.ok)setStatus(`Lỗi: ${apiError(d)}`);else{setStatus("Đã lưu ST Group → Area.");notifyConfigHealthChanged();await load(true)}}
 return <>
 <div className="card"><h2 style={{marginTop:0}}>+ Add Area</h2><div className="area-form"><input className="input" placeholder="Mã khu" value={form.area_code} onChange={e=>setForm({...form,area_code:e.target.value})}/><input className="input" placeholder="Tên khu vực" value={form.area_name} onChange={e=>setForm({...form,area_name:e.target.value})}/><input className="input" placeholder="Mô tả" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><input className="input" type="number" placeholder="Thứ tự" value={form.sort_order} onChange={e=>setForm({...form,sort_order:e.target.value})}/><button className="btn primary" onClick={add}>Thêm khu</button></div></div>
 <div className="card section" style={{overflowX:"auto"}}><h2 style={{marginTop:0}}>Area List</h2><table><thead><tr><th>Mã khu</th><th>Tên khu vực</th><th>Mô tả</th><th>Nhóm ST</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{areas.map(a=><tr key={a.id}><td>{a.area_code}</td><td><b>{a.area_name}</b></td><td>{a.description||""}</td><td>{maps.filter(m=>m.area_id===a.id).map(m=>m.st_group).join(", ")||"—"}</td><td><span className="badge">{a.is_active?"Active":"Inactive"}</span></td><td><div className="row"><button className="btn" onClick={()=>{setSelected(a.id);setStatus("")}}>Gán nhóm</button><button className="btn" onClick={()=>edit(a)}>Sửa</button><button className={a.is_active?"btn danger-btn":"btn"} onClick={()=>toggle(a)}>{a.is_active?"Ngưng":"Kích hoạt"}</button></div></td></tr>)}</tbody></table></div>
 {selected&&<div className="card section"><h2 style={{marginTop:0}}>Assign ST Groups → {areas.find(a=>a.id===selected)?.area_name}</h2><p className="muted">Một ST Group thuộc một Area. Chọn group đã thuộc Area khác sẽ tự chuyển sang Area này.</p><div className="group-grid">{groups.map(g=><label className="check-card" key={`${selected}-${g}`}><input name="stgroup" type="checkbox" value={g} defaultChecked={selectedGroups.includes(g)}/><span><b>{g}</b>{assigned.get(g)&&assigned.get(g)!==selected?<small>Hiện tại: {areas.find(a=>a.id===assigned.get(g))?.area_name}</small>:null}</span></label>)}</div><div className="row" style={{marginTop:16}}><button className="btn primary" onClick={saveGroups}>Lưu gán nhóm</button><button className="btn" onClick={()=>setSelected(null)}>Close</button></div></div>}
 </>}
