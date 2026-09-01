"use client";

import {useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";
import {createClient} from "@/lib/supabase/client";
import {safeJson} from "@/lib/fetch-json";

type BridgeRun={runId:string;status:string;totalRoutings:number;processedRoutings:number;chunkSize:number};

export function MasterImporter(){
 const [file,setFile]=useState<File|null>(null);
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const [resetBusy,setResetBusy]=useState(false);
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
   setStatus(`Import đã lưu · đang cập nhật Auto Bridge: ${run.processedRoutings.toLocaleString()} / ${run.totalRoutings.toLocaleString()} routing · ${pct}%`);
   if(run.status==="READY_TO_FINALIZE")break;
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  if(run.status==="READY_TO_FINALIZE"){
   setStatus("Import đã lưu · đang Finalize Auto Bridge incremental...");
   await bridgeRequest({action:"finalize",run_id:run.runId});
  }
 }

 async function run(){
  if(!file)return;
  setBusy(true);setStatus("Đang upload...");
  try{
   const s=createClient();
   const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
   const path=`master/${new Date().toISOString().replace(/[:.]/g,"-")}_${safe}`;
   const prepResponse=await fetch("/api/import/upload-url",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({path,fileName:file.name})});
   const prep=await safeJson(prepResponse);
   if(!prepResponse.ok)throw new Error(prep.error||"Không chuẩn bị được Storage upload.");
   const {error}=await s.storage.from(String(prep.bucket)).uploadToSignedUrl(String(prep.path),String(prep.token),file,{
    contentType:file.type||"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
   });
   if(error)throw error;
   setStatus("Đang so sánh NEW / CHANGED...");
   const r=await fetch("/api/import/master",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({path,fileName:file.name})});
   const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Import failed");

   if(d.bridgeRebuildRun){
    await finishIncrementalBridge(d.bridgeRebuildRun as BridgeRun);
   }
   setStatus(`Hoàn tất: ${d.sourceRows.toLocaleString()} dòng · Mới ${d.newRows.toLocaleString()} · Thay đổi ${d.changedRows.toLocaleString()} · Không đổi ${d.unchangedRows.toLocaleString()}${d.affectedRoutingCodes?` · Auto Bridge incremental ${Number(d.affectedRoutingCodes).toLocaleString()} routing`:""}.`);
   setTimeout(()=>location.reload(),1800);
  }catch(e){
   setStatus(`Lỗi: ${e instanceof Error?e.message:String(e)}${String(e).includes("Bridge")?". Import đã có thể hoàn tất; Auto Bridge có thể Resume tại ST Operation Flow.":""}`);
  }finally{setBusy(false)}
 }

 async function resetAll(){
  if(!confirm("Reset toàn bộ Master Data và Import History? ST Operation Scope hệ thống sẽ được giữ lại."))return;
  if(prompt('Nhập chính xác RESET để xác nhận:')!=="RESET")return;
  setResetBusy(true);
  try{
   const r=await fetch("/api/master/reset",{method:"POST"}),d=await safeJson(r);
   if(!r.ok)throw new Error(d.error||"Reset failed");
   setStatus("Reset hoàn tất.");setTimeout(()=>location.reload(),1000);
  }catch(e){setStatus(`Lỗi: ${e instanceof Error?e.message:String(e)}`)}finally{setResetBusy(false)}
 }

 return <div className="card">
  <h2 style={{marginTop:0}}>Import Master Excel</h2>
  <p className="muted">Lần đầu Full Import. Từ lần 2 chỉ NEW/CHANGED được cập nhật; UNCHANGED bỏ qua. v298 chỉ rebuild Auto Bridge cho routing signature bị thay đổi.</p>
  <div className="row">
   <input className="input" type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/>
   <button className="btn primary" disabled={!file||busy||resetBusy} onClick={run}>{busy?"Đang xử lý...":"Import Master"}</button>
   <button className="btn danger-btn" disabled={busy||resetBusy} onClick={resetAll}>{resetBusy?"Đang reset...":"Reset All Master Data"}</button>
  </div>
 </div>;
}
