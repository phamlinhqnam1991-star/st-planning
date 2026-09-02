"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {safeJson} from "@/lib/fetch-json";
import {pushAppToast} from "@/components/app-toast-provider";
import {useUiLanguage} from "@/components/i18n/ui-language-provider";

type RequirementRow={
 requirementCode:string;
 ruleCount:number;
 mappingIds:number[];
 operations:string[];
 manualKeep:boolean;
 willImport:boolean;
};
type GateRule={
 id:number;
 requirementCode:string;
 blockedValues:string[];
 isActive:boolean;
 note:string;
};
type State={
 migrationInstalled:boolean;
 gateMigrationInstalled:boolean;
 requirements:RequirementRow[];
 gateRules:GateRule[];
 effectiveCodes:string[];
 unknownCodes:string[];
 stats:{estimated_rows:number|string;total_bytes:number|string;table_bytes:number|string;index_bytes:number|string};
};

const fmtBytes=(value:unknown)=>{
 const bytes=Number(value||0);
 if(!Number.isFinite(bytes)||bytes<=0)return "0 MB";
 const mb=bytes/1024/1024;
 return mb>=1024?`${(mb/1024).toFixed(2)} GB`:`${mb.toFixed(mb>=100?0:1)} MB`;
};

export function ProcessRequirementFilterManager(){
 const {text}=useUiLanguage();
 const [state,setState]=useState<State|null>(null);
 const [loading,setLoading]=useState(true);
 const [busyCode,setBusyCode]=useState("");
 const [cleanupText,setCleanupText]=useState("");
 const [cleanupBusy,setCleanupBusy]=useState(false);
 const [search,setSearch]=useState("");
 const [gateCode,setGateCode]=useState("ST");
 const [gateValues,setGateValues]=useState("NO");
 const [gateEnabled,setGateEnabled]=useState(true);
 const [gateNote,setGateNote]=useState("");
 const [gateBusy,setGateBusy]=useState(false);

 async function load(){
  setLoading(true);
  try{
   const r=await fetch("/api/config/process-requirement-filter",{cache:"no-store"});
   const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Unable to load Process Requirement filter.");
   setState(d as State);
  }catch(error){pushAppToast(error instanceof Error?error.message:String(error));}
  finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[]);

 const shown=useMemo(()=>{
  const q=search.trim().toLowerCase();
  if(!q)return state?.requirements||[];
  return (state?.requirements||[]).filter(row=>`${row.requirementCode} ${row.operations.join(" ")}`.toLowerCase().includes(q));
 },[state,search]);

 async function setKeep(row:RequirementRow,keep:boolean){
  setBusyCode(row.requirementCode);
  try{
   const r=await fetch("/api/config/process-requirement-filter",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"KEEP",requirementCode:row.requirementCode,keep})});
   const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Unable to update Manual Keep.");
   setState(d as State);
  }catch(error){pushAppToast(error instanceof Error?error.message:String(error));}
  finally{setBusyCode("");}
 }

 function editGate(rule:GateRule){
  setGateCode(rule.requirementCode);
  setGateValues(rule.blockedValues.join(", "));
  setGateEnabled(rule.isActive);
  setGateNote(rule.note||"");
 }

 async function saveGate(){
  const values=gateValues.split(",").map(x=>x.trim()).filter(Boolean);
  if(!gateCode||!values.length)return;
  setGateBusy(true);
  try{
   const r=await fetch("/api/config/process-requirement-filter",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
    action:"GATE",requirementCode:gateCode,blockedValues:values,enabled:gateEnabled,note:gateNote
   })});
   const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Unable to update Part-level Gate Rule.");
   setState(d as State);
   pushAppToast(text("Gate Rule saved. Re-import Master to apply it.","Đã lưu Gate Rule. Import Master lại để áp dụng."));
  }catch(error){pushAppToast(error instanceof Error?error.message:String(error));}
  finally{setGateBusy(false);}
 }

 async function cleanup(){
  if(cleanupText.trim().toUpperCase()!=="TRUNCATE")return;
  setCleanupBusy(true);
  try{
   const r=await fetch("/api/config/process-requirement-filter/cleanup",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirmation:cleanupText})});
   const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Unable to clear Process Requirement data.");
   setCleanupText("");
   pushAppToast(`${text("Process Requirement cleared.","Đã xóa dữ liệu Process Requirement.")} ${fmtBytes(d.beforeBytes)} → ${fmtBytes(d.afterBytes)}. ${text("Re-import Master now.","Hãy Import Master lại ngay.")}`);
   await load();
  }catch(error){pushAppToast(error instanceof Error?error.message:String(error));}
  finally{setCleanupBusy(false);}
 }

 if(loading&&!state)return <div className="erp-panel"><div className="erp-empty">{text("Loading Process Requirement filter...","Đang tải bộ lọc Process Requirement...")}</div></div>;
 if(!state)return <div className="notice error">{text("Unable to load Process Requirement filter.","Không tải được bộ lọc Process Requirement.")}</div>;
 const activeRuleCodes=state.requirements.filter(x=>x.ruleCount>0).length;
 const manualKeepCodes=state.requirements.filter(x=>x.manualKeep).length;
 const activeGateRules=state.gateRules.filter(x=>x.isActive).length;

 return <div className="erp-config-dashboard">
  {!state.migrationInstalled&&<div className="notice error"><b>{text("Migration 069 required.","Cần chạy migration 069.")}</b> {text("Run supabase/migrations/069_process_requirement_filtered_import.sql before using Manual Keep.","Hãy chạy supabase/migrations/069_process_requirement_filtered_import.sql trước khi dùng Manual Keep.")}</div>}
  {!state.gateMigrationInstalled&&<div className="notice error"><b>{text("Migration 070 required for Part-level Gate.","Cần migration 070 cho Part-level Gate.")}</b> {text("Run supabase/migrations/070_process_requirement_part_gate.sql. It seeds ST = NO as the first Gate Rule.","Chạy supabase/migrations/070_process_requirement_part_gate.sql. Migration sẽ tạo sẵn Gate Rule ST = NO.")}</div>}

  <div className="erp-config-kpi-grid">
   <div className="erp-config-kpi"><span>{text("Current table size","Dung lượng bảng hiện tại")}</span><b>{fmtBytes(state.stats.total_bytes)}</b><small>table + indexes</small></div>
   <div className="erp-config-kpi"><span>{text("Estimated rows","Số dòng ước tính")}</span><b>{Number(state.stats.estimated_rows||0).toLocaleString()}</b><small>pg_stat estimate</small></div>
   <div className="erp-config-kpi"><span>{text("Part-level Gates","Gate theo Part")}</span><b>{activeGateRules}</b><small>{text("active rules","rule đang bật")}</small></div>
   <div className="erp-config-kpi"><span>{text("Rule-required codes","Mã Recipe Rule cần")}</span><b>{activeRuleCodes}</b><small>MD:REQ active</small></div>
   <div className="erp-config-kpi"><span>{text("Effective import codes","Mã sẽ import")}</span><b>{state.effectiveCodes.length}</b><small>{manualKeepCodes} manual keep</small></div>
  </div>

  <section className="erp-panel">
   <div className="erp-panel-head"><div><b>{text("Part / Revision Gate Rules","Gate Rule theo Part / Revision")}</b><small>{text("A matching Gate skips ALL 38 Process Requirement rows for that Part/Revision before the normal Requirement filter runs.","Nếu Gate khớp, bỏ TOÀN BỘ 38 Process Requirement của Part/Revision đó trước khi chạy bộ lọc Requirement thông thường.")}</small></div></div>
   <div className="erp-context-note">
    {text("Default V375 rule: ST = NO. Therefore a Part/Revision whose Master Requirement ST is NO stores zero md_process_requirement rows. Re-import also removes old Requirement rows for that blocked Part/Revision, even when the source hash is unchanged.","Rule mặc định V375: ST = NO. Vì vậy Part/Revision có Requirement ST = NO sẽ không lưu dòng nào trong md_process_requirement. Import lại cũng tự xóa Requirement cũ của Part/Revision bị chặn, kể cả khi source hash không đổi.")}
   </div>
   <div className="erp-form-grid" style={{padding:"10px"}}>
    <label>{text("Gate Requirement","Requirement làm Gate")}
     <select className="input" value={gateCode} onChange={e=>setGateCode(e.target.value)}>{state.requirements.map(row=><option key={row.requirementCode} value={row.requirementCode}>{row.requirementCode}</option>)}</select>
    </label>
    <label>{text("Blocked values","Giá trị bị chặn")}
     <input className="input" value={gateValues} onChange={e=>setGateValues(e.target.value)} placeholder="NO, N/A"/>
     <small>{text("Comma separated, exact match, case-insensitive.","Ngăn cách bằng dấu phẩy, khớp chính xác, không phân biệt hoa/thường.")}</small>
    </label>
    <label>{text("Note","Ghi chú")}
     <input className="input" value={gateNote} onChange={e=>setGateNote(e.target.value)} placeholder={text("Optional note","Ghi chú tùy chọn")}/>
    </label>
    <label className="row"><input type="checkbox" checked={gateEnabled} onChange={e=>setGateEnabled(e.target.checked)}/><span>{text("Gate enabled","Bật Gate")}</span></label>
   </div>
   <div className="erp-command-bar"><button type="button" className="btn primary" disabled={!state.gateMigrationInstalled||gateBusy||!gateValues.trim()} onClick={saveGate}>{gateBusy?text("Saving...","Đang lưu..."):text("Save Gate Rule","Lưu Gate Rule")}</button></div>
   <div className="table-wrap"><table className="erp-table"><thead><tr><th>{text("Gate Requirement","Requirement làm Gate")}</th><th>{text("Blocked Values","Giá trị chặn")}</th><th>{text("Status","Trạng thái")}</th><th>{text("Action","Thao tác")}</th></tr></thead><tbody>
    {state.gateRules.length?state.gateRules.map(rule=><tr key={rule.id}><td><b>{rule.requirementCode}</b></td><td>{rule.blockedValues.join(" / ")||"—"}</td><td>{rule.isActive?<span className="badge b-ready">ACTIVE</span>:<span className="badge">OFF</span>}</td><td><button type="button" className="btn small" onClick={()=>editGate(rule)}>{text("Edit","Sửa")}</button></td></tr>):<tr><td colSpan={4} className="muted">{text("No Gate Rule configured.","Chưa có Gate Rule.")}</td></tr>}
   </tbody></table></div>
  </section>

  <section className="erp-panel">
   <div className="erp-panel-head"><div><b>{text("Second-level filtered import","Bộ lọc import tầng 2")}</b><small>{text("For Parts that pass the Gate: Will Import = active MD:REQ Recipe Rule OR Manual Keep. Blank values are skipped.","Với Part vượt qua Gate: Sẽ Import = Recipe Rule MD:REQ đang dùng HOẶC Manual Keep. Value rỗng được bỏ qua.")}</small></div></div>
   <div className="erp-context-note">
    {text("Changing a Recipe Rule, Manual Keep or Gate Rule does not require a full Master reset. Re-import the same Master Excel to synchronize Process Requirements.","Đổi Recipe Rule, Manual Keep hoặc Gate Rule không cần Reset Master. Import lại đúng file Master để đồng bộ Process Requirement.")}
   </div>
   <div className="erp-command-bar"><input className="input" value={search} onChange={e=>setSearch(e.target.value)} placeholder={text("Search Requirement / Operation...","Tìm Requirement / Operation...")}/><span className="erp-record-count">{shown.length}/38</span></div>
   <div className="table-wrap"><table className="erp-table"><thead><tr>
    <th>{text("Requirement Code","Mã Requirement")}</th><th>{text("Active Recipe Rule","Recipe Rule đang dùng")}</th><th>{text("Manual Keep","Giữ thủ công")}</th><th>{text("Will Import","Sẽ Import")}</th>
   </tr></thead><tbody>{shown.map(row=><tr key={row.requirementCode}>
    <td><b>{row.requirementCode}</b></td>
    <td>{row.ruleCount?<><span className="badge b-ready">{row.ruleCount} rule</span><small className="planning-sub">{row.operations.join(" / ")||"—"}</small></>:<span className="muted">—</span>}</td>
    <td><label className="row"><input type="checkbox" checked={row.manualKeep} disabled={!state.migrationInstalled||busyCode===row.requirementCode} onChange={e=>setKeep(row,e.target.checked)}/><span>{row.manualKeep?text("Keep","Giữ"):text("Not kept","Không giữ")}</span></label></td>
    <td>{row.willImport?<span className="badge b-ready">{text("YES","CÓ")}</span>:<span className="badge">NO</span>}</td>
   </tr>)}</tbody></table></div>
   {state.unknownCodes.length>0&&<div className="notice error"><b>{text("Unknown MD:REQ codes:","MD:REQ không có trong Master:")}</b> {state.unknownCodes.join(" · ")}</div>}
  </section>

  <section className="erp-panel">
   <div className="erp-panel-head"><div><b>{text("One-time database cleanup","Dọn database một lần")}</b><small>{text("Use this before rebuilding the smaller dataset. It clears only md_process_requirement so PostgreSQL can release the large table/index files immediately.","Dùng trước khi dựng lại dataset nhỏ hơn. Chỉ xóa md_process_requirement để PostgreSQL giải phóng ngay file bảng/index lớn.")}</small></div></div>
   <div className="erp-danger-confirm">
    <div><b>{text("Recommended test flow: run migrations 069 + 070 → review ST = NO Gate → TRUNCATE → re-import the same Master Excel.","Luồng thử khuyến nghị: chạy migration 069 + 070 → kiểm tra Gate ST = NO → TRUNCATE → Import lại đúng file Master.")}</b><small>{text("This does NOT delete Part, Routing, Planning Chain, Batch, Schedule or Production Execution.","Không xóa Part, Routing, Planning Chain, Batch, Schedule hay Production Execution.")}</small></div>
    <input className="input mono" value={cleanupText} onChange={e=>setCleanupText(e.target.value.toUpperCase())} placeholder="TRUNCATE"/>
    <div className="row"><button type="button" className="btn danger-btn" disabled={!state.migrationInstalled||!state.gateMigrationInstalled||cleanupBusy||cleanupText!=="TRUNCATE"} onClick={cleanup}>{cleanupBusy?text("Cleaning...","Đang dọn..."):text("Clear Process Requirement only","Xóa riêng Process Requirement")}</button><Link href="/import-master" className="btn primary">{text("Open Import Master","Mở Import Master")}</Link></div>
   </div>
  </section>
 </div>;
}
