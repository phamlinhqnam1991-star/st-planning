"use client";

import {useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";

type Row={
 standard_operation:string;
 st_group:string;
 batch_prefix:string|null;
 time_calc_type:string|null;
 priority:number|null;
 qty_min:number|null;
 qty_max:number|null;
 surface_min_dm2:number|null;
 surface_max_dm2:number|null;
 fixed_hours:number|null;
 standard_hours:number|null;
 note:string|null;
};

export function OperationMasterManager({rows}:{rows:Row[]}){
 const [editing,setEditing]=useState<string|null>(null);
 const [name,setName]=useState("");
 const [prefixEditing,setPrefixEditing]=useState<string|null>(null);
 const [prefixValue,setPrefixValue]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 usePopupMessage(message);

 function begin(row:Row){
  setEditing(row.standard_operation);
  setName(row.standard_operation);
  setMessage("");
 }

 async function save(){
  if(!editing)return;
  const next=name.trim().toUpperCase();

  if(!next){
   setMessage("Tên công đoạn không được để trống.");
   return;
  }

  if(next===editing){
   setEditing(null);
   return;
  }

  const ok=window.confirm(
   `Đổi tên công đoạn "${editing}" thành "${next}"?\n\n`+
   `Hệ thống sẽ cập nhật các liên kết Planning/Recipe/Batch liên quan.`
  );
  if(!ok)return;

  setBusy(true);
  setMessage("");

  try{
   const r=await fetch("/api/config/operation-master/rename",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
     old_name:editing,
     new_name:next
    })
   });
   const d=await r.json();

   if(!r.ok)throw new Error(d.error||"Không đổi được tên công đoạn.");

   setMessage(`Đã đổi ${editing} → ${next}.`);
   setEditing(null);
   setTimeout(()=>location.reload(),700);
  }catch(e){
   setMessage(e instanceof Error?e.message:"Không đổi được tên công đoạn.");
  }finally{
   setBusy(false);
  }
 }

 function beginPrefix(row:Row){
  setPrefixEditing(row.standard_operation);
  setPrefixValue(String(row.batch_prefix||"").toUpperCase());
  setMessage("");
 }

 async function savePrefix(operation:string){
  const prefix=prefixValue.trim().toUpperCase();

  if(!/^[A-Z0-9]{3}$/.test(prefix)){
   setMessage("Batch Prefix phải đúng 3 ký tự A-Z hoặc 0-9.");
   return;
  }

  setBusy(true);
  setMessage("");

  try{
   const r=await fetch("/api/config/operation-master/prefix",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
     standard_operation:operation,
     batch_prefix:prefix
    })
   });
   const d=await r.json();

   if(!r.ok)throw new Error(d.error||"Không lưu được Batch Prefix.");

   setMessage(`Đã lưu ${operation} → Prefix ${prefix}.`);
   setPrefixEditing(null);
   setTimeout(()=>location.reload(),600);
  }catch(e){
   setMessage(e instanceof Error?e.message:"Không lưu được Batch Prefix.");
  }finally{
   setBusy(false);
  }
 }

 return <div className="erp-table-panel section">
  <div className="erp-panel-head">
   <b>Operation Master</b>
   <span>{rows.length} active records</span>
  </div>

  <div className="table-wrap">
   <table className="erp-table">
    <thead>
     <tr>
      <th>standard_operation</th>
      <th>st_group</th>
      <th>batch_prefix</th>
      <th>time_calc_type</th>
      <th>priority</th>
      <th>qty_min</th>
      <th>qty_max</th>
      <th>surface_min_dm2</th>
      <th>surface_max_dm2</th>
      <th>fixed_hours</th>
      <th>standard_hours</th>
      <th>note</th>
      <th>Action</th>
     </tr>
    </thead>
    <tbody>
     {rows.map(row=>
      <tr key={row.standard_operation}>
       <td>
        {editing===row.standard_operation
         ? <input
            className="input operation-name-input"
            value={name}
            onChange={e=>setName(e.target.value)}
            disabled={busy}
            autoFocus
           />
         : <b>{row.standard_operation}</b>}
       </td>
       <td>{row.st_group}</td>
       <td>
        {prefixEditing===row.standard_operation
         ? <div className="row operation-prefix-edit">
            <input
             className="input mono operation-prefix-input"
             value={prefixValue}
             maxLength={3}
             onChange={e=>setPrefixValue(e.target.value.toUpperCase())}
             disabled={busy}
            />
            <button
             className="btn primary small"
             type="button"
             disabled={busy}
             onClick={()=>savePrefix(row.standard_operation)}
            >Save</button>
            <button
             className="btn small"
             type="button"
             disabled={busy}
             onClick={()=>setPrefixEditing(null)}
            >×</button>
           </div>
         : <button
            className="btn small mono operation-prefix-button"
            type="button"
            disabled={busy}
            onClick={()=>beginPrefix(row)}
           >
            {row.batch_prefix||"SET"}
           </button>}
       </td>
       <td>{row.time_calc_type||""}</td>
       <td>{row.priority??""}</td>
       <td>{row.qty_min??""}</td>
       <td>{row.qty_max??""}</td>
       <td>{row.surface_min_dm2??""}</td>
       <td>{row.surface_max_dm2??""}</td>
       <td>{row.fixed_hours??""}</td>
       <td>{row.standard_hours??""}</td>
       <td>{row.note||""}</td>
       <td>
        {editing===row.standard_operation
         ? <div className="row">
            <button className="btn primary small" type="button" disabled={busy} onClick={save}>
             Save
            </button>
            <button className="btn small" type="button" disabled={busy} onClick={()=>setEditing(null)}>
             Cancel
            </button>
           </div>
         : <button className="btn small" type="button" disabled={busy} onClick={()=>begin(row)}>
            Edit Name
           </button>}
       </td>
      </tr>
     )}
    </tbody>
   </table>
  </div>
 </div>
}
