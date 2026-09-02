"use client";
import {safeJson} from "@/lib/fetch-json";
import {useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {refreshConfigPage} from "@/lib/config/config-client";

type Recipe={
 recipe_key:string;
 process_family:string;
 recipe_group:string;
 recipe_group_source_column:string|null;
 recipe_no:string|null;
 recipe_no_source_column:string|null;
 recipe_name:string|null;
 recipe_name_source_column:string|null;
 batch_key:string;
 source_system:string|null;
 note:string|null;
 is_active:boolean;
};
type PartMap={part_num:string;revision_num:string;standard_operation:string;recipe_key:string;source_slot:string|null;source_recipe_no:string|null;recipe_no:string|null;recipe_name:string|null;recipe_group:string;process_family:string;batch_key:string};
type ColumnValue={column:string;value:string;label:string};
type RecipeForm={
 process_family:string;
 recipe_group:string;
 recipe_group_source_column:string;
 recipe_no_source_column:string;
 recipe_no:string;
 recipe_name_source_column:string;
 recipe_name:string;
 batch_key:string;
 note:string;
};
type EntryMode="OPEN_JOB"|"MANUAL";

const emptyForm=():RecipeForm=>({
 process_family:"PAINT",
 recipe_group:"",
 recipe_group_source_column:"",
 recipe_no_source_column:"",
 recipe_no:"",
 recipe_name_source_column:"",
 recipe_name:"",
 batch_key:"",
 note:""
});

export function ProcessRecipeManager({recipes,partRows,partQuery,sourceColumns,columnValues}:{
 recipes:Recipe[];
 partRows:PartMap[];
 partQuery:string;
 sourceColumns:string[];
 columnValues:ColumnValue[];
}){
 const router=useRouter();
 const [busy,setBusy]=useState(false);
 const [filter,setFilter]=useState("PAINT");
 const [edit,setEdit]=useState<Recipe|null>(null);
 const [form,setForm]=useState<RecipeForm>(emptyForm);
 const [groupMode,setGroupMode]=useState<EntryMode>("OPEN_JOB");
 const [noMode,setNoMode]=useState<EntryMode>("OPEN_JOB");
 const [nameMode,setNameMode]=useState<EntryMode>("OPEN_JOB");
 const [suggestedNameValues,setSuggestedNameValues]=useState<ColumnValue[]|null>(null);
 const [nameSuggestionBusy,setNameSuggestionBusy]=useState(false);
 const [nameSuggestionError,setNameSuggestionError]=useState("");
 const visible=useMemo(()=>recipes.filter(x=>!filter||x.process_family===filter),[recipes,filter]);
 const families=[...new Set(recipes.map(x=>x.process_family))];
 if(!families.includes("PAINT"))families.unshift("PAINT");

 const columns=useMemo(()=>{
  const out=[...new Set(sourceColumns.map(x=>String(x||"").trim()).filter(Boolean))];
  out.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"}));
  return out;
 },[sourceColumns]);

 const valuesByColumn=useMemo(()=>{
  const map=new Map<string,ColumnValue[]>();
  const seen=new Map<string,Set<string>>();
  for(const row of columnValues){
   const column=String(row.column||"").trim();
   const value=String(row.value||"").trim();
   if(!column||!value)continue;
   const colSeen=seen.get(column)||new Set<string>();
   if(colSeen.has(value))continue;
   colSeen.add(value);seen.set(column,colSeen);
   const arr=map.get(column)||[];
   arr.push({column,value,label:String(row.label||value).trim()||value});
   map.set(column,arr);
  }
  for(const arr of map.values())arr.sort((a,b)=>a.value.localeCompare(b.value,undefined,{numeric:true,sensitivity:"base"}));
  return map;
 },[columnValues]);

 function sourceOptions(current:string){
  if(current&& !columns.includes(current))return [current,...columns];
  return columns;
 }
 function valueOptions(column:string,current:string){
  const arr=[...(valuesByColumn.get(column)||[])];
  if(current&&!arr.some(x=>x.value===current))arr.unshift({column,value:current,label:current});
  return arr;
 }
 function optionLabel(x:ColumnValue){
  return x.label&&x.label!==x.value?`${x.label} — ${x.value}`:x.value;
 }

 function clear(){
  setEdit(null);
  setForm(emptyForm());
  setGroupMode("OPEN_JOB");
  setNoMode("OPEN_JOB");
  setNameMode("OPEN_JOB");
  setSuggestedNameValues(null);
  setNameSuggestionError("");
 }
 function startEdit(r:Recipe){
  setEdit(r);
  setGroupMode(r.recipe_group_source_column?"OPEN_JOB":"MANUAL");
  setNoMode(r.recipe_no_source_column?"OPEN_JOB":"MANUAL");
  setNameMode(r.recipe_name_source_column?"OPEN_JOB":"MANUAL");
  setSuggestedNameValues(null);
  setNameSuggestionError("");
  setForm({
   process_family:r.process_family,
   recipe_group:r.recipe_group,
   recipe_group_source_column:r.recipe_group_source_column||r.recipe_group||"",
   recipe_no_source_column:r.recipe_no_source_column||"",
   recipe_no:r.recipe_no||"",
   recipe_name_source_column:r.recipe_name_source_column||"",
   recipe_name:r.recipe_name||"",
   batch_key:r.batch_key||"",
   note:r.note||""
  });
  window.scrollTo({top:0,behavior:"smooth"});
 }
 async function save(){
  if(!form.process_family.trim()||!form.recipe_group.trim()||!form.recipe_no.trim()){
   alert("Process Family, Recipe Group và Recipe No là bắt buộc.");
   return;
  }
  if(nameMode==="OPEN_JOB"&&form.recipe_name_source_column.trim()&&!form.recipe_name.trim()){
   alert("Đã chọn cột nguồn Recipe Name nhưng chưa chọn giá trị.");
   return;
  }
  setBusy(true);try{
   const normalizedForm={
    ...form,
    recipe_group_source_column:groupMode==="OPEN_JOB"?form.recipe_group_source_column:"",
    recipe_no_source_column:noMode==="OPEN_JOB"?form.recipe_no_source_column:"",
    recipe_name_source_column:nameMode==="OPEN_JOB"?form.recipe_name_source_column:""
   };
   const body=edit?{...normalizedForm,recipe_key:edit.recipe_key}:normalizedForm;
   const r=await fetch("/api/process-recipe",{method:edit?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
   const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Save failed");clear();refreshConfigPage(router)
  }catch(e){alert(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function deactivate(r:Recipe){
  if(!confirm(`Deactivate recipe ${r.recipe_no||r.recipe_name}?`))return;
  setBusy(true);try{
   const x=await fetch("/api/process-recipe",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({recipe_key:r.recipe_key})});
   const d=await safeJson(x);if(!x.ok)throw new Error(d.error||"Deactivate failed");refreshConfigPage(router)
  }catch(e){alert(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }

 // v285: Recipe Name là dependent dropdown của Recipe No. Open Job Column
 // Values chỉ cho biết danh sách unique độc lập; API này đọc open_job_current
 // để giữ đúng quan hệ 2 giá trị nằm trên cùng một Job.
 useEffect(()=>{
  const noColumn=noMode==="OPEN_JOB"?form.recipe_no_source_column.trim():"";
  const noValue=form.recipe_no.trim();
  const nameColumn=nameMode==="OPEN_JOB"?form.recipe_name_source_column.trim():"";
  if(nameMode!=="OPEN_JOB"||!nameColumn||!noValue||noMode!=="OPEN_JOB"||!noColumn){
   setSuggestedNameValues(null);
   setNameSuggestionBusy(false);
   setNameSuggestionError("");
   return;
  }

  const controller=new AbortController();
  setNameSuggestionBusy(true);
  setNameSuggestionError("");
  const params=new URLSearchParams({
   recipeNoColumn:noColumn,
   recipeNo:noValue,
   recipeNameColumn:nameColumn
  });
  fetch(`/api/process-recipe/name-options?${params.toString()}`,{cache:"no-store",signal:controller.signal})
   .then(async r=>{
    const d=await safeJson(r);
    if(!r.ok)throw new Error(d.error||"Không tải được Recipe Name đề xuất.");
    return d;
   })
   .then((d:any)=>{
    const rows:ColumnValue[]=(Array.isArray(d.rows)?d.rows:[])
     .map((x:any)=>({column:nameColumn,value:String(x.value||"").trim(),label:String(x.label||x.value||"").trim()}))
     .filter((x:ColumnValue)=>x.value);
    setSuggestedNameValues(rows);
    setForm(prev=>{
     if(prev.recipe_no_source_column.trim()!==noColumn||
        prev.recipe_no.trim()!==noValue||
        prev.recipe_name_source_column.trim()!==nameColumn)return prev;
     const current=prev.recipe_name.trim();
     const currentStillValid=current&&rows.some(x=>x.value.localeCompare(current,undefined,{sensitivity:"accent"})===0);
     if(currentStillValid)return prev;
     if(rows.length===1)return {...prev,recipe_name:rows[0].value};
     return current?{...prev,recipe_name:""}:prev;
    });
   })
   .catch(e=>{
    if(e instanceof DOMException&&e.name==="AbortError")return;
    setSuggestedNameValues([]);
    setNameSuggestionError(e instanceof Error?e.message:String(e));
   })
   .finally(()=>{if(!controller.signal.aborted)setNameSuggestionBusy(false)});
  return ()=>controller.abort();
 },[form.recipe_no_source_column,form.recipe_no,form.recipe_name_source_column,noMode,nameMode]);

 const noValues=valueOptions(form.recipe_no_source_column,form.recipe_no);
 const baseNameValues=valueOptions(form.recipe_name_source_column,form.recipe_name);
 const nameValues=useMemo(()=>{
  if(suggestedNameValues==null)return baseNameValues;
  const arr=[...suggestedNameValues];
  // Khi sửa recipe cũ, vẫn hiển thị value hiện tại để form không mất dữ liệu
  // nếu All Open Job vừa thay đổi; save sẽ tiếp tục validate active source.
  if(edit&&form.recipe_name&&!arr.some(x=>x.value===form.recipe_name)){
   arr.unshift({column:form.recipe_name_source_column,value:form.recipe_name,label:form.recipe_name});
  }
  return arr;
 },[suggestedNameValues,baseNameValues,edit,form.recipe_name,form.recipe_name_source_column]);

 return <div>
  <div className="erp-table-panel">
   <div className="erp-panel-head"><b>{edit?"Sửa Process Recipe":"+ Thêm Process Recipe"}</b><span>Danh mục chuẩn dùng chung cho mọi công đoạn; tạo xong cần map ở phần ① để Planning Board đề xuất.</span></div>
   <div className="recipe-form recipe-form-open-job-source">
    <label>Process Family<input className="input" value={form.process_family} disabled={!!edit} onChange={e=>setForm({...form,process_family:e.target.value.toUpperCase()})}/></label>

    <label>Recipe Group
     <div className="row recipe-entry-mode">
      <button type="button" className={`btn small ${groupMode==="OPEN_JOB"?"primary":""}`} disabled={!!edit} onClick={()=>{setGroupMode("OPEN_JOB");setForm({...form,recipe_group:"",recipe_group_source_column:""});}}>Chọn từ Open Job</button>
      <button type="button" className={`btn small ${groupMode==="MANUAL"?"primary":""}`} disabled={!!edit} onClick={()=>{setGroupMode("MANUAL");setForm({...form,recipe_group:"",recipe_group_source_column:""});}}>Nhập tay</button>
     </div>
     {groupMode==="OPEN_JOB"?<>
      <select className="input" value={form.recipe_group_source_column} disabled={!!edit} onChange={e=>{
       const column=e.target.value;
       setForm({...form,recipe_group_source_column:column,recipe_group:column});
      }}>
       <option value="">Chọn cột All Open Job...</option>
       {sourceOptions(form.recipe_group_source_column).map(c=><option key={c} value={c}>{c}</option>)}
      </select>
      <span className="recipe-source-help">Lấy tên cột từ Open Job Column Values.</span>
     </>:<input className="input" value={form.recipe_group} disabled={!!edit} placeholder="Nhập Recipe Group..." onChange={e=>setForm({...form,recipe_group:e.target.value})}/>}
    </label>

    <label className="recipe-pair-field">Recipe No
     <div className="row recipe-entry-mode">
      <button type="button" className={`btn small ${noMode==="OPEN_JOB"?"primary":""}`} disabled={!!edit} onClick={()=>{setNoMode("OPEN_JOB");setForm({...form,recipe_no_source_column:"",recipe_no:"",recipe_name:""});}}>Chọn từ Open Job</button>
      <button type="button" className={`btn small ${noMode==="MANUAL"?"primary":""}`} disabled={!!edit} onClick={()=>{setNoMode("MANUAL");setSuggestedNameValues(null);setForm({...form,recipe_no_source_column:"",recipe_no:"",recipe_name:""});}}>Nhập tay</button>
     </div>
     {noMode==="OPEN_JOB"?<div className="recipe-source-pair">
      <select className="input" value={form.recipe_no_source_column} disabled={!!edit} onChange={e=>setForm({...form,recipe_no_source_column:e.target.value,recipe_no:"",recipe_name:""})}>
       <option value="">1. Chọn cột...</option>
       {sourceOptions(form.recipe_no_source_column).map(c=><option key={c} value={c}>{c}</option>)}
      </select>
      <select className="input" value={form.recipe_no} disabled={!!edit||!form.recipe_no_source_column} title={edit?"Recipe No là một phần của khóa Recipe và không được đổi để bảo toàn mapping, Batch và lịch sử.":undefined} onChange={e=>setForm({...form,recipe_no:e.target.value,recipe_name:""})}>
       <option value="">2. Chọn giá trị unique...</option>
       {noValues.map(x=><option key={x.value} value={x.value}>{optionLabel(x)}</option>)}
      </select>
     </div>:<input className="input" value={form.recipe_no} disabled={!!edit} title={edit?"Recipe No là một phần của khóa Recipe và không được đổi để bảo toàn mapping, Batch và lịch sử.":undefined} placeholder="Nhập Recipe No, ví dụ 005 hoặc SPX-005..." onChange={e=>setForm({...form,recipe_no:e.target.value,recipe_name:""})}/>}
    </label>

    <label className="recipe-pair-field">Recipe Name
     <div className="row recipe-entry-mode">
      <button type="button" className={`btn small ${nameMode==="OPEN_JOB"?"primary":""}`} onClick={()=>{setNameMode("OPEN_JOB");setForm({...form,recipe_name_source_column:"",recipe_name:""});}}>Chọn từ Open Job</button>
      <button type="button" className={`btn small ${nameMode==="MANUAL"?"primary":""}`} onClick={()=>{setNameMode("MANUAL");setSuggestedNameValues(null);setNameSuggestionError("");setForm({...form,recipe_name_source_column:"",recipe_name:""});}}>Nhập tay</button>
     </div>
     {nameMode==="OPEN_JOB"?<>
      <div className="recipe-source-pair">
       <select className="input" value={form.recipe_name_source_column} onChange={e=>setForm({...form,recipe_name_source_column:e.target.value,recipe_name:""})}>
        <option value="">1. Chọn cột...</option>
        {sourceOptions(form.recipe_name_source_column).map(c=><option key={c} value={c}>{c}</option>)}
       </select>
       <select className="input" value={form.recipe_name} disabled={!form.recipe_name_source_column||nameSuggestionBusy} onChange={e=>setForm({...form,recipe_name:e.target.value})}>
        <option value="">{nameSuggestionBusy?"Đang đề xuất theo Recipe No...":suggestedNameValues!=null?"2. Chọn Recipe Name phù hợp...":"2. Chọn giá trị unique..."}</option>
        {nameValues.map(x=><option key={x.value} value={x.value}>{optionLabel(x)}</option>)}
       </select>
      </div>
      {form.recipe_no&&form.recipe_name_source_column&&<span className="recipe-source-help">{noMode!=="OPEN_JOB"?"Recipe No đang nhập tay nên Recipe Name sẽ lấy danh sách unique của cột đã chọn.":nameSuggestionBusy?"Đang tìm Recipe Name nằm cùng Job với Recipe No đã chọn...":nameSuggestionError?nameSuggestionError:suggestedNameValues!=null?`${suggestedNameValues.length} Recipe Name phù hợp theo All Open Job.${suggestedNameValues.length===1?" Đã tự chọn.":""}`:""}</span>}
     </>:<input className="input" value={form.recipe_name} placeholder="Nhập Recipe Name..." onChange={e=>setForm({...form,recipe_name:e.target.value})}/>}
    </label>

    <label>Batch Key<input className="input" value={form.batch_key} placeholder="Để trống = Family | Group | Tên Recipe" onChange={e=>setForm({...form,batch_key:e.target.value})}/></label>
    <label>Note<input className="input" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>
   </div>
   {!edit&&<div className="notice recipe-multi-name-hint"><b>Có 2 cách khai báo:</b> chọn từ All Open Job để giữ liên kết cột nguồn, hoặc <b>Nhập tay</b> khi Recipe chưa có trong dữ liệu Open Job. 1 Recipe No vẫn có thể có nhiều Recipe Name; cùng No + Name sẽ cập nhật/reactivate đúng Recipe đã có.</div>}
   {edit&&<div className="notice"><b>Khóa Recipe được giữ nguyên:</b> Process Family, Recipe Group và Recipe No không thể đổi sau khi tạo vì đã liên kết mapping, batch và lịch sử. Recipe Name vẫn có thể chọn lại từ một cột All Open Job khác.</div>}
   <div className="recipe-actions"><button className="btn primary" disabled={busy} onClick={save}>{edit?"Lưu thay đổi":"Thêm Recipe"}</button>{edit&&<button className="btn" onClick={clear}>Hủy</button>}</div>
  </div>

  <div className="erp-table-panel section">
   <div className="erp-panel-head"><b>Process Recipe Master</b><div className="row"><span>{visible.length} recipes</span><select className="input recipe-filter" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All Process</option>{families.map(f=><option key={f}>{f}</option>)}</select></div></div>
   <div className="table-wrap"><table className="erp-table"><thead><tr><th>Nhóm lớn</th><th>Nhóm Recipe</th><th>Số Recipe</th><th>Tên Recipe</th><th>Mã lô</th><th>Nguồn</th><th></th></tr></thead>
    <tbody>{visible.map(r=><tr key={r.recipe_key}><td>{r.process_family}</td><td><b>{r.recipe_group}</b>{r.recipe_group_source_column&&<div className="muted recipe-source-cell">Cột: {r.recipe_group_source_column}</div>}</td><td className="mono">{r.recipe_no||"—"}{r.recipe_no_source_column&&<div className="muted recipe-source-cell">← {r.recipe_no_source_column}</div>}</td><td>{r.recipe_name||"—"}{r.recipe_name_source_column&&<div className="muted recipe-source-cell">← {r.recipe_name_source_column}</div>}</td><td className="mono">{r.batch_key}</td><td>{r.source_system||"—"}</td><td className="action"><div className="row"><button className="btn small" onClick={()=>startEdit(r)}>Sửa</button><button className="btn danger-btn small" onClick={()=>deactivate(r)}>Ngưng</button></div></td></tr>)}
    {!visible.length&&<tr><td colSpan={7} className="muted">Chưa có recipe.</td></tr>}</tbody>
   </table></div>
  </div>

  <div className="erp-table-panel section">
   <div className="erp-panel-head"><b>Part → Process Recipe</b><span>Recipe Name trả về từ Process Recipe Master</span></div>
   <form className="recipe-part-search" method="get"><input className="input" name="part" defaultValue={partQuery} placeholder="Nhập Part Number..."/><button className="btn primary">Tìm Part</button></form>
   {partQuery?<div className="table-wrap"><table className="erp-table"><thead><tr><th>Part</th><th>Bản vẽ</th><th>Công đoạn chính</th><th>Nhóm lớn</th><th>Nhóm Recipe</th><th>Số Recipe</th><th>Tên Recipe</th><th>Mã lô</th></tr></thead>
    <tbody>{partRows.map(r=><tr key={`${r.part_num}|${r.revision_num}|${r.standard_operation}`}><td><b>{r.part_num}</b></td><td>{r.revision_num}</td><td>{r.standard_operation}</td><td>{r.process_family}</td><td>{r.recipe_group}</td><td className="mono">{r.source_recipe_no||"—"}</td><td>{r.recipe_name||"CHƯA KHAI BÁO"}</td><td className="mono">{r.batch_key}</td></tr>)}
    {!partRows.length&&<tr><td colSpan={8} className="muted">Part chưa có Process Recipe mapping.</td></tr>}</tbody></table></div>:<div className="erp-empty">Nhập Part Number để kiểm tra recipe theo từng Revision/Operation.</div>}
  </div>
 </div>
}
