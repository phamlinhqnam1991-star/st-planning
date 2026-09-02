"use client";

import {safeJson} from "@/lib/fetch-json";
import {useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {usePopupMessage} from "@/hooks/use-popup-message";

type FlowRow={
 operation_code:string;operation_name:string|null;planning_sort_order:number|null;
 operation_type:"PLANNING_OPERATION"|"BRIDGE_INTERMEDIATE"|"ST_SCOPE_ONLY";
 mapping_id:number|null;mapping_rule:string|null;standard_operation:string|null;st_group:string|null;
 area_id:number|null;area_name:string|null;schedule_area_code:string|null;schedule_area_name:string|null;planner_owner:string|null;
 open_jobs:number;config_status:string;bridge_count?:number;bridge_summary?:string|null;
};
type RawOp={operation_code:string;operation_name:string|null;open_jobs:number;in_st_scope:boolean};
type MainOp={standard_operation:string;st_group:string;planning_sort_order:number|null;batch_prefix:string|null};
type Group={st_group:string;group_name:string};
type Area={id:number;area_code:string;area_name:string};
type ScheduleArea={schedule_area_code:string;schedule_area_name:string;planner_owner:string|null};
type BridgeSegment={
 id:number;previous_main_operation:string;next_main_operation:string;intermediate_signature:string;
 route_count:number;source:"AUTO_ROUTING"|"MANUAL";routing_codes:string|null;priority?:number;note?:string|null;intermediate_operations?:string[];
};
type ManualBridgeForm={id:number|null;previous_main_operation:string;next_main_operation:string;intermediate_operations:string[];priority:string;note:string};
const emptyManualBridge:ManualBridgeForm={id:null,previous_main_operation:"",next_main_operation:"",intermediate_operations:[""],priority:"100",note:""};

type BridgeRun={
 runId:string;mode:"FULL"|"INCREMENTAL";status:string;totalRoutings:number;processedRoutings:number;lastRoutingCode:string|null;chunkSize:number;errorMessage:string|null;
};

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

export function StOperationFlowManager({rows,rawOperations,mainOperations,groups,areas,scheduleAreas,bridgeSegments}:{
 rows:FlowRow[];rawOperations:RawOp[];mainOperations:MainOp[];groups:Group[];areas:Area[];scheduleAreas:ScheduleArea[];bridgeSegments:BridgeSegment[];
}){
 const router=useRouter();
 const [form,setForm]=useState<FormState>(emptyForm);
 const [step,setStep]=useState<1|2|3>(1);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [search,setSearch]=useState("");
 const [codeOrderEditing,setCodeOrderEditing]=useState<string|null>(null);
 const [codeOrderValue,setCodeOrderValue]=useState("");
 const [bridgeRun,setBridgeRun]=useState<BridgeRun|null>(null);
 const [manualBridge,setManualBridge]=useState<ManualBridgeForm>(emptyManualBridge);
 const [bridgeSourceFilter,setBridgeSourceFilter]=useState<"ALL"|"AUTO_ROUTING"|"MANUAL">("ALL");
 usePopupMessage(message);
 useEffect(()=>{
  let cancelled=false;
  fetch("/api/config/intermediate-bridges/rebuild",{cache:"no-store"})
   .then(safeJson)
   .then(d=>{if(!cancelled&&d?.run)setBridgeRun(d.run as BridgeRun)})
   .catch(()=>{});
  return()=>{cancelled=true};
 },[]);
 const scopeOnly=form.operation_type==="ST_SCOPE_ONLY";
 const maxStep:1|2|3=scopeOnly?1:3;

 const filtered=useMemo(()=>{
  const q=search.trim().toUpperCase();
  if(!q)return rows;
  return rows.filter(r=>[
   r.operation_code,r.operation_name,r.standard_operation,r.st_group,r.area_name,r.schedule_area_name,r.config_status,r.bridge_summary
  ].some(v=>String(v??"").toUpperCase().includes(q)));
 },[rows,search]);

 const autoIntermediateCount=rows.filter(r=>r.operation_type==="BRIDGE_INTERMEDIATE").length;
 const statusCounts=useMemo(()=>rows.reduce((m,r)=>{m[r.config_status]=(m[r.config_status]||0)+1;return m;},{} as Record<string,number>),[rows]);
 const shownBridgeSegments=useMemo(()=>bridgeSourceFilter==="ALL"?bridgeSegments:bridgeSegments.filter(x=>x.source===bridgeSourceFilter),[bridgeSegments,bridgeSourceFilter]);
 const autoBridgeCount=bridgeSegments.filter(x=>x.source==="AUTO_ROUTING").length;
 const manualBridgeCount=bridgeSegments.filter(x=>x.source==="MANUAL").length;

 const beginCodeOrder=(r:FlowRow)=>{
  setCodeOrderEditing(r.operation_code);
  setCodeOrderValue(r.planning_sort_order==null?"":String(r.planning_sort_order));
 };

 const saveCodeOrder=async(r:FlowRow)=>{
  const raw=codeOrderValue.trim();
  const parsed=raw===""?null:Number(raw);
  if(parsed!==null&&(!Number.isInteger(parsed)||parsed<0)){
   setMessage("Operation Code Order phải là số nguyên >= 0 hoặc để trống.");
   return;
  }
  setBusy(true);setMessage("");
  try{
   const res=await fetch("/api/config/operation-code-order",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({
     operation_code:r.operation_code,
     operation_name:r.operation_name||r.operation_code,
     planning_sort_order:parsed
    })
   });
   const d=await safeJson(res);
   if(!res.ok)throw new Error(d.error||"Không lưu được Operation Code Order.");
   setCodeOrderEditing(null);
   setMessage(`Đã lưu Operation Code Order ${r.operation_code} = ${d.row?.planning_sort_order??"chưa gán"}. Chỉ tie-break trong cùng Main; không thay đổi READY/WAIT hay Planning Chain.`);
   router.refresh();
  }catch(e){setMessage(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };

 const selectSource=(code:string)=>{
  const op=rawOperations.find(x=>x.operation_code===code);
  const existing=rows.find(x=>x.operation_code===code);
  const editableType=existing?.operation_type==="ST_SCOPE_ONLY"?"ST_SCOPE_ONLY":"PLANNING_OPERATION";
  setForm(f=>({
   ...f,source_operation_code:code,source_operation_name:op?.operation_name||code,
   source_planning_order:existing?.planning_sort_order==null?"":String(existing.planning_sort_order),
   operation_type:editableType,
   standard_operation:existing?.operation_type==="PLANNING_OPERATION"?(existing.standard_operation||""):"",
   st_group:existing?.operation_type==="PLANNING_OPERATION"?(existing.st_group||""):"",
   area_id:existing?.operation_type==="PLANNING_OPERATION"&&existing.area_id!=null?String(existing.area_id):"",
   schedule_area_code:existing?.operation_type==="PLANNING_OPERATION"?(existing.schedule_area_code||""):"",
   planner_owner:existing?.operation_type==="PLANNING_OPERATION"?(existing.planner_owner||""):"",
   mapping_rule:existing?.operation_type==="PLANNING_OPERATION"?(existing.mapping_rule||"DIRECT"):"DIRECT"
  }));
 };

 const selectMain=(standard:string)=>{
  const m=mainOperations.find(x=>x.standard_operation===standard);
  setForm(f=>({...f,standard_operation:standard,st_group:m?.st_group||f.st_group,
   main_planning_order:m?.planning_sort_order==null?f.main_planning_order:String(m.planning_sort_order),batch_prefix:m?.batch_prefix||f.batch_prefix}));
 };
 const selectScheduleArea=(code:string)=>{
  const sa=scheduleAreas.find(x=>x.schedule_area_code===code);
  setForm(f=>({...f,schedule_area_code:code,planner_owner:["1","2"].includes(sa?.planner_owner||"")?String(sa?.planner_owner):f.planner_owner}));
 };

 const edit=(r:FlowRow)=>{
  if(r.operation_type==="BRIDGE_INTERMEDIATE"){
   setMessage(`${r.operation_code} là Bridge Intermediate. AUTO chỉnh qua Routing/Rebuild; MANUAL chỉnh tại bảng Intermediate Bridge Segments bên dưới.`);
   return;
  }
  const m=mainOperations.find(x=>x.standard_operation===r.standard_operation);
  setForm({
   source_operation_code:r.operation_code,source_operation_name:r.operation_name||r.operation_code,
   source_planning_order:r.planning_sort_order==null?"":String(r.planning_sort_order),operation_type:r.operation_type,
   standard_operation:r.standard_operation||"",main_planning_order:m?.planning_sort_order==null?"":String(m.planning_sort_order),
   batch_prefix:m?.batch_prefix||"",st_group:r.st_group||m?.st_group||"",area_id:r.area_id==null?"":String(r.area_id),
   schedule_area_code:r.schedule_area_code||"",planner_owner:r.planner_owner||"",mapping_rule:r.mapping_rule||"DIRECT"
  });
  setStep(r.operation_type==="ST_SCOPE_ONLY"?1:3);window.scrollTo({top:0,behavior:"smooth"});
 };

 const next=()=>{
  if(!form.source_operation_code){setMessage("Bước 1: nhập Operation Code.");return;}
  if(step===1){setStep(scopeOnly?1:2);return;}
  if(step===2){if(!form.standard_operation){setMessage("Bước 2: chọn Công đoạn chính.");return;}setStep(3);}
 };
 const back=()=>setStep(s=>s===1?1:(s-1) as 1|2|3);

 const save=async()=>{
  if(!form.source_operation_code){setMessage("Nhập Operation Code.");return;}
  if(!scopeOnly&&(!form.standard_operation||!form.st_group||!form.area_id||!form.schedule_area_code||!["1","2"].includes(form.planner_owner))){
   setMessage("Planning Operation bắt buộc đủ Main Operation → ST Group → Physical Area → Schedule Area → Planner.");return;
  }
  if(!scopeOnly&&!window.confirm("Lưu sẽ cập nhật lại chuỗi công đoạn cho các Job liên quan.\n\nNếu thay đổi Main/Routing, hãy dựng lại Auto Bridge sau khi lưu. Lịch sử Batch/Schedule không bị xóa.\n\nTiếp tục?"))return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/config/st-operation-flow",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
    ...form,source_planning_order:form.source_planning_order===""?null:Number(form.source_planning_order),
    main_planning_order:form.main_planning_order===""?null:Number(form.main_planning_order),area_id:form.area_id===""?null:Number(form.area_id)
   })});
   const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Không lưu được ST Operation Flow.");
   setMessage(d.operation_type==="ST_SCOPE_ONLY"
    ?`Đã lưu ${d.source_operation_code} = ST_SCOPE_ONLY.`
    :`Đã đồng bộ ${d.source_operation_code} → ${d.standard_operation}. Nếu thay đổi này ảnh hưởng Main/Routing, hãy Rebuild Auto Bridge Segments.`);
   setForm(emptyForm);setStep(1);setTimeout(()=>location.reload(),700);
  }catch(e){setMessage(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };

 const bridgeRequest=async(body:Record<string,unknown>)=>{
  const r=await fetch("/api/config/intermediate-bridges/rebuild",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Không xử lý được Auto Bridge rebuild.");return d;
 };

 const refreshBridgeRun=async()=>{
  try{
   const r=await fetch(`/api/config/intermediate-bridges/rebuild?t=${Date.now()}`,{cache:"no-store"});
   const d=await safeJson(r);
   const latest=(d?.run||null) as BridgeRun|null;
   setBridgeRun(latest);
   return latest;
  }catch{return bridgeRun}
 };

 const runBridgeUntilDone=async(initial:BridgeRun)=>{
  let run=initial;setBridgeRun(run);

  // Process until the durable snapshot reaches 100%. FAILED is resumable.
  while(run.processedRoutings<run.totalRoutings||run.status==="RUNNING"||run.status==="FAILED"){
   const d=await bridgeRequest({action:"process",run_id:run.runId,chunk_size:run.chunkSize||150});
   run=d.run as BridgeRun;setBridgeRun(run);
   const pct=run.totalRoutings?Math.floor(run.processedRoutings*100/run.totalRoutings):100;
   setMessage(`Đang dựng Auto Bridge: ${run.processedRoutings.toLocaleString()} / ${run.totalRoutings.toLocaleString()} routing · ${pct}%`);
   if(run.processedRoutings>=run.totalRoutings&&run.status==="READY_TO_FINALIZE")break;
   await new Promise(resolve=>setTimeout(resolve,25));
  }

  // v306: once 100% is reached, always attempt Finalize. The server validates
  // remaining processed_at rows authoritatively and safely retries FAILED runs.
  if(run.processedRoutings>=run.totalRoutings&&run.status!=="COMPLETED"&&run.status!=="CANCELLED"){
   setMessage(`Đã xử lý đủ ${run.processedRoutings.toLocaleString()} / ${run.totalRoutings.toLocaleString()} routing. Đang hoàn tất Auto Bridge...`);
   const d=await bridgeRequest({action:"finalize",run_id:run.runId});
   run=d.run as BridgeRun;setBridgeRun(null);
   setMessage(`Hoàn tất Auto Bridge: ${Number(d.segments||0).toLocaleString()} segment. Nếu Bridge vừa thay đổi, hãy Rebuild Chain.`);
   setTimeout(()=>location.reload(),1200);
  }
 };

 const rebuildAutoBridge=async()=>{
  if(bridgeRun&&["RUNNING","FAILED","READY_TO_FINALIZE"].includes(bridgeRun.status)){
   setBusy(true);setMessage(`Tiếp tục rebuild ${bridgeRun.processedRoutings.toLocaleString()} / ${bridgeRun.totalRoutings.toLocaleString()} routing...`);
   try{await runBridgeUntilDone(bridgeRun)}catch(e){const latest=await refreshBridgeRun();setMessage(`Rebuild tạm dừng: ${e instanceof Error?e.message:String(e)}.${latest?.processedRoutings===latest?.totalRoutings?" Dữ liệu đã xử lý 100%; bấm Hoàn tất để thử lại.":" Có thể bấm Tiếp tục để chạy từ vị trí hiện tại."}`)}finally{setBusy(false)}
   return;
  }
  if(!window.confirm("Dựng lại toàn bộ Auto Bridge?\n\nHệ thống sẽ quét toàn bộ ST Routing Chain. Nếu bị gián đoạn có thể tiếp tục lại; Planning Board vẫn dùng cấu hình hiện tại cho tới khi rebuild hoàn tất.\n\nTiếp tục?"))return;
  setBusy(true);setMessage("Đang chuẩn bị Auto Bridge...");
  try{
   const d=await bridgeRequest({action:"start",mode:"FULL",chunk_size:150});
   await runBridgeUntilDone(d.run as BridgeRun);
  }catch(e){const latest=await refreshBridgeRun();setMessage(`Rebuild tạm dừng: ${e instanceof Error?e.message:String(e)}. Dữ liệu Bridge ACTIVE cũ vẫn an toàn.${latest?.processedRoutings===latest?.totalRoutings?" Bấm Hoàn tất để thử lại.":" Bấm Tiếp tục để chạy tiếp."}`)}finally{setBusy(false)}
 };

 const cancelBridgeRun=async()=>{
  if(!bridgeRun)return;
  if(!window.confirm("Hủy lần rebuild đang dở và làm lại từ đầu?\n\nCấu hình Bridge hiện tại vẫn được giữ cho tới khi rebuild mới hoàn tất."))return;
  setBusy(true);
  try{
   await bridgeRequest({action:"cancel",run_id:bridgeRun.runId});
   setBridgeRun(null);setMessage("Đã hủy lần rebuild cũ. Đang làm lại từ đầu...");
   const d=await bridgeRequest({action:"start",mode:"FULL",chunk_size:150});
   await runBridgeUntilDone(d.run as BridgeRun);
  }catch(e){setMessage(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };

 const resetManualBridge=()=>setManualBridge(emptyManualBridge);
 const setManualOp=(index:number,value:string)=>setManualBridge(f=>({...f,intermediate_operations:f.intermediate_operations.map((x,i)=>i===index?value.toUpperCase():x)}));
 const addManualOp=()=>setManualBridge(f=>({...f,intermediate_operations:[...f.intermediate_operations,""]}));
 const removeManualOp=(index:number)=>setManualBridge(f=>{const next=f.intermediate_operations.filter((_,i)=>i!==index);return {...f,intermediate_operations:next.length?next:[""]}});
 const moveManualOp=(index:number,delta:-1|1)=>setManualBridge(f=>{
  const target=index+delta;if(target<0||target>=f.intermediate_operations.length)return f;
  const next=[...f.intermediate_operations];[next[index],next[target]]=[next[target],next[index]];return {...f,intermediate_operations:next};
 });
 const editManualBridge=(segment:BridgeSegment)=>setManualBridge({
  id:segment.id,
  previous_main_operation:segment.previous_main_operation,
  next_main_operation:segment.next_main_operation,
  intermediate_operations:Array.isArray(segment.intermediate_operations)&&segment.intermediate_operations.length
   ?segment.intermediate_operations
   :segment.intermediate_signature.split(/\s*→\s*/).map(x=>x.trim()).filter(Boolean),
  priority:String(segment.priority??100),note:segment.note||""
 });
 const saveManualBridge=async()=>{
  const ops=manualBridge.intermediate_operations.map(x=>x.trim().toUpperCase()).filter(Boolean);
  if(!manualBridge.previous_main_operation){setMessage("Manual Bridge: chọn Previous Main.");return;}
  if(!manualBridge.next_main_operation){setMessage("Manual Bridge: chọn Next Main.");return;}
  if(!ops.length){setMessage("Manual Bridge: thêm ít nhất 1 Intermediate Operation.");return;}
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/config/intermediate-bridges/manual",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
    action:"save",id:manualBridge.id,previous_main_operation:manualBridge.previous_main_operation,next_main_operation:manualBridge.next_main_operation,
    intermediate_operations:ops,priority:Number(manualBridge.priority||100),note:manualBridge.note
   })});
   const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Không lưu được Manual Bridge Segment.");
   resetManualBridge();
   setMessage(`Đã lưu Manual Bridge. MANUAL sẽ ưu tiên hơn AUTO khi cùng LastLaborOp + NextOperation. Hãy Rebuild Chain để áp dụng cho Candidate hiện tại.`);
   router.refresh();
  }catch(e){setMessage(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };
 const deactivateManualBridge=async(segment:BridgeSegment)=>{
  if(!confirm(`Ngưng Manual Bridge ${segment.previous_main_operation} → [${segment.intermediate_signature}] → ${segment.next_main_operation}?\n\nAuto Bridge tương ứng (nếu có) sẽ được dùng lại sau khi Rebuild Chain.`))return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/config/intermediate-bridges/manual",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"deactivate",id:segment.id})});
   const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Không ngưng được Manual Bridge.");
   if(manualBridge.id===segment.id)resetManualBridge();
   setMessage("Đã ngưng Manual Bridge. Hãy Rebuild Chain để Candidate dùng lại Auto Bridge nếu có.");
   router.refresh();
  }catch(e){setMessage(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };

 const deactivate=async(code:string)=>{
  if(!confirm(`Bỏ ${code} khỏi ST Scope?\n\nChỉ dùng cho Planning/ST_SCOPE_ONLY đã cấu hình tay. Auto Intermediate không cần thao tác này.`))return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/config/st-operation-flow",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({source_operation_code:code})});
   const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Không deactivate được ST Operation.");
   setMessage(`Đã bỏ ${code} khỏi ST Scope.`);setTimeout(()=>location.reload(),700);
  }catch(e){setMessage(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };

 const chainPreview=()=>{
  const chips:{label:string;ok:boolean}[]=[{label:form.source_operation_code||"Operation Code",ok:!!form.source_operation_code}];
  if(scopeOnly)chips.push({label:"ST_SCOPE_ONLY (chỉ hiển thị)",ok:true});
  else{
   chips.push({label:form.standard_operation||"Công đoạn chính",ok:!!form.standard_operation});
   chips.push({label:form.st_group||"Nhóm ST",ok:!!form.st_group});
   chips.push({label:areas.find(a=>String(a.id)===form.area_id)?.area_name||"Khu vật lý",ok:!!form.area_id});
   chips.push({label:scheduleAreas.find(s=>s.schedule_area_code===form.schedule_area_code)?.schedule_area_name||"Khu điều độ",ok:!!form.schedule_area_code});
   chips.push({label:form.planner_owner?`Planner ${form.planner_owner}`:"Planner",ok:!!form.planner_owner});
  }
  return <div className="chain-preview"><b style={{fontSize:11}}>Chuỗi sẽ lưu:</b>{chips.map((c,i)=><span key={i} className={`cp ${c.ok?"ok":"miss"}`}>{c.label}</span>)}</div>;
 };
 const wsStep=(no:number,label:string,desc:string)=>{const state=step>no?"done":step===no?"active":"";return <div className={`wizard-step ${state}`}><span className="ws-no">{step>no?"✓":no}</span><div><b>{label}</b><small>{desc}</small></div></div>};

 return <>
  <div className="card section">
   <div className="erp-panel-head"><div><b>Trợ lý cấu hình Main Planning / ST Scope Only</b><small className="planning-sub">Không cần chọn INTERMEDIATE. Hệ thống tự suy ra từ Routing giữa các Main Planning.</small></div><button className="btn" type="button" onClick={()=>{setForm(emptyForm);setStep(1)}} disabled={busy}>Làm mới</button></div>
   <div className="wizard-stepper">{wsStep(1,"Operation Code","Chọn mã công đoạn")}<div className={`wizard-conn ${step>1?"done":""}`}/>{wsStep(2,"Công đoạn & Nhóm","Gán Main Planning")}<div className={`wizard-conn ${step>2?"done":""}`}/>{wsStep(3,"Khu vực & Planner","Chọn nơi chạy, ai lo")}</div>
   <div className="wizard-panel">
    {step===1&&<><div className="candidate-filter-grid">
     <label>Mã công đoạn<input className="input" list="st-source-ops" value={form.source_operation_code} onChange={e=>selectSource(e.target.value.toUpperCase())} placeholder="VD: CPBILP"/><datalist id="st-source-ops">{rawOperations.map(x=><option key={x.operation_code} value={x.operation_code}>{x.operation_name||x.operation_code} · {x.open_jobs||0} job</option>)}</datalist></label>
     <label>Tên công đoạn<input className="input" value={form.source_operation_name} onChange={e=>setForm({...form,source_operation_name:e.target.value})}/></label>
     <label>Loại Operation<select className="input" value={form.operation_type} onChange={e=>{const type=e.target.value as FormState["operation_type"];setStep(1);if(type==="ST_SCOPE_ONLY")setForm({...form,operation_type:type,standard_operation:"",main_planning_order:"",batch_prefix:"",st_group:"",area_id:"",schedule_area_code:"",planner_owner:"",mapping_rule:"DIRECT"});else setForm({...form,operation_type:type})}}><option value="PLANNING_OPERATION">Planning Operation — tạo Main/Batch/Schedule</option><option value="ST_SCOPE_ONLY">ST_SCOPE_ONLY — chỉ hiển thị, không lập kế hoạch</option></select></label>
     <label>Operation Code Order (tie-break)<input className="input" type="number" value={form.source_planning_order} onChange={e=>setForm({...form,source_planning_order:e.target.value})}/></label>
    </div>{scopeOnly&&<div className="notice" style={{marginTop:10}}><b>ST_SCOPE_ONLY:</b> không sinh Planning Chain/Batch/Schedule.</div>}</>}
    {step===2&&<><div className="candidate-filter-grid">
     <label>Công đoạn chính<input className="input" list="st-main-ops" value={form.standard_operation} onChange={e=>selectMain(e.target.value.toUpperCase())}/><datalist id="st-main-ops">{mainOperations.map(x=><option key={x.standard_operation} value={x.standard_operation}>{x.st_group}</option>)}</datalist></label>
     <label>Thứ tự Main<input className="input" type="number" value={form.main_planning_order} onChange={e=>setForm({...form,main_planning_order:e.target.value})}/></label>
     <label>Tiền tố số lô<input className="input" maxLength={3} value={form.batch_prefix} onChange={e=>setForm({...form,batch_prefix:e.target.value.toUpperCase()})}/></label>
     <label>Nhóm ST<select className="input" value={form.st_group} onChange={e=>setForm({...form,st_group:e.target.value})}><option value="">Chọn nhóm...</option>{groups.map(x=><option key={x.st_group} value={x.st_group}>{x.st_group} · {x.group_name}</option>)}</select></label>
     <label>Quy tắc mapping<select className="input" value={form.mapping_rule} onChange={e=>setForm({...form,mapping_rule:e.target.value})}><option>DIRECT</option><option>OCCURRENCE</option><option>SEQUENCE</option><option>SEQUENCE/FALLBACK</option></select></label>
    </div></>}
    {step===3&&<><div className="candidate-filter-grid">
     <label>Khu vực vật lý<select className="input" value={form.area_id} onChange={e=>setForm({...form,area_id:e.target.value})}><option value="">Chọn khu...</option>{areas.map(x=><option key={x.id} value={x.id}>{x.area_name}</option>)}</select></label>
     <label>Khu vực điều độ<select className="input" value={form.schedule_area_code} onChange={e=>selectScheduleArea(e.target.value)}><option value="">Chọn lane...</option>{scheduleAreas.map(x=><option key={x.schedule_area_code} value={x.schedule_area_code}>{x.schedule_area_name}</option>)}</select></label>
     <label>Planner<select className="input" value={form.planner_owner} onChange={e=>setForm({...form,planner_owner:e.target.value})}><option value="">Chọn...</option><option value="1">Planner 1</option><option value="2">Planner 2</option></select></label>
    </div>{chainPreview()}</>}
    <div className="row" style={{marginTop:14,justifyContent:"space-between"}}><div className="row">{step>1&&<button className="btn" onClick={back} disabled={busy}>← Quay lại</button>}{step<maxStep&&<button className="btn primary" onClick={next} disabled={busy}>Tiếp tục →</button>}</div><div className="row">{step===maxStep&&<button className="btn primary" onClick={save} disabled={busy}>{busy?"Đang đồng bộ...":scopeOnly?"Lưu ST_SCOPE_ONLY":"Lưu + Dựng lại chuỗi"}</button>}</div></div>
   </div>
  </div>

  <div className="erp-table-panel section">
   <div className="erp-panel-head"><div><b>Danh sách Operation</b><small className="planning-sub">RAW NextOperation kế thừa Main Planning Order; Operation Code Order chỉ dùng để sắp xếp thêm trong cùng Main.</small></div><div className="row"><span>Planning OK {statusCounts.OK||0}</span><span>Bridge Intermediate {autoIntermediateCount}</span><span>ST Scope Only {statusCounts.ST_SCOPE_ONLY||0}</span><input className="input" style={{width:220}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm Operation..."/></div></div>
   <div className="table-wrap" style={{maxHeight:560}}><table className="erp-table"><thead><tr><th>Mã nguồn</th><th>Loại</th><th>Số Job</th><th>Operation Code Order</th><th>Main / Bridge</th><th>Rule</th><th>Nhóm ST</th><th>Khu vật lý</th><th>Khu điều độ</th><th>Planner</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
    {filtered.map(r=>{const auto=r.operation_type==="BRIDGE_INTERMEDIATE";const valid=r.config_status==="OK"||r.config_status==="INTERMEDIATE_BRIDGE"||r.config_status==="ST_SCOPE_ONLY";return <tr key={r.operation_code} style={{background:valid?undefined:"#fff7ed"}}><td><b>{r.operation_code}</b><small className="planning-sub">{r.operation_name||""}</small></td><td><b>{r.operation_type==="ST_SCOPE_ONLY"?"Chỉ hiển thị":auto?"Bridge Intermediate":"Planning"}</b></td><td className="num">{r.open_jobs||0}</td><td style={{minWidth:145}}>{codeOrderEditing===r.operation_code?<div className="row" style={{flexWrap:"nowrap"}}><input className="input" type="number" min={0} step={1} value={codeOrderValue} onChange={e=>setCodeOrderValue(e.target.value)} style={{width:72}} autoFocus/><button className="btn small primary" type="button" disabled={busy} onClick={()=>saveCodeOrder(r)}>Lưu</button><button className="btn small" type="button" disabled={busy} onClick={()=>setCodeOrderEditing(null)}>Hủy</button></div>:<button className="btn small mono" type="button" disabled={busy} onClick={()=>beginCodeOrder(r)} title="Thứ tự phụ của Operation Code trong cùng Main; Main Planning Order vẫn là thứ tự chính">{r.planning_sort_order??"ĐẶT"}</button>}</td><td><b>{auto?(r.bridge_summary||"Auto Bridge"):(r.standard_operation||"—")}</b>{auto&&<small className="planning-sub">{r.bridge_count||0} segment</small>}</td><td>{auto?"AUTO ROUTING":(r.mapping_rule||"—")}</td><td>{r.st_group||"—"}</td><td>{r.area_name||"—"}</td><td>{r.schedule_area_name||"—"}</td><td>{r.planner_owner||"—"}</td><td><b>{r.config_status}</b></td><td>{auto?<span className="muted">Tự động</span>:<div className="row"><button className="btn small" onClick={()=>edit(r)}>Sửa</button><button className="btn small danger-btn" onClick={()=>deactivate(r.operation_code)} disabled={busy}>Bỏ khỏi ST</button></div>}</td></tr>})}
   </tbody></table></div>
  </div>

  <div className="erp-table-panel section">
   <div className="erp-panel-head"><div><b>Intermediate Bridge Segments · AUTO + MANUAL</b><small className="planning-sub">AUTO được suy ra từ ST Routing Chain. MANUAL dùng cho ngoại lệ và được ưu tiên hơn AUTO khi cùng điều kiện.</small></div><div className="row"><span>{bridgeSegments.length} active · AUTO {autoBridgeCount} · MANUAL {manualBridgeCount}</span><button className="btn primary" type="button" onClick={rebuildAutoBridge} disabled={busy}>{busy?"Đang xử lý...":bridgeRun?.processedRoutings===bridgeRun?.totalRoutings?"✓ Hoàn tất":bridgeRun?"▶ Tiếp tục":"↻ Dựng lại Auto Bridge"}</button>{bridgeRun&&<button className="btn danger-btn" type="button" onClick={cancelBridgeRun} disabled={busy}>Hủy & làm lại</button>}</div></div>
   {bridgeRun&&<div className="notice" style={{margin:"0 12px 12px"}}><div className="row" style={{justifyContent:"space-between"}}><b>Rebuild Auto Bridge chưa hoàn tất</b><b>{bridgeRun.totalRoutings?Math.floor(bridgeRun.processedRoutings*100/bridgeRun.totalRoutings):100}%</b></div><div style={{height:8,background:"#e5e7eb",borderRadius:999,overflow:"hidden",marginTop:8}}><div style={{height:"100%",width:`${bridgeRun.totalRoutings?Math.min(100,bridgeRun.processedRoutings*100/bridgeRun.totalRoutings):100}%`,background:"currentColor"}}/></div><div className="row" style={{marginTop:8}}><span>Đã xử lý: <b>{bridgeRun.processedRoutings.toLocaleString()} / {bridgeRun.totalRoutings.toLocaleString()}</b> routing</span></div>{bridgeRun.errorMessage&&<small className="planning-sub">Lần chạy trước dừng: {bridgeRun.errorMessage}</small>}</div>}
   <div className="card" style={{margin:"0 12px 12px",padding:12}}>
    <div className="row" style={{justifyContent:"space-between",alignItems:"center"}}><div><b>Manual Bridge Segment</b><small className="planning-sub">Dùng cho ngoại lệ cần chỉ định rõ chuỗi Previous Main → Intermediate → Next Main.</small></div>{manualBridge.id&&<button className="btn small" type="button" onClick={resetManualBridge}>Tạo mới</button>}</div>
    <div className="candidate-filter-grid" style={{marginTop:10}}>
     <label>Previous Main<select className="input" value={manualBridge.previous_main_operation} onChange={e=>setManualBridge({...manualBridge,previous_main_operation:e.target.value})}><option value="">Chọn Main...</option>{mainOperations.map(x=><option key={`pm-${x.standard_operation}`} value={x.standard_operation}>{x.standard_operation}</option>)}</select></label>
     <label>Next Main<select className="input" value={manualBridge.next_main_operation} onChange={e=>setManualBridge({...manualBridge,next_main_operation:e.target.value})}><option value="">Chọn Main...</option>{mainOperations.map(x=><option key={`nm-${x.standard_operation}`} value={x.standard_operation}>{x.standard_operation}</option>)}</select></label>
     <label>Priority<input className="input" type="number" value={manualBridge.priority} onChange={e=>setManualBridge({...manualBridge,priority:e.target.value})}/><small className="planning-sub">MANUAL cao hơn thắng khi nhiều rule cùng match.</small></label>
     <label>Note<input className="input" value={manualBridge.note} onChange={e=>setManualBridge({...manualBridge,note:e.target.value})} placeholder="Ghi chú ngoại lệ..."/></label>
    </div>
    <div style={{marginTop:10}}><b style={{fontSize:12}}>Intermediate Operations · đúng thứ tự vật lý</b>{manualBridge.intermediate_operations.map((op,index)=><div className="row" key={index} style={{marginTop:6}}><span className="muted" style={{width:24}}>{index+1}.</span><input className="input" list="manual-bridge-ops" style={{maxWidth:420}} value={op} onChange={e=>setManualOp(index,e.target.value)} placeholder="VD: INSAND-B"/><button className="btn small" type="button" onClick={()=>moveManualOp(index,-1)} disabled={index===0}>↑</button><button className="btn small" type="button" onClick={()=>moveManualOp(index,1)} disabled={index===manualBridge.intermediate_operations.length-1}>↓</button><button className="btn small danger-btn" type="button" onClick={()=>removeManualOp(index)}>Xóa</button></div>)}<datalist id="manual-bridge-ops">{rawOperations.map(x=><option key={`mb-${x.operation_code}`} value={x.operation_code}>{x.operation_name||x.operation_code}</option>)}</datalist><div className="row" style={{marginTop:8}}><button className="btn small" type="button" onClick={addManualOp}>Thêm Intermediate</button><button className="btn primary" type="button" onClick={saveManualBridge} disabled={busy}>{manualBridge.id?"Cập nhật Manual Segment":"Lưu Manual Segment"}</button></div></div>
   </div>
   <div className="row" style={{padding:"0 12px 8px"}}><button className={`btn small ${bridgeSourceFilter==="ALL"?"primary":""}`} onClick={()=>setBridgeSourceFilter("ALL")}>Tất cả ({bridgeSegments.length})</button><button className={`btn small ${bridgeSourceFilter==="AUTO_ROUTING"?"primary":""}`} onClick={()=>setBridgeSourceFilter("AUTO_ROUTING")}>AUTO ({autoBridgeCount})</button><button className={`btn small ${bridgeSourceFilter==="MANUAL"?"primary":""}`} onClick={()=>setBridgeSourceFilter("MANUAL")}>MANUAL ({manualBridgeCount})</button></div>
   <div className="table-wrap" style={{maxHeight:420}}><table className="erp-table"><thead><tr><th>Previous Main</th><th>Intermediate Operations</th><th>Next Main</th><th>Priority</th><th>Routing Count</th><th>Source</th><th>Routing mẫu / Note</th><th>Thao tác</th></tr></thead><tbody>
    {shownBridgeSegments.length?shownBridgeSegments.map(s=><tr key={s.id}><td><b>{s.previous_main_operation}</b></td><td><b>{s.intermediate_signature}</b></td><td><b>{s.next_main_operation}</b></td><td className="num">{s.source==="MANUAL"?(s.priority??100):"—"}</td><td className="num">{s.route_count}</td><td><b>{s.source}</b></td><td><small>{s.source==="MANUAL"?(s.note||"—"):(s.routing_codes||"—")}</small></td><td>{s.source==="MANUAL"?<div className="row"><button className="btn small" onClick={()=>editManualBridge(s)}>Sửa</button><button className="btn small danger-btn" onClick={()=>deactivateManualBridge(s)} disabled={busy}>Ngưng</button></div>:<span className="muted">Tự động</span>}</td></tr>):<tr><td colSpan={8}><div className="notice">Chưa có Segment trong bộ lọc này. AUTO dùng Rebuild; MANUAL dùng form phía trên.</div></td></tr>}
   </tbody></table></div>
  </div>
 </>;
}
