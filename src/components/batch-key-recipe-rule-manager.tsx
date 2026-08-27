"use client";

import {useEffect,useMemo,useState} from "react";

type Cond={source_column:string;operator:string;source_value:string;is_active:boolean};
type Rule={
 id:number;
 rule_name:string;
 standard_operation:string;
 match_mode:"ALL"|"ANY";
 priority:number;
 suggested_recipe_key:string|null;
 suggested_recipe_no:string|null;
 suggested_recipe_name:string|null;
 batch_key_template:string|null;
 batch_no_prefix:string|null;
 is_active:boolean;
 note:string|null;
 conditions:Cond[];
};
type Recipe={recipe_key:string;process_family:string;recipe_group:string;recipe_no:string|null;recipe_name:string|null;batch_key:string};

const OPERATORS=[
 {value:"equals",label:"bằng (=)"},
 {value:"contains",label:"chứa"},
 {value:"not_empty",label:"không rỗng"},
 {value:"starts_with",label:"bắt đầu bằng"},
 {value:"ends_with",label:"kết thúc bằng"}
];

const blank=():Cond=>({source_column:"",operator:"not_empty",source_value:"",is_active:true});
const blankForm=()=>({
 rule_name:"",standard_operation:"",match_mode:"ALL" as "ALL"|"ANY",priority:"100",
 suggested_recipe_key:"",batch_key_template:"",batch_no_prefix:"",is_active:true,note:"",
 conditions:[blank()]
});

