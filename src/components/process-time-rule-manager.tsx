"use client";

import {useMemo,useState} from "react";

type Recipe={
 recipe_key:string;
 process_family:string;
 recipe_group:string;
 recipe_no:string|null;
 recipe_name:string|null;
 batch_key:string;
};
type Rule={
 id:number;
 recipe_key:string;
 process_family:string;
 recipe_group:string;
 recipe_no:string|null;
 recipe_name:string|null;
 calc_type:"FIXED_HOURS"|"QTY_SURFACE";
 priority:number;
 qty_min:number|null;
 qty_max:number|null;
 surface_min_dm2:number|null;
 surface_max_dm2:number|null;
 fixed_hours:number|null;
 standard_hours:number|null;
 note:string|null;
};

export function ProcessTimeRuleManager({
 recipes,rules
}:{recipes:Recipe[];rules:Rule[]}){
 const [busy,setBusy]=useState(false);
 const [family,setFamily]=useState<"PAINT"|"CHEMICAL_LINE">("CHEMICAL_LINE");
 const familyRecipes=useMemo(()=>recipes.filter(x=>x.process_family===family),[recipes,family]);
 const [recipeKey,setRecipeKey]=useState("");
 const [edit,setEdit]=useState<Rule|null>(null);
 const [filter,setFilter]=useState("");
 const [f,setF]=useState({
   priority:"100",
   qty_min:"",
   qty_max:"",
   surface_min_dm2:"",
   surface_max_dm2:"",
   fixed_hours:"",
   standard_hours:"",
   note:""
 });

 const selectedRecipeKey=recipeKey || familyRecipes[0]?.recipe_key || "";
 const calcType=family==="CHEMICAL_LINE"?"FIXED_HOURS":"QTY_SURFACE";

 const visible=useMemo(()=>{
   const q=filter.trim().toUpperCase();
   return rules.filter(x=>{
     if(x.process_family!==family)return false;
     if(!q)return true;
     return (x.recipe_no||"").toUpperCase().includes(q) ||
            (x.recipe_name||"").toUpperCase().includes(q) ||
            x.recipe_group.toUpperCase().includes(q);
   });
 },[rules,family,filter]);

 function clear(){
   setEdit(null);
   setF({
    priority:"100",qty_min:"",qty_max:"",
    surface_min_dm2:"",surface_max_dm2:"",
    fixed_hours:"",standard_hours:"",note:""
   });
 }

 function start(r:Rule){
   setFamily(r.process_family as "PAINT"|"CHEMICAL_LINE");
   setRecipeKey(r.recipe_key);
   setEdit(r);
   setF({
     priority:String(r.priority??100),
     qty_min:r.qty_min==null?"":String(r.qty_min),
     qty_max:r.qty_max==null?"":String(r.qty_max),
     surface_min_dm2:r.surface_min_dm2==null?"":String(r.surface_min_dm2),
     surface_max_dm2:r.surface_max_dm2==null?"":String(r.surface_max_dm2),
     fixed_hours:r.fixed_hours==null?"":String(r.fixed_hours),
     standard_hours:r.standard_hours==null?"":String(r.standard_hours),
     note:r.note||""
   });
   window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"});
 }

 async function save(){
   if(!selectedRecipeKey)return alert("Chọn Recipe.");
   const body={
     ...(edit?{id:edit.id}:{}),
     recipe_key:selectedRecipeKey,
     calc_type:calcType,
     priority:Number(f.priority)||100,
     qty_min:f.qty_min,
     qty_max:f.qty_max,
     surface_min_dm2:f.surface_min_dm2,
     surface_max_dm2:f.surface_max_dm2,
     fixed_hours:f.fixed_hours,
     standard_hours:f.standard_hours,
     note:f.note
   };

   setBusy(true);
   try{
     const r=await fetch("/api/process-recipe/time-rule",{
       method:edit?"PATCH":"POST",
       headers:{"content-type":"application/json"},
       body:JSON.stringify(body)
     });
     const d=await r.json();
     if(!r.ok)throw new Error(d.error||"Save failed");
     location.reload();
   }catch(e){
     alert(e instanceof Error?e.message:String(e));
   }finally{setBusy(false)}
 }

 async function remove(r:Rule){
   if(!confirm(`Deactivate Time Rule của Recipe ${r.recipe_no||r.recipe_name}?`))return;
   setBusy(true);
   try{
     const x=await fetch("/api/process-recipe/time-rule",{
       method:"DELETE",
       headers:{"content-type":"application/json"},
       body:JSON.stringify({id:r.id})
     });
     const d=await x.json();
     if(!x.ok)throw new Error(d.error||"Remove failed");
     location.reload();
   }catch(e){
     alert(e instanceof Error?e.message:String(e));
   }finally{setBusy(false)}
 }

 return <div className="section">
   <div className="erp-table-panel">
    <div className="erp-panel-head">
      <b>Process Time by Recipe</b>
      <span>Chemical Line = Fixed · Paint = Qty + Surface</span>
    </div>

    <div className="time-family-tabs">
      <button
       className={`btn ${family==="CHEMICAL_LINE"?"primary":""}`}
       onClick={()=>{setFamily("CHEMICAL_LINE");setRecipeKey("");clear()}}>
       Chemical Line
      </button>
      <button
       className={`btn ${family==="PAINT"?"primary":""}`}
       onClick={()=>{setFamily("PAINT");setRecipeKey("");clear()}}>
       Paint
      </button>
    </div>

    <div className={`process-time-form ${family==="CHEMICAL_LINE"?"fixed":"paint"}`}>
      <label>
       Recipe
       <select
        className="input"
        value={selectedRecipeKey}
        disabled={!!edit}
        onChange={e=>setRecipeKey(e.target.value)}>
        {familyRecipes.map(r=>
         <option key={r.recipe_key} value={r.recipe_key}>
          {r.recipe_no||"—"} · {r.recipe_name||"CHƯA KHAI BÁO"}
         </option>
        )}
       </select>
      </label>

      <label>
       Calc Type
       <input className="input" value={calcType} disabled/>
      </label>

      <label>
       Priority
       <input className="input" type="number" min="1"
        value={f.priority}
        onChange={e=>setF({...f,priority:e.target.value})}/>
      </label>

      {family==="CHEMICAL_LINE" ? <>
       <label>
        Fixed Hours
        <input className="input" type="number" step="0.01" min="0"
         value={f.fixed_hours}
         onChange={e=>setF({...f,fixed_hours:e.target.value})}/>
       </label>
      </> : <>
       <label>
        Qty Min
        <input className="input" type="number" step="1" min="0"
         value={f.qty_min}
         onChange={e=>setF({...f,qty_min:e.target.value})}/>
       </label>
       <label>
        Qty Max
        <input className="input" type="number" step="1" min="0"
         value={f.qty_max}
         onChange={e=>setF({...f,qty_max:e.target.value})}/>
       </label>
       <label>
        Surface Min (dm²)
        <input className="input" type="number" step="0.01" min="0"
         value={f.surface_min_dm2}
         onChange={e=>setF({...f,surface_min_dm2:e.target.value})}/>
       </label>
       <label>
        Surface Max (dm²)
        <input className="input" type="number" step="0.01" min="0"
         value={f.surface_max_dm2}
         onChange={e=>setF({...f,surface_max_dm2:e.target.value})}/>
       </label>
       <label>
        Standard Hours
        <input className="input" type="number" step="0.01" min="0"
         value={f.standard_hours}
         onChange={e=>setF({...f,standard_hours:e.target.value})}/>
       </label>
      </>}

      <label className="process-time-note">
       Note
       <input className="input"
        value={f.note}
        placeholder="Ghi chú kinh nghiệm / điều kiện"
        onChange={e=>setF({...f,note:e.target.value})}/>
      </label>

      <div className="process-time-actions">
       <button className="btn primary" disabled={busy} onClick={save}>
        {edit?"Save Changes":"Add Time Rule"}
       </button>
       {edit&&<button className="btn" onClick={clear}>Cancel</button>}
      </div>
    </div>
   </div>

   <div className="erp-table-panel section">
    <div className="erp-panel-head">
      <b>{family==="CHEMICAL_LINE"?"Chemical Line Fixed Time":"Paint Qty / Surface Time Rules"}</b>
      <div className="row">
       <span>{visible.length} active rules</span>
       <input
        className="input process-time-filter"
        value={filter}
        placeholder="Filter recipe..."
        onChange={e=>setFilter(e.target.value)}/>
      </div>
    </div>

    <div className="table-wrap">
     <table className="erp-table">
      <thead>
       <tr>
        <th>Recipe No</th>
        <th>Recipe Name</th>
        <th>Calc Type</th>
        <th>Priority</th>
        {family==="PAINT"&&<>
         <th>Qty Min</th><th>Qty Max</th>
         <th>Surface Min</th><th>Surface Max</th>
        </>}
        <th>{family==="CHEMICAL_LINE"?"Fixed Hours":"Standard Hours"}</th>
        <th>Note</th>
        <th></th>
       </tr>
      </thead>
      <tbody>
       {visible.map(r=><tr key={r.id}>
        <td className="mono">{r.recipe_no||"—"}</td>
        <td><b>{r.recipe_name||"CHƯA KHAI BÁO"}</b></td>
        <td>{r.calc_type}</td>
        <td className="num mono">{r.priority}</td>
        {family==="PAINT"&&<>
         <td className="num">{r.qty_min??"—"}</td>
         <td className="num">{r.qty_max??"—"}</td>
         <td className="num">{r.surface_min_dm2??"—"}</td>
         <td className="num">{r.surface_max_dm2??"—"}</td>
        </>}
        <td className="num mono">{family==="CHEMICAL_LINE"?r.fixed_hours??"—":r.standard_hours??"—"}</td>
        <td>{r.note||"—"}</td>
        <td className="action">
         <div className="row">
          <button className="btn small" onClick={()=>start(r)}>Edit</button>
          <button className="btn danger-btn small" onClick={()=>remove(r)}>Deactivate</button>
         </div>
        </td>
       </tr>)}
       {!visible.length&&
        <tr><td colSpan={family==="PAINT"?11:7} className="muted">Chưa có Time Rule.</td></tr>}
      </tbody>
     </table>
    </div>
   </div>
 </div>
}
