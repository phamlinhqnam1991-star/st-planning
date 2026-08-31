"use client";

import {useMemo,useState} from "react";

type Operation={operation_code:string;operation_name:string|null};
type Recipe={
 recipe_key:string;
 recipe_no:string|null;
 recipe_name:string|null;
 process_family:string;
 recipe_group:string;
 batch_key:string;
};
type Mapping={
 operation_code:string;
 operation_name:string|null;
 recipe_key:string;
 recipe_no:string|null;
 recipe_name:string|null;
 batch_key:string;
 priority:number;
 selection_rule:string|null;
 is_default:boolean;
 note:string|null;
};

export function ChemicalRecipeMappingManager({
 operations,recipes,mappings
}:{
 operations:Operation[];
 recipes:Recipe[];
 mappings:Mapping[];
}){
 const [busy,setBusy]=useState(false);
 const [operationCode,setOperationCode]=useState("");
 const [recipeKey,setRecipeKey]=useState(recipes[0]?.recipe_key||"");
 const [priority,setPriority]=useState("100");
 const [selectionRule,setSelectionRule]=useState("");
 const [isDefault,setIsDefault]=useState(false);
 const [note,setNote]=useState("");
 const [filter,setFilter]=useState("");

 const visible=useMemo(()=>{
   const q=filter.trim().toUpperCase();
   if(!q)return mappings;
   return mappings.filter(x=>
     x.operation_code.toUpperCase().includes(q) ||
     (x.operation_name||"").toUpperCase().includes(q) ||
     (x.recipe_no||"").toUpperCase().includes(q) ||
     (x.recipe_name||"").toUpperCase().includes(q) ||
     (x.selection_rule||"").toUpperCase().includes(q)
   );
 },[mappings,filter]);

 async function save(){
   if(!operationCode.trim())return alert("Chọn Operation Code.");
   if(!recipeKey)return alert("Chọn Chemical Line Recipe.");
   setBusy(true);
   try{
     const r=await fetch("/api/process-recipe/operation-code-map",{
       method:"POST",
       headers:{"content-type":"application/json"},
       body:JSON.stringify({
         operation_code:operationCode.trim(),
         recipe_key:recipeKey,
         priority:Number(priority)||100,
         selection_rule:selectionRule,
         is_default:isDefault,
         note
       })
     });
     const d=await r.json();
     if(!r.ok)throw new Error(d.error||"Save failed");
     location.reload();
   }catch(e){
     alert(e instanceof Error?e.message:String(e));
   }finally{
     setBusy(false);
   }
 }

 async function remove(row:Mapping){
   if(!confirm(`Bỏ Recipe ${row.recipe_no||row.recipe_name} khỏi Operation Code ${row.operation_code}?`))return;
   setBusy(true);
   try{
     const r=await fetch("/api/process-recipe/operation-code-map",{
       method:"DELETE",
       headers:{"content-type":"application/json"},
       body:JSON.stringify({
         operation_code:row.operation_code,
         recipe_key:row.recipe_key
       })
     });
     const d=await r.json();
     if(!r.ok)throw new Error(d.error||"Remove failed");
     location.reload();
   }catch(e){
     alert(e instanceof Error?e.message:String(e));
   }finally{
     setBusy(false);
   }
 }

 function edit(row:Mapping){
   setOperationCode(row.operation_code);
   setRecipeKey(row.recipe_key);
   setPriority(String(row.priority??100));
   setSelectionRule(row.selection_rule||"");
   setIsDefault(Boolean(row.is_default));
   setNote(row.note||"");
   window.scrollTo({top:0,behavior:"smooth"});
 }

 return <div className="section">
   <div className="erp-table-panel">
     <div className="erp-panel-head">
       <b>Chemical Line · Operation Code → Multiple Recipes</b>
       <span>1 Operation Code có thể gán nhiều Recipe</span>
     </div>

     <div className="chemical-multi-map-form">
       <label>
         Operation Code
         <input
           className="input"
           list="chemical-operation-list"
           value={operationCode}
           placeholder="Nhập/chọn Operation Code..."
           onChange={e=>setOperationCode(e.target.value)}
         />
         <datalist id="chemical-operation-list">
           {operations.map(o=>
             <option key={o.operation_code} value={o.operation_code}>
               {o.operation_name||o.operation_code}
             </option>
           )}
         </datalist>
       </label>

       <label>
         Recipe No / Recipe Name
         <select
           className="input"
           value={recipeKey}
           onChange={e=>setRecipeKey(e.target.value)}
         >
           {recipes.map(r=>
             <option key={r.recipe_key} value={r.recipe_key}>
               {r.recipe_no||"—"} · {r.recipe_name||"CHƯA KHAI BÁO"}
             </option>
           )}
         </select>
       </label>

       <label>
         Priority
         <input
           className="input"
           type="number"
           min="1"
           value={priority}
           onChange={e=>setPriority(e.target.value)}
         />
       </label>

       <label>
         Selection Rule
         <input
           className="input"
           value={selectionRule}
           placeholder="Để trống; dùng cho Auto Select sau này"
           onChange={e=>setSelectionRule(e.target.value)}
         />
       </label>

       <label>
         Note
         <input
           className="input"
           value={note}
           placeholder="Optional"
           onChange={e=>setNote(e.target.value)}
         />
       </label>

       <label className="chemical-default-check">
         <input
           type="checkbox"
           checked={isDefault}
           onChange={e=>setIsDefault(e.target.checked)}
         />
         Default Recipe
       </label>

       <button className="btn primary" disabled={busy} onClick={save}>
         Add / Save Recipe
       </button>
     </div>
   </div>

   <div className="erp-table-panel section">
     <div className="erp-panel-head">
       <b>Chemical Line Operation Recipe Mapping</b>
       <div className="row">
         <span>{visible.length} active mappings</span>
         <input
           className="input chemical-map-filter"
           value={filter}
           placeholder="Filter..."
           onChange={e=>setFilter(e.target.value)}
         />
       </div>
     </div>

     <div className="table-wrap">
       <table className="erp-table">
         <thead>
           <tr>
             <th>Operation Code</th>
             <th>Operation Name</th>
             <th>Recipe No</th>
             <th>Recipe Name</th>
             <th>Priority</th>
             <th>Default</th>
             <th>Selection Rule</th>
             <th>Batch Key</th>
             <th>Note</th>
             <th></th>
           </tr>
         </thead>
         <tbody>
           {visible.map(x=>
             <tr key={`${x.operation_code}|${x.recipe_key}`}>
               <td><b>{x.operation_code}</b></td>
               <td>{x.operation_name||"—"}</td>
               <td className="mono">{x.recipe_no||"—"}</td>
               <td>{x.recipe_name||"CHƯA KHAI BÁO"}</td>
               <td className="num mono">{x.priority??100}</td>
               <td>{x.is_default?"YES":"—"}</td>
               <td>{x.selection_rule||"—"}</td>
               <td className="mono">{x.batch_key}</td>
               <td>{x.note||"—"}</td>
               <td className="action">
                 <div className="row">
                   <button className="btn small" onClick={()=>edit(x)}>Edit</button>
                   <button className="btn danger-btn small" onClick={()=>remove(x)}>Remove</button>
                 </div>
               </td>
             </tr>
           )}
           {!visible.length&&
             <tr><td colSpan={10} className="muted">Chưa gán Recipe cho Operation Code.</td></tr>
           }
         </tbody>
       </table>
     </div>
   </div>
 </div>
}
