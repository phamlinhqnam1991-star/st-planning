"use client";

import {useMemo,useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";

type FlowRow={
 operation_code:string;operation_name:string|null;planning_sort_order:number|null;
 operation_type:"PLANNING_OPERATION"|"ST_SCOPE_ONLY";
 mapping_id:number|null;mapping_rule:string|null;standard_operation:string|null;st_group:string|null;
 area_id:number|null;area_name:string|null;schedule_area_code:string|null;schedule_area_name:string|null;planner_owner:string|null;
 open_jobs:number;config_status:string;
};
type RawOp={operation_code:string;operation_name:string|null;open_jobs:number;in_st_scope:boolean};
type MainOp={standard_operation:string;st_group:string;planning_sort_order:number|null;batch_prefix:string|null};
type Group={st_group:string;group_name:string};
type Area={id:number;area_code:string;area_name:string};
type ScheduleArea={schedule_area_code:string;schedule_area_name:string;planner_owner:string|null};

type FormState={
 source_operation_code:string;source_operation_name:string;source_planning_order:string;
 operation_type:"PLANNING_OPERATION"|"ST_SCOPE_ONLY";
 standard_operation:string;main_planning_order:string;batch_prefix:string;
 st_group:string;area_id:string;schedule_area_code:string;planner_owner:string;mapping_rule:string;
};
const emptyForm:FormState={
 source_operation_code:"",source_operation_name:"",source_planning_order:"",
 operation_type:"PLANNING_OPERATION",
 standard_operation:"",main_planning_order:"",batch_prefix:"",
 st_group:"",area_id:"",schedule_area_code:"",planner_owner:"",mapping_rule:"DIRECT"
};

export function StOperationFlowManager({
 rows,rawOperations,mainOperations,groups,areas,scheduleAreas
}:{
 rows:FlowRow[];rawOperations:RawOp[];mainOperations:MainOp[];groups:Group[];areas:Area[];scheduleAreas:ScheduleArea[];
}){
 const [form,setForm]=useState<FormState>(emptyForm);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [search,setSearch]=useState("");
 usePopupMessage(message);
 const scopeOnly=form.operation_type==="ST_SCOPE_ONLY";

 const filtered=useMemo(()=>{
  const q=search.trim().toUpperCase();
  if(!q)return rows;
  return rows.filter(r=>[
   r.operation_code,r.operation_name,r.standard_operation,r.st_group,r.area_name,r.schedule_area_name,r.config_status
  ].some(v=>String(v??"").toUpperCase().includes(q)));
 },[rows,search]);

 const statusCounts=useMemo(()=>rows.reduce((m,r)=>{
  m[r.config_status]=(m[r.config_status]||0)+1;return m;
 },{} as Record<string,number>),[rows]);

 const selectSource=(code:string)=>{
  const op=rawOperations.find(x=>x.operation_code===code);
  const existing=rows.find(x=>x.operation_code===code);
  setForm(f=>({
   ...f,
   source_operation_code:code,
   source_operation_name:op?.operation_name||code,
   source_planning_order:existing?.planning_sort_order==null?"":String(existing.planning_sort_order),
   operation_type:existing?.operation_type||"PLANNING_OPERATION"
  }));
 };

 const selectMain=(standard:string)=>{
  const m=mainOperations.find(x=>x.standard_operation===standard);
  setForm(f=>({
   ...f,
   standard_operation:standard,
   st_group:m?.st_group||f.st_group,
   main_planning_order:m?.planning_sort_order==null?f.main_planning_order:String(m.planning_sort_order),
   batch_prefix:m?.batch_prefix||f.batch_prefix
  }));
 };

 const edit=(r:FlowRow)=>{
  const m=mainOperations.find(x=>x.standard_operation===r.standard_operation);
  setForm({
   source_operation_code:r.operation_code,
   source_operation_name:r.operation_name||r.operation_code,
   source_planning_order:r.planning_sort_order==null?"":String(r.planning_sort_order),
   operation_type:r.operation_type||"PLANNING_OPERATION",
   standard_operation:r.standard_operation||"",
   main_planning_order:m?.planning_sort_order==null?"":String(m.planning_sort_order),
   batch_prefix:m?.batch_prefix||"",
   st_group:r.st_group||m?.st_group||"",
   area_id:r.area_id==null?"":String(r.area_id),
   schedule_area_code:r.schedule_area_code||"",
   planner_owner:r.planner_owner||"",
   mapping_rule:r.mapping_rule||"DIRECT"
  });
  window.scrollTo({top:0,behavior:"smooth"});
 };

 const save=async()=>{
  if(!form.source_operation_code){
   setMessage("Nhập Operation Code.");return;
  }
  if(!scopeOnly&&(!form.standard_operation||!form.st_group||!form.area_id||!form.schedule_area_code||!["1","2"].includes(form.planner_owner))){
   setMessage("Planning Operation bắt buộc đủ Main Operation → ST Group → Physical Area → Schedule Area → Planner.");return;
  }
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/config/st-operation-flow",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({
     ...form,
     source_planning_order:form.source_planning_order===""?null:Number(form.source_planning_order),
     main_planning_order:form.main_planning_order===""?null:Number(form.main_planning_order),
     area_id:form.area_id===""?null:Number(form.area_id)
    })
   });
   const d=await r.json(); if(!r.ok)throw new Error(d.error||"Không lưu được ST Operation Flow.");
   setMessage(d.operation_type==="ST_SCOPE_ONLY"
    ?`Đã lưu ${d.source_operation_code} = ST_SCOPE_ONLY; vẫn thuộc All Open Jobs và đã loại khỏi Planning/Batch/Điều độ.`
    :`Đã đồng bộ ${d.source_operation_code} → ${d.standard_operation} qua toàn bộ ST Flow.`);
   setForm(emptyForm);setTimeout(()=>location.reload(),700);
  }catch(e){setMessage(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 };

 const deactivate=async(code:string)=>{
  if(!confirm(`Bỏ ${code} khỏi ST Scope?\n\nSource Operation vẫn giữ trong Operation catalog. Mapping ST của code này sẽ inactive và Planning Chain tương lai được rebuild.`))return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/config/st-operation-flow",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({source_operation_code:code})});
   const d=await r.json();if(!r.ok)throw new Error(d.error||"Không deactivate được ST Operation.");
   setMessage(`Đã bỏ ${code} khỏi ST Scope và rebuild dữ liệu dẫn xuất.`);setTimeout(()=>location.reload(),700);
  }catch(e){setMessage(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 };

 return <>
  <div className="card section">
   <div className="erp-panel-head">
    <div><b>ST Operation Flow · Operation Type</b><small className="planning-sub">Chọn ST_SCOPE_ONLY hoặc Planning Operation trước khi cấu hình chuỗi Planning.</small></div>
    <button className="btn" type="button" onClick={()=>setForm(emptyForm)} disabled={busy}>New</button>
   </div>

   <div className="notice" style={{marginBottom:10}}>
    {scopeOnly
     ?<><b>ST_SCOPE_ONLY:</b> Operation Code → ST Scope ON → All Open Jobs. Không sinh Planning Chain, Batch hoặc dòng trên Board Điều Độ.</>
     :<><b>Planning Operation:</b> Operation Code → ST Scope ON → Main Operation → ST Group → Physical Area → Schedule Area → Planner → Planning/Batch/Điều độ.</>}
   </div>

   <div className="candidate-filter-grid">
    <label>1. Operation Code
     <input className="input" list="st-source-ops" value={form.source_operation_code} onChange={e=>selectSource(e.target.value.toUpperCase())} placeholder="VD: MSKG-AND"/>
     <datalist id="st-source-ops">{rawOperations.map(x=><option key={x.operation_code} value={x.operation_code}>{x.operation_name||x.operation_code} · {x.open_jobs||0} open jobs</option>)}</datalist>
    </label>
    <label>Operation Name<input className="input" value={form.source_operation_name} onChange={e=>setForm({...form,source_operation_name:e.target.value})}/></label>
    <label>2. ST Scope<select className="input" value="ON" disabled><option>ON</option></select></label>
    <label>3. Operation Type<select className="input" value={form.operation_type} onChange={e=>{const type=e.target.value as FormState["operation_type"];setForm(type==="ST_SCOPE_ONLY"?{...form,operation_type:type,standard_operation:"",main_planning_order:"",batch_prefix:"",st_group:"",area_id:"",schedule_area_code:"",planner_owner:"",mapping_rule:"DIRECT"}:{...form,operation_type:type})}}><option value="PLANNING_OPERATION">Planning Operation</option><option value="ST_SCOPE_ONLY">ST_SCOPE_ONLY</option></select></label>
    <label>Planning Order (Optional)<input className="input" type="number" value={form.source_planning_order} onChange={e=>setForm({...form,source_planning_order:e.target.value})} placeholder="Có thể để trống"/></label>
    <label style={{opacity:scopeOnly ? 0.48 : 1}}>4. Main Operation
     <input className="input" disabled={scopeOnly} list="st-main-ops" value={form.standard_operation} onChange={e=>selectMain(e.target.value.toUpperCase())} placeholder={scopeOnly?"Optional · để trống":"VD: CPBILP"}/>
     <datalist id="st-main-ops">{mainOperations.map(x=><option key={x.standard_operation} value={x.standard_operation}>{x.st_group}</option>)}</datalist>
    </label>
    <label style={{opacity:scopeOnly ? 0.48 : 1}}>Main Planning Order<input className="input" disabled={scopeOnly} type="number" value={form.main_planning_order} onChange={e=>setForm({...form,main_planning_order:e.target.value})} placeholder={scopeOnly?"Optional · để trống":""}/></label>
    <label style={{opacity:scopeOnly ? 0.48 : 1}}>Batch Prefix<input className="input" disabled={scopeOnly} maxLength={3} value={form.batch_prefix} onChange={e=>setForm({...form,batch_prefix:e.target.value.toUpperCase()})} placeholder={scopeOnly?"Optional · để trống":"3 ký tự"}/></label>
    <label style={{opacity:scopeOnly ? 0.48 : 1}}>5. ST Group<select className="input" disabled={scopeOnly} value={form.st_group} onChange={e=>setForm({...form,st_group:e.target.value})}><option value="">{scopeOnly?"Optional · để trống":"Select..."}</option>{groups.map(x=><option key={x.st_group} value={x.st_group}>{x.st_group} · {x.group_name}</option>)}</select></label>
    <label style={{opacity:scopeOnly ? 0.48 : 1}}>6. Physical Area<select className="input" disabled={scopeOnly} value={form.area_id} onChange={e=>setForm({...form,area_id:e.target.value})}><option value="">{scopeOnly?"Optional · để trống":"Select..."}</option>{areas.map(x=><option key={x.id} value={x.id}>{x.area_name}</option>)}</select></label>
    <label style={{opacity:scopeOnly ? 0.48 : 1}}>7. Schedule Area<select className="input" disabled={scopeOnly} value={form.schedule_area_code} onChange={e=>{const code=e.target.value;const sa=scheduleAreas.find(x=>x.schedule_area_code===code);setForm({...form,schedule_area_code:code,planner_owner:["1","2"].includes(sa?.planner_owner||"")?String(sa?.planner_owner):""})}}><option value="">{scopeOnly?"Optional · để trống":"Select..."}</option>{scheduleAreas.map(x=><option key={x.schedule_area_code} value={x.schedule_area_code}>{x.schedule_area_name}</option>)}</select></label>
    <label style={{opacity:scopeOnly ? 0.48 : 1}}>8. Planner Owner<select className="input" disabled={scopeOnly} value={form.planner_owner} onChange={e=>setForm({...form,planner_owner:e.target.value})}><option value="">{scopeOnly?"Optional · để trống":"Select..."}</option><option value="1">Planner 1</option><option value="2">Planner 2</option></select></label>
    <label style={{opacity:scopeOnly ? 0.48 : 1}}>Mapping Rule<select className="input" disabled={scopeOnly} value={form.mapping_rule} onChange={e=>setForm({...form,mapping_rule:e.target.value})}><option>DIRECT</option><option>OCCURRENCE</option><option>SEQUENCE</option><option>SEQUENCE/FALLBACK</option></select></label>
   </div>
   <div className="row" style={{marginTop:12}}><button className="btn primary" type="button" onClick={save} disabled={busy}>{busy?"Synchronizing...":scopeOnly?"Save ST_SCOPE_ONLY":"Save + Remap + Rebuild All"}</button><span className="muted">Existing Batch/Schedule history is preserved.</span></div>
  </div>

  <div className="erp-table-panel section">
   <div className="erp-panel-head">
    <div><b>ST Configuration Health</b><small className="planning-sub">ST_SCOPE_ONLY hợp lệ mà không cần Main/Group/Area/Schedule/Planner.</small></div>
    <div className="row"><span>Planning OK {statusCounts.OK||0}</span><span>ST Scope Only {statusCounts.ST_SCOPE_ONLY||0}</span><span>Need config {rows.length-(statusCounts.OK||0)-(statusCounts.ST_SCOPE_ONLY||0)}</span><input className="input" style={{width:220}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Operation..."/></div>
   </div>
   <div className="table-wrap" style={{maxHeight:560}}><table className="erp-table"><thead><tr><th>Source Op</th><th>Type</th><th>Open Jobs</th><th>Source Order</th><th>Main Operation</th><th>Rule</th><th>ST Group</th><th>Physical Area</th><th>Schedule Area</th><th>Planner</th><th>Status</th><th>Action</th></tr></thead><tbody>
    {filtered.map(r=>{const valid=r.config_status==="OK"||r.config_status==="ST_SCOPE_ONLY";return <tr key={r.operation_code} style={{background:valid?undefined:"#fff7ed"}}><td><b>{r.operation_code}</b><small className="planning-sub">{r.operation_name||""}</small></td><td><b>{r.operation_type==="ST_SCOPE_ONLY"?"ST_SCOPE_ONLY":"Planning"}</b></td><td className="num">{r.open_jobs||0}</td><td>{r.planning_sort_order??"—"}</td><td><b>{r.standard_operation||"—"}</b></td><td>{r.mapping_rule||"—"}</td><td>{r.st_group||"—"}</td><td>{r.area_name||"—"}</td><td>{r.schedule_area_name||"—"}</td><td>{r.planner_owner||"—"}</td><td><b>{r.config_status}</b></td><td><div className="row"><button className="btn small" onClick={()=>edit(r)}>Configure</button><button className="btn small danger-btn" onClick={()=>deactivate(r.operation_code)} disabled={busy}>Remove ST</button></div></td></tr>})}
   </tbody></table></div>
  </div>
 </>;
}
