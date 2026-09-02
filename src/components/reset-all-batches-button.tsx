"use client";

import {safeJson} from "@/lib/fetch-json";
import {useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";

export function ResetAllBatchesButton({presentation="legacy"}:{presentation?:"legacy"|"erp"}={}){
 const erpMode=presentation==="erp";
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 usePopupMessage(message);

 async function resetAll(){
  const first=window.confirm(
   (erpMode?"ĐẶT LẠI TẤT CẢ BATCH?\n\n":"RESET TẤT CẢ CÁC LÔ?\n\n")+
   (erpMode?"Tất cả Batch chưa chạy sẽ bị hủy, lịch điều độ tương ứng bị hủy và Job được trả về trạng thái chưa lập Batch.":"Tất cả Batch chưa chạy sẽ bị hủy, Schedule tương ứng bị hủy và toàn bộ Job sẽ trở về chuỗi chưa lập lô.")
  );
  if(!first)return;

  const second=window.confirm(
   (erpMode?"XÁC NHẬN LẦN CUỐI\n\n":"XÁC NHẬN LẦN CUỐI\n\n")+
   (erpMode?"Thao tác áp dụng cho tất cả công đoạn và không thể hoàn tác. Tiếp tục?":"Thao tác này áp dụng cho TẤT CẢ công đoạn và không thể Undo. Tiếp tục?")
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
    throw new Error(data.error||(erpMode?"Không đặt lại được các Batch.":"Không Reset được các lô."));

   window.alert(
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