export function BatchKeyRecipeRuleManager({prefillOperation}:{prefillOperation?:string}){
 const [rules,setRules]=useState<Rule[]>([]);
 const [operations,setOperations]=useState<string[]>([]);
 const [recipes,setRecipes]=useState<Recipe[]>([]);
 const [columns,setColumns]=useState<string[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [filter,setFilter]=useState("");
 const [editId,setEditId]=useState<number|null>(null);
 const [f,setF]=useState(blankForm());
 const [columnValues,setColumnValues]=useState<Record<string,string[]>>({});

 async function load(){
  setBusy(true);
  try{
   const r=await fetch("/api/config/batch-key-recipe-rules");
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||"Load failed");
   setRules(d.rows||[]);
   setOperations(d.operations||[]);
   setRecipes(d.recipes||[]);
   setColumns((d.columns||[]).map((c:any)=>c.source_column));
   if(prefillOperation&&!f.standard_operation){
    setF(x=>({...x,standard_operation:prefillOperation}));
   }
  }catch(e){setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`)}finally{setBusy(false)}
 }

 useEffect(()=>{load()},[]);

 async function loadColumnValues(column:string){
  if(!column||columnValues[column])return;
  try{
   const r=await fetch(`/api/config/open-job-column-values?column=${encodeURIComponent(column)}&pageSize=200`);
   const d=await r.json();
   if(r.ok)setColumnValues(v=>({...v,[column]:(d.rows||[]).map((x:any)=>x.source_value)}));
  }catch{/* best effort */}
 }

 function setCond(index:number,patch:Partial<Cond>){
  const next=[...f.conditions];
  next[index]={...next[index],...patch};
  setF({...f,conditions:next});
  if(patch.source_column)loadColumnValues(patch.source_column);
 }

 async function save(){
  if(!f.rule_name.trim())return alert("Nhập Rule Name.");
  if(!f.standard_operation)return alert("Chọn Main Operation.");
  const conds=f.conditions
   .filter(c=>c.source_column.trim()&&c.is_active!==false)
   .map(c=>({
    source_column:c.source_column.trim(),
    operator:c.operator,
    source_value:c.source_value.trim()||null,
    is_active:true
   }));
  if(!conds.length)return alert("Rule cần ít nhất 1 điều kiện.");

  setBusy(true);
  try{
   const r=await fetch("/api/config/batch-key-recipe-rules",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({
     ...(editId?{id:editId}:{}),
     rule_name:f.rule_name.trim(),
     standard_operation:f.standard_operation,
     match_mode:f.match_mode,
     priority:Number(f.priority)||100,
     suggested_recipe_key:f.suggested_recipe_key||null,
     batch_key_template:f.batch_key_template.trim()||null,
     batch_no_prefix:f.batch_no_prefix.trim().toUpperCase()||"",
     is_active:f.is_active,
     note:f.note.trim()||null,
     conditions:conds
    })
   });
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||"Save failed");
   setMessage(`Đã lưu rule${editId?` #${editId}`:""}.`);
   setEditId(null);setF(blankForm());
   load();
  }catch(e){setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`)}finally{setBusy(false)}
 }

 async function remove(rule:Rule){
  if(!confirm(`Inactivate rule "${rule.rule_name}" (${rule.standard_operation})?`))return;
  setBusy(true);
  try{
   const r=await fetch("/api/config/batch-key-recipe-rules",{
    method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:rule.id})
   });
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||"Remove failed");
   load();
  }catch(e){setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`)}finally{setBusy(false)}
 }

 function startEdit(rule:Rule){
  setEditId(rule.id);
  setF({
   rule_name:rule.rule_name,
   standard_operation:rule.standard_operation,
   match_mode:rule.match_mode,
   priority:String(rule.priority),
   suggested_recipe_key:rule.suggested_recipe_key||"",
   batch_key_template:rule.batch_key_template||"",
   batch_no_prefix:rule.batch_no_prefix||"",
   is_active:rule.is_active,
   note:rule.note||"",
   conditions:rule.conditions.length?rule.conditions.map(c=>({...c,source_value:c.source_value||""})):[blank()]
  });
  for(const c of rule.conditions)loadColumnValues(c.source_column);
  window.scrollTo({top:0,behavior:"smooth"});
 }

 const visible=useMemo(()=>{
  const q=filter.trim().toUpperCase();
  if(!q)return rules;
  return rules.filter(r=>
   r.rule_name.toUpperCase().includes(q)||
   r.standard_operation.toUpperCase().includes(q)||
   (r.suggested_recipe_name||"").toUpperCase().includes(q)
  );
 },[rules,filter]);

 const recipeMap=useMemo(()=>new Map(recipes.map(r=>[r.recipe_key,r])),[recipes]);

 return <div className="section">
  <div className="erp-table-panel">
   <div className="erp-panel-head">
    <b>{editId?`Edit Rule #${editId}`:"Tạo Rule mới"}</b>
    <span>Main Operation → Điều kiện All Open Job → Recipe + Batch Key + Prefix</span>
   </div>

   <div className="rule-form">
    <label>Rule Name
     <input className="input" value={f.rule_name} placeholder="vd PRIMER 20-T3-10 EPOXY"
      onChange={e=>setF({...f,rule_name:e.target.value})}/>
    </label>
    <label>Main Operation
     <select className="input" value={f.standard_operation} onChange={e=>setF({...f,standard_operation:e.target.value})}>
      <option value="">Chọn Main Operation...</option>
      {operations.map(o=><option key={o} value={o}>{o}</option>)}
     </select>
    </label>
    <label>Match Mode
     <select className="input" value={f.match_mode} onChange={e=>setF({...f,match_mode:e.target.value as any})}>
      <option value="ALL">ALL — mọi điều kiện đều đúng</option>
      <option value="ANY">ANY — ít nhất 1 điều kiện đúng</option>
     </select>
    </label>
    <label>Priority
     <input className="input" type="number" min="1" value={f.priority} onChange={e=>setF({...f,priority:e.target.value})}/>
    </label>
    <label>Suggested Recipe
     <select className="input" value={f.suggested_recipe_key} onChange={e=>setF({...f,suggested_recipe_key:e.target.value})}>
      <option value="">(Để trống = không đề xuất recipe)</option>
      {recipes.map(r=><option key={r.recipe_key} value={r.recipe_key}>
       [{r.process_family}] {r.recipe_no||"—"} · {r.recipe_name||"CHƯA KHAI BÁO"}
      </option>)}
     </select>
    </label>
    <label>Batch Key Template
     <input className="input mono" value={f.batch_key_template}
      placeholder={'PAINT|PRIMER|{PRIMER1} — {COT} lấy giá trị thật của Job'}
      onChange={e=>setF({...f,batch_key_template:e.target.value})}/>
    </label>
    <label>Batch No Prefix (3 ký tự)
     <input className="input mono" maxLength={3} value={f.batch_no_prefix}
      placeholder="vd PRI, TOP, CHM" onChange={e=>setF({...f,batch_no_prefix:e.target.value.toUpperCase()})}/>
    </label>
    <label className="row"><input type="checkbox" checked={f.is_active} onChange={e=>setF({...f,is_active:e.target.checked})}/>Active</label>
    <label>Note
     <input className="input" value={f.note} placeholder="Ghi chú rule" onChange={e=>setF({...f,note:e.target.value})}/>
    </label>
   </div>

   <div className="rule-conditions">
    <div className="erp-panel-head"><b>Conditions</b><span>đọc từ cột All Open Job</span></div>
    {f.conditions.map((cond,index)=>
     <div className="rule-condition-row" key={index}>
      <select className="input" value={cond.source_column} onChange={e=>setCond(index,{source_column:e.target.value})}>
       <option value="">Cột...</option>
       {columns.map(c=><option key={c} value={c}>{c}</option>)}
      </select>
      <select className="input" value={cond.operator} onChange={e=>setCond(index,{operator:e.target.value})}>
       {OPERATORS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {cond.operator!=="not_empty"&&
       <input className="input" list={`rule-values-${index}`} value={cond.source_value}
        placeholder="Giá trị (hoặc chọn từ danh sách)"
        onChange={e=>setCond(index,{source_value:e.target.value})}/>
      }
      <datalist id={`rule-values-${index}`}>
       {(columnValues[cond.source_column]||[]).map(v=><option key={v} value={v}/>)}
      </datalist>
      <button className="btn danger-btn small" disabled={f.conditions.length<=1}
       onClick={()=>setF({...f,conditions:f.conditions.filter((_,i)=>i!==index)})}>✕</button>
     </div>
    )}
    <button className="btn small" onClick={()=>setF({...f,conditions:[...f.conditions,blank()]})}>+ Thêm điều kiện</button>
   </div>

   <div className="row rule-form-actions">
    <button className="btn primary" disabled={busy} onClick={save}>{busy?"Đang lưu...":editId?"Save Changes":"Add Rule"}</button>
    {editId&&<button className="btn" onClick={()=>{setEditId(null);setF(blankForm())}}>Cancel</button>}
   </div>

   {message&&<div className="notice">{message}</div>}
  </div>

  <div className="erp-table-panel section">
   <div className="erp-panel-head">
    <b>Batch Key / Recipe Rules</b>
    <div className="row">
     <span>{visible.length} active rules</span>
     <input className="input rule-filter" value={filter} placeholder="Tìm rule..." onChange={e=>setFilter(e.target.value)}/>
    </div>
   </div>

   <div className="table-wrap">
    <table className="erp-table">
     <thead><tr>
      <th>Main Op</th><th>Rule Name</th><th>Match</th><th>Priority</th>
      <th>Recipe</th><th>Batch Key Template</th><th>Prefix</th><th>Active</th><th></th>
     </tr></thead>
     <tbody>
      {visible.map(r=><tr key={r.id}>
       <td><b>{r.standard_operation}</b></td>
       <td>{r.rule_name}{r.note&&<small className="muted"> — {r.note}</small>}</td>
       <td>{r.match_mode}</td>
       <td className="num mono">{r.priority}</td>
       <td>
        {r.suggested_recipe_no||r.suggested_recipe_name
         ? <><b>{r.suggested_recipe_no||"—"}</b> · {r.suggested_recipe_name||"CHƯA KHAI BÁO"}</>
         : <span className="muted">—</span>}
       </td>
       <td className="mono">{r.batch_key_template||"—"}</td>
       <td className="mono">{r.batch_no_prefix||"—"}</td>
       <td>{r.is_active?"YES":"NO"}</td>
       <td className="action">
        <div className="row">
         <button className="btn small" onClick={()=>startEdit(r)}>Edit</button>
         <button className="btn danger-btn small" onClick={()=>remove(r)}>Delete</button>
        </div>
       </td>
      </tr>)}
      {!visible.length&&<tr><td colSpan={9} className="muted">Chưa có rule nào. Tạo rule đầu tiên ở phía trên.</td></tr>}
     </tbody>
    </table>
   </div>
  </div>
 </div>
}
