"use client";

import {useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";

type Row={
 operation_code:string;
 operation_name:string|null;
 planning_sort_order:number|null;
};

export function OperationCodeOrderManager({rows}:{rows:Row[]}){
 const [editing,setEditing]=useState<string|null>(null);
 const [value,setValue]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 usePopupMessage(message);

 function begin(row:Row){
  setEditing(row.operation_code);
  setValue(row.planning_sort_order==null?"":String(row.planning_sort_order));
 }

 async function save(operationCode:string){
  setBusy(true);
  setMessage("");
  try{
   const r=await fetch("/api/config/operation-code-order",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
     operation_code:operationCode,
     planning_sort_order:value.trim()===""?null:Number(value)
    })
   });
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||"Không lưu được Planning Order.");

   setMessage(`Đã lưu ${operationCode} = ${d.row.planning_sort_order??"chưa gán"}.`);
   setEditing(null);
   setTimeout(()=>location.reload(),450);
  }catch(e){
   setMessage(e instanceof Error?e.message:"Không lưu được Planning Order.");
  }finally{
   setBusy(false);
  }
 }

 return <div className="erp-table-panel section table-wrap">
  <table className="erp-table">
   <thead>
    <tr>
     <th>Planning Order</th>
     <th>Operation Code</th>
     <th>Operation Name</th>
     <th>Action</th>
    </tr>
   </thead>
   <tbody>
    {rows.map(row=>
     <tr key={row.operation_code}>
      <td style={{width:150}}>
       {editing===row.operation_code
        ? <input
           className="input"
           type="number"
           min={0}
           step={1}
           value={value}
           onChange={e=>setValue(e.target.value)}
           autoFocus
          />
        : <b>{row.planning_sort_order??"—"}</b>}
      </td>
      <td><b>{row.operation_code}</b></td>
      <td>{row.operation_name||"—"}</td>
      <td>
       {editing===row.operation_code
        ? <div className="row">
           <button className="btn small primary" type="button" disabled={busy} onClick={()=>save(row.operation_code)}>Save</button>
           <button className="btn small" type="button" disabled={busy} onClick={()=>setEditing(null)}>Cancel</button>
          </div>
        : <button className="btn small" type="button" onClick={()=>begin(row)}>Set Order</button>}
      </td>
     </tr>
    )}
    {!rows.length&&<tr><td colSpan={4} className="muted">Không có Operation Code.</td></tr>}
   </tbody>
  </table>
 </div>;
}
