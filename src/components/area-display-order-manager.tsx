"use client";

import {useEffect,useMemo,useState} from "react";
import {safeJson} from "@/lib/fetch-json";
import {usePopupMessage} from "@/hooks/use-popup-message";
import {notifyConfigHealthChanged} from "@/lib/config/config-client";

type Area={id:number;area_code:string;area_name:string;description:string|null;sort_order:number;is_active:boolean};

export function AreaDisplayOrderManager(){
 const [areas,setAreas]=useState<Area[]>([]);
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 usePopupMessage(status);
 async function load(){
  const r=await fetch(`/api/area?fresh=${Date.now()}`,{cache:"no-store"});
  const d=await safeJson(r);
  if(!r.ok){setStatus(`Lỗi: ${d?.error||"Không tải được Area."}`);return;}
  setAreas((d.areas||[]).filter((x:Area)=>x.is_active));
 }
 useEffect(()=>{load()},[]);
 const normalized=useMemo(()=>areas.map((a,index)=>({...a,display_order:(index+1)*10})),[areas]);
 function move(index:number,delta:number){
  const target=index+delta;if(target<0||target>=areas.length)return;
  setAreas(prev=>{const next=[...prev];const [row]=next.splice(index,1);next.splice(target,0,row);return next;});
 }
 async function save(){
  if(!areas.length)return;
  setBusy(true);setStatus("");
  try{
   const r=await fetch("/api/area/display-order",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({area_ids:areas.map(x=>x.id)})});
   const d=await safeJson(r);if(!r.ok)throw new Error(d?.error||"Không lưu được thứ tự Area.");
   setStatus("Đã lưu thứ tự hiển thị Area.");notifyConfigHealthChanged();await load();
  }catch(e){setStatus(`Lỗi: ${e instanceof Error?e.message:String(e)}`)}finally{setBusy(false)}
 }
 return <div className="erp-config-editor-stack">
  <section className="erp-form-panel erp-editor-panel">
   <div className="erp-panel-head"><div><b>Thứ tự hiển thị khu vực theo Physical Area</b><span>Một nguồn thứ tự dùng chung cho Dashboard, Planning workload và các panel Production có Area.</span></div><span>{areas.length} Area</span></div>
   <div className="erp-context-note">Dùng nút ↑ / ↓ để sắp xếp. Khi lưu, hệ thống ghi lại <code>md_area.sort_order</code> theo bước 10. Không đổi mapping ST Group, Schedule Area, Resource hay Planner.</div>
   <div className="table-wrap"><table className="erp-table"><thead><tr><th>Hiển thị</th><th>Mã Area</th><th>Tên Area</th><th>Mô tả</th><th className="action">Sắp xếp</th></tr></thead><tbody>
    {normalized.map((a,index)=><tr key={a.id}><td className="num"><b className="mono">{a.display_order}</b></td><td className="mono"><b>{a.area_code}</b></td><td><b>{a.area_name}</b></td><td>{a.description||"—"}</td><td className="action"><div className="row"><button type="button" className="btn small" disabled={index===0||busy} onClick={()=>move(index,-1)}>↑</button><button type="button" className="btn small" disabled={index===areas.length-1||busy} onClick={()=>move(index,1)}>↓</button></div></td></tr>)}
   </tbody></table></div>
   <div className="erp-sticky-action-bar"><div className="erp-action-hint">Chỉ thay đổi thứ tự hiển thị theo Area; không thay business flow.</div><button type="button" className="btn primary" disabled={busy||!areas.length} onClick={save}>{busy?"Đang lưu…":"Lưu thứ tự Area"}</button></div>
  </section>
 </div>;
}
