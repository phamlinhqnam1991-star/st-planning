"use client";
import {safeJson} from "@/lib/fetch-json";
import {useState} from "react";

type Op={standard_operation:string};
type Recipe={recipe_key:string;process_family:string;recipe_group:string;recipe_no:string|null;recipe_name:string|null;batch_key:string};
type OpMap={standard_operation:string;recipe_key:string;source_slot:string|null;is_default:boolean;recipe_no:string|null;recipe_name:string|null;recipe_group:string;process_family:string};

/**
 * Standard Operation → Recipe (md_operation_recipe_mapping):
 * Recipe nào được phép dùng cho mỗi công đoạn chính.
 * (Tách từ ProcessRecipeManager — v221.28)
 */
export function OperationRecipeAllowedManager({operations,recipes,mappings}:{
 operations:Op[];recipes:Recipe[];mappings:OpMap[];
}){
 const [busy,setBusy]=useState(false);
 const [mapForm,setMapForm]=useState({standard_operation:operations[0]?.standard_operation||"",recipe_key:recipes[0]?.recipe_key||"",source_slot:"",is_default:false});

 async function saveMap(){
  if(!mapForm.standard_operation||!mapForm.recipe_key)return alert("Chọn Operation và Recipe.");
  setBusy(true);try{
   const r=await fetch("/api/process-recipe/operation-map",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(mapForm)});
   const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Mapping failed");location.reload()
  }catch(e){alert(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function removeMap(m:OpMap){
  if(!confirm(`Bỏ recipe khỏi ${m.standard_operation}?`))return;
  setBusy(true);try{
   const r=await fetch("/api/process-recipe/operation-map",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({standard_operation:m.standard_operation,recipe_key:m.recipe_key})});
   const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Remove failed");location.reload()
  }catch(e){alert(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }

 return <div className="erp-table-panel section">
  <div className="erp-panel-head"><b>Standard Operation → Recipe (danh sách được phép)</b><span>Recipe nào được dùng cho từng công đoạn chính</span></div>
  <div className="recipe-map-form">
   <label>Standard Operation<select className="input" value={mapForm.standard_operation} onChange={e=>setMapForm({...mapForm,standard_operation:e.target.value})}>{operations.map(o=><option key={o.standard_operation}>{o.standard_operation}</option>)}</select></label>
   <label>Recipe<select className="input" value={mapForm.recipe_key} onChange={e=>setMapForm({...mapForm,recipe_key:e.target.value})}>{recipes.map(r=><option key={r.recipe_key} value={r.recipe_key}>{r.process_family} · {r.recipe_group} · {r.recipe_no||"—"} · {r.recipe_name||"—"}</option>)}</select></label>
   <label>Source Slot<input className="input" value={mapForm.source_slot} placeholder="Optional" onChange={e=>setMapForm({...mapForm,source_slot:e.target.value})}/></label>
   <label className="recipe-check"><input type="checkbox" checked={mapForm.is_default} onChange={e=>setMapForm({...mapForm,is_default:e.target.checked})}/> Default</label>
   <button className="btn primary" disabled={busy} onClick={saveMap}>Add Mapping</button>
  </div>
  <div className="table-wrap"><table className="erp-table"><thead><tr><th>Công đoạn chính</th><th>Nhóm lớn</th><th>Nhóm Recipe</th><th>Số Recipe</th><th>Tên Recipe</th><th>Vị trí nguồn</th><th></th></tr></thead>
   <tbody>{mappings.map(m=><tr key={`${m.standard_operation}|${m.recipe_key}`}><td><b>{m.standard_operation}</b></td><td>{m.process_family}</td><td>{m.recipe_group}</td><td className="mono">{m.recipe_no||"—"}</td><td>{m.recipe_name||"—"}</td><td>{m.source_slot||"—"}</td><td className="action"><button className="btn danger-btn small" onClick={()=>removeMap(m)}>Bỏ</button></td></tr>)}</tbody>
  </table></div>
 </div>
}
