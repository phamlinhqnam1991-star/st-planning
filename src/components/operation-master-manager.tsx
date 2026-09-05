"use client";

import {safeJson} from "@/lib/fetch-json";
import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {refreshConfigPage} from "@/lib/config/config-client";
import {usePopupMessage} from "@/hooks/use-popup-message";
import {useErpConfirm} from "@/components/app-dialog-provider";

type Row={
 standard_operation:string;
 st_group:string;
 batch_prefix:string|null;
 batch_sequence_start:number|null;
 batch_sequence_padding:number|null;
 batch_size_qty:number|null;
 batch_auto_split:boolean|null;
 time_calc_type:string|null;
 priority:number|null;
 planning_sort_order:number|null;
 qty_min:number|null;
 qty_max:number|null;
 surface_min_dm2:number|null;
 surface_max_dm2:number|null;
 fixed_hours:number|null;
 standard_hours:number|null;
 note:string|null;
 is_active:boolean;
};

type StGroup={st_group:string;group_name:string|null};

type Dependency={label:string;count:number};
type RecipeOption={recipe_key:string;recipe_no:string|null;recipe_name:string|null};
type RecipeSizeRule={recipe_key:string;batch_size_qty:string};

const EMPTY_CREATE={
 standard_operation:"",
 st_group:"",
 batch_prefix:"",
 batch_sequence_start:"1",
 batch_sequence_padding:"5",
 batch_size_qty:"",
 batch_auto_split:false,
 planning_sort_order:"",
 note:""
};

