"use client";

import {safeJson} from "@/lib/fetch-json";
import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {refreshConfigPage} from "@/lib/config/config-client";

type Recipe={
 recipe_key:string;
 process_family:string;
 recipe_group:string;
 recipe_no:string|null;
 recipe_name:string|null;
 batch_key:string;
 main_operations:string[];
};
type RuleCondition={
 id?:number;
 source_column:string;
 source_value:string;
 condition_order?:number;
};
type Rule={
 id:number;
 recipe_key:string;
 process_family:string;
 recipe_group:string;
 recipe_no:string|null;
 recipe_name:string|null;
 main_operations:string[];
 calc_type:"FIXED_HOURS"|"QTY_SURFACE";
 priority:number;
 qty_min:number|null;
 qty_max:number|null;
 surface_min_dm2:number|null;
 surface_max_dm2:number|null;
 fixed_hours:number|null;
 standard_hours:number|null;
 note:string|null;
 conditions:RuleCondition[];
};
type ColumnOption={source_column:string;value_count:number};
type ValueOption={source_value:string;display_name:string};

function hoursToHhmm(value:unknown){
 const hours=Number(value);
 if(!Number.isFinite(hours)||hours<0)return "";
 const total=Math.round(hours*60);
 return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;
}
function validHhmm(value:string){
 return /^(\d{1,3}):([0-5]\d)$/.test(value.trim());
}
function operationsOf(x:{main_operations?:string[]}){
 return Array.isArray(x.main_operations)?x.main_operations.filter(Boolean):[];
}
function operationText(x:{main_operations?:string[]}){
 const ops=operationsOf(x);
 return ops.length?ops.join(", "):"—";
}
function conditionText(conditions:RuleCondition[]|null|undefined){
 const rows=Array.isArray(conditions)?conditions:[];
 if(!rows.length)return "Mặc định / Không điều kiện";
 return rows.map(x=>`${x.source_column} = ${x.source_value}`).join(" AND ");
}

