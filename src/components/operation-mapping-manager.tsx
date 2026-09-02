"use client";

import {pushAppToast} from "@/components/app-toast-provider";
import {safeJson} from "@/lib/fetch-json";
import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {refreshConfigPage} from "@/lib/config/config-client";
import {useErpConfirm} from "@/components/app-dialog-provider";

type Row={id:number;sort_order:number;st_group:string;source_operation_code:string;source_label:string|null;standard_operation_rule:string;mapping_rule:string;is_active:boolean;note?:string|null};
const RULES=["DIRECT","OCCURRENCE","SEQUENCE","SEQUENCE/FALLBACK"];
export function OperationMappingManager({rows,groups,sourceOperations}:{rows:Row[];groups:string[];sourceOperations:string[]}){
 const confirmErp=useErpConfirm();
 const router=useRouter();
 const [q,setQ]=useState(""); const [busy,setBusy]=useState(false); const [edit,setEdit]=useState<Row|null>(null);
 const [form,setForm]=useState({st_group:groups[0]||"",source_operation_code:"",source_label:"",standard_operation_rule:"",mapping_rule:"DIRECT"});
 const filtered=useMemo(()=>rows.filter(r=>[r.st_group,r.source_operation_code,r.source_label,r.standard_operation_rule,r.mapping_rule].join(" ").toLowerCase().includes(q.toLowerCase())),[rows,q]);
 const set=(k:string,v:string)=>setForm(x=>({...x,[k]:v}));
 async function save(){
  if(!form.st_group||!form.source_operation_code||!form.standard_operation_rule)return pushAppToast("Vui lòng nhập đủ ST Group, Operation Code và Main Operation.");
  setBusy(true);try{
   const method=edit?"PATCH":"POST";const body=edit?{...form,id:edit.id}:form;
   const r=await fetch("/api/master/operation-mapping",{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Không lưu được mapping.");cancel();refreshConfigPage(router);
  }catch(e){pushAppToast(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function remove(r:Row){
  if(!await confirmErp(`Bỏ ${r.source_operation_code} khỏi nhóm ${r.st_group}?\n\nLịch sử đã có vẫn được giữ.`))return;
  setBusy(true);try{const x=await fetch("/api/master/operation-mapping",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:r.id})});const d=await safeJson(x);if(!x.ok)throw new Error(d.error||"Không bỏ được mapping.");refreshConfigPage(router)}catch(e){pushAppToast(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 function startEdit(r:Row){setEdit(r);setForm({st_group:r.st_group,source_operation_code:r.source_operation_code,source_label:r.source_label||"",standard_operation_rule:r.standard_operation_rule,mapping_rule:r.mapping_rule});window.scrollTo({top:0,behavior:"smooth"})}
 function cancel(){setEdit(null);setForm({st_group:groups[0]||"",source_operation_code:"",source_label:"",standard_operation_rule:"",mapping_rule:"DIRECT"})}
 return <div className="erp-config-editor-stack">
  <section className="erp-form-panel erp-editor-panel">
   <div className="erp-panel-head"><div><b>{edit?"Sửa Operation Mapping":"Thêm Operation Mapping"}</b><span>Map Operation Code nguồn vào Main Operation và ST Group.</span></div>{edit&&<span className="status-pill">EDIT</span>}</div>
   <div className="mapping-form erp-field-grid">
    <label>ST Group<select className="input" value={form.st_group} onChange={e=>set("st_group",e.target.value)}>{groups.map(g=><option key={g}>{g}</option>)}</select></label>
    <label>Operation Code<input className="input mono" list="source-ops" value={form.source_operation_code} disabled={!!edit} onChange={e=>set("source_operation_code",e.target.value.toUpperCase())}/><datalist id="source-ops">{sourceOperations.map(x=><option key={x} value={x}/>)}</datalist></label>
    <label>Source Label<input className="input" value={form.source_label} onChange={e=>set("source_label",e.target.value)}/></label>
    <label>Main Operation<input className="input" value={form.standard_operation_rule} onChange={e=>set("standard_operation_rule",e.target.value)}/></label>
    <label>Mapping Rule<select className="input" value={form.mapping_rule} onChange={e=>set("mapping_rule",e.target.value)}>{RULES.map(x=><option key={x}>{x}</option>)}</select></label>
   </div>
   <div className="erp-sticky-action-bar"><div className="erp-action-hint">Mapping mới sẽ được dùng khi dựng Planning Chain; lịch sử Batch/Schedule không bị xóa.</div><div className="row"><button className="btn primary" disabled={busy} onClick={save}>{busy?"Đang lưu...":edit?"Lưu thay đổi":"Thêm mapping"}</button>{edit&&<button className="btn" onClick={cancel}>Hủy</button>}</div></div>
  </section>
  <section className="erp-table-panel">
   <div className="erp-panel-head"><div><b>Source → Main Mapping</b><span>{filtered.length} / {rows.length} mapping</span></div><div className="erp-command-actions"><input className="input erp-search-input" placeholder="Tìm Operation Code / ST Group / Main Operation..." value={q} onChange={e=>setQ(e.target.value)}/></div></div>
   <div className="table-wrap"><table className="erp-table"><thead><tr><th>ST Group</th><th>Operation Code</th><th>Source Label</th><th>Main Operation</th><th>Rule</th><th className="action">Thao tác</th></tr></thead><tbody>{filtered.map(r=><tr key={`${r.id}:${r.st_group}:${r.source_operation_code}:${r.standard_operation_rule}`}><td><b>{r.st_group}</b></td><td className="mono"><b>{r.source_operation_code}</b></td><td>{r.source_label||"—"}</td><td><b>{r.standard_operation_rule}</b></td><td><span className="badge">{r.mapping_rule}</span></td><td className="action"><div className="row erp-row-actions"><button className="btn small" disabled={busy} onClick={()=>startEdit(r)}>Sửa / Chuyển</button><button className="btn danger-btn small" disabled={busy} onClick={()=>remove(r)}>Bỏ</button></div></td></tr>)}</tbody></table></div>
  </section>
 </div>
}
