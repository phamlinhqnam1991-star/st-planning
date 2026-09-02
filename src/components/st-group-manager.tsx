"use client";
import {safeJson} from "@/lib/fetch-json";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {refreshConfigPage} from "@/lib/config/config-client";
type G={st_group:string;group_name:string;description:string|null;sort_order:number;is_active:boolean};
export function StGroupManager({rows}:{rows:G[]}){
 const router=useRouter();
 const [edit,setEdit]=useState<G|null>(null),[busy,setBusy]=useState(false);
 const [f,setF]=useState({st_group:"",group_name:"",description:""});
 function start(g:G){setEdit(g);setF({st_group:g.st_group,group_name:g.group_name,description:g.description||""})}
 function clear(){setEdit(null);setF({st_group:"",group_name:"",description:""})}
 async function save(){if(!f.st_group.trim())return alert("Nhập ST Group.");setBusy(true);try{
  const r=await fetch("/api/master/st-group",{method:edit?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(f)});const d=await safeJson(r);if(!r.ok)throw new Error(d.error);clear();refreshConfigPage(router)
 }catch(e){alert(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 async function deactivate(g:G){if(!confirm(`Ngưng sử dụng ST Group ${g.st_group}?`))return;setBusy(true);try{
  const r=await fetch("/api/master/st-group",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({st_group:g.st_group})});const d=await safeJson(r);if(!r.ok)throw new Error(d.error);clear();refreshConfigPage(router)
 }catch(e){alert(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 return <div className="erp-config-editor-stack">
  <section className="erp-form-panel erp-editor-panel">
   <div className="erp-panel-head"><div><b>{edit?"Sửa ST Group":"Thêm ST Group"}</b><span>Nhóm dùng để liên kết Main Operation với khu vực vật lý và điều độ.</span></div><span className="erp-record-count">{rows.length} nhóm</span></div>
   <div className="group-form erp-field-grid">
    <label>Mã nhóm ST<input className="input mono" disabled={!!edit} value={f.st_group} onChange={e=>setF({...f,st_group:e.target.value.toUpperCase()})}/></label>
    <label>Tên nhóm<input className="input" value={f.group_name} onChange={e=>setF({...f,group_name:e.target.value})}/></label>
    <label className="erp-field-span-2">Mô tả<input className="input" value={f.description} onChange={e=>setF({...f,description:e.target.value})}/></label>
   </div>
   <div className="erp-sticky-action-bar"><div className="erp-action-hint">{edit?`Đang sửa ${edit.st_group}`:"Tạo nhóm mới mà không thay đổi các nhóm hiện có."}</div><div className="row"><button className="btn primary" disabled={busy} onClick={save}>{edit?"Lưu thay đổi":"Thêm nhóm"}</button>{edit&&<button className="btn" onClick={clear}>Hủy</button>}</div></div>
  </section>
  <section className="erp-table-panel">
   <div className="erp-panel-head"><div><b>Danh sách ST Group</b><span>Nhóm đang hoạt động trong cấu hình ST Planning.</span></div></div>
   <div className="table-wrap"><table className="erp-table"><thead><tr><th>Nhóm ST</th><th>Tên nhóm</th><th>Mô tả</th><th className="action">Thao tác</th></tr></thead><tbody>{rows.map(g=><tr key={g.st_group}><td className="mono"><b>{g.st_group}</b></td><td>{g.group_name}</td><td>{g.description||"—"}</td><td className="action"><div className="row erp-row-actions"><button className="btn small" onClick={()=>start(g)}>Sửa</button><button className="btn danger-btn small" onClick={()=>deactivate(g)}>Ngưng dùng</button></div></td></tr>)}</tbody></table></div>
  </section>
 </div>
}
