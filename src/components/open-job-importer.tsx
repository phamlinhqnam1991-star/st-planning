"use client";

import {safeJson} from "@/lib/fetch-json";
import {useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";
import {uploadFileToSignedUrl} from "@/lib/storage/signed-upload-client";

type UnconfiguredOperation={operation_code:string;affected_jobs:number};

export function OpenJobImporter(){
 const [file,setFile]=useState<File|null>(null);
 const [unconfigured,setUnconfigured]=useState<UnconfiguredOperation[]>([]);
 const [status,setStatus]=useState("");
 usePopupMessage(status);
 const [busy,setBusy]=useState(false);

 async function run(){
   if(!file)return;

   setBusy(true);
   setUnconfigured([]);
   setStatus("Đang upload All Open Job...");

   try{
     const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
     const storagePath=`open-jobs/${new Date().toISOString().replace(/[:.]/g,"-")}_${safe}`;

     const prepResponse=await fetch("/api/import/upload-url",{
       method:"POST",
       headers:{"content-type":"application/json"},
       body:JSON.stringify({path:storagePath,fileName:file.name})
     });
     const prep=await safeJson(prepResponse);
     if(!prepResponse.ok)throw new Error(prep.error||"Không chuẩn bị được Storage upload.");

     await uploadFileToSignedUrl(String(prep.signedUrl || ""), file);

     setStatus("Đang so sánh NEW / CHANGED / UNCHANGED / CLOSED...");

     const r=await fetch("/api/import/open-jobs",{
       method:"POST",
       headers:{"content-type":"application/json"},
       body:JSON.stringify({path:storagePath,fileName:file.name})
     });

     const d=await safeJson(r);
     if(!r.ok)throw new Error(d.error||"Import failed");

     const detected=Array.isArray(d.unconfiguredOperations)
       ?d.unconfiguredOperations.map((x:any)=>({operation_code:String(x.operation_code||""),affected_jobs:Number(x.affected_jobs||0)})).filter((x:UnconfiguredOperation)=>x.operation_code)
       :[];
     setUnconfigured(detected);

     setStatus(
       `Hoàn tất ${d.sourceRows.toLocaleString()} Jobs · `+
       `NEW ${d.newJobs.toLocaleString()} · `+
       `CHANGED ${d.changedJobs.toLocaleString()} · `+
       `UNCHANGED ${d.unchangedJobs.toLocaleString()} bỏ qua rebuild · `+
       `CLOSED ${d.closedJobs.toLocaleString()} · `+
       `Planning sync ${Number(d.incrementalSync?.affectedOpenJobs||0).toLocaleString()} Job`+
       (detected.length?` · ${detected.length} Operation mới cần cấu hình`:``)
     );

     if(!detected.length)setTimeout(()=>location.reload(),1600);
   }catch(e){
     setStatus(`Lỗi: ${e instanceof Error?e.message:String(e)}`);
   }finally{
     setBusy(false);
   }
 }

 return <div className="erp-table-panel">
   <div className="erp-panel-head">
     <b>Import All Open Jobs</b>
     <span>Import và cập nhật thay đổi theo Job</span>
   </div>

   <div className="open-job-import-form">
     <input
       className="input"
       type="file"
       accept=".xlsx"
       onChange={e=>setFile(e.target.files?.[0]||null)}
     />
     <button
       className="btn primary"
       disabled={!file||busy}
       onClick={run}>
       {busy?"Đang xử lý...":"Import All Open Job"}
     </button>
   </div>

   {unconfigured.length>0&&<div style={{marginTop:10,padding:"10px 12px",border:"1px solid #f0ddb6",background:"#fff7e8",borderRadius:8}}>
     <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
       <div>
         <b>Operation mới / chưa cấu hình</b>
         <div style={{fontSize:12,marginTop:3}}>All Open Job đã cập nhật RAW NextOperation, nhưng các code dưới đây chưa được phân loại ST. Hệ thống không tự đoán Main Operation.</div>
       </div>
       <a className="btn" href="/st-operation-flow">Mở ST Operation Flow</a>
     </div>
     <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
       {unconfigured.map(x=><span key={x.operation_code} className="erpkit-status erpkit-status-warning">{x.operation_code} · {x.affected_jobs.toLocaleString()} Job</span>)}
     </div>
   </div>}

 </div>
}
