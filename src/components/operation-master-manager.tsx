"use client";

import {safeJson} from "@/lib/fetch-json";
import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {refreshConfigPage} from "@/lib/config/config-client";
import {usePopupMessage} from "@/hooks/use-popup-message";

type Row={
 standard_operation:string;
 st_group:string;
 batch_prefix:string|null;
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

const EMPTY_CREATE={
 standard_operation:"",
 st_group:"",
 batch_prefix:"",
 planning_sort_order:"",
 note:""
};

export function OperationMasterManager({rows,stGroups}:{rows:Row[];stGroups:StGroup[]}){
 const router=useRouter();
 const [editing,setEditing]=useState<string|null>(null);
 const [name,setName]=useState("");
 const [prefixEditing,setPrefixEditing]=useState<string|null>(null);
 const [prefixValue,setPrefixValue]=useState("");
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
  const ok=window.confirm(
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

 function beginPrefix(row:Row){
  setPrefixEditing(row.standard_operation);
  setPrefixValue(String(row.batch_prefix||"").toUpperCase());
  setMessage("");
 }

 async function savePrefix(operation:string){
  const prefix=prefixValue.trim().toUpperCase();
  if(!/^[A-Z0-9]{3}$/.test(prefix)){setMessage("Tiền tố số lô phải đúng 3 ký tự A-Z hoặc 0-9.");return;}
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/config/operation-master/prefix",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({standard_operation:operation,batch_prefix:prefix})
   });
   const d=await safeJson(r);
   if(!r.ok)throw new Error(d.error||"Không lưu được Batch Prefix.");
   setMessage(`Đã lưu ${operation} → Prefix ${prefix}.`);
   setPrefixEditing(null);refreshConfigPage(router);
  }catch(e){setMessage(e instanceof Error?e.message:"Không lưu được Batch Prefix.");}
  finally{setBusy(false);}
 }

 async function createOperation(){
  const operation=create.standard_operation.trim().toUpperCase();
  const group=create.st_group.trim().toUpperCase();
  const prefix=create.batch_prefix.trim().toUpperCase();
  if(!operation){setMessage("Nhập Main Operation.");return;}
  if(!group){setMessage("Chọn ST Group.");return;}
  if(!/^[A-Z0-9]{3}$/.test(prefix)){setMessage("Batch Prefix phải đúng 3 ký tự A-Z hoặc 0-9.");return;}
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/config/operation-master/manage",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({
     standard_operation:operation,
     st_group:group,
     batch_prefix:prefix,
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
  if(!window.confirm(detail))return;
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
  if(!window.confirm(
   `Xóa VĨNH VIỄN Main Operation "${row.standard_operation}"?\n\n`+
   `Chỉ xóa được khi không còn Mapping / Recipe / Planning / Batch / lịch sử tham chiếu.`
  ))return;
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

 return <div className="erp-table-panel section">
  <div className="erp-panel-head">
   <b>Operation Master</b>
   <div className="row" style={{gap:8}}>
    <span>{activeCount} active{inactiveCount?` · ${inactiveCount} ngưng`:""}</span>
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
    <label style={{width:130}}><span className="muted">Batch Prefix</span>
     <input className="input mono" maxLength={3} value={create.batch_prefix} onChange={e=>setCreate(x=>({...x,batch_prefix:e.target.value.toUpperCase()}))} placeholder="ABC" disabled={busy}/>
    </label>
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
     <th>Công đoạn chính</th><th>Trạng thái</th><th>Nhóm ST</th><th>Tiền tố lô</th><th>Kiểu tính giờ</th><th>Thứ tự</th><th>Ưu tiên</th><th>SL min</th><th>SL max</th><th>dm² min</th><th>dm² max</th><th>Giờ cố định</th><th>Giờ chuẩn</th><th>Ghi chú</th><th>Thao tác</th>
    </tr></thead>
    <tbody>
     {visibleRows.map(row=><tr key={row.standard_operation} style={!row.is_active?{opacity:.58}:undefined}>
      <td>{editing===row.standard_operation
       ? <input className="input operation-name-input" value={name} onChange={e=>setName(e.target.value)} disabled={busy} autoFocus/>
       : <b>{row.standard_operation}</b>}</td>
      <td>{row.is_active?<span className="status-pill done">ACTIVE</span>:<span className="status-pill">NGƯNG</span>}</td>
      <td>{row.st_group}</td>
      <td>{prefixEditing===row.standard_operation
       ? <div className="row operation-prefix-edit"><input className="input mono operation-prefix-input" value={prefixValue} maxLength={3} onChange={e=>setPrefixValue(e.target.value.toUpperCase())} disabled={busy}/><button className="btn primary small" type="button" disabled={busy} onClick={()=>savePrefix(row.standard_operation)}>Save</button><button className="btn small" type="button" disabled={busy} onClick={()=>setPrefixEditing(null)}>×</button></div>
       : <button className="btn small mono operation-prefix-button" type="button" disabled={busy||!row.is_active} onClick={()=>beginPrefix(row)}>{row.batch_prefix||"ĐẶT"}</button>}</td>
      <td>{row.time_calc_type||""}</td>
      <td>{sortEditing===row.standard_operation
       ? <div className="row"><input className="input" type="number" min="0" step="1" style={{width:80}} value={sortValue} onChange={e=>setSortValue(e.target.value)}/><button className="btn primary small" onClick={()=>saveSortOrder(row.standard_operation)} disabled={busy}>Save</button><button className="btn small" onClick={()=>setSortEditing(null)} disabled={busy}>×</button></div>
       : <button className="btn small mono" type="button" onClick={()=>{setSortEditing(row.standard_operation);setSortValue(row.planning_sort_order==null?"":String(row.planning_sort_order));}} disabled={busy||!row.is_active}>{row.planning_sort_order??"ĐẶT"}</button>}</td>
      <td>{row.priority??""}</td><td>{row.qty_min??""}</td><td>{row.qty_max??""}</td><td>{row.surface_min_dm2??""}</td><td>{row.surface_max_dm2??""}</td><td>{row.fixed_hours??""}</td><td>{row.standard_hours??""}</td><td>{row.note||""}</td>
      <td>{editing===row.standard_operation
       ? <div className="row"><button className="btn primary small" type="button" disabled={busy} onClick={save}>Save</button><button className="btn small" type="button" disabled={busy} onClick={()=>setEditing(null)}>Cancel</button></div>
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
