"use client";

import {safeJson} from "@/lib/fetch-json";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {refreshConfigPage} from "@/lib/config/config-client";
import {usePopupMessage} from "@/hooks/use-popup-message";

type Row={
 operation_code:string;
 operation_name:string|null;
 planning_sort_order:number|null;
 operation_type:"PLANNING_OPERATION"|"BRIDGE_INTERMEDIATE"|"ST_SCOPE_ONLY";
};

export function OperationCodeOrderManager({rows}:{rows:Row[]}){
 const router=useRouter();
 const [editing,setEditing]=useState<string|null>(null);
 const [value,setValue]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [addOpen,setAddOpen]=useState(false);
 const [newCode,setNewCode]=useState("");
 const [newName,setNewName]=useState("");
 const [newOrder,setNewOrder]=useState("");
 usePopupMessage(message);

 function begin(row:Row){
  setEditing(row.operation_code);
  setValue(row.planning_sort_order==null?"":String(row.planning_sort_order));
 }

 async function request(body:any,method:"POST"|"DELETE"="POST"){
  const r=await fetch("/api/config/operation-code-order",{
   method,
   headers:{"content-type":"application/json"},
   body:JSON.stringify(body)
  });
  const d=await safeJson(r);
  if(!r.ok)throw new Error(d.error||"Không cập nhật được Operation Code.");
  return d;
 }

 async function save(operationCode:string){
  setBusy(true);
  setMessage("");
  try{
   const d=await request({
    action:"set-next-op-sort",
    operation_code:operationCode,
    planning_sort_order:value.trim()===""?null:Number(value)
   });

   setMessage(
    `Đã lưu Next Op Sort ${operationCode} = ${d.row.planning_sort_order??"chưa gán"}. Không thay đổi Planning Chain.`
   );
   setEditing(null);
   refreshConfigPage(router);
  }catch(e){
   setMessage(e instanceof Error?e.message:"Không lưu được Next Op Sort.");
  }finally{
   setBusy(false);
  }
 }

 async function addOperation(){
  const code=newCode.trim().toUpperCase();
  if(!code){
   setMessage("Nhập Operation Code.");
   return;
  }

  setBusy(true);
  setMessage("");
  try{
   const d=await request({
    action:"add",
    operation_code:code,
    operation_name:newName.trim()||code,
    planning_sort_order:newOrder.trim()===""?null:Number(newOrder)
   });

   setMessage(
    `Đã thêm/reactivate ${d.row.operation_code} và mapping/sync lại toàn bộ. `+
    `Nếu đây là code mới hoàn toàn, hãy gán ST Operation Mapping để code thuộc Main Operation mong muốn.`
   );
   setNewCode("");
   setNewName("");
   setNewOrder("");
   setAddOpen(false);
   refreshConfigPage(router);
  }catch(e){
   setMessage(e instanceof Error?e.message:"Không thêm được Operation Code.");
  }finally{
   setBusy(false);
  }
 }

 async function removeOperation(row:Row){
  const ok=window.confirm(
   `Bỏ ${row.operation_code} khỏi ST Scope?\n\n`+
   `Operation sẽ được bỏ khỏi ST Scope; source catalog vẫn giữ. Mapping active của code này sẽ inactive, `+
   `sau đó hệ thống mapping/sync lại toàn bộ Planning Chain tương lai.\n`+
   `Batch/Schedule lịch sử không bị xóa.`
  );
  if(!ok)return;

  setBusy(true);
  setMessage("");
  try{
   const d=await request({operation_code:row.operation_code},"DELETE");
   setMessage(
    `Đã bỏ ${row.operation_code} khỏi ST Scope; `+
    `${d.deactivated_mappings||0} mapping được deactivate; đã mapping/sync lại toàn bộ.`
   );
   refreshConfigPage(router);
  }catch(e){
   setMessage(e instanceof Error?e.message:"Không remove được Operation Code.");
  }finally{
   setBusy(false);
  }
 }

 return <div className="section">
  <div className="erp-panel-head" style={{marginBottom:8}}>
   <div>
    <b>ST Scope & Next Operation Sort</b>
    <small className="planning-sub">
     Next Op Sort áp dụng cho cả Planning và Intermediate, chỉ dùng khi sort RAW NextOperation trên Planning Board. Thêm mới đầy đủ dùng ST Operation Flow.
    </small>
   </div>
   <button className="btn primary" type="button" disabled={busy} onClick={()=>router.push("/st-operation-flow")}>＋ Add / Configure Full Flow</button>
  </div>



  <div className="notice" style={{marginBottom:10}}>
   <b>Nguồn chuẩn:</b> md_st_operation_scope quyết định Operation nào thuộc ST. Remove ở đây chỉ bỏ khỏi ST Scope, không xóa Operation khỏi catalog toàn nhà máy. Source→Main/Area/Schedule cấu hình tại ST Operation Flow.
  </div>

  <div className="erp-table-panel table-wrap">
   <table className="erp-table">
    <thead>
     <tr>
      <th>Next Op Sort</th>
     <th>Mã công đoạn</th>
     <th>Tên công đoạn</th>
      <th>Loại</th>
     <th>Thao tác</th>
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
       <td><b>{row.operation_type==="ST_SCOPE_ONLY"?"ST_SCOPE_ONLY":row.operation_type==="BRIDGE_INTERMEDIATE"?"Intermediate":"Planning"}</b></td>
       <td>
        {editing===row.operation_code
         ? <div className="row">
            <button className="btn small primary" type="button" disabled={busy} onClick={()=>save(row.operation_code)}>Save + Remap</button>
            <button className="btn small" type="button" disabled={busy} onClick={()=>setEditing(null)}>Cancel</button>
           </div>
         : <div className="row">
            <button className="btn small" type="button" disabled={busy} onClick={()=>begin(row)}>Đặt thứ tự</button>
            {row.operation_type!=="BRIDGE_INTERMEDIATE"&&<button
             className="btn small"
             type="button"
             disabled={busy}
             onClick={()=>removeOperation(row)}
             style={{borderColor:"#dc2626",color:"#b91c1c"}}
            >
             Bỏ khỏi ST
            </button>}
           </div>}
       </td>
      </tr>
     )}
     {!rows.length&&<tr><td colSpan={5} className="muted">Không có Operation Code.</td></tr>}
    </tbody>
   </table>
  </div>
 </div>;
}
