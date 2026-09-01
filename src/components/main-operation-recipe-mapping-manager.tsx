"use client";

import {safeJson} from "@/lib/fetch-json";
import {useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {refreshConfigPage} from "@/lib/config/config-client";
import {parseSelectionRule} from "@/lib/batch-key-recipe";

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
 mapping_id:number;
 operation_code:string;
 standard_operation:string|null;
 operation_name:string|null;
 recipe_key:string;
 recipe_no:string|null;
 recipe_name:string|null;
 process_family:string|null;
 recipe_group:string|null;
 batch_key:string;
 priority:number;
 selection_rule:string|null;
 is_default:boolean;
 note:string|null;
 updated_at:string|null;
 batch_key_template:string|null;
 batch_no_prefix:string|null;
};
type Cond={column:string;operator:string;value:string};

const OPERATORS=[
 {value:"equals",label:"="},
 {value:"contains",label:"chứa"},
 {value:"starts_with",label:"bắt đầu bằng"},
 {value:"ends_with",label:"kết thúc bằng"},
 {value:"not_empty",label:"có giá trị"},
 {value:"is_empty",label:"trống / rỗng"}
];

const MD_LABELS:Record<string,string>={
 "MD:ALLOY":"Alloy","MD:TEMPER":"Temper","MD:TSA":"TSA","MD:CHEMCONV_AIRBUS":"Chemical Conv Airbus",
 "MD:PRIMER1":"Primer 1","MD:PRIMER2":"Primer 2","MD:PRIMER3":"Primer 3",
 "MD:TOPCOAT1":"Top Coat 1","MD:TOPCOAT2":"Top Coat 2","MD:ANTIABRASION":"Anti Abrasion",
 "MD:PRIMER1_NAME":"Tên Primer 1","MD:TOPCOAT_NAME":"Tên Top Coat","MD:ANTIABRASION_NAME":"Tên Anti Abrasion",
 "MD:VARINISH_NAME":"Tên Varnish","MD:PROGRAM":"Program","MD:PART_CLUSTER":"Part Cluster",
 "MD:PART_DESCRIPTION":"Part Description","MD:SURFACE_DM2":"Surface dm²"
};
const mdLabel=(key:string)=>MD_LABELS[key]||(key.startsWith("MD:REQ:")?`Req: ${key.slice(7)}`:(key.startsWith("MD:")?key.slice(3)+" (Master)":key));

const ruleLabel=(selectionRule:string|null)=>{
 const conds=parseSelectionRule(selectionRule);
 if(!conds.length)return "—";
 return conds.map(c=>{
   const op=OPERATORS.find(o=>o.value===c.operator)?.label||c.operator;
   const col=mdLabel(c.source_column);
   return (c.operator==="not_empty"||c.operator==="is_empty")
     ? `${col} ${op}`
     : `${col} ${op} ${c.source_value||""}`;
 }).join(" · ");
};

// v272/v274: tách "Áp dụng cho" thành 2 cột — "Cột điều kiện" (tên cột) và
// "Giá trị điều kiện" (toán tử + giá trị), đánh số để ghép cặp từng dòng.
const renderConditionColumns=(selectionRule:string|null)=>{
 const conds=parseSelectionRule(selectionRule);
 if(!conds.length){
  // v275: chưa đặt điều kiện → cột "Cột điều kiện" để trống, cột "Giá trị điều kiện"
  // hiện "Không lọc (Mọi Job)" — áp dụng cho tất cả Job của công đoạn này.
  return {
   col:<span className="muted">—</span>,
   val:<span className="badge b-ready" title="Không có điều kiện — recipe dùng cho MỌI Job của công đoạn này">Không lọc (Mọi Job)</span>
  };
 }
 const opLabel=(op:string)=>OPERATORS.find(o=>o.value===op)?.label||op;
 const colCell=<div className="recipe-apply-list">
  {conds.map((c,i)=><div key={i} className="recipe-apply-line"><b>{i+1}.</b> <span>{mdLabel(c.source_column)}</span></div>)}
 </div>;
 const valCell=<div className="recipe-apply-list">
  {conds.map((c,i)=>{
   const op=opLabel(c.operator);
   const val=(c.operator==="not_empty"||c.operator==="is_empty")?op:`${op} ${c.source_value||""}`;
   return <div key={i} className="recipe-apply-line"><span className="mono">{val}</span></div>;
  })}
 </div>;
 return {col:colCell,val:valCell};
};

