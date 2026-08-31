"use client";

import {useMemo,useState} from "react";
import {safeJson} from "@/lib/fetch-json";
import {useRouter} from "next/navigation";
import {refreshConfigPage} from "@/lib/config/config-client";

type Row={standard_operation:string;recipe_key:string;source_slot:string|null;is_default:boolean;recipe_no:string|null;recipe_name:string|null;recipe_group:string|null;process_family:string|null};
type Recipe={recipe_key:string;recipe_no:string|null;recipe_name:string|null;recipe_group:string|null;process_family:string|null};

export function OperationRecipeMappingMasterManager({rows,operations,recipes}:{rows:Row[];operations:string[];recipes:Recipe[]}){
 const router=useRouter();
 const [q,setQ]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [standardOperation,setStandardOperation]=useState(operations[0]||"");
 const [recipeKey,setRecipeKey]=useState("");
 const [sourceSlot,setSourceSlot]=useState("");
 const [isDefault,setIsDefault]=useState(false);
 const shown=useMemo(()=>{
  const term=q.trim().toUpperCase();
  if(!term)return rows;
  return rows.filter(r=>[r.standard_operation,r.recipe_no,r.recipe_name,r.recipe_group,r.process_family,r.source_slot].some(v=>String(v||"").toUpperCase().includes(term)));
 },[rows,q]);
 const save=async()=>{
  if(!standardOperation||!recipeKey){setMessage("Chọn Main Operation và Recipe.");return;}
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/process-recipe/operation-map",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({standard_operation:standardOperation,recipe_key:recipeKey,source_slot:sourceSlot||null,is_default:isDefault})});
   const d=await safeJson<{ok?:boolean;error?:string}>(r);
   if(!r.ok||!d.ok)throw new Error(d.error||"Không lưu được mapping.");
   refreshConfigPage(router);
  }catch(e){setMessage(e instanceof Error?e.message:String(e));setBusy(false);}
 };
 const remove=async(row:Row)=>{
  if(!confirm(`Ngưng dùng mapping ${row.standard_operation} → ${row.recipe_no||row.recipe_key}?`))return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/process-recipe/operation-map",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({standard_operation:row.standard_operation,recipe_key:row.recipe_key})});
   const d=await safeJson<{ok?:boolean;error?:string}>(r);
   if(!r.ok||!d.ok)throw new Error(d.error||"Không thể ngưng dùng mapping.");
   refreshConfigPage(router);
  }catch(e){setMessage(e instanceof Error?e.message:String(e));setBusy(false);}
 };
 return <>
  <div className="notice section"><b>Lưu ý:</b> bảng này dùng để quản lý/đối chiếu mapping Standard Operation → Recipe cũ. Từ v280, Planning Board <b>không dùng bảng này để tự đề xuất Recipe</b>; nguồn ưu tiên là <a href="/recipe-operation-map">Công thức & Rule: Operation Code → Recipe</a>.</div>
  <section className="erp-form-panel section">
   <div className="erp-panel-head"><b>Thêm hoặc cập nhật mapping</b></div>
   <div className="form-grid">
    <label>Main Operation<select className="input" value={standardOperation} onChange={e=>setStandardOperation(e.target.value)}><option value="">Chọn công đoạn</option>{operations.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
    <label>Recipe<select className="input" value={recipeKey} onChange={e=>setRecipeKey(e.target.value)}><option value="">Chọn Recipe</option>{recipes.map(r=><option key={r.recipe_key} value={r.recipe_key}>{r.recipe_no||"—"} · {r.recipe_name||r.recipe_key}</option>)}</select></label>
    <label>Source Slot<input className="input" value={sourceSlot} onChange={e=>setSourceSlot(e.target.value)} placeholder="Không bắt buộc"/></label>
    <label className="check-label"><input type="checkbox" checked={isDefault} onChange={e=>setIsDefault(e.target.checked)}/> Recipe mặc định</label>
    <button className="btn primary" type="button" disabled={busy} onClick={save}>{busy?"Đang lưu...":"Lưu mapping"}</button>
   </div>
   {message&&<div className="notice">{message}</div>}
  </section>
  <section className="erp-table-panel">
   <div className="erp-panel-head"><b>Standard Operation → Recipe</b><span>{shown.length}/{rows.length} mapping</span></div>
   <div className="row section"><input className="input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Tìm Main Operation, Recipe, nhóm..."/></div>
   <div className="table-wrap"><table className="erp-table"><thead><tr><th>Main Operation</th><th>Recipe No</th><th>Recipe Name</th><th>Family · Group</th><th>Source Slot</th><th>Default</th><th></th></tr></thead><tbody>
    {shown.map(r=><tr key={`${r.standard_operation}-${r.recipe_key}`}><td><b>{r.standard_operation}</b></td><td className="mono">{r.recipe_no||"—"}</td><td>{r.recipe_name||r.recipe_key}</td><td>{[r.process_family,r.recipe_group].filter(Boolean).join(" · ")||"—"}</td><td>{r.source_slot||"—"}</td><td>{r.is_default?"✓":""}</td><td className="action"><button className="btn small" disabled={busy} onClick={()=>{setStandardOperation(r.standard_operation);setRecipeKey(r.recipe_key);setSourceSlot(r.source_slot||"");setIsDefault(r.is_default);window.scrollTo({top:0,behavior:"smooth"});}}>Sửa</button> <button className="btn small danger" disabled={busy} onClick={()=>remove(r)}>Ngưng dùng</button></td></tr>)}
    {!shown.length&&<tr><td colSpan={7} className="muted">Không có mapping phù hợp.</td></tr>}
   </tbody></table></div>
  </section>
 </>;
}
