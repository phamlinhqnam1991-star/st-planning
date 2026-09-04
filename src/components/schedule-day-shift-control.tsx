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
   `${verb}\n\n${scheduleCount} lô thuộc ngày sản xuất ${date} (06:00 → 06:00 hôm sau) sẽ được MOVE in-place sang ${target}.\n`+
   `Các lô bắt đầu sau 00:00 nhưng trước 06:00 hôm sau vẫn được dời cùng ngày nguồn.\n`+
   `Không clone Batch/Schedule. Ngày sản xuất ${date} sẽ rỗng sau khi hoàn tất.\n`+
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
   setMsg(`Đã dời ${data.moved||0} lô: ngày sản xuất ${date} → ${data.targetDate}. Ngày nguồn đã rỗng.`);
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
   title="Hoàn tác trial theo ngày sản xuất 06:00→06:00: move toàn bộ lịch về ngày hôm trước, không clone"
  >
   ← Lùi 1 ngày
  </button>
  <button
   type="button"
   className="btn primary"
   disabled={busy||scheduleCount<=0}
   onClick={()=>move(1)}
   title="Move toàn bộ ngày sản xuất 06:00→06:00 sang ngày hôm sau; ngày nguồn sẽ rỗng"
  >
   {busy?"Đang dời…":"Dời toàn bộ lịch → +1 ngày"}
  </button>
  <small>{scheduleCount>0?`${scheduleCount} lô · ngày SX 06:00→06:00 · MOVE`:"Ngày này chưa có lô để dời"}</small>
 </div>;
}
