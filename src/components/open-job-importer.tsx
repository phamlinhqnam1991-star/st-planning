"use client";

import {useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";
import {createClient} from "@/lib/supabase/client";

export function OpenJobImporter(){
 const [file,setFile]=useState<File|null>(null);
 const [status,setStatus]=useState("");
 usePopupMessage(status);
 const [busy,setBusy]=useState(false);

 async function run(){
   if(!file)return;

   setBusy(true);
   setStatus("Đang upload All Open Job...");

   try{
     const s=createClient();
     const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
     const storagePath=`open-jobs/${new Date().toISOString().replace(/[:.]/g,"-")}_${safe}`;

     const {error}=await s.storage
       .from("master-imports")
       .upload(storagePath,file,{upsert:false});

     if(error)throw error;

     setStatus("Đang so sánh NEW / CHANGED / UNCHANGED / CLOSED...");

     const r=await fetch("/api/import/open-jobs",{
       method:"POST",
       headers:{"content-type":"application/json"},
       body:JSON.stringify({path:storagePath,fileName:file.name})
     });

     const d=await r.json();
     if(!r.ok)throw new Error(d.error||"Import failed");

     setStatus(
       `Hoàn tất ${d.sourceRows.toLocaleString()} Jobs · `+
       `NEW ${d.newJobs.toLocaleString()} · `+
       `CHANGED ${d.changedJobs.toLocaleString()} · `+
       `UNCHANGED ${d.unchangedJobs.toLocaleString()} · `+
       `CLOSED ${d.closedJobs.toLocaleString()}`
     );

     setTimeout(()=>location.reload(),1600);
   }catch(e){
     setStatus(`Lỗi: ${e instanceof Error?e.message:String(e)}`);
   }finally{
     setBusy(false);
   }
 }

 return <div className="erp-table-panel">
   <div className="erp-panel-head">
     <b>Import All Open Jobs</b>
     <span>Full snapshot · incremental comparison by JobNum</span>
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

 </div>
}
