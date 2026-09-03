"use client";

import {useState} from "react";
import {safeJson} from "@/lib/fetch-json";
import {usePopupMessage} from "@/hooks/use-popup-message";

function shiftDate(date:string,days:number){
 const [y,m,d]=date.split("-").map(Number);
 const x=new Date(Date.UTC(y,m-1,d+days));
 return x.toISOString().slice(0,10);
}

export function ScheduleDayShiftControl({
 date,planner,scheduleCount
}:{
 date:string;
 planner:"1"|"2";
 scheduleCount:number;
}){
 const [busy,setBusy]=useState(false);
 const [msg,setMsg]=useState("");
 usePopupMessage(msg);

 async function move(direction:1|-1){
  if(busy||scheduleCount<=0)return;
  const target=shiftDate(date,direction);
  const verb=direction===1?"DỜI SANG NGÀY HÔM SAU":"LÙI VỀ NGÀY HÔM TRƯỚC";
  const ok=window.confirm(
   `${verb}\n\n${scheduleCount} lô đang hiển thị ở ${date} sẽ được MOVE in-place sang ${target}.\n`+
   `Không clone Batch/Schedule. Ngày ${date} sẽ rỗng sau khi hoàn tất.\n`+
   `Resource, Recipe, Duration và toàn bộ mốc Chemical Line sẽ giữ nguyên tương đối.\n\nTiếp tục?`
  );
  if(!ok)return;

  setBusy(true);
  setMsg("");
  try{
   const response=await fetch("/api/schedule/shift-day",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({sourceDate:date,direction})
   });
   const data=await safeJson(response);
   if(!response.ok)throw new Error(data.error||"Không thể dời ngày điều độ.");
   setMsg(`Đã dời ${data.moved||0} lô: ${date} → ${data.targetDate}. Ngày cũ đã rỗng.`);
   window.setTimeout(()=>{
    window.location.href=`/schedule?date=${encodeURIComponent(data.targetDate)}&planner=${encodeURIComponent(planner)}`;
   },500);
  }catch(error){
   setMsg(error instanceof Error?error.message:"Không thể dời ngày điều độ.");
  }finally{
   setBusy(false);
  }
 }

 return <div className="schedule-day-shift-control">
  <button
   type="button"
   className="btn"
   disabled={busy||scheduleCount<=0}
   onClick={()=>move(-1)}
   title="Hoàn tác kiểu trial: move toàn bộ lịch của ngày đang xem về ngày hôm trước, không clone"
  >
   ← Lùi 1 ngày
  </button>
  <button
   type="button"
   className="btn primary"
   disabled={busy||scheduleCount<=0}
   onClick={()=>move(1)}
   title="Move toàn bộ lịch của ngày đang xem sang ngày hôm sau; ngày cũ sẽ rỗng"
  >
   {busy?"Đang dời…":"Dời toàn bộ lịch → +1 ngày"}
  </button>
  <small>{scheduleCount>0?`${scheduleCount} lô · MOVE, không copy`:"Ngày này chưa có lô để dời"}</small>
 </div>;
}
