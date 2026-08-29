"use client";

import {safeJson} from "@/lib/fetch-json";
import {useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";

export function ResetAllBatchesButton(){
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 usePopupMessage(message);

 async function resetAll(){
  const first=window.confirm(
   "RESET TẤT CẢ CÁC LÔ?\n\n"+
   "Tất cả Batch chưa chạy sẽ bị hủy, Schedule tương ứng bị hủy và toàn bộ Job sẽ trở về chuỗi chưa lập lô."
  );
  if(!first)return;

  const second=window.confirm(
   "XÁC NHẬN LẦN CUỐI\n\n"+
   "Thao tác này áp dụng cho TẤT CẢ công đoạn và không thể Undo. Tiếp tục?"
  );
  if(!second)return;

  setBusy(true);
  setMessage("");

  try{
   const response=await fetch("/api/planning/batches/reset",{
    method:"POST",
    headers:{"content-type":"application/json"}
   });
   const data=await safeJson(response);

   if(!response.ok)
    throw new Error(data.error||"Không Reset được các lô.");

   window.alert(
    `Reset hoàn tất.\nBatch: ${data.resetBatches||0}\nJob được trả về Planning: ${data.releasedJobs||0}`
   );
   window.location.reload();
  }catch(error){
   setMessage(error instanceof Error?error.message:"Không Reset được các lô.");
  }finally{
   setBusy(false);
  }
 }

 return <div className="reset-all-batches">
  <button
   type="button"
   className="btn danger-btn"
   disabled={busy}
   onClick={resetAll}
  >
   {busy?"Resetting...":"Reset All Batches"}
  </button>

 </div>;
}
