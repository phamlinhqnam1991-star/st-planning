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
type State={
 migrationInstalled:boolean;
 requirements:RequirementRow[];
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
   const r=await fetch("/api/config/process-requirement-filter",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({requirementCode:row.requirementCode,keep})});
   const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Unable to update Manual Keep.");
   setState(d as State);
  }catch(error){pushAppToast(error instanceof Error?error.message:String(error));}
  finally{setBusyCode("");}
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

 return <div className="erp-config-dashboard">
  {!state.migrationInstalled&&<div className="notice error"><b>{text("Migration 069 required.","Cần chạy migration 069.")}</b> {text("Run supabase/migrations/069_process_requirement_filtered_import.sql before using Manual Keep.","Hãy chạy supabase/migrations/069_process_requirement_filtered_import.sql trước khi dùng Manual Keep.")}</div>}

  <div className="erp-config-kpi-grid">
   <div className="erp-config-kpi"><span>{text("Current table size","Dung lượng bảng hiện tại")}</span><b>{fmtBytes(state.stats.total_bytes)}</b><small>table + indexes</small></div>
   <div className="erp-config-kpi"><span>{text("Estimated rows","Số dòng ước tính")}</span><b>{Number(state.stats.estimated_rows||0).toLocaleString()}</b><small>pg_stat estimate</small></div>
   <div className="erp-config-kpi"><span>{text("Rule-required codes","Mã Recipe Rule cần")}</span><b>{activeRuleCodes}</b><small>MD:REQ active</small></div>
   <div className="erp-config-kpi"><span>{text("Effective import codes","Mã sẽ import")}</span><b>{state.effectiveCodes.length}</b><small>{manualKeepCodes} manual keep</small></div>
  </div>

  <section className="erp-panel">
   <div className="erp-panel-head"><div><b>{text("Filtered import logic","Logic import có lọc")}</b><small>{text("Will Import = used by an active MD:REQ Recipe Rule OR Manual Keep. Blank values are skipped.","Sẽ Import = đang được Recipe Rule MD:REQ dùng HOẶC Manual Keep. Value rỗng được bỏ qua.")}</small></div></div>
   <div className="erp-context-note">
    {text("Changing a Recipe Rule or Manual Keep does not need a full Master reset. Re-import the same Master Excel; V374 extracts required Requirement rows even when Part/Revision is UNCHANGED.","Đổi Recipe Rule hoặc Manual Keep không cần Reset Master. Import lại đúng file Master; V374 vẫn lấy Requirement cần thiết ngay cả khi Part/Revision là UNCHANGED.")}
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
   <div className="erp-panel-head"><div><b>{text("One-time database cleanup","Dọn database một lần")}</b><small>{text("Use this after reviewing the effective import codes. It clears only md_process_requirement so PostgreSQL can release the large table/index files immediately.","Dùng sau khi đã kiểm tra danh sách mã sẽ import. Chỉ xóa md_process_requirement để PostgreSQL giải phóng ngay file bảng/index lớn.")}</small></div></div>
   <div className="erp-danger-confirm">
    <div><b>{text("After cleanup, re-import the same Master Excel immediately.","Sau khi dọn, hãy Import lại đúng file Master ngay.")}</b><small>{text("This does NOT delete Part, Routing, Planning Chain, Batch, Schedule or Production Execution.","Không xóa Part, Routing, Planning Chain, Batch, Schedule hay Production Execution.")}</small></div>
    <input className="input mono" value={cleanupText} onChange={e=>setCleanupText(e.target.value.toUpperCase())} placeholder="TRUNCATE"/>
    <div className="row"><button type="button" className="btn danger-btn" disabled={!state.migrationInstalled||cleanupBusy||cleanupText!=="TRUNCATE"} onClick={cleanup}>{cleanupBusy?text("Cleaning...","Đang dọn..."):text("Clear Process Requirement only","Xóa riêng Process Requirement")}</button><Link href="/import-master" className="btn primary">{text("Open Import Master","Mở Import Master")}</Link></div>
   </div>
  </section>
 </div>;
}