export function OperationMasterManager({rows,stGroups}:{rows:Row[];stGroups:StGroup[]}){
 const confirmErp=useErpConfirm();
 const router=useRouter();
 const [editing,setEditing]=useState<string|null>(null);
 const [name,setName]=useState("");
 const [batchEditing,setBatchEditing]=useState<string|null>(null);
 const [batchCfg,setBatchCfg]=useState({prefix:"",start:"1",padding:"5",size:"",autoSplit:false});
 const [recipeOptions,setRecipeOptions]=useState<RecipeOption[]>([]);
 const [recipeRules,setRecipeRules]=useState<RecipeSizeRule[]>([]);
 const [batchLoading,setBatchLoading]=useState(false);
 const [busy,setBusy]=useState(false);
 const [sortEditing,setSortEditing]=useState<string|null>(null);
 const [sortValue,setSortValue]=useState("");
 const [message,setMessage]=useState("");
 const [showCreate,setShowCreate]=useState(false);
 const [create,setCreate]=useState({...EMPTY_CREATE});
 const [showInactive,setShowInactive]=useState(false);
 usePopupMessage(message);

 const visibleRows=useMemo(
  ()=>showInactive?rows:rows.filter(x=>x.is_active),
  [rows,showInactive]
 );
 const activeCount=useMemo(()=>rows.filter(x=>x.is_active).length,[rows]);
 const inactiveCount=rows.length-activeCount;

 function begin(row:Row){
  setEditing(row.standard_operation);
  setName(row.standard_operation);
  setMessage("");
 }

 async function save(){
  if(!editing)return;
  const next=name.trim().toUpperCase();
  if(!next){setMessage("Tên công đoạn không được để trống.");return;}
  if(next===editing){setEditing(null);return;}
  const ok=await confirmErp(
   `Đổi tên công đoạn "${editing}" thành "${next}"?\n\n`+
   `Hệ thống sẽ cập nhật các liên kết Planning/Recipe/Batch liên quan.`
  );
  if(!ok)return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/config/operation-master/rename",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({old_name:editing,new_name:next})
   });
   const d=await safeJson(r);
   if(!r.ok)throw new Error(d.error||"Không đổi được tên công đoạn.");
   setMessage(`Đã đổi ${editing} → ${next}.`);
   setEditing(null);refreshConfigPage(router);
  }catch(e){setMessage(e instanceof Error?e.message:"Không đổi được tên công đoạn.");}
  finally{setBusy(false);}
 }

 async function saveSortOrder(operation:string){
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/config/operation-master/sort-order",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({standard_operation:operation,planning_sort_order:sortValue.trim()===""?null:Number(sortValue)})
   });
   const d=await safeJson(r);
   if(!r.ok)throw new Error(d.error||"Không lưu được Planning Order.");
   setMessage(`Đã lưu thứ tự ${operation}: ${d.row.planning_sort_order??"chưa gán"}.`);
   setSortEditing(null);refreshConfigPage(router);
  }catch(e){setMessage(e instanceof Error?e.message:"Không lưu được Planning Order.");}
  finally{setBusy(false);}
 }

 async function beginBatchConfig(row:Row){
  setBatchEditing(row.standard_operation);
  setBatchCfg({
   prefix:String(row.batch_prefix||"").toUpperCase(),
   start:String(row.batch_sequence_start??1),
   padding:String(row.batch_sequence_padding??5),
   size:row.batch_size_qty==null?"":String(row.batch_size_qty),
   autoSplit:Boolean(row.batch_auto_split)
  });
  setRecipeOptions([]);setRecipeRules([]);setMessage("");setBatchLoading(true);
  try{
   const r=await fetch(`/api/config/operation-master/batch-config?standard_operation=${encodeURIComponent(row.standard_operation)}`);
   const d=await safeJson(r);
   if(!r.ok)throw new Error(d.error||"Không tải được Recipe Batch Size.");
   setRecipeOptions(Array.isArray(d.recipes)?d.recipes:[]);
   setRecipeRules(Array.isArray(d.recipeRules)?d.recipeRules.map((x:any)=>({recipe_key:String(x.recipe_key||""),batch_size_qty:String(x.batch_size_qty??"")})):[]);
  }catch(e){setMessage(e instanceof Error?e.message:"Không tải được Recipe Batch Size.");}
  finally{setBatchLoading(false);}
 }

 async function saveBatchConfig(operation:string){
  const prefix=batchCfg.prefix.trim().toUpperCase();
  const start=Number(batchCfg.start);
  const padding=Number(batchCfg.padding);
  const size=batchCfg.size.trim()===""?null:Number(batchCfg.size);
  if(!/^[A-Z0-9][A-Z0-9_-]{0,29}$/.test(prefix)){setMessage("Batch Prefix: 1-30 ký tự A-Z, 0-9, _ hoặc -.");return;}
  if(!Number.isInteger(start)||start<0){setMessage("Sequence Start phải là số nguyên >= 0.");return;}
  if(!Number.isInteger(padding)||padding<1||padding>12){setMessage("Sequence Padding phải từ 1 đến 12.");return;}
  if(size!==null&&(!Number.isFinite(size)||size<=0)){setMessage("Batch Size phải > 0 hoặc để trống.");return;}
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/config/operation-master/batch-config",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({standard_operation:operation,batch_prefix:prefix,batch_sequence_start:start,batch_sequence_padding:padding,batch_size_qty:size,batch_auto_split:batchCfg.autoSplit,recipe_size_rules:recipeRules})
   });
   const d=await safeJson(r);
   if(!r.ok)throw new Error(d.error||"Không lưu được cấu hình Batch.");
   setMessage(`Đã lưu Batch Config ${operation}: ${prefix}${String(start).padStart(padding,"0")}${size?` · Common Size ${size}`:" · Common Size dùng chung/không split"}${recipeRules.length?` · ${recipeRules.length} Recipe override`:""}${batchCfg.autoSplit?" · Auto Split":""}.`);
   setBatchEditing(null);refreshConfigPage(router);
  }catch(e){setMessage(e instanceof Error?e.message:"Không lưu được cấu hình Batch.");}
  finally{setBusy(false);}
 }

 async function createOperation(){
  const operation=create.standard_operation.trim().toUpperCase();
  const group=create.st_group.trim().toUpperCase();
  const prefix=create.batch_prefix.trim().toUpperCase();
  if(!operation){setMessage("Nhập Main Operation.");return;}
  if(!group){setMessage("Chọn ST Group.");return;}
  if(!/^[A-Z0-9][A-Z0-9_-]{0,29}$/.test(prefix)){setMessage("Batch Prefix: 1-30 ký tự A-Z, 0-9, _ hoặc -.");return;}
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/config/operation-master/manage",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({
     standard_operation:operation,
     st_group:group,
     batch_prefix:prefix,
     batch_sequence_start:Number(create.batch_sequence_start||1),
     batch_sequence_padding:Number(create.batch_sequence_padding||5),
     batch_size_qty:create.batch_size_qty.trim()===""?null:Number(create.batch_size_qty),
     batch_auto_split:Boolean(create.batch_auto_split),
     planning_sort_order:create.planning_sort_order.trim()===""?null:Number(create.planning_sort_order),
     note:create.note.trim()||null
    })
   });
   const d=await safeJson(r);
   if(!r.ok)throw new Error(d.error||"Không thêm được Main Operation.");
   setMessage(d.reactivated?`Đã kích hoạt lại ${operation}.`:`Đã thêm Main Operation ${operation}.`);
   setCreate({...EMPTY_CREATE});setShowCreate(false);refreshConfigPage(router);
  }catch(e){setMessage(e instanceof Error?e.message:"Không thêm được Main Operation.");}
  finally{setBusy(false);}
 }

 async function setActive(row:Row,next:boolean){
  const verb=next?"Kích hoạt":"Ngưng sử dụng";
  const detail=next
   ? `Kích hoạt lại Main Operation "${row.standard_operation}"?`
   : `Ngưng sử dụng Main Operation "${row.standard_operation}"?\n\nMain này sẽ không còn dùng cho Planning mới. Dữ liệu lịch sử vẫn được giữ.`;
  if(!await confirmErp({title:verb,message:detail,tone:next?"default":"warning",confirmLabel:verb}))return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/config/operation-master/manage",{
    method:"PATCH",headers:{"content-type":"application/json"},
    body:JSON.stringify({standard_operation:row.standard_operation,is_active:next})
   });
   const d=await safeJson(r);
   if(!r.ok)throw new Error(d.error||`Không thể ${verb.toLowerCase()} Main Operation.`);
   setMessage(`${verb}: ${row.standard_operation}.`);
   refreshConfigPage(router);
  }catch(e){setMessage(e instanceof Error?e.message:`Không thể ${verb.toLowerCase()} Main Operation.`);}
  finally{setBusy(false);}
 }

 async function deleteOperation(row:Row){
  if(row.is_active){setMessage("Phải Ngưng sử dụng Main Operation trước khi Xóa vĩnh viễn.");return;}
  if(!await confirmErp({title:"Xóa vĩnh viễn Main Operation",message:`Xóa Main Operation "${row.standard_operation}"?`,detail:"Chỉ xóa được khi không còn Mapping / Recipe / Planning / Batch / lịch sử tham chiếu.",tone:"danger",confirmLabel:"Xóa vĩnh viễn"}))return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/config/operation-master/manage",{
    method:"DELETE",headers:{"content-type":"application/json"},
    body:JSON.stringify({standard_operation:row.standard_operation})
   });
   const d=await safeJson(r);
   if(!r.ok){
    const deps=Array.isArray(d.dependencies)?(d.dependencies as Dependency[]):[];
    const extra=deps.length?`\n${deps.map(x=>`${x.label}: ${x.count}`).join(" · ")}`:"";
    throw new Error((d.error||"Không xóa được Main Operation.")+extra);
   }
   setMessage(`Đã xóa vĩnh viễn ${row.standard_operation}.`);
   refreshConfigPage(router);
  }catch(e){setMessage(e instanceof Error?e.message:"Không xóa được Main Operation.");}
  finally{setBusy(false);}
 }

 return <div className="erp-table-panel section erp-config-editor-stack">
  <div className="erp-panel-head">
   <b>Operation Master</b>
   <div className="row" style={{gap:8}}>
    <span>{activeCount} đang dùng{inactiveCount?` · ${inactiveCount} ngưng`:""}</span>
    {inactiveCount>0&&<button className="btn small" type="button" onClick={()=>setShowInactive(x=>!x)} disabled={busy}>
     {showInactive?"Ẩn công đoạn ngưng":"Hiện công đoạn ngưng"}
    </button>}
    <button className="btn primary small" type="button" onClick={()=>setShowCreate(x=>!x)} disabled={busy}>
     {showCreate?"Đóng":"+ Thêm Main Operation"}
    </button>
   </div>
  </div>

  {showCreate&&<div className="erp-form-panel" style={{margin:10}}>
   <div className="row" style={{alignItems:"flex-end",gap:10,flexWrap:"wrap"}}>
    <label style={{minWidth:210}}><span className="muted">Main Operation</span>
     <input className="input mono" value={create.standard_operation} onChange={e=>setCreate(x=>({...x,standard_operation:e.target.value.toUpperCase()}))} placeholder="VD: NEW-OP" disabled={busy}/>
    </label>
    <label style={{minWidth:200}}><span className="muted">ST Group</span>
     <select className="input" value={create.st_group} onChange={e=>setCreate(x=>({...x,st_group:e.target.value}))} disabled={busy}>
      <option value="">-- Chọn ST Group --</option>
      {stGroups.map(g=><option key={g.st_group} value={g.st_group}>{g.st_group}{g.group_name&&g.group_name!==g.st_group?` · ${g.group_name}`:""}</option>)}
     </select>
    </label>
    <label style={{width:150}}><span className="muted">Batch Prefix</span>
     <input className="input mono" maxLength={30} value={create.batch_prefix} onChange={e=>setCreate(x=>({...x,batch_prefix:e.target.value.toUpperCase()}))} placeholder="VD: XXX_" disabled={busy}/>
    </label>
    <label style={{width:105}}><span className="muted">Seq Start</span>
     <input className="input mono" type="number" min="0" step="1" value={create.batch_sequence_start} onChange={e=>setCreate(x=>({...x,batch_sequence_start:e.target.value}))} disabled={busy}/>
    </label>
    <label style={{width:90}}><span className="muted">Digits</span>
     <input className="input mono" type="number" min="1" max="12" step="1" value={create.batch_sequence_padding} onChange={e=>setCreate(x=>({...x,batch_sequence_padding:e.target.value}))} disabled={busy}/>
    </label>
    <label style={{width:115}}><span className="muted">Batch Size</span>
     <input className="input mono" type="number" min="0.0001" step="any" value={create.batch_size_qty} onChange={e=>setCreate(x=>({...x,batch_size_qty:e.target.value}))} placeholder="pcs" disabled={busy}/>
    </label>
    <label className="row" style={{gap:6,paddingBottom:8}}><input type="checkbox" checked={create.batch_auto_split} onChange={e=>setCreate(x=>({...x,batch_auto_split:e.target.checked}))} disabled={busy}/><span>Auto Split</span></label>
    <label style={{width:135}}><span className="muted">Planning Order</span>
     <input className="input" type="number" min="0" step="1" value={create.planning_sort_order} onChange={e=>setCreate(x=>({...x,planning_sort_order:e.target.value}))} placeholder="VD: 220" disabled={busy}/>
    </label>
    <label style={{minWidth:230,flex:1}}><span className="muted">Ghi chú</span>
     <input className="input" value={create.note} onChange={e=>setCreate(x=>({...x,note:e.target.value}))} placeholder="Tùy chọn" disabled={busy}/>
    </label>
    <button className="btn primary" type="button" onClick={createOperation} disabled={busy}>Lưu</button>
    <button className="btn" type="button" onClick={()=>{setShowCreate(false);setCreate({...EMPTY_CREATE});}} disabled={busy}>Hủy</button>
   </div>
  </div>}

  <div className="table-wrap">
   <table className="erp-table">
    <thead><tr>
     <th>Công đoạn chính</th><th>Trạng thái</th><th>Nhóm ST</th><th>Batch Config</th><th>Kiểu tính giờ</th><th>Thứ tự</th><th>Ưu tiên</th><th>SL min</th><th>SL max</th><th>dm² min</th><th>dm² max</th><th>Giờ cố định</th><th>Giờ chuẩn</th><th>Ghi chú</th><th>Thao tác</th>
    </tr></thead>
    <tbody>
     {visibleRows.map(row=><tr key={row.standard_operation} style={!row.is_active?{opacity:.58}:undefined}>
      <td>{editing===row.standard_operation
       ? <input className="input operation-name-input" value={name} onChange={e=>setName(e.target.value)} disabled={busy} autoFocus/>
       : <b>{row.standard_operation}</b>}</td>
      <td>{row.is_active?<span className="status-pill done">ĐANG DÙNG</span>:<span className="status-pill">NGƯNG</span>}</td>
      <td>{row.st_group}</td>
      <td>{batchEditing===row.standard_operation
       ? <div style={{display:"grid",gap:7,minWidth:720}}>
          <div style={{display:"grid",gridTemplateColumns:"150px 90px 80px 125px auto",gap:5}}>
           <input className="input mono" value={batchCfg.prefix} maxLength={30} onChange={e=>setBatchCfg(x=>({...x,prefix:e.target.value.toUpperCase()}))} placeholder="XXX_" disabled={busy}/>
           <input className="input mono" type="number" min="0" step="1" value={batchCfg.start} onChange={e=>setBatchCfg(x=>({...x,start:e.target.value}))} title="Sequence Start" disabled={busy}/>
           <input className="input mono" type="number" min="1" max="12" step="1" value={batchCfg.padding} onChange={e=>setBatchCfg(x=>({...x,padding:e.target.value}))} title="Digits" disabled={busy}/>
           <input className="input mono" type="number" min="0.0001" step="any" value={batchCfg.size} onChange={e=>setBatchCfg(x=>({...x,size:e.target.value}))} placeholder="Common Size" title="Để trống = Recipe không có override sẽ không tự chia" disabled={busy}/>
           <div className="row" style={{gap:5}}><label className="row" style={{gap:4,whiteSpace:"nowrap"}}><input type="checkbox" checked={batchCfg.autoSplit} onChange={e=>setBatchCfg(x=>({...x,autoSplit:e.target.checked}))}/><span>Split</span></label><button className="btn primary small" type="button" disabled={busy||batchLoading} onClick={()=>saveBatchConfig(row.standard_operation)}>Lưu</button><button className="btn small" type="button" disabled={busy} onClick={()=>setBatchEditing(null)}>×</button></div>
          </div>
          <div className="muted" style={{fontSize:12}}>Batch Size: Recipe cụ thể ưu tiên trước; nếu không có thì dùng Common Size. Cả hai trống = không split, dùng chung một batch.</div>
          {batchLoading?<div className="muted">Đang tải Recipe…</div>:<div style={{display:"grid",gap:5}}>
           {recipeRules.map((rule,idx)=><div key={`${rule.recipe_key}-${idx}`} style={{display:"grid",gridTemplateColumns:"minmax(260px,1fr) 120px 34px",gap:5}}>
            <select className="input" value={rule.recipe_key} onChange={e=>setRecipeRules(xs=>xs.map((x,i)=>i===idx?{...x,recipe_key:e.target.value}:x))} disabled={busy}>
             <option value="">-- Chọn Recipe --</option>
             {recipeOptions.map(r=><option key={r.recipe_key} value={r.recipe_key}>{r.recipe_no?`${r.recipe_no} · `:""}{r.recipe_name||r.recipe_key}</option>)}
            </select>
            <input className="input mono" type="number" min="0.0001" step="any" value={rule.batch_size_qty} onChange={e=>setRecipeRules(xs=>xs.map((x,i)=>i===idx?{...x,batch_size_qty:e.target.value}:x))} placeholder="Batch Size" disabled={busy}/>
            <button className="btn small" type="button" onClick={()=>setRecipeRules(xs=>xs.filter((_,i)=>i!==idx))} disabled={busy}>×</button>
           </div>)}
           <div><button className="btn small" type="button" onClick={()=>setRecipeRules(xs=>[...xs,{recipe_key:"",batch_size_qty:""}])} disabled={busy}>+ Recipe Batch Size</button></div>
          </div>}
         </div>
       : <button className="btn small mono operation-prefix-button" type="button" disabled={busy||!row.is_active} onClick={()=>beginBatchConfig(row)} title={`Start ${row.batch_sequence_start??1} · ${row.batch_sequence_padding??5} digits · Size ${row.batch_size_qty??"—"} · ${row.batch_auto_split?"Auto Split":"No Split"}`}>{row.batch_prefix||"ĐẶT"} · {row.batch_sequence_padding??5}D{row.batch_size_qty?` · ${row.batch_size_qty} pcs`:""}{row.batch_auto_split?" · SPLIT":""}</button>}</td>
      <td>{row.time_calc_type||""}</td>
      <td>{sortEditing===row.standard_operation
       ? <div className="row"><input className="input" type="number" min="0" step="1" style={{width:80}} value={sortValue} onChange={e=>setSortValue(e.target.value)}/><button className="btn primary small" onClick={()=>saveSortOrder(row.standard_operation)} disabled={busy}>Lưu</button><button className="btn small" onClick={()=>setSortEditing(null)} disabled={busy}>×</button></div>
       : <button className="btn small mono" type="button" onClick={()=>{setSortEditing(row.standard_operation);setSortValue(row.planning_sort_order==null?"":String(row.planning_sort_order));}} disabled={busy||!row.is_active}>{row.planning_sort_order??"ĐẶT"}</button>}</td>
      <td>{row.priority??""}</td><td>{row.qty_min??""}</td><td>{row.qty_max??""}</td><td>{row.surface_min_dm2??""}</td><td>{row.surface_max_dm2??""}</td><td>{row.fixed_hours??""}</td><td>{row.standard_hours??""}</td><td>{row.note||""}</td>
      <td>{editing===row.standard_operation
       ? <div className="row"><button className="btn primary small" type="button" disabled={busy} onClick={save}>Lưu</button><button className="btn small" type="button" disabled={busy} onClick={()=>setEditing(null)}>Hủy</button></div>
       : <div className="row" style={{gap:5,flexWrap:"wrap"}}>
          {row.is_active&&<button className="btn small" type="button" disabled={busy} onClick={()=>begin(row)}>Đổi tên</button>}
          <button className="btn small" type="button" disabled={busy} onClick={()=>setActive(row,!row.is_active)}>{row.is_active?"Ngưng":"Kích hoạt"}</button>
          {!row.is_active&&<button className="btn small danger" type="button" disabled={busy} onClick={()=>deleteOperation(row)}>Xóa</button>}
         </div>}
      </td>
     </tr>)}
     {!visibleRows.length&&<tr><td colSpan={15} className="muted">Không có Main Operation.</td></tr>}
    </tbody>
   </table>
  </div>
 </div>;
}
