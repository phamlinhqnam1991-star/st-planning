"use client";

import {useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";
import {safeJson} from "@/lib/fetch-json";
import {uploadFileToSignedUrl} from "@/lib/storage/signed-upload-client";

type BridgeRun={runId:string;status:string;totalRoutings:number;processedRoutings:number;chunkSize:number};

export function MasterImporter(){
 const [file,setFile]=useState<File|null>(null);
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const [resetBusy,setResetBusy]=useState(false);
 const [resetOpen,setResetOpen]=useState(false);
 const [resetText,setResetText]=useState("");
 usePopupMessage(status);

 async function bridgeRequest(body:Record<string,unknown>){
  const r=await fetch("/api/config/intermediate-bridges/rebuild",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Không xử lý được Incremental Auto Bridge.");return d;
 }

 async function finishIncrementalBridge(initial:BridgeRun){
  let run=initial;
  while(run.status==="RUNNING"||run.status==="FAILED"){
   const d=await bridgeRequest({action:"process",run_id:run.runId,chunk_size:run.chunkSize||150});
   run=d.run as BridgeRun;
   const pct=run.totalRoutings?Math.floor(run.processedRoutings*100/run.totalRoutings):100;
   setStatus(`Import đã lưu · đang cập nhật chuỗi công đoạn: ${pct}%`);
   if(run.status==="READY_TO_FINALIZE")break;
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  if(run.status==="READY_TO_FINALIZE"){
   setStatus("Import đã lưu · đang hoàn tất cập nhật chuỗi công đoạn...");
   await bridgeRequest({action:"finalize",run_id:run.runId});
  }
 }

 async function run(){
  if(!file)return;
  setBusy(true);setStatus("Đang upload...");
  try{
   const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
   const path=`master/${new Date().toISOString().replace(/[:.]/g,"-")}_${safe}`;
   const prepResponse=await fetch("/api/import/upload-url",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({path,fileName:file.name})});
   const prep=await safeJson(prepResponse);
   if(!prepResponse.ok)throw new Error(prep.error||"Không chuẩn bị được Storage upload.");
   await uploadFileToSignedUrl(String(prep.signedUrl || ""), file);
   setStatus("Đang so sánh NEW / CHANGED...");
   const r=await fetch("/api/import/master",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({path,fileName:file.name})});
   const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Import failed");

   if(d.bridgeRebuildRun){
    await finishIncrementalBridge(d.bridgeRebuildRun as BridgeRun);
   }
   setStatus(`Hoàn tất: ${d.sourceRows.toLocaleString()} dòng · Mới ${d.newRows.toLocaleString()} · Thay đổi ${d.changedRows.toLocaleString()} · Không đổi ${d.unchangedRows.toLocaleString()}.`);
   setTimeout(()=>location.reload(),1800);
  }catch(e){
   setStatus(`Lỗi: ${e instanceof Error?e.message:String(e)}${String(e).includes("Bridge")?". Dữ liệu import có thể đã lưu; vào ST Operation Flow để tiếp tục cập nhật chuỗi công đoạn.":""}`);
  }finally{setBusy(false)}
 }

 async function resetAll(){
  if(resetText!=="RESET")return;
  setResetBusy(true);
  try{
   const r=await fetch("/api/master/reset",{method:"POST"}),d=await safeJson(r);
   if(!r.ok)throw new Error(d.error||"Reset failed");
   setStatus("Reset hoàn tất.");setResetOpen(false);setResetText("");setTimeout(()=>location.reload(),1000);
  }catch(e){setStatus(`Lỗi: ${e instanceof Error?e.message:String(e)}`)}finally{setResetBusy(false)}
 }

 return <section className="erp-form-panel erp-editor-panel master-import-workspace">
  <div className="erp-panel-head"><div><b>Import Master Excel</b><span>Incremental import · chỉ ghi NEW/CHANGED, giữ cấu hình ST.</span></div>{file&&<span className="erp-record-count">{file.name}</span>}</div>
  <div className="erp-import-dropzone">
   <div><b>Chọn file Master</b><small>Lần đầu import toàn bộ; các lần sau chỉ cập nhật dữ liệu mới hoặc thay đổi.</small></div>
   <input className="input" type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/>
  </div>
  <div className="erp-sticky-action-bar"><div className="erp-action-hint">Import có thể tự cập nhật lại Auto Bridge cho routing bị ảnh hưởng.</div><div className="row"><button className="btn primary" disabled={!file||busy||resetBusy} onClick={run}>{busy?"Đang xử lý...":"Import Master"}</button><button className="btn danger-btn" disabled={busy||resetBusy} onClick={()=>{setResetOpen(true);setResetText("")}}>Reset Master</button></div></div>
  {resetOpen&&<div className="erp-danger-confirm"><div><b>Reset toàn bộ Master Data và lịch sử Import?</b><small>ST Operation Scope hệ thống được giữ lại. Nhập chính xác <span className="mono">RESET</span> để xác nhận.</small></div><input className="input mono" value={resetText} onChange={e=>setResetText(e.target.value.toUpperCase())} placeholder="RESET" autoFocus/><div className="row"><button className="btn danger-btn" disabled={resetBusy||resetText!=="RESET"} onClick={resetAll}>{resetBusy?"Đang reset...":"Xác nhận Reset"}</button><button className="btn" disabled={resetBusy} onClick={()=>{setResetOpen(false);setResetText("")}}>Hủy</button></div></div>}
 </section>;
}
