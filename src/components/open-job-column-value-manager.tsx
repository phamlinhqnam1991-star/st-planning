"use client";

import {safeJson} from "@/lib/fetch-json";
import {useEffect,useState} from "react";

type Row={
 id:number;
 source_column:string;
 source_value:string;
 display_name:string|null;
 seen_count:number;
 last_seen_at:string|null;
 is_active:boolean;
};
type ColumnStat={source_column:string;value_count:number};

export function OpenJobColumnValueManager(){
 const [rows,setRows]=useState<Row[]>([]);
 const [columns,setColumns]=useState<ColumnStat[]>([]);
 const [total,setTotal]=useState(0);
 const [column,setColumn]=useState("");
 const [q,setQ]=useState("");
 const [page,setPage]=useState(1);
 const [pageSize,setPageSize]=useState(50);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [editing,setEditing]=useState<Row|null>(null);
 const [displayName,setDisplayName]=useState("");
 const [active,setActive]=useState(true);
 const [newColumn,setNewColumn]=useState("");
 const [newValue,setNewValue]=useState("");

 async function load(){
  setBusy(true);
  try{
   const params=new URLSearchParams({page:String(page),pageSize:String(pageSize)});
   if(column)params.set("column",column);
   if(q)params.set("q",q);
   const r=await fetch(`/api/config/open-job-column-values?${params.toString()}`);
   const d=await safeJson(r);
   if(!r.ok)throw new Error(d.error||"Load failed");
   setRows(d.rows||[]);
   setTotal(Number(d.total||0));
   setColumns(d.columns||[]);
  }catch(e){
   setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`);
  }finally{setBusy(false)}
 }

 useEffect(()=>{load()},[page,pageSize,column]);

 async function rebuild(){
  if(!confirm("Quét lại toàn bộ giá trị từ All Open Job hiện tại?"))return;
  setBusy(true);
  try{
   const r=await fetch("/api/config/open-job-column-values",{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"rebuild"})
   });
   const d=await safeJson(r);
   if(!r.ok)throw new Error(d.error||"Rebuild failed");
   setMessage("Đã quét xong. Danh sách giá trị đã cập nhật.");
   load();
  }catch(e){setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`)}finally{setBusy(false)}
 }

 async function addValue(){
  if(!newColumn.trim()||!newValue.trim())return alert("Nhập Column và Value.");
  setBusy(true);
  try{
   const r=await fetch("/api/config/open-job-column-values",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({source_column:newColumn.trim(),source_value:newValue.trim(),display_name:newValue.trim()})
   });
   const d=await safeJson(r);
   if(!r.ok)throw new Error(d.error||"Add failed");
   setNewColumn("");setNewValue("");
   setMessage("Đã thêm giá trị.");
   load();
  }catch(e){setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`)}finally{setBusy(false)}
 }

 async function saveEdit(){
  if(!editing)return;
  setBusy(true);
  try{
   const r=await fetch("/api/config/open-job-column-values",{
    method:"PATCH",headers:{"content-type":"application/json"},
    body:JSON.stringify({id:editing.id,display_name:displayName||null,is_active:active})
   });
   const d=await safeJson(r);
   if(!r.ok)throw new Error(d.error||"Save failed");
   setEditing(null);
   load();
  }catch(e){setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`)}finally{setBusy(false)}
 }

 async function inactivate(row:Row){
  if(!confirm(`Inactivate giá trị "${row.source_value}" của cột ${row.source_column}?`))return;
  setBusy(true);
  try{
   const r=await fetch("/api/config/open-job-column-values",{
    method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:row.id})
   });
   const d=await safeJson(r);
   if(!r.ok)throw new Error(d.error||"Remove failed");
   load();
  }catch(e){setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`)}finally{setBusy(false)}
 }

 const totalPages=Math.max(1,Math.ceil(total/pageSize));

 return <div className="section">
  <div className="erp-table-panel">
   <div className="erp-panel-head">
    <b>All Open Job Column Values</b>
    <span>{total.toLocaleString()} values · {columns.length} columns</span>
   </div>

   <div className="row erp-filter-row">
    <button className="btn primary" disabled={busy} onClick={rebuild}>Quét lại dữ liệu</button>
    <select className="input" value={column} onChange={e=>{setColumn(e.target.value);setPage(1)}}>
     <option value="">All columns</option>
     {columns.map(c=><option key={c.source_column} value={c.source_column}>{c.source_column} ({c.value_count})</option>)}
    </select>
    <input className="input" placeholder="Tìm giá trị..." value={q}
     onChange={e=>{setQ(e.target.value);setPage(1)}}/>
    <select className="input" value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}>
     <option value={50}>50 / trang</option><option value={100}>100 / trang</option><option value={200}>200 / trang</option>
    </select>
   </div>

   <div className="row erp-filter-row">
    <input className="input" style={{maxWidth:220}} placeholder="Cột mới (vd NextOperation)" value={newColumn} onChange={e=>setNewColumn(e.target.value)}/>
    <input className="input" style={{maxWidth:280}} placeholder="Giá trị mới" value={newValue} onChange={e=>setNewValue(e.target.value)}/>
    <button className="btn" disabled={busy} onClick={addValue}>Thêm giá trị</button>
   </div>

   {message&&<div className="notice">{message}</div>}

   <div className="table-wrap">
    <table className="erp-table">
     <thead><tr>
      <th>Cột nguồn</th><th>Giá trị nguồn</th><th>Tên hiển thị</th>
      <th>Số lần gặp</th><th>Gặp lần cuối</th><th>Hoạt động</th><th></th>
     </tr></thead>
     <tbody>
      {rows.map(r=><tr key={r.id}>
       <td><b>{r.source_column}</b></td>
       <td className="mono">{r.source_value}</td>
       <td>
        {editing&&editing.id===r.id
         ? <input className="input" value={displayName} onChange={e=>setDisplayName(e.target.value)}/>
         : r.display_name||"—"}
       </td>
       <td className="num mono">{r.seen_count}</td>
       <td className="mono">{r.last_seen_at?new Date(r.last_seen_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"}):"—"}</td>
       <td>{r.is_active?"Có":"Không"}</td>
       <td className="action">
        {editing&&editing.id===r.id
         ? <div className="row">
            <label className="row"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>Active</label>
            <button className="btn small primary" onClick={saveEdit}>Save</button>
            <button className="btn small" onClick={()=>setEditing(null)}>Cancel</button>
           </div>
         : <div className="row">
            <button className="btn small" onClick={()=>{setEditing(r);setDisplayName(r.display_name||r.source_value);setActive(r.is_active)}}>Sửa</button>
            <button className="btn danger-btn small" onClick={()=>inactivate(r)}>Ngưng</button>
           </div>}
       </td>
      </tr>)}
      {!rows.length&&<tr><td colSpan={7} className="muted">Chưa có dữ liệu. Bấm Scan / Rebuild để quét từ All Open Job.</td></tr>}
     </tbody>
    </table>
   </div>

   <div className="row erp-pager">
    <button className="btn small" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>‹ Trước</button>
    <span>Trang {page} / {totalPages} · {total.toLocaleString()} values</span>
    <button className="btn small" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>Sau ›</button>
   </div>
  </div>
 </div>
}
