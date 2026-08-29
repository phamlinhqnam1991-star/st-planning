"use client";
import {safeJson} from "@/lib/fetch-json";
import { useMemo,useState } from "react";

type Row={id:number;sort_order:number;st_group:string;source_operation_code:string;source_label:string|null;standard_operation_rule:string;mapping_rule:string;is_active:boolean;note?:string|null};
const RULES=["DIRECT","OCCURRENCE","SEQUENCE","SEQUENCE/FALLBACK"];
export function OperationMappingManager({rows,groups,sourceOperations}:{rows:Row[];groups:string[];sourceOperations:string[]}){
 const [q,setQ]=useState(""); const [busy,setBusy]=useState(false); const [edit,setEdit]=useState<Row|null>(null);
 const [form,setForm]=useState({st_group:groups[0]||"",source_operation_code:"",source_label:"",standard_operation_rule:"",mapping_rule:"DIRECT"});
 const filtered=useMemo(()=>rows.filter(r=>[r.st_group,r.source_operation_code,r.source_label,r.standard_operation_rule,r.mapping_rule].join(" ").toLowerCase().includes(q.toLowerCase())),[rows,q]);
 const set=(k:string,v:string)=>setForm(x=>({...x,[k]:v}));
 async function save(){
  if(!form.st_group||!form.source_operation_code||!form.standard_operation_rule)return alert("Vui lòng nhập đủ ST Group, Operation Code và Standard Operation.");
  setBusy(true);try{
   const method=edit?"PATCH":"POST";const body=edit?{...form,id:edit.id}:form;
   const r=await fetch("/api/master/operation-mapping",{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Save failed");location.reload();
  }catch(e){alert(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function remove(r:Row){
  if(!confirm(`Bỏ ${r.source_operation_code} khỏi nhóm ${r.st_group}?\n\nDữ liệu không bị DELETE; mapping sẽ chuyển inactive.`))return;
  setBusy(true);try{const x=await fetch("/api/master/operation-mapping",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:r.id})});const d=await safeJson(x);if(!x.ok)throw new Error(d.error||"Remove failed");location.reload()}catch(e){alert(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 function startEdit(r:Row){setEdit(r);setForm({st_group:r.st_group,source_operation_code:r.source_operation_code,source_label:r.source_label||"",standard_operation_rule:r.standard_operation_rule,mapping_rule:r.mapping_rule});window.scrollTo({top:0,behavior:"smooth"})}
 function cancel(){setEdit(null);setForm({st_group:groups[0]||"",source_operation_code:"",source_label:"",standard_operation_rule:"",mapping_rule:"DIRECT"})}
 return <div>
  <div className="card section"><h2 style={{marginTop:0}}>{edit?"Edit Operation Mapping":"+ Add Operation Code to Group"}</h2><p className="muted">Mã công đoạn bị bỏ khỏi nhóm sẽ chuyển inactive, không xóa lịch sử. Khi Save/Remove, ST Routing Mapping được refresh tự động.</p>
   <div className="mapping-form">
    <label>ST Group<select className="input" value={form.st_group} onChange={e=>set("st_group",e.target.value)}>{groups.map(g=><option key={g}>{g}</option>)}</select></label>
    <label>Operation Code<input className="input" list="source-ops" value={form.source_operation_code} disabled={!!edit} onChange={e=>set("source_operation_code",e.target.value.toUpperCase())}/><datalist id="source-ops">{sourceOperations.map(x=><option key={x} value={x}/>)}</datalist></label>
    <label>Source Label<input className="input" value={form.source_label} onChange={e=>set("source_label",e.target.value)}/></label>
    <label>Standard Operation<input className="input" value={form.standard_operation_rule} onChange={e=>set("standard_operation_rule",e.target.value)}/></label>
    <label>Mapping Rule<select className="input" value={form.mapping_rule} onChange={e=>set("mapping_rule",e.target.value)}>{RULES.map(x=><option key={x}>{x}</option>)}</select></label>
   </div><div className="row" style={{marginTop:12}}><button className="btn primary" disabled={busy} onClick={save}>{busy?"Đang lưu...":edit?"Lưu thay đổi":"Thêm mapping"}</button>{edit&&<button className="btn" onClick={cancel}>Hủy</button>}</div>
  </div>
  <div className="card section"><div className="row" style={{marginBottom:14}}><input className="input" placeholder="Tìm mã công đoạn / nhóm..." value={q} onChange={e=>setQ(e.target.value)}/><span className="muted">{filtered.length} mappings</span></div>
   <div style={{overflowX:"auto"}}><table><thead><tr><th>Nhóm ST</th><th>Mã công đoạn</th><th>Tên nguồn</th><th>Công đoạn chính</th><th>Quy tắc</th><th>Thao tác</th></tr></thead><tbody>{filtered.map(r=><tr key={`${r.id}:${r.st_group}:${r.source_operation_code}:${r.standard_operation_rule}`}><td><b>{r.st_group}</b></td><td>{r.source_operation_code}</td><td>{r.source_label||""}</td><td>{r.standard_operation_rule}</td><td><span className="badge">{r.mapping_rule}</span></td><td><div className="row"><button className="btn small" disabled={busy} onClick={()=>startEdit(r)}>Sửa / Chuyển</button><button className="btn danger-btn small" disabled={busy} onClick={()=>remove(r)}>Bỏ</button></div></td></tr>)}</tbody></table></div>
  </div>
 </div>
}