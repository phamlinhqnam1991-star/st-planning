"use client";

import {pushAppToast} from "@/components/app-toast-provider";

import {safeJson} from "@/lib/fetch-json";
import {useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";
import {useErpConfirm} from "@/components/app-dialog-provider";

export function ResetAllBatchesButton({presentation="legacy"}:{presentation?:"legacy"|"erp"}={}){
 const confirmErp=useErpConfirm();
 const erpMode=presentation==="erp";
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 usePopupMessage(message);

 async function resetAll(){
  const first=await confirmErp({title:erpMode?"Đặt lại tất cả Batch":"Reset tất cả lô",message:erpMode?"Hủy tất cả Batch chưa chạy?":"Hủy tất cả lô chưa chạy?",detail:erpMode?"Lịch điều độ tương ứng bị hủy và Job được trả về trạng thái chưa lập Batch.":"Schedule tương ứng bị hủy và toàn bộ Job sẽ trở về chuỗi chưa lập lô.",tone:"danger",confirmLabel:erpMode?"Tiếp tục đặt lại":"Tiếp tục reset"});
  if(!first)return;

  const second=await confirmErp({title:"Xác nhận lần cuối",message:erpMode?"Áp dụng đặt lại cho tất cả công đoạn?":"Áp dụng reset cho tất cả công đoạn?",detail:"Thao tác này không thể hoàn tác.",tone:"danger",confirmLabel:erpMode?"Đặt lại tất cả":"Reset tất cả"});
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
    throw new Error(data.error||(erpMode?"Không đặt lại được các Batch.":"Không Reset được các lô."));

   pushAppToast(
    erpMode?`Đặt lại hoàn tất.\nBatch đã đặt lại: ${data.resetBatches||0}\nJob trở về trạng thái chưa lập Batch: ${data.releasedJobs||0}`:`Reset hoàn tất.\nBatch: ${data.resetBatches||0}\nJob được trả về Planning: ${data.releasedJobs||0}`
   );
   window.location.reload();
  }catch(error){
   setMessage(error instanceof Error?error.message:(erpMode?"Không đặt lại được các Batch.":"Không Reset được các lô."));
  }finally{
   setBusy(false);
  }
 }

 return <div className="reset-all-batches">
  <button
   type="button"
   className={erpMode?"erpkit-btn erpkit-btn-danger":"btn danger-btn"}
   disabled={busy}
   onClick={resetAll}
  >
   {busy?(erpMode?"Đang đặt lại…":"Resetting..."):(erpMode?"Đặt lại tất cả Batch":"Reset All Batches")}
  </button>

 </div>;
}
