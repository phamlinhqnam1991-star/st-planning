"use client";
import {useMemo,useState} from "react";

type Recipe={recipe_key:string;process_family:string;recipe_group:string;recipe_no:string|null;recipe_name:string|null;batch_key:string;source_system:string|null;note:string|null;is_active:boolean};
type OpMap={standard_operation:string;recipe_key:string;source_slot:string|null;is_default:boolean;recipe_no:string|null;recipe_name:string|null;recipe_group:string;process_family:string};
type PartMap={part_num:string;revision_num:string;standard_operation:string;recipe_key:string;source_slot:string|null;source_recipe_no:string|null;recipe_no:string|null;recipe_name:string|null;recipe_group:string;process_family:string;batch_key:string};
type Op={standard_operation:string};

export function ProcessRecipeManager({recipes,mappings,partRows,partQuery,operations}:{recipes:Recipe[];mappings:OpMap[];partRows:PartMap[];partQuery:string;operations:Op[]}){
 const [busy,setBusy]=useState(false);
 const [filter,setFilter]=useState("PAINT");
 const [edit,setEdit]=useState<Recipe|null>(null);
 const [form,setForm]=useState({process_family:"PAINT",recipe_group:"PRIMER",recipe_no:"",recipe_name:"",batch_key:"",note:""});
 const [mapForm,setMapForm]=useState({standard_operation:operations[0]?.standard_operation||"",recipe_key:recipes[0]?.recipe_key||"",source_slot:"",is_default:false});
 const visible=useMemo(()=>recipes.filter(x=>!filter||x.process_family===filter),[recipes,filter]);
 const families=[...new Set(recipes.map(x=>x.process_family))];
 if(!families.includes("PAINT"))families.unshift("PAINT");

 function clear(){setEdit(null);setForm({process_family:"PAINT",recipe_group:"PRIMER",recipe_no:"",recipe_name:"",batch_key:"",note:""})}
 function startEdit(r:Recipe){setEdit(r);setForm({process_family:r.process_family,recipe_group:r.recipe_group,recipe_no:r.recipe_no||"",recipe_name:r.recipe_name||"",batch_key:r.batch_key||"",note:r.note||""});window.scrollTo({top:0,behavior:"smooth"})}
 async function save(){
  setBusy(true);try{
   const body=edit?{...form,recipe_key:edit.recipe_key}:form;
   const r=await fetch("/api/process-recipe",{method:edit?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
   const d=await r.json();if(!r.ok)throw new Error(d.error||"Save failed");location.reload()
  }catch(e){alert(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function deactivate(r:Recipe){
  if(!confirm(`Deactivate recipe ${r.recipe_no||r.recipe_name}?`))return;
  setBusy(true);try{
   const x=await fetch("/api/process-recipe",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({recipe_key:r.recipe_key})});
   const d=await x.json();if(!x.ok)throw new Error(d.error||"Deactivate failed");location.reload()
  }catch(e){alert(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function saveMap(){
  if(!mapForm.standard_operation||!mapForm.recipe_key)return alert("Chọn Operation và Recipe.");
  setBusy(true);try{
   const r=await fetch("/api/process-recipe/operation-map",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(mapForm)});
   const d=await r.json();if(!r.ok)throw new Error(d.error||"Mapping failed");location.reload()
  }catch(e){alert(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function removeMap(m:OpMap){
  if(!confirm(`Bỏ recipe khỏi ${m.standard_operation}?`))return;
  setBusy(true);try{
   const r=await fetch("/api/process-recipe/operation-map",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({standard_operation:m.standard_operation,recipe_key:m.recipe_key})});
   const d=await r.json();if(!r.ok)throw new Error(d.error||"Remove failed");location.reload()
  }catch(e){alert(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }

 return <div>
  <div className="erp-table-panel">
   <div className="erp-panel-head"><b>{edit?"Edit Process Recipe":"+ Add Process Recipe"}</b><span>Generic master · Phase 1: Paint</span></div>
   <div className="recipe-form">
    <label>Process Family<input className="input" value={form.process_family} disabled={!!edit} onChange={e=>setForm({...form,process_family:e.target.value.toUpperCase()})}/></label>
    <label>Recipe Group<input className="input" value={form.recipe_group} disabled={!!edit} onChange={e=>setForm({...form,recipe_group:e.target.value.toUpperCase()})}/></label>
    <label>Recipe No<input className="input" value={form.recipe_no} onChange={e=>setForm({...form,recipe_no:e.target.value})}/></label>
    <label>Recipe Name<input className="input" value={form.recipe_name} onChange={e=>setForm({...form,recipe_name:e.target.value})}/></label>
    <label>Batch Key<input className="input" value={form.batch_key} placeholder="Để trống = Family | Group | Recipe Name" onChange={e=>setForm({...form,batch_key:e.target.value})}/></label>
    <label>Note<input className="input" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>
   </div>
   <div className="recipe-actions"><button className="btn primary" disabled={busy} onClick={save}>{edit?"Save Changes":"Add Recipe"}</button>{edit&&<button className="btn" onClick={clear}>Cancel</button>}</div>
  </div>

  <div className="erp-table-panel section">
   <div className="erp-panel-head"><b>Process Recipe Master</b><div className="row"><span>{visible.length} recipes</span><select className="input recipe-filter" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All Process</option>{families.map(f=><option key={f}>{f}</option>)}</select></div></div>
   <div className="table-wrap"><table className="erp-table"><thead><tr><th>Family</th><th>Recipe Group</th><th>Recipe No</th><th>Recipe Name</th><th>Batch Key</th><th>Source</th><th></th></tr></thead>
    <tbody>{visible.map(r=><tr key={r.recipe_key}><td>{r.process_family}</td><td><b>{r.recipe_group}</b></td><td className="mono">{r.recipe_no||"—"}</td><td>{r.recipe_name||"—"}</td><td className="mono">{r.batch_key}</td><td>{r.source_system||"—"}</td><td className="action"><div className="row"><button className="btn small" onClick={()=>startEdit(r)}>Edit</button><button className="btn danger-btn small" onClick={()=>deactivate(r)}>Deactivate</button></div></td></tr>)}
    {!visible.length&&<tr><td colSpan={7} className="muted">Chưa có recipe.</td></tr>}</tbody>
   </table></div>
  </div>

  <div className="erp-table-panel section">
   <div className="erp-panel-head"><b>Operation → Recipe Mapping</b><span>Recipe nào được phép dùng cho Standard Operation</span></div>
   <div className="recipe-map-form">
    <label>Standard Operation<select className="input" value={mapForm.standard_operation} onChange={e=>setMapForm({...mapForm,standard_operation:e.target.value})}>{operations.map(o=><option key={o.standard_operation}>{o.standard_operation}</option>)}</select></label>
    <label>Recipe<select className="input" value={mapForm.recipe_key} onChange={e=>setMapForm({...mapForm,recipe_key:e.target.value})}>{recipes.map(r=><option key={r.recipe_key} value={r.recipe_key}>{r.process_family} · {r.recipe_group} · {r.recipe_no||"—"} · {r.recipe_name||"—"}</option>)}</select></label>
    <label>Source Slot<input className="input" value={mapForm.source_slot} placeholder="Optional" onChange={e=>setMapForm({...mapForm,source_slot:e.target.value})}/></label>
    <label className="recipe-check"><input type="checkbox" checked={mapForm.is_default} onChange={e=>setMapForm({...mapForm,is_default:e.target.checked})}/> Default</label>
    <button className="btn primary" disabled={busy} onClick={saveMap}>Add Mapping</button>
   </div>
   <div className="table-wrap"><table className="erp-table"><thead><tr><th>Standard Operation</th><th>Family</th><th>Recipe Group</th><th>Recipe No</th><th>Recipe Name</th><th>Source Slot</th><th></th></tr></thead>
    <tbody>{mappings.map(m=><tr key={`${m.standard_operation}|${m.recipe_key}`}><td><b>{m.standard_operation}</b></td><td>{m.process_family}</td><td>{m.recipe_group}</td><td className="mono">{m.recipe_no||"—"}</td><td>{m.recipe_name||"—"}</td><td>{m.source_slot||"—"}</td><td className="action"><button className="btn danger-btn small" onClick={()=>removeMap(m)}>Remove</button></td></tr>)}</tbody>
   </table></div>
  </div>

  <div className="erp-table-panel section">
   <div className="erp-panel-head"><b>Part → Process Recipe</b><span>Recipe Name trả về từ Process Recipe Master</span></div>
   <form className="recipe-part-search" method="get"><input className="input" name="part" defaultValue={partQuery} placeholder="Nhập Part Number..."/><button className="btn primary">Tìm Part</button></form>
   {partQuery?<div className="table-wrap"><table className="erp-table"><thead><tr><th>Part</th><th>Revision</th><th>Standard Operation</th><th>Family</th><th>Recipe Group</th><th>Recipe No</th><th>Recipe Name</th><th>Batch Key</th></tr></thead>
    <tbody>{partRows.map(r=><tr key={`${r.part_num}|${r.revision_num}|${r.standard_operation}`}><td><b>{r.part_num}</b></td><td>{r.revision_num}</td><td>{r.standard_operation}</td><td>{r.process_family}</td><td>{r.recipe_group}</td><td className="mono">{r.source_recipe_no||"—"}</td><td>{r.recipe_name||"CHƯA KHAI BÁO"}</td><td className="mono">{r.batch_key}</td></tr>)}
    {!partRows.length&&<tr><td colSpan={8} className="muted">Part chưa có Process Recipe mapping.</td></tr>}</tbody></table></div>:<div className="erp-empty">Nhập Part Number để kiểm tra recipe theo từng Revision/Operation.</div>}
  </div>
 </div>
}