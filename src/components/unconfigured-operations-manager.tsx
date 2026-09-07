"use client";

import {useMemo,useState} from "react";
import type {OperationInboxRow,OperationInboxStatus} from "@/lib/config/unconfigured-operations";
import {usePopupMessage} from "@/hooks/use-popup-message";

type MainOperation={standard_operation:string;st_group:string|null;planning_sort_order:number|null;batch_prefix:string|null};
type StGroup={st_group:string;group_name:string|null};
type Area={id:number;area_code:string;area_name:string};
type ScheduleArea={schedule_area_code:string;schedule_area_name:string;planner_owner:string|null};
type Filter="ACTIVE"|"ALL"|"NEXT"|"NEW"|"INACTIVE"|"PARTIAL_CONFIG"|"NOT_ST";
type StType=""|"ST_SCOPE_ONLY"|"PLANNING_OPERATION"|"INTERMEDIATE";

const STATUS_LABEL:Record<OperationInboxStatus,string>={
 NEW:"New / Unreviewed",
 INACTIVE:"Inactive ST config",
 PARTIAL_CONFIG:"Partial ST config",
 NOT_ST:"Not ST",
};

function defaultType(row:OperationInboxRow):StType{
 if(row.status==="PARTIAL_CONFIG")return "PLANNING_OPERATION";
 if(row.bridge_count>0)return "INTERMEDIATE";
 return "";
}

