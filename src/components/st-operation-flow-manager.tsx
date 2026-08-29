"use client";

import {safeJson} from "@/lib/fetch-json";
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
 const [step,setStep]=useState<1|2|3>(1);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [search,setSearch]=useState("");
 usePopupMessage(message);
 const scopeOnly=form.operation_type==="ST_SCOPE_ONLY";
 const maxStep:1|2|3=scopeOnly?1:3;

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

 const selectScheduleArea=(code:string)=>{
  const sa=scheduleAreas.find(x=>x.schedule_area_code===code);
  setForm(f=>({
   ...f,
   schedule_area_code:code,
   planner_owner:["1","2"].includes(sa?.planner_owner||"")?String(sa?.planner_owner):f.planner_owner
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
  setStep(r.operation_type==="ST_SCOPE_ONLY"?1:3);
  window.scrollTo({top:0,behavior:"smooth"});
 };

 const next=()=>{
  if(!form.source_operation_code){setMessage("Bước 1: nhập Operation Code.");return;}
  if(step===1){setStep(scopeOnly?1:2);return;}
  if(step===2){
   if(!form.standard_operation){setMessage("Bước 2: chọn Công đoạn chính.");return;}
   setStep(3);return;
  }
 };

 const back=()=>setStep(s=>s===1?1:(s-1) as 1|2|3);

 const save=async()=>{
  if(!form.source_operation_code){
   setMessage("Nhập Operation Code.");return;
  }
  if(!scopeOnly&&(!form.standard_operation||!form.st_group||!form.area_id||!form.schedule_area_code||!["1","2"].includes(form.planner_owner))){
   setMessage("Planning Operation bắt buộc đủ Main Operation → ST Group → Physical Area → Schedule Area → Planner.");return;
  }
  if(!scopeOnly){
   const ok=window.confirm(
    "Lưu sẽ dựng lại toàn bộ chuỗi công đoạn (ST Routing + Planning Chain) cho các Job liên quan.\n\n"+
    "Thao tác này có thể mất vài chục giây. Lịch sử Batch/Schedule không bị xóa.\n\nTiếp tục?"
   );
   if(!ok)return;
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
   const d=await safeJson(r); if(!r.ok)throw new Error(d.error||"Không lưu được ST Operation Flow.");
   setMessage(d.operation_type==="ST_SCOPE_ONLY"
    ?`Đã lưu ${d.source_operation_code} = ST_SCOPE_ONLY; vẫn thuộc All Open Jobs và đã loại khỏi Planning/Batch/Điều độ.`
    :`Đã đồng bộ ${d.source_operation_code} → ${d.standard_operation} qua toàn bộ ST Flow.`);
   setForm(emptyForm);setStep(1);setTimeout(()=>location.reload(),700);
  }catch(e){setMessage(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 };

 const deactivate=async(code:string)=>{
  if(!confirm(`Bỏ ${code} khỏi ST Scope?\n\nSource Operation vẫn giữ trong Operation catalog. Mapping ST của code này sẽ inactive; Job biến khỏi Planning Board ngay (xóa nhanh — nên bấm Rebuild Chain khi thuận tiện).`))return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/config/st-operation-flow",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({source_operation_code:code})});
   const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Không deactivate được ST Operation.");
   setMessage(`Đã bỏ ${code} khỏi ST Scope (nhanh). Job đã biến khỏi bảng; bấm Rebuild Chain trên Planning Board để làm sạch chuỗi khi thuận tiện.`);setTimeout(()=>location.reload(),700);
  }catch(e){setMessage(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 };

 const chainPreview=()=>{
  const chips:{label:string;ok:boolean}[]=[
   {label:form.source_operation_code||"Operation Code",ok:!!form.source_operation_code},
   {label:scopeOnly?"ST_SCOPE_ONLY (chỉ hiển thị)":(form.standard_operation||"Công đoạn chính"),ok:scopeOnly?true:!!form.standard_operation},
  ];
  if(!scopeOnly){
   chips.push({label:form.st_group||"Nhóm ST",ok:!!form.st_group});
   chips.push({label:areas.find(a=>String(a.id)===form.area_id)?.area_name||"Khu vật lý",ok:!!form.area_id});
   chips.push({label:scheduleAreas.find(s=>s.schedule_area_code===form.schedule_area_code)?.schedule_area_name||"Khu điều độ",ok:!!form.schedule_area_code});
   chips.push({label:form.planner_owner?`Planner ${form.planner_owner}`:"Planner",ok:!!form.planner_owner});
  }
  return <div className="chain-preview">
   <b style={{fontSize:11}}>Chuỗi sẽ lưu:</b>
   {chips.map((c,i)=><span key={i} className={`cp ${c.ok?"ok":"miss"}`}>{c.label}</span>)}
  </div>;
 };

 const wsStep=(no:number,label:string,desc:string)=>{
  const state=step>no?"done":step===no?"active":"";
  return <div className={`wizard-step ${state}`}>
   <span className="ws-no">{step>no?"✓":no}</span>
   <div><b>{label}</b><small>{desc}</small></div>
  </div>;
 };

 return <>
  <div className="card section">
   <div className="erp-panel-head">
    <div><b>Trợ lý cấu hình Operation</b><small className="planning-sub">Làm theo 3 bước — hệ thống tự gợi ý từ dữ liệu thật.</small></div>
    <button className="btn" type="button" onClick={()=>{setForm(emptyForm);setStep(1);}} disabled={busy}>＋ Làm mới</button>
   </div>

   <div className="wizard-stepper">
    {wsStep(1,"Operation Code","Chọn mã công đoạn")}
    <div className={`wizard-conn ${step>1?"done":""}`}/>
    {wsStep(2,"Công đoạn & Nhóm","Gán công đoạn chính")}
    <div className={`wizard-conn ${step>2?"done":""}`}/>
    {wsStep(3,"Khu vực & Planner","Chọn nơi chạy, ai lo")}
   </div>

   <div className="wizard-panel">
    {step===1&&<>
     <div className="notice" style={{marginBottom:10}}>
      <b>Bước 1 · Mã công đoạn (Operation Code)</b> — chọn code từ danh sách (có gợi ý). Hệ thống kiểm tra code đã thuộc ST chưa.
     </div>
     <div className="candidate-filter-grid">
      <label>Mã công đoạn
       <input className="input" list="st-source-ops" value={form.source_operation_code} onChange={e=>selectSource(e.target.value.toUpperCase())} placeholder="VD: MSKG-AND"/>
       <datalist id="st-source-ops">{rawOperations.map(x=><option key={x.operation_code} value={x.operation_code}>{x.operation_name||x.operation_code} · {x.open_jobs||0} job đang mở</option>)}</datalist>
      </label>
      <label>Tên công đoạn<input className="input" value={form.source_operation_name} onChange={e=>setForm({...form,source_operation_name:e.target.value})}/></label>
      <label>Loại Operation<select className="input" value={form.operation_type} onChange={e=>{const type=e.target.value as FormState["operation_type"];setForm(type==="ST_SCOPE_ONLY"?{...form,operation_type:type,standard_operation:"",main_planning_order:"",batch_prefix:"",st_group:"",area_id:"",schedule_area_code:"",planner_owner:"",mapping_rule:"DIRECT"}:{...form,operation_type:type})}}>
       <option value="PLANNING_OPERATION">Planning Operation — được lập kế hoạch</option>
       <option value="ST_SCOPE_ONLY">ST_SCOPE_ONLY — chỉ hiển thị, không lập kế hoạch</option>
      </select></label>
      <label>Thứ tự công đoạn (tùy chọn)<input className="input" type="number" value={form.source_planning_order} onChange={e=>setForm({...form,source_planning_order:e.target.value})} placeholder="Có thể để trống"/></label>
     </div>
     {scopeOnly&&<div className="notice" style={{marginTop:10}}><b>ST_SCOPE_ONLY:</b> code chỉ hiển thị ở All Open Jobs — không sinh Planning Chain, Batch hoặc dòng trên Board Điều Độ. Bấm <b>Lưu</b> bên dưới là xong.</div>}
    </>}

    {step===2&&<>
     <div className="notice" style={{marginBottom:10}}>
      <b>Bước 2 · Công đoạn chính & Nhóm</b> — chọn công đoạn chính, hệ thống tự điền nhóm/thứ tự/tiền tố số lô (có thể sửa).
     </div>
     <div className="candidate-filter-grid">
      <label>Công đoạn chính
       <input className="input" list="st-main-ops" value={form.standard_operation} onChange={e=>selectMain(e.target.value.toUpperCase())} placeholder="VD: CPBILP"/>
       <datalist id="st-main-ops">{mainOperations.map(x=><option key={x.standard_operation} value={x.standard_operation}>{x.st_group}</option>)}</datalist>
      </label>
      <label>Thứ tự công đoạn chính<input className="input" type="number" value={form.main_planning_order} onChange={e=>setForm({...form,main_planning_order:e.target.value})} placeholder="Tự điền"/></label>
      <label>Tiền tố số lô<input className="input" maxLength={3} value={form.batch_prefix} onChange={e=>setForm({...form,batch_prefix:e.target.value.toUpperCase()})} placeholder="3 ký tự, vd CHM"/></label>
      <label>Nhóm ST<select className="input" value={form.st_group} onChange={e=>setForm({...form,st_group:e.target.value})}><option value="">Chọn nhóm...</option>{groups.map(x=><option key={x.st_group} value={x.st_group}>{x.st_group} · {x.group_name}</option>)}</select></label>
      <label>Quy tắc mapping<select className="input" value={form.mapping_rule} onChange={e=>setForm({...form,mapping_rule:e.target.value})}><option>DIRECT</option><option>OCCURRENCE</option><option>SEQUENCE</option><option>SEQUENCE/FALLBACK</option></select></label>
     </div>
     <small className="muted" style={{display:"block",marginTop:6}}>Quy tắc mapping: DIRECT = cố định · OCCURRENCE = đánh số lần lặp (PRIMER/PRIMER2/PRIMER3) · SEQUENCE = tùy vị trí trong chuỗi (HE-BAKE) · SEQUENCE/FALLBACK = ưu tiên ngữ cảnh, không khớp thì dùng mặc định.</small>
    </>}

    {step===3&&<>
     <div className="notice" style={{marginBottom:10}}>
      <b>Bước 3 · Khu vực & Planner</b> — chọn nơi công đoạn này chạy và ai phụ trách điều độ.
     </div>
     <div className="candidate-filter-grid">
      <label>Khu vực vật lý<select className="input" value={form.area_id} onChange={e=>setForm({...form,area_id:e.target.value})}><option value="">Chọn khu...</option>{areas.map(x=><option key={x.id} value={x.id}>{x.area_name}</option>)}</select></label>
      <label>Khu vực điều độ<select className="input" value={form.schedule_area_code} onChange={e=>selectScheduleArea(e.target.value)}><option value="">Chọn lane...</option>{scheduleAreas.map(x=><option key={x.schedule_area_code} value={x.schedule_area_code}>{x.schedule_area_name}</option>)}</select></label>
      <label>Planner phụ trách<select className="input" value={form.planner_owner} onChange={e=>setForm({...form,planner_owner:e.target.value})}><option value="">Chọn...</option><option value="1">Planner 1</option><option value="2">Planner 2</option></select></label>
     </div>
     {chainPreview()}
    </>}

    <div className="row" style={{marginTop:14,justifyContent:"space-between"}}>
     <div className="row">
      {step>1&&<button className="btn" type="button" onClick={back} disabled={busy}>← Quay lại</button>}
      {step<maxStep&&<button className="btn primary" type="button" onClick={next} disabled={busy}>Tiếp tục →</button>}
     </div>
     <div className="row">
      {step===maxStep&&<button className="btn primary" type="button" onClick={save} disabled={busy}>{busy?"Đang đồng bộ...":scopeOnly?"💾 Lưu ST_SCOPE_ONLY":"💾 Lưu + Dựng lại chuỗi"}</button>}
      <span className="muted" style={{fontSize:11}}>Lịch sử Batch/Schedule được giữ nguyên.</span>
     </div>
    </div>
   </div>
  </div>

  <div className="erp-table-panel section">
   <div className="erp-panel-head">
    <div><b>Danh sách Operation đã khai báo</b><small className="planning-sub">ST_SCOPE_ONLY hợp lệ mà không cần Main/Group/Area/Schedule/Planner.</small></div>
    <div className="row"><span>Đã cấu hình đủ {statusCounts.OK||0}</span><span>ST Scope Only {statusCounts.ST_SCOPE_ONLY||0}</span><span>Cần bổ sung {rows.length-(statusCounts.OK||0)-(statusCounts.ST_SCOPE_ONLY||0)}</span><input className="input" style={{width:220}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm Operation..."/></div>
   </div>
   <div className="table-wrap" style={{maxHeight:560}}><table className="erp-table"><thead><tr><th>Mã nguồn</th><th>Loại</th><th>Số Job</th><th>Thứ tự</th><th>Công đoạn chính</th><th>Rule</th><th>Nhóm ST</th><th>Khu vật lý</th><th>Khu điều độ</th><th>Planner</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
    {filtered.map(r=>{const valid=r.config_status==="OK"||r.config_status==="ST_SCOPE_ONLY";return <tr key={r.operation_code} style={{background:valid?undefined:"#fff7ed"}}><td><b>{r.operation_code}</b><small className="planning-sub">{r.operation_name||""}</small></td><td><b>{r.operation_type==="ST_SCOPE_ONLY"?"Chỉ hiển thị":"Planning"}</b></td><td className="num">{r.open_jobs||0}</td><td>{r.planning_sort_order??"—"}</td><td><b>{r.standard_operation||"—"}</b></td><td>{r.mapping_rule||"—"}</td><td>{r.st_group||"—"}</td><td>{r.area_name||"—"}</td><td>{r.schedule_area_name||"—"}</td><td>{r.planner_owner||"—"}</td><td><b>{r.config_status}</b></td><td><div className="row"><button className="btn small" onClick={()=>edit(r)}>Sửa</button><button className="btn small danger-btn" onClick={()=>deactivate(r.operation_code)} disabled={busy}>Bỏ khỏi ST</button></div></td></tr>})}
   </tbody></table></div>
  </div>
 </>;
}