export function ProcessTimeRuleManager({
 recipes,rules,columns
}:{
 recipes:Recipe[];
 rules:Rule[];
 columns:ColumnOption[];
}){
 const router=useRouter();
 const [busy,setBusy]=useState(false);
 const [calcType,setCalcType]=useState<"FIXED_HOURS"|"QTY_SURFACE">("FIXED_HOURS");
 const [operationFilter,setOperationFilter]=useState("ALL");
 const [familyFilter,setFamilyFilter]=useState("ALL");
 const [recipeKey,setRecipeKey]=useState("");
 const [edit,setEdit]=useState<Rule|null>(null);
 const [filter,setFilter]=useState("");
 const [conditions,setConditions]=useState<RuleCondition[]>([]);
 const [conditionValues,setConditionValues]=useState<Record<string,ValueOption[]>>({});
 const [conditionTruncated,setConditionTruncated]=useState<Record<string,boolean>>({});
 const [conditionLoading,setConditionLoading]=useState<Record<string,boolean>>({});
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

 const operations=useMemo(()=>[...new Set(recipes.flatMap(r=>operationsOf(r)))].sort(),[recipes]);
 const families=useMemo(()=>[...new Set(recipes.map(r=>r.process_family).filter(Boolean))].sort(),[recipes]);
 const familyRecipes=useMemo(()=>recipes.filter(x=>{
   if(operationFilter!=="ALL"&&!operationsOf(x).includes(operationFilter))return false;
   if(familyFilter!=="ALL"&&x.process_family!==familyFilter)return false;
   return true;
 }),[recipes,operationFilter,familyFilter]);

 const selectedRecipeKey=recipeKey || familyRecipes[0]?.recipe_key || "";

 const visible=useMemo(()=>{
   const q=filter.trim().toUpperCase();
   return rules.filter(x=>{
     if(operationFilter!=="ALL"&&!operationsOf(x).includes(operationFilter))return false;
     if(familyFilter!=="ALL"&&x.process_family!==familyFilter)return false;
     if(x.calc_type!==calcType)return false;
     if(!q)return true;
     return (x.recipe_no||"").toUpperCase().includes(q) ||
            (x.recipe_name||"").toUpperCase().includes(q) ||
            x.recipe_group.toUpperCase().includes(q) ||
            operationText(x).toUpperCase().includes(q) ||
            conditionText(x.conditions).toUpperCase().includes(q);
   });
 },[rules,operationFilter,familyFilter,calcType,filter]);

 async function ensureValues(column:string){
   if(!column||conditionValues[column]||conditionLoading[column])return;
   setConditionLoading(x=>({...x,[column]:true}));
   try{
     const r=await fetch(`/api/process-recipe/time-rule/condition-options?column=${encodeURIComponent(column)}&limit=1000`,{cache:"no-store"});
     const d=await safeJson(r);
     if(!r.ok)throw new Error(d.error||"Không tải được giá trị Open Job.");
     setConditionValues(x=>({...x,[column]:Array.isArray(d.rows)?d.rows:[]}));
     setConditionTruncated(x=>({...x,[column]:Boolean(d.truncated)}));
   }catch(e){
     alert(e instanceof Error?e.message:String(e));
   }finally{
     setConditionLoading(x=>({...x,[column]:false}));
   }
 }

 function clear(){
   setEdit(null);
   setConditions([]);
   setF({
    priority:"100",qty_min:"",qty_max:"",
    surface_min_dm2:"",surface_max_dm2:"",
    fixed_hours:"",standard_hours:"",note:""
   });
 }

 function switchType(type:"FIXED_HOURS"|"QTY_SURFACE"){
   setCalcType(type);
   setRecipeKey("");
   clear();
 }

 function start(r:Rule){
   setRecipeKey(r.recipe_key);
   setEdit(r);
   setCalcType(r.calc_type);
   const firstOp=operationsOf(r)[0];
   if(firstOp)setOperationFilter(firstOp);
   setFamilyFilter(r.process_family||"ALL");
   const conds=(Array.isArray(r.conditions)?r.conditions:[]).map(x=>({
    id:x.id,
    source_column:x.source_column,
    source_value:x.source_value,
    condition_order:x.condition_order
   }));
   setConditions(conds);
   conds.forEach(x=>{if(x.source_column)void ensureValues(x.source_column)});
   setF({
     priority:String(r.priority??100),
     qty_min:r.qty_min==null?"":String(r.qty_min),
     qty_max:r.qty_max==null?"":String(r.qty_max),
     surface_min_dm2:r.surface_min_dm2==null?"":String(r.surface_min_dm2),
     surface_max_dm2:r.surface_max_dm2==null?"":String(r.surface_max_dm2),
     fixed_hours:hoursToHhmm(r.fixed_hours),
     standard_hours:hoursToHhmm(r.standard_hours),
     note:r.note||""
   });
   window.scrollTo({top:0,behavior:"smooth"});
 }

 function addCondition(){
   if(conditions.length>=8)return alert("Mỗi rule được tối đa 8 cột điều kiện.");
   setConditions(x=>[...x,{source_column:"",source_value:""}]);
 }

 function removeCondition(index:number){
   setConditions(x=>x.filter((_,i)=>i!==index));
 }

 function changeConditionColumn(index:number,column:string){
   setConditions(x=>x.map((row,i)=>i===index?{...row,source_column:column,source_value:""}:row));
   if(column)void ensureValues(column);
 }

 function changeConditionValue(index:number,value:string){
   setConditions(x=>x.map((row,i)=>i===index?{...row,source_value:value}:row));
 }

 async function save(){
   if(!selectedRecipeKey)return alert("Chọn Recipe.");
   const timeValue=calcType==="FIXED_HOURS"?f.fixed_hours:f.standard_hours;
   if(!validHhmm(timeValue))return alert("Thời gian phải nhập theo HH:MM, ví dụ 07:30.");
   if(conditions.some(x=>!x.source_column||!x.source_value))
     return alert("Điều kiện Open Job phải chọn đủ Cột và Giá trị, hoặc xóa dòng điều kiện chưa dùng.");
   const cols=conditions.map(x=>x.source_column.toUpperCase());
   if(new Set(cols).size!==cols.length)
     return alert("Không được chọn lặp cùng một cột trong một Time Rule.");

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
     note:f.note,
     conditions:conditions.map((x,i)=>({
      source_column:x.source_column,
      source_value:x.source_value,
      condition_order:i+1
     }))
   };

   setBusy(true);
   try{
     const r=await fetch("/api/process-recipe/time-rule",{
       method:edit?"PATCH":"POST",
       headers:{"content-type":"application/json"},
       body:JSON.stringify(body)
     });
     const d=await safeJson(r);
     if(!r.ok)throw new Error(d.error||"Save failed");
     clear();
     refreshConfigPage(router);
   }catch(e){
     alert(e instanceof Error?e.message:String(e));
   }finally{setBusy(false)}
 }

 async function remove(r:Rule){
   if(!confirm(`Ngưng Time Rule của Recipe ${r.recipe_no||r.recipe_name}?`))return;
   setBusy(true);
   try{
     const x=await fetch("/api/process-recipe/time-rule",{
       method:"DELETE",
       headers:{"content-type":"application/json"},
       body:JSON.stringify({id:r.id})
     });
     const d=await safeJson(x);
     if(!x.ok)throw new Error(d.error||"Remove failed");
     clear();
     refreshConfigPage(router);
   }catch(e){
     alert(e instanceof Error?e.message:String(e));
   }finally{setBusy(false)}
 }

 return <div className="section">
   <div className="erp-table-panel">
    <div className="erp-panel-head">
      <b>Thời gian xử lý (Process)</b>
      <span>Main Operation → Recipe → Rule · Có thể thêm nhiều cột điều kiện All Open Job · điều kiện dùng AND · thời gian HH:MM</span>
    </div>

    <div className="time-family-tabs">
      <button className={`btn ${calcType==="FIXED_HOURS"?"primary":""}`} onClick={()=>switchType("FIXED_HOURS")}>
       Cố định
      </button>
      <button className={`btn ${calcType==="QTY_SURFACE"?"primary":""}`} onClick={()=>switchType("QTY_SURFACE")}>
       Theo Qty + Surface
      </button>
      <select className="input" value={operationFilter} onChange={e=>{setOperationFilter(e.target.value);setRecipeKey("");clear()}}>
       <option value="ALL">Tất cả Main Operation</option>
       {operations.map(op=><option key={op} value={op}>{op}</option>)}
      </select>
      <select className="input" value={familyFilter} onChange={e=>{setFamilyFilter(e.target.value);setRecipeKey("");clear()}}>
       <option value="ALL">Tất cả Process Family</option>
       {families.map(fm=><option key={fm} value={fm}>{fm}</option>)}
      </select>
    </div>

    <div className={`process-time-form ${calcType==="FIXED_HOURS"?"fixed":"paint"}`}>
      <label>
       Recipe
       <select className="input" value={selectedRecipeKey} disabled={!!edit} onChange={e=>setRecipeKey(e.target.value)}>
        {familyRecipes.map(r=><option key={r.recipe_key} value={r.recipe_key}>
          [{operationText(r)}] {r.recipe_no||"—"} · {r.recipe_name||"CHƯA KHAI BÁO"}
        </option>)}
       </select>
      </label>

      <label>
       Kiểu tính
       <input className="input" value={calcType==="FIXED_HOURS"?"Cố định":"Qty + Surface"} disabled/>
      </label>

      <label>
       Priority
       <input className="input" type="number" min="1" value={f.priority} onChange={e=>setF({...f,priority:e.target.value})}/>
      </label>

      {calcType==="FIXED_HOURS" ? <label>
        Process Time (HH:MM)
        <input className="input mono" inputMode="numeric" placeholder="07:30" value={f.fixed_hours} onChange={e=>setF({...f,fixed_hours:e.target.value})}/>
       </label> : <>
       <label>Qty Min<input className="input" type="number" step="1" min="0" value={f.qty_min} onChange={e=>setF({...f,qty_min:e.target.value})}/></label>
       <label>Qty Max<input className="input" type="number" step="1" min="0" value={f.qty_max} onChange={e=>setF({...f,qty_max:e.target.value})}/></label>
       <label>Surface Min (dm²)<input className="input" type="number" step="0.01" min="0" value={f.surface_min_dm2} onChange={e=>setF({...f,surface_min_dm2:e.target.value})}/></label>
       <label>Surface Max (dm²)<input className="input" type="number" step="0.01" min="0" value={f.surface_max_dm2} onChange={e=>setF({...f,surface_max_dm2:e.target.value})}/></label>
       <label>
        Process Time (HH:MM)
        <input className="input mono" inputMode="numeric" placeholder="07:30" value={f.standard_hours} onChange={e=>setF({...f,standard_hours:e.target.value})}/>
       </label>
      </>}

      <label className="process-time-note">
       Note
       <input className="input" value={f.note} placeholder="Ghi chú" onChange={e=>setF({...f,note:e.target.value})}/>
      </label>

      <div className="process-time-actions">
       <button className="btn primary" disabled={busy||!selectedRecipeKey} onClick={save}>
        {edit?"Lưu thay đổi":"Thêm rule thời gian"}
       </button>
       {edit&&<button className="btn" onClick={clear}>Hủy</button>}
      </div>

      <div className="process-condition-editor">
       <div className="process-condition-head">
        <div>
         <b>Điều kiện theo All Open Job <span className="muted">(tùy chọn)</span></b>
         <div className="muted">Không thêm điều kiện = rule mặc định/fallback. Nhiều cột = AND. Rule match nhiều điều kiện hơn được ưu tiên trước Priority.</div>
        </div>
        <button type="button" className="btn small" onClick={addCondition}>+ Thêm cột điều kiện</button>
       </div>

       {conditions.map((cond,index)=>{
        const values=conditionValues[cond.source_column]||[];
        const hasCurrent=values.some(x=>x.source_value===cond.source_value);
        return <div className="process-condition-row" key={`${index}-${cond.source_column}`}>
         <label>
          Cột Open Job {index+1}
          <select className="input" value={cond.source_column} onChange={e=>changeConditionColumn(index,e.target.value)}>
           <option value="">-- Chọn cột --</option>
           {columns.map(c=>{
            const selectedElsewhere=conditions.some((x,i)=>i!==index&&x.source_column===c.source_column);
            return <option key={c.source_column} value={c.source_column} disabled={selectedElsewhere}>
             {c.source_column} ({c.value_count})
            </option>
           })}
          </select>
         </label>

         <label>
          Giá trị unique
          <select
           className="input"
           value={cond.source_value}
           disabled={!cond.source_column||Boolean(conditionLoading[cond.source_column])}
           onChange={e=>changeConditionValue(index,e.target.value)}
          >
           <option value="">{conditionLoading[cond.source_column]?"Đang tải...":"-- Chọn giá trị --"}</option>
           {cond.source_value&&!hasCurrent&&<option value={cond.source_value}>{cond.source_value}</option>}
           {values.map(v=><option key={v.source_value} value={v.source_value}>
            {v.display_name===v.source_value?v.source_value:`${v.display_name} · ${v.source_value}`}
           </option>)}
          </select>
          {conditionTruncated[cond.source_column]&&<span className="process-condition-warning">Hiển thị 1000 giá trị đầu tiên của cột này.</span>}
         </label>

         <button type="button" className="btn danger-btn small process-condition-remove" onClick={()=>removeCondition(index)}>Xóa</button>
        </div>
       })}

       {!conditions.length&&<div className="process-condition-empty">Rule này đang áp dụng cho mọi Job của Recipe nếu không có rule điều kiện cụ thể hơn match.</div>}
      </div>
    </div>
   </div>

   <div className="erp-table-panel section">
    <div className="erp-panel-head">
      <b>Time Rules · {calcType==="FIXED_HOURS"?"Cố định":"Qty + Surface"}</b>
      <div className="row">
       <span>{visible.length} active rules</span>
       <input className="input process-time-filter" value={filter} placeholder="Tìm operation / recipe / điều kiện..." onChange={e=>setFilter(e.target.value)}/>
      </div>
    </div>

    <div className="table-wrap">
     <table className="erp-table">
      <thead><tr>
        <th>Main Operation</th>
        <th>Process Family</th>
        <th>Recipe No.</th>
        <th>Recipe Name</th>
        <th>Điều kiện Open Job</th>
        <th>Ưu tiên</th>
        {calcType==="QTY_SURFACE"&&<><th>Qty Min</th><th>Qty Max</th><th>dm² Min</th><th>dm² Max</th></>}
        <th>Process</th>
        <th>Ghi chú</th>
        <th></th>
      </tr></thead>
      <tbody>
       {visible.map(r=><tr key={r.id}>
        <td><b>{operationText(r)}</b></td>
        <td>{r.process_family}</td>
        <td className="mono">{r.recipe_no||"—"}</td>
        <td><b>{r.recipe_name||"CHƯA KHAI BÁO"}</b></td>
        <td className="process-condition-cell">{conditionText(r.conditions)}</td>
        <td className="num mono">{r.priority}</td>
        {calcType==="QTY_SURFACE"&&<>
         <td className="num">{r.qty_min??"—"}</td><td className="num">{r.qty_max??"—"}</td>
         <td className="num">{r.surface_min_dm2??"—"}</td><td className="num">{r.surface_max_dm2??"—"}</td>
        </>}
        <td className="num mono"><b>{hoursToHhmm(calcType==="FIXED_HOURS"?r.fixed_hours:r.standard_hours)||"—"}</b></td>
        <td>{r.note||"—"}</td>
        <td className="action"><div className="row">
          <button className="btn small" onClick={()=>start(r)}>Sửa</button>
          <button className="btn danger-btn small" onClick={()=>remove(r)}>Ngưng</button>
        </div></td>
       </tr>)}
       {!visible.length&&<tr><td colSpan={calcType==="QTY_SURFACE"?13:9} className="muted">Chưa có Time Rule phù hợp bộ lọc.</td></tr>}
      </tbody>
     </table>
    </div>
   </div>
 </div>
}