export function UnconfiguredOperationsManager({
 rows,mainOperations,groups,areas,scheduleAreas,reviewTableReady,
}:{
 rows:OperationInboxRow[];
 mainOperations:MainOperation[];
 groups:StGroup[];
 areas:Area[];
 scheduleAreas:ScheduleArea[];
 reviewTableReady:boolean;
}){
 const initialRow=rows.find(x=>x.status!=="NOT_ST")||rows[0]||null;
 const [filter,setFilter]=useState<Filter>("ACTIVE");
 const [query,setQuery]=useState("");
 const [selectedCode,setSelectedCode]=useState(initialRow?.operation_code||"");
 const [type,setType]=useState<StType>(initialRow?defaultType(initialRow):"");
 const [main,setMain]=useState(initialRow?.mapped_main||initialRow?.suggested_main||"");
 const [group,setGroup]=useState(initialRow?.mapped_group||initialRow?.suggested_st_group||"");
 const [areaId,setAreaId]=useState("");
 const [scheduleArea,setScheduleArea]=useState("");
 const [planner,setPlanner]=useState("");
 const [mappingRule,setMappingRule]=useState("DIRECT");
 const [note,setNote]=useState(initialRow?.review_note||"");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 usePopupMessage(message);

 const selected=rows.find(x=>x.operation_code===selectedCode)||null;
 const filtered=useMemo(()=>{
  const q=query.trim().toLowerCase();
  return rows.filter(r=>{
   if(filter==="ACTIVE"&&r.status==="NOT_ST")return false;
   if(filter==="NEXT"&&r.next_op_jobs<=0)return false;
   if(["NEW","INACTIVE","PARTIAL_CONFIG","NOT_ST"].includes(filter)&&r.status!==filter)return false;
   if(q&&!`${r.operation_code} ${r.operation_name} ${r.found_in} ${r.suggested_main||""} ${r.suggested_st_group||""}`.toLowerCase().includes(q))return false;
   return true;
  });
 },[rows,filter,query]);

 const counts=useMemo(()=>({
  active:rows.filter(r=>r.status!=="NOT_ST").length,
  new:rows.filter(r=>r.status==="NEW").length,
  inactive:rows.filter(r=>r.status==="INACTIVE").length,
  partial:rows.filter(r=>r.status==="PARTIAL_CONFIG").length,
  ignored:rows.filter(r=>r.status==="NOT_ST").length,
  nextJobs:rows.filter(r=>r.status!=="NOT_ST").reduce((s,r)=>s+r.next_op_jobs,0),
 }),[rows]);

 const selectRow=(r:OperationInboxRow)=>{
  setSelectedCode(r.operation_code);
  const t=defaultType(r);setType(t);
  setMain(r.mapped_main||r.suggested_main||"");
  setGroup(r.mapped_group||r.suggested_st_group||"");
  setAreaId("");setScheduleArea("");setPlanner("");setMappingRule("DIRECT");setNote(r.review_note||"");
 };

 const chooseMain=(value:string)=>{
  setMain(value);
  const m=mainOperations.find(x=>x.standard_operation===value);
  if(m?.st_group)setGroup(m.st_group);
 };
 const chooseSchedule=(value:string)=>{
  setScheduleArea(value);
  const s=scheduleAreas.find(x=>x.schedule_area_code===value);
  if(s?.planner_owner&&["1","2"].includes(String(s.planner_owner)))setPlanner(String(s.planner_owner));
 };

 const markNotSt=async()=>{
  if(!selected)return;
  const ok=window.confirm(`Đánh dấu ${selected.operation_code} là NOT ST?\n\nOperation này sẽ được ẩn khỏi danh sách cần xử lý ở các lần import sau. Không thay đổi All Open Job.`);
  if(!ok)return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/config/unconfigured-operations/review",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operation_code:selected.operation_code,decision:"NOT_ST",note})});
   const d=await r.json();if(!r.ok)throw new Error(d.error||"Không thể lưu review.");
   setMessage(`Đã đánh dấu ${selected.operation_code} là Not ST.`);setTimeout(()=>location.reload(),700);
  }catch(e){setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`)}finally{setBusy(false)}
 };

 const reopen=async()=>{
  if(!selected)return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/config/unconfigured-operations/review",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operation_code:selected.operation_code,decision:"UNREVIEWED"})});
   const d=await r.json();if(!r.ok)throw new Error(d.error||"Không thể mở lại review.");
   setMessage(`Đã đưa ${selected.operation_code} trở lại danh sách cần review.`);setTimeout(()=>location.reload(),700);
  }catch(e){setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`)}finally{setBusy(false)}
 };

 const addToSt=async()=>{
  if(!selected||!type){setMessage("Chọn ST Operation Type trước khi thêm.");return;}
  if(type==="INTERMEDIATE"&&selected.bridge_count<=0){setMessage("INTERMEDIATE chỉ dùng cho Operation đang có active Intermediate Bridge.");return;}
  if(type==="PLANNING_OPERATION"&&(!main||!group||!areaId||!scheduleArea||!planner)){
   setMessage("Planning Operation cần đủ Main Operation → ST Group → Physical Area → Schedule Area → Planner.");return;
  }
  const body:any={source_operation_code:selected.operation_code,source_operation_name:selected.operation_name,operation_type:type};
  if(type==="PLANNING_OPERATION")Object.assign(body,{standard_operation:main,st_group:group,area_id:Number(areaId),schedule_area_code:scheduleArea,planner_owner:planner,mapping_rule:mappingRule});
  const ok=window.confirm(`Thêm ${selected.operation_code} vào ST với loại ${type}?\n\nHệ thống chỉ cập nhật cấu hình theo loại bạn chọn. All Open Job không bị sửa.`);
  if(!ok)return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/config/st-operation-flow",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
   const d=await r.json();if(!r.ok)throw new Error(d.error||"Không thể thêm Operation vào ST.");
   // Cleanup an earlier NOT_ST decision if the operation is being explicitly added to ST.
   await fetch("/api/config/unconfigured-operations/review",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operation_code:selected.operation_code,decision:"UNREVIEWED"})}).catch(()=>null);
   setMessage(`Đã thêm ${selected.operation_code} vào ST (${type}).`);setTimeout(()=>location.reload(),900);
  }catch(e){setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`)}finally{setBusy(false)}
 };

 return <div className="erp-operation-inbox">
  <div className="erp-config-kpi-grid erp-operation-inbox-kpis">
   <div className="erp-config-kpi"><span>Need Review</span><b>{counts.active}</b><small>Operation chưa có quyết định cuối</small></div>
   <div className="erp-config-kpi"><span>NextOperation Impact</span><b>{counts.nextJobs.toLocaleString("vi-VN")}</b><small>Job đang đứng tại các Operation này</small></div>
   <div className="erp-config-kpi"><span>Partial / Inactive</span><b>{counts.partial+counts.inactive}</b><small>{counts.partial} partial · {counts.inactive} inactive</small></div>
   <div className="erp-config-kpi"><span>Not ST</span><b>{counts.ignored}</b><small>Đã review và bỏ qua</small></div>
  </div>

  {!reviewTableReady&&<div className="erp-operation-inbox-note">Review storage sẽ được khởi tạo tự động khi bạn dùng <b>Not ST</b> lần đầu. Migration 089 cũng được kèm trong source để triển khai chuẩn.</div>}

  <section className="erp-panel erp-operation-inbox-panel">
   <div className="erp-panel-head">
    <div><b>New / Unconfigured Operations</b><small>Unique Operation từ NextOperation + AllOperation. Không tự động đưa bất kỳ Operation nào vào ST.</small></div>
    <span className="erp-status-pill warn">{filtered.length} rows</span>
   </div>
   <div className="erp-operation-inbox-toolbar">
    <div className="erp-operation-inbox-filters">
     {([['ACTIVE','Need review'],['NEXT','NextOperation only'],['NEW','New'],['INACTIVE','Inactive'],['PARTIAL_CONFIG','Partial config'],['NOT_ST','Ignored'],['ALL','All']] as [Filter,string][]).map(([k,l])=><button type="button" key={k} className={filter===k?"active":""} onClick={()=>setFilter(k)}>{l}</button>)}
    </div>
    <input className="input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search operation / main / group..."/>
   </div>
   <div className="erp-operation-inbox-layout">
    <div className="table-wrap erp-operation-inbox-table-wrap">
     <table className="erp-table erp-operation-inbox-table">
      <thead><tr><th>Operation Code</th><th>Status</th><th className="num">Next Jobs</th><th className="num">All Jobs</th><th className="num">Parts</th><th className="num">Programs</th><th>Found In</th><th>Suggested Type</th></tr></thead>
      <tbody>{filtered.map(r=><tr key={r.operation_code} className={selectedCode===r.operation_code?"selected":""} onClick={()=>selectRow(r)}>
       <td><b className="erp-operation-code">{r.operation_code}</b><small>{r.operation_name!==r.operation_code?r.operation_name:""}</small></td>
       <td><span className={`erp-operation-review-status ${r.status.toLowerCase()}`}>{STATUS_LABEL[r.status]}</span></td>
       <td className="num"><b>{r.next_op_jobs.toLocaleString("vi-VN")}</b></td><td className="num">{r.total_jobs.toLocaleString("vi-VN")}</td><td className="num">{r.parts}</td><td className="num">{r.programs}</td>
       <td>{r.found_in}</td><td>{r.status==="PARTIAL_CONFIG"?"PLANNING_OPERATION":r.bridge_count>0?"INTERMEDIATE":"—"}</td>
      </tr>)}</tbody>
     </table>
     {!filtered.length&&<div className="erp-config-empty-ok"><b>Không có Operation phù hợp bộ lọc.</b><span>Thử chọn All hoặc xóa nội dung tìm kiếm.</span></div>}
    </div>

    <aside className="erp-operation-review-editor">
     {selected?<>
      <div className="erp-operation-review-head"><div><span>OPERATION REVIEW</span><h3>{selected.operation_code}</h3><small>{selected.next_op_jobs} NextOperation Jobs · {selected.total_jobs} total Jobs</small></div><span className={`erp-operation-review-status ${selected.status.toLowerCase()}`}>{STATUS_LABEL[selected.status]}</span></div>
      <div className="erp-operation-review-facts">
       <div><span>Found In</span><b>{selected.found_in}</b></div><div><span>Bridge</span><b>{selected.bridge_count?`${selected.bridge_count} active segment(s)`:"No active bridge"}</b></div>
       <div><span>Suggested Main</span><b>{selected.suggested_main||"—"}</b></div><div><span>Suggested ST Group</span><b>{selected.suggested_st_group||"—"}</b></div>
      </div>
      {selected.status==="NOT_ST"?<div className="erp-operation-review-actions"><button className="btn primary" type="button" disabled={busy} onClick={reopen}>Re-open review</button></div>:<>
       <label className="erp-operation-review-field"><span>ST Operation Type</span><select className="input" value={type} onChange={e=>setType(e.target.value as StType)}><option value="">— Chọn loại ST —</option><option value="ST_SCOPE_ONLY">ST_SCOPE_ONLY</option><option value="PLANNING_OPERATION">PLANNING_OPERATION</option><option value="INTERMEDIATE" disabled={selected.bridge_count<=0}>INTERMEDIATE{selected.bridge_count<=0?" (requires Bridge)":""}</option></select></label>
       {type==="PLANNING_OPERATION"&&<div className="erp-operation-review-planning-fields">
        <label><span>Main Operation</span><select className="input" value={main} onChange={e=>chooseMain(e.target.value)}><option value="">Chọn...</option>{mainOperations.map(m=><option key={m.standard_operation} value={m.standard_operation}>{m.standard_operation}</option>)}</select></label>
        <label><span>ST Group</span><select className="input" value={group} onChange={e=>setGroup(e.target.value)}><option value="">Chọn...</option>{groups.map(g=><option key={g.st_group} value={g.st_group}>{g.st_group}{g.group_name?` · ${g.group_name}`:""}</option>)}</select></label>
        <label><span>Physical Area</span><select className="input" value={areaId} onChange={e=>setAreaId(e.target.value)}><option value="">Chọn...</option>{areas.map(a=><option key={a.id} value={a.id}>{a.area_name}</option>)}</select></label>
        <label><span>Schedule Area</span><select className="input" value={scheduleArea} onChange={e=>chooseSchedule(e.target.value)}><option value="">Chọn...</option>{scheduleAreas.map(s=><option key={s.schedule_area_code} value={s.schedule_area_code}>{s.schedule_area_name}</option>)}</select></label>
        <label><span>Planner</span><select className="input" value={planner} onChange={e=>setPlanner(e.target.value)}><option value="">Chọn...</option><option value="1">Planner 1</option><option value="2">Planner 2</option></select></label>
        <label><span>Mapping Rule</span><select className="input" value={mappingRule} onChange={e=>setMappingRule(e.target.value)}><option>DIRECT</option><option>OCCURRENCE</option><option>SEQUENCE</option><option>SEQUENCE/FALLBACK</option></select></label>
       </div>}
       <label className="erp-operation-review-field"><span>Review note (optional)</span><input className="input" value={note} onChange={e=>setNote(e.target.value)} placeholder="Lý do / ghi chú..."/></label>
       <div className="erp-operation-review-actions"><button className="btn primary" type="button" disabled={busy||!type} onClick={addToSt}>{busy?"Processing...":"Add to ST Operation"}</button><button className="btn" type="button" disabled={busy||selected.status==="PARTIAL_CONFIG"} title={selected.status==="PARTIAL_CONFIG"?"Operation đang có active ST Scope. Hãy deactivate tại ST Operation Flow trước.":""} onClick={markNotSt}>Not ST</button></div>
       <small className="erp-operation-review-help">ST_SCOPE_ONLY không tạo Planning Chain. INTERMEDIATE chỉ tạo Dashboard ST membership và yêu cầu active Bridge. PLANNING_OPERATION sẽ dùng đủ Main → Group → Area → Schedule Area → Planner.</small>
      </>}
     </>:<div className="erp-config-empty-ok"><b>Chọn một Operation.</b><span>Chi tiết review và action sẽ xuất hiện tại đây.</span></div>}
    </aside>
   </div>
  </section>
 </div>;
}