// Main Operation → Recipe Mapping (md_main_operation_recipe).
// Mở rộng từ "Chemical Line only" sang mọi Operation Code / Main Operation.
export function MainOperationRecipeMappingManager({
 operations,mainOperations,recipes,mappings,sourceColumns,columnValues,masterColumns,masterValues,timeRules,unmapped
}:{
 operations:Operation[];
 mainOperations:string[];
 recipes:Recipe[];
 mappings:Mapping[];
 sourceColumns:string[];
 columnValues:{column:string;value:string}[];
 masterColumns:{key:string;label:string}[];
 masterValues:{column:string;value:string}[];
 timeRules:{recipe_key:string;calc_type:string;priority:number;fixed_hours:number|null;standard_hours:number|null}[];
 unmapped:{operation_code:string;operation_name:string|null}[];
}){
 const router=useRouter();
 // v270: tóm tắt thời gian Process theo Recipe (ưu tiên FIXED_HOURS, kế QTY_SURFACE).
 const timeByRecipe=useMemo(()=>{
   const map=new Map<string,string>();
   const sorted=[...timeRules].sort((a,b)=>a.priority-b.priority);
   for(const t of sorted){
     if(map.has(t.recipe_key))continue;
     if(t.calc_type==="FIXED_HOURS"&&t.fixed_hours!=null){
       const h=Math.floor(t.fixed_hours),m=Math.round((t.fixed_hours-h)*60);
       map.set(t.recipe_key,`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")} cố định`);
     }else if(t.calc_type==="QTY_SURFACE"){
       map.set(t.recipe_key,"Theo SL / DT");
     }
   }
   return map;
 },[timeRules]);

 // v341: giá trị MD:REQ:* lazy-load (chỉ khi người dùng chọn cột MD:REQ trong
 // builder điều kiện) — tránh tải 2.1M rows của md_process_requirement khi mở trang.
 const [reqValues,setReqValues]=useState<Record<string,string[]>>({});
 const [reqLoading,setReqLoading]=useState<Record<string,boolean>>({});

 const valuesByColumn=useMemo(()=>{
   const map=new Map<string,string[]>();
   for(const v of [...columnValues,...masterValues]){
     if(v==null||v.value==null||!String(v.value).trim())continue; // giá trị trống xử lý bằng toán tử "trống / rỗng"
     const arr=map.get(v.column)||[];
     if(!arr.includes(v.value))arr.push(v.value);
     map.set(v.column,arr);
   }
   // v341: giá trị MD:REQ:* được lazy-load (chỉ khi người dùng chọn cột đó) —
   // không tải toàn bộ md_process_requirement (2.1M rows) khi mở trang.
   for(const [col,vals] of Object.entries(reqValues)){
     if(!vals.length)continue;
     const arr=map.get(col)||[];
     for(const v of vals){if(!arr.includes(v))arr.push(v);}
     map.set(col,arr);
   }
   for(const arr of map.values())arr.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"}));
   return map;
 },[columnValues,masterValues,reqValues]);
 const [busy,setBusy]=useState(false);
 const [editingMappingId,setEditingMappingId]=useState<number|null>(null);
 const [operationCode,setOperationCode]=useState("");
 const [standardOperation,setStandardOperation]=useState("");
 const [recipeKey,setRecipeKey]=useState(recipes[0]?.recipe_key||"");
 const [priority,setPriority]=useState("100");
 const [conditions,setConditions]=useState<Cond[]>([{column:"",operator:"equals",value:""}]);
 const [isDefault,setIsDefault]=useState(false);
 const [note,setNote]=useState("");
 const [batchKeyTemplate,setBatchKeyTemplate]=useState("");
 const [batchNoPrefix,setBatchNoPrefix]=useState("");
 const [filter,setFilter]=useState("");
 const conditionColumnsKey=conditions.map(c=>c.column).join("|");
 useEffect(()=>{
  for(const cond of conditions){
   if(!cond.column.startsWith("MD:REQ:"))continue;
   const code=cond.column.slice("MD:REQ:".length);
   if(!code||reqValues[cond.column]||reqLoading[cond.column])continue;
   setReqLoading(prev=>({...prev,[cond.column]:true}));
   (async()=>{
    try{
     const r=await fetch(`/api/config/recipe-condition-values?column=${encodeURIComponent(cond.column)}`,{cache:"no-store"});
     const d=await r.json().catch(()=>({}));
     if(Array.isArray(d.values))setReqValues(prev=>({...prev,[cond.column]:d.values as string[]}));
    }catch{/* graceful — người dùng vẫn có thể gõ tay */}
    finally{setReqLoading(prev=>({...prev,[cond.column]:false}));}
   })();
  }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[conditionColumnsKey]);

 const visible=useMemo(()=>{
   const q=filter.trim().toUpperCase();
   if(!q)return mappings;
   return mappings.filter(x=>
     x.operation_code.toUpperCase().includes(q) ||
     (x.standard_operation||"").toUpperCase().includes(q) ||
     (x.operation_name||"").toUpperCase().includes(q) ||
     (x.recipe_no||"").toUpperCase().includes(q) ||
     (x.recipe_name||"").toUpperCase().includes(q) ||
     (x.selection_rule||"").toUpperCase().includes(q)
   );
 },[mappings,filter]);

 // v263: recipe "đang thắng" của mỗi Operation Code — đúng thứ tự engine dùng:
 // priority nhỏ nhất → is_default → updated_at cũ nhất → recipe_no.
 const winners=useMemo(()=>{
   const byOp=new Map<string,Mapping[]>();
   for(const m of mappings){
     const k=m.operation_code;
     byOp.set(k,(byOp.get(k)||[]).concat(m));
   }
   const out=new Map<string,number>();
   for(const [k,list] of byOp){
     const sorted=[...list].sort((a,b)=>{
       const pa=a.priority??100,pb=b.priority??100;
       if(pa!==pb)return pa-pb;
       const da=a.is_default?1:0,db=b.is_default?1:0;
       if(da!==db)return db-da;
       const ua=String(a.updated_at??""),ub=String(b.updated_at??"");
       if(ua!==ub)return ua<ub?-1:1;
       return String(a.recipe_no||"").localeCompare(String(b.recipe_no||""));
     });
     out.set(k,Number(sorted[0].mapping_id));
   }
   return out;
 },[mappings]);

 async function save(){
   if(!operationCode.trim())return alert("Chọn Operation Code.");
   if(!recipeKey)return alert("Chọn Recipe.");
   // v277: LƯU ĐÚNG format chuẩn source_column/operator/source_value —
   // trước đây ghi {column,value} → parseSelectionRule/engine không đọc được,
   // điều kiện "biến mất" sau khi lưu (báo lỗi "không lưu khi add/save recipe").
   const conds=conditions
     .map(c=>({
       source_column:c.column.trim(),
       operator:c.operator,
       source_value:(c.operator==="not_empty"||c.operator==="is_empty")?null:c.value.trim()
     }))
     .filter(c=>c.source_column);
   setBusy(true);
   try{
     const r=await fetch("/api/process-recipe/operation-code-map",{
       method:"POST",
       headers:{"content-type":"application/json"},
       body:JSON.stringify({
         mapping_id:editingMappingId,
         operation_code:operationCode.trim(),
         standard_operation:standardOperation||null,
         recipe_key:recipeKey,
         priority:Number(priority)||100,
         selection_rule:conds.length?JSON.stringify(conds):null,
         is_default:isDefault,
         note,
         batch_key_template:batchKeyTemplate.trim()||null,
         batch_no_prefix:batchNoPrefix.trim()||null
       })
     });
     const d=await safeJson(r);
     if(!r.ok)throw new Error(d.error||"Save failed");
     refreshConfigPage(router);
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
         mapping_id:row.mapping_id,
         operation_code:row.operation_code,
         recipe_key:row.recipe_key
       })
     });
     const d=await safeJson(r);
     if(!r.ok)throw new Error(d.error||"Remove failed");
     refreshConfigPage(router);
   }catch(e){
     alert(e instanceof Error?e.message:String(e));
   }finally{
     setBusy(false);
   }
 }

 function edit(row:Mapping){
   setEditingMappingId(Number(row.mapping_id));
   setOperationCode(row.operation_code);
   setStandardOperation(row.standard_operation||"");
   setRecipeKey(row.recipe_key);
   setPriority(String(row.priority??100));
   const conds=parseSelectionRule(row.selection_rule);
   setConditions(conds.length
     ? conds.map(c=>({column:c.source_column,operator:c.operator,value:c.source_value||""}))
     : [{column:"",operator:"equals",value:""}]);
   setIsDefault(Boolean(row.is_default));
   setNote(row.note||"");
   setBatchKeyTemplate(row.batch_key_template||"");
   setBatchNoPrefix(row.batch_no_prefix||"");
   window.scrollTo({top:0,behavior:"smooth"});
 }

 function newRule(keepCurrent=true){
   setEditingMappingId(null);
   if(!keepCurrent){
     setOperationCode("");
     setStandardOperation("");
     setRecipeKey(recipes[0]?.recipe_key||"");
   }
   setPriority("100");
   setConditions([{column:"",operator:"equals",value:""}]);
   setIsDefault(false);
   setNote("");
   setBatchKeyTemplate("");
   setBatchNoPrefix("");
   window.scrollTo({top:0,behavior:"smooth"});
 }

 const updateCondition=(i:number,key:keyof Cond,value:string)=>{
   setConditions(prev=>prev.map((c,idx)=>idx===i?{...c,[key]:value}:c));
 };
 const addCondition=()=>{
   setConditions(prev=>prev.length>=8?prev:[...prev,{column:"",operator:"equals",value:""}]);
 };
 const removeCondition=(i:number)=>{
   setConditions(prev=>prev.filter((_,idx)=>idx!==i));
 };

 return <div className="section">
   <div className="erp-table-panel">
     <div className="erp-panel-head">
       <b>Main Operation · Operation Code → Recipe</b>
       <span>1 Operation Code có thể gán nhiều Recipe — áp dụng cho MỌI công đoạn</span>
     </div>

     <div className="chemical-multi-map-note">
      Hệ thống TỰ CHỌN Recipe khi chọn Job vào lô theo thứ tự: <b>điều kiện khớp Job → Priority (số nhỏ trước) → Mặc định → cập nhật trước</b>. Không có điều kiện là fallback cho mọi Job. Cột <b>✓ Tự chọn</b> thể hiện thứ tự mặc định của Operation Code; Recipe thực tế vẫn phụ thuộc điều kiện của từng Job.
     </div>

     <div className="chemical-multi-map-note">
      <b>v352 · Nhiều Rule cùng Recipe:</b> mỗi dòng là một <b>Recipe Rule</b> độc lập có <span className="mono">mapping_id</span> riêng. Cùng Operation Code + cùng Recipe vẫn có thể thêm nhiều dòng nếu bộ điều kiện khác nhau. Bấm <b>Sửa</b> chỉ cập nhật đúng Rule đó; bấm <b>+ Rule mới cùng Recipe</b> để tạo thêm rule mà không ghi đè.
     </div>

     <div className="chemical-multi-map-form">
       <label>
         Operation Code
         <input
           className="input"
           list="main-op-operation-list"
           value={operationCode}
           placeholder="Nhập/chọn Operation Code..."
           onChange={e=>setOperationCode(e.target.value)}
         />
         <datalist id="main-op-operation-list">
           {operations.map(o=>
             <option key={o.operation_code} value={o.operation_code}>
               {o.operation_name||o.operation_code}
             </option>
           )}
         </datalist>
       </label>

       <label>
         Standard Operation (Main — tùy chọn)
         <select
           className="input"
           value={standardOperation}
           onChange={e=>setStandardOperation(e.target.value)}
         >
           <option value="">(Không giới hạn)</option>
           {mainOperations.map(op=>
             <option key={op} value={op}>{op}</option>
           )}
         </select>
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
               [{r.process_family}] {r.recipe_no||"—"} · {r.recipe_name||"CHƯA KHAI BÁO"}
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

       <div className="chemical-conditions">
        <div className="chemical-conditions-title">
         <b>Áp dụng cho Job (tùy chọn)</b>
         <span>Để trống = áp dụng cho MỌI Job của công đoạn này. Khớp điều kiện → recipe này được ưu tiên chọn cho đúng Job đó.</span>
        </div>
        {conditions.map((c,i)=>(
         <div className="chemical-condition-row" key={i}>
          <select
           className="input"
           value={c.column}
           onChange={e=>updateCondition(i,"column",e.target.value)}
          >
           <option value="">— Chọn cột —</option>
           <optgroup label="All Open Job">
            {sourceColumns.map(col=>
             <option key={col} value={col}>{col}</option>
            )}
           </optgroup>
           <optgroup label="Part Master (file Master Data)">
            {masterColumns.map(mc=>
             <option key={mc.key} value={mc.key}>{mc.label}</option>
            )}
           </optgroup>
          </select>
          <select
           className="input"
           value={c.operator}
           onChange={e=>updateCondition(i,"operator",e.target.value)}
          >
           {OPERATORS.map(o=>
            <option key={o.value} value={o.value}>{o.label}</option>
           )}
          </select>
          {c.operator==="equals"&&c.column?(
           <select
            className="input"
            value={c.value}
            onChange={e=>updateCondition(i,"value",e.target.value)}
           >
            <option value="">{c.column.startsWith("MD:REQ:")&&reqLoading[c.column]?"Đang tải giá trị...":"— Chọn giá trị unique —"}</option>
            {[...new Set([...(valuesByColumn.get(c.column)||[]),...(c.value?[c.value]:[])])].map(v=>
             <option key={v} value={v}>{v}</option>
            )}
           </select>
          ):c.operator!=="not_empty"&&c.operator!=="is_empty"&&
           <input
            className="input"
            value={c.value}
            placeholder="Giá trị..."
            onChange={e=>updateCondition(i,"value",e.target.value)}
           />}
          <button
           className="btn small danger-btn"
           type="button"
           disabled={conditions.length===1}
           onClick={()=>removeCondition(i)}
          >✕</button>
         </div>
        ))}
        {conditions.length<8&&
         <button className="btn small" type="button" onClick={addCondition}>
          + Thêm điều kiện
         </button>}
       </div>

       <label>
         Note
         <input
           className="input"
           value={note}
           placeholder="Optional"
           onChange={e=>setNote(e.target.value)}
         />
       </label>

       <label>
         Mã lô mẫu (tùy chọn)
         <input
           className="input"
           value={batchKeyTemplate}
           placeholder="VD PRIMER-{MATERIAL} — {CỘT} lấy giá trị của Job"
           onChange={e=>setBatchKeyTemplate(e.target.value)}
         />
       </label>

       <label>
         Prefix số lô (tùy chọn, 3 ký tự)
         <input
           className="input"
           value={batchNoPrefix}
           maxLength={3}
           placeholder="VD PRI"
           onChange={e=>setBatchNoPrefix(e.target.value.toUpperCase())}
         />
       </label>

       <label className="chemical-default-check">
         <input
           type="checkbox"
           checked={isDefault}
           onChange={e=>setIsDefault(e.target.checked)}
         />
         Recipe mặc định
       </label>

       <div className="row">
        <button className="btn primary" disabled={busy} onClick={save}>
         {editingMappingId?`Lưu Rule #${editingMappingId}`:"+ Thêm Recipe Rule"}
        </button>
        {editingMappingId&&<button className="btn" type="button" disabled={busy} onClick={()=>newRule(true)}>
         + Rule mới cùng Recipe
        </button>}
       </div>
     </div>
   </div>

   <div className="erp-table-panel section">
     <div className="erp-panel-head">
       <b>Operation Code → Recipe Mapping</b>
       <div className="row">
         <span>{visible.length} active mappings</span>
         <input
           className="input chemical-map-filter"
           value={filter}
           placeholder="Tìm..."
           onChange={e=>setFilter(e.target.value)}
         />
       </div>
     </div>

     <div className="table-wrap">
       <table className="erp-table">
         <thead>
           <tr>
             <th>Rule ID</th>
             <th>Mã công đoạn</th>
             <th>Tên công đoạn</th>
             <th>Công đoạn chính</th>
             <th>Số Recipe</th>
             <th>Tên Recipe</th>
             <th>Nhóm recipe</th>
             <th>Thời gian Process</th>
             <th>Ưu tiên</th>
             <th>Mặc định</th>
             <th>✓ Tự chọn</th>
             <th>Cột điều kiện</th>
             <th>Giá trị điều kiện</th>
             <th>Mã lô mẫu / Prefix</th>
             <th>Mã lô</th>
             <th>Ghi chú</th>
             <th></th>
           </tr>
         </thead>
         <tbody>
           {visible.map(x=>
             <tr key={x.mapping_id}>
               <td className="mono">#{x.mapping_id}</td>
               <td><b>{x.operation_code}</b></td>
               <td>{x.operation_name||"—"}</td>
               <td>{x.standard_operation||"—"}</td>
               <td className="mono">{x.recipe_no||"—"}</td>
               <td>{x.recipe_name||"CHƯA KHAI BÁO"}</td>
               <td className="recipe-rule-cell">
                {[x.process_family,x.recipe_group].filter(Boolean).join(" · ")||"—"}
               </td>
               <td className="mono">{timeByRecipe.get(x.recipe_key)||"—"}</td>
               <td className="num mono">{x.priority??100}</td>
               <td>{x.is_default?"Có":"—"}</td>
               <td>{winners.get(x.operation_code)===Number(x.mapping_id)
                 ? <b className="recipe-winner">✓</b>
                 : "—"}</td>
               <td className="recipe-rule-cell">{renderConditionColumns(x.selection_rule).col}</td>
               <td className="recipe-rule-cell">{renderConditionColumns(x.selection_rule).val}</td>
               <td className="recipe-rule-cell">
                {x.batch_key_template||x.batch_no_prefix
                 ? <span className="mono">{[x.batch_key_template,x.batch_no_prefix?`Prefix ${x.batch_no_prefix}`:null].filter(Boolean).join(" · ")}</span>
                 : "—"}
               </td>
               <td className="mono">{x.batch_key}</td>
               <td>{x.note||"—"}</td>
               <td className="action">
                 <div className="row">
                   <button className="btn small" onClick={()=>edit(x)}>Sửa</button>
                   <button className="btn danger-btn small" onClick={()=>remove(x)}>Bỏ</button>
                 </div>
               </td>
             </tr>
           )}
           {!visible.length&&
             <tr><td colSpan={17} className="muted">Chưa gán Recipe cho Operation Code.</td></tr>
           }
         </tbody>
       </table>
     </div>
   </div>

   {unmapped.length>0&&
    <div className="erp-table-panel section">
     <div className="erp-panel-head">
      <b>Operation Code chưa gán Recipe</b>
      <span>{unmapped.length} mã công đoạn còn thiếu — bấm "Cấu hình" để điền form bên trên</span>
     </div>
     <div className="table-wrap">
      <table className="erp-table">
       <thead><tr><th>Mã công đoạn</th><th>Tên công đoạn</th><th></th></tr></thead>
       <tbody>
        {unmapped.map(u=>
         <tr key={u.operation_code}>
          <td><b>{u.operation_code}</b></td>
          <td>{u.operation_name||"—"}</td>
          <td className="action">
           <button
            className="btn small"
            onClick={()=>{
             setEditingMappingId(null);
             setOperationCode(u.operation_code);
             setConditions([{column:"",operator:"equals",value:""}]);
             window.scrollTo({top:0,behavior:"smooth"});
            }}
           >Cấu hình →</button>
          </td>
         </tr>
        )}
       </tbody>
      </table>
     </div>
    </div>}
 </div>
}
