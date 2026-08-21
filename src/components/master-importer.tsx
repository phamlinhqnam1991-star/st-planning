"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
export function MasterImporter(){
 const [file,setFile]=useState<File|null>(null); const [status,setStatus]=useState(""); const [busy,setBusy]=useState(false);
 async function run(){
  if(!file) return; setBusy(true); setStatus("Đang upload trực tiếp lên Supabase Storage...");
  try{
   const supabase=createClient(); const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_"); const path=`${new Date().toISOString().replace(/[:.]/g,"-")}_${safe}`;
   const {error:upErr}=await supabase.storage.from("master-imports").upload(path,file,{upsert:false,contentType:file.type||"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
   if(upErr) throw upErr;
   setStatus("Upload xong. Đang đọc Excel và đồng bộ PostgreSQL...");
   const r=await fetch("/api/import/master",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({path,fileName:file.name})});
   const data=await r.json(); if(!r.ok) throw new Error(data.error||"Import failed");
   setStatus(`Hoàn tất: ${data.sourceRows.toLocaleString()} dòng nguồn, ${data.routingRows.toLocaleString()} routing detail. Đang tải lại...`);
   setTimeout(()=>location.reload(),1200);
  }catch(e){setStatus(`Lỗi: ${e instanceof Error?e.message:String(e)}`)}finally{setBusy(false)}
 }
 return <div className="card"><h2 style={{marginTop:0}}>Import Master Excel</h2><p className="muted">Chọn file Partinfo_Used for Surface Treatment (.xlsx). File được upload thẳng lên Supabase Storage, sau đó server đồng bộ toàn bộ Master Data.</p><div className="row"><input className="input" type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/><button className="btn primary" disabled={!file||busy} onClick={run}>{busy?"Đang xử lý...":"Import Master"}</button></div>{status&&<p className={status.startsWith("Lỗi")?"danger":"muted"}>{status}</p>}</div>
}
