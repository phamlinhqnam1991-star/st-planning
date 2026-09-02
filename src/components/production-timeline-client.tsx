"use client";

// =====================================================================
// Production Timeline — client component.
// Ban đầu render từ dữ liệu server (initialRows). Khi planner Save/Edit/
// Delete/Move trong lưới (ManualScheduleGrid phát sự kiện st-schedule-changed),
// component tự nạp lại danh sách lịch qua GET /api/schedule/rows — KHÔNG
// tải lại trang, nên các dòng đang nhập dở không bao giờ bị mất.
// =====================================================================
import {safeJson} from "@/lib/fetch-json";
import {useEffect,useState} from "react";

type TimelineRow={
 id:number;batch_id:number;batch_no:string;standard_operation:string;recipe_key:string|null;
 recipe_no:string|null;recipe_name:string|null;resource_code:string;resource_group:string;
 total_jobs:number;total_qty:number;total_surface_dm2:number;planned_start:string;planned_end:string;
 duration_minutes:number;sequence_no:number;status:string;plan_source:string|null;
 loading_start?:string|null;loading_end?:string|null;loading_duration_minutes?:number|null;
 process_start?:string|null;process_end?:string|null;process_duration_minutes?:number|null;
 ndt_start?:string|null;ndt_end?:string|null;ndt_duration_minutes?:number|null;
 unloading_start?:string|null;unloading_end?:string|null;unloading_duration_minutes?:number|null;
 resource_name?:string|null;resource_sort_order?:number|null;
};

const TIMELINE_RESOURCE_ORDER=[
 "SPX-CLEAN","MANUAL-DBL","AUTO-DBL","PLATING","HE-BAKE","PASS-BRTG","MANUALSP","AUTOSHP",
 "FB-01","FB-02","FB-03","FB-04","FB-05","FB-06",
 "CAB1","CAB2","CAB3","CAB4","PAINT-POWDER"
];

function time(v:any){
 if(!v)return "—";
 return new Date(v).toLocaleTimeString("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"});
}
function hhmm(v:any){
 const n=Number(v||0);if(!n)return "";
 return `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
}

export default function ProductionTimelineClient({
 date,initialRows,resources,plannerOps
}:{
 date:string;
 initialRows:any[];
 resources:any[];
 plannerOps:string[];
}){
 const [rows,setRows]=useState<TimelineRow[]>(initialRows as TimelineRow[]);

 useEffect(()=>{
  setRows(initialRows as TimelineRow[]);
 },[initialRows]);

 useEffect(()=>{
  const handler=async()=>{
   try{
    const res=await fetch(`/api/schedule/rows?date=${encodeURIComponent(date)}`);
    const d=await safeJson(res);
    if(!res.ok)return;
    const opSet=new Set((plannerOps||[]).map((x:string)=>x.toUpperCase()));
    setRows((d.rows||[]).filter((x:any)=>
     opSet.has(String(x.standard_operation||"").toUpperCase())
    ) as TimelineRow[]);
   }catch{/* giữ nguyên dữ liệu cũ nếu lỗi mạng */}
  };
  window.addEventListener("st-schedule-changed",handler);
  return()=>window.removeEventListener("st-schedule-changed",handler);
 },[date,plannerOps]);

 const timelineRows=rows;

 const resourceByCode=new Map((resources||[]).map((r:any)=>[String(r.resource_code),r]));
 const usedResourceCodes=new Set(timelineRows.map((x:any)=>String(x.resource_code||"")));

 const productionResources=(TIMELINE_RESOURCE_ORDER as string[])
  .map(code=>{
   const r=resourceByCode.get(code);
   if(r)return r;
   if(/^FB-0[1-6]$/.test(code))
    return {resource_code:code,resource_name:`Chemical Line Flybar ${code}`,resource_group:"CHEMICAL_LINE"};
   return null;
  })
  .filter((r:any)=>Boolean(r)&&(
   String(r.resource_group)==="CHEMICAL_LINE"||usedResourceCodes.has(String(r.resource_code))
  )) as any[];

 for(const r of resources||[]){
  if(
   !TIMELINE_RESOURCE_ORDER.includes(String(r.resource_code)) &&
   usedResourceCodes.has(String(r.resource_code))
  )productionResources.push(r);
 }

 // Phát hiện xung đột: hai lịch cùng Resource chồng thời gian.
 const conflictIds=new Set<number>();
 for(const r of productionResources){
  const items=timelineRows.filter((x:any)=>x.resource_code===r.resource_code);
  for(let i=0;i<items.length;i++){
   for(let j=i+1;j<items.length;j++){
    const a=items[i],b=items[j];
    const as=new Date(a.planned_start).getTime(),ae=new Date(a.planned_end).getTime();
    const bs=new Date(b.planned_start).getTime(),be=new Date(b.planned_end).getTime();
    if(Number.isFinite(as)&&Number.isFinite(ae)&&Number.isFinite(bs)&&Number.isFinite(be)&&as<be&&bs<ae){
     conflictIds.add(Number(a.id));
     conflictIds.add(Number(b.id));
    }
   }
  }
 }

 // Production-day timeline = 06:00 selected date -> 06:00 next day.
 // Nếu Batch/NDT/Unloading kéo dài qua 06:00 hôm sau, Timeline tự mở rộng
 // tới khi mọi công đoạn hoàn tất (tối đa 48h).
 const timelineStart=new Date(`${date}T06:00:00+07:00`);
 const baseTimelineEndMs=new Date(timelineStart.getTime()+24*60*60*1000).getTime();
 let timelineEndMs=baseTimelineEndMs;
 for(const x of timelineRows as any[]){
  for(const v of [x.planned_end,x.unloading_end,x.ndt_end]){
   if(!v)continue;
   const t=new Date(v).getTime();
   if(Number.isFinite(t)&&t>timelineEndMs)timelineEndMs=t;
  }
 }
 const maxSpanMs=48*60*60*1000;
 if(timelineEndMs-timelineStart.getTime()>maxSpanMs)timelineEndMs=timelineStart.getTime()+maxSpanMs;
 const timelineEnd=new Date(timelineEndMs);
 const timelineStartMs=timelineStart.getTime();
 const timelineSpanMs=timelineEndMs-timelineStartMs;
 const timelineTotalHours=Math.max(24,Math.ceil(timelineSpanMs/3600000));
 const timelineHours=Array.from({length:timelineTotalHours+1},(_,i)=>(6+i)%24);

 const timelineStyle=(startValue:any,endValue:any)=>{
  const rawStart=new Date(startValue).getTime();
  const rawEnd=new Date(endValue).getTime();

  const clippedStart=Math.max(rawStart,timelineStartMs);
  const clippedEnd=Math.min(rawEnd,timelineEndMs);

  if(
   !Number.isFinite(clippedStart) ||
   !Number.isFinite(clippedEnd) ||
   clippedEnd<=clippedStart
  )return null;

  const left=((clippedStart-timelineStartMs)/timelineSpanMs)*100;
  const width=((clippedEnd-clippedStart)/timelineSpanMs)*100;

  return {
   left:`${left}%`,
   width:`${Math.max(width,0.35)}%`
  };
 };

 return <div className="erp-table-panel section production-timeline-panel">
  <div className="erp-panel-head">
   <b>Production Timeline</b>
   <span>
    {date} 06:00 → {timelineEnd.toLocaleTimeString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hour12:false})} ({timelineTotalHours}h) · {productionResources.length} resources
   </span>
  </div>

  <div className="production-timeline-scroll">
   <div className="production-timeline-frame">
    <div className="production-timeline-hours">
     <div className="production-timeline-corner">Resource</div>
     <div className="production-timeline-hour-track">
      {timelineHours.map((hour,index)=>
       <span
        key={`${hour}-${index}`}
        className="production-timeline-hour"
        style={{left:`${(index/timelineTotalHours)*100}%`}}
       >
        {String(hour).padStart(2,"0")}:00
       </span>
      )}
     </div>
    </div>

    {productionResources.map((r:any)=>{
     const rawItems=timelineRows.filter((x:any)=>x.resource_code===r.resource_code);
     const items=rawItems.map((x:any,idx:number)=>{
      const prev=idx>0?rawItems[idx-1]:null;
      const ls=x.loading_start?new Date(String(x.loading_start)).getTime():0;
      const pe=prev&&prev.planned_end?new Date(String(prev.planned_end)).getTime():0;
      const continued=Boolean(prev&&ls&&pe&&Number(x.loading_duration_minutes||0)===0&&Math.abs(ls-pe)<=5*60000);
      return {x,prev,continued};
     });

     return <div className="production-timeline-row" key={r.resource_code}>
      <div className={`schedule-resource-label${/^FB-0[1-6]$/.test(String(r.resource_code))?` fb-label ${String(r.resource_code).toLowerCase()}`:""}`}>
       <b>{r.resource_code}</b>
       <small>{r.resource_name}</small>
      </div>

      <div className="production-timeline-track">
       {items.map(({x,prev,continued}:any)=>{
        const style=timelineStyle(x.planned_start,x.planned_end);
        if(!style)return null;
        const chainTitle=continued?` · ↳ nối tiếp từ ${prev.batch_no} (không loading)`:"";
        const chainClass=continued?" continued":"";

        if(r.resource_group==="CHEMICAL_LINE"&&x.loading_start){
         const conflicted=conflictIds.has(Number(x.id));
         const segments=[
          {key:"loading",label:"Loading",start:x.loading_start,end:x.loading_end},
          {key:"process",label:"Process",start:x.process_start,end:x.process_end},
          ...(x.ndt_start?[{key:"ndt",label:"NDT",start:x.ndt_start,end:x.ndt_end}]:[]),
          {key:"unloading",label:"Unloading",start:x.unloading_start,end:x.unloading_end}
         ];
         return segments.map(segment=>{
          const segmentStyle=timelineStyle(segment.start,segment.end);if(!segmentStyle)return null;
          return <div className={`schedule-chip production-timeline-batch chemical chemical-${segment.key}${conflicted?" conflict":""}${chainClass}`}
           key={`${x.id}-${segment.key}`} style={segmentStyle}
           title={`${x.batch_no}${x.recipe_no?` · Recipe ${x.recipe_no}`:""} · ${segment.label} · ${time(segment.start)}–${time(segment.end)}${chainTitle}${conflicted?" · XUNG ĐỘT":""}`}>
           {continued&&segment.key==="loading"&&<span className="chain-mark">↳</span>}
           <b>{time(segment.start)}–{time(segment.end)}{segment.key==="process"&&x.process_duration_minutes?` · ${hhmm(x.process_duration_minutes)}`:""}</b><span>{segment.label}</span><span>{x.batch_no}</span>
          </div>;
         });
        }

        return <div
         className={`schedule-chip production-timeline-batch ${
          r.resource_group==="CHEMICAL_LINE"
           ?"chemical"
           :r.resource_group==="PAINTING"
            ?"paint"
            :"other"
         }${conflictIds.has(Number(x.id))?" conflict":""}${chainClass}`}
         key={x.id}
         style={style}
         title={`${x.batch_no} · ${x.standard_operation} · ${time(x.planned_start)}–${time(x.planned_end)}${x.recipe_no?` · Recipe ${x.recipe_no}`:""}${chainTitle}${conflictIds.has(Number(x.id))?" · XUNG ĐỘT":""}`}
        >
         <b>{time(x.planned_start)}–{time(x.planned_end)}</b>
         <span>{x.batch_no}</span>
         {x.recipe_no&&<span>Recipe {x.recipe_no}</span>}
        </div>;
       })}

       {/* Mũi tên liên kết nối tiếp tại điểm chuyển tiếp */}
       {items.map(({x,continued}:any)=>{
        if(!continued)return null;
        const pe=new Date(String(x.loading_start)).getTime();
        const left=((pe-timelineStartMs)/timelineSpanMs)*100;
        return <div key={`chainlink-${x.id}`} className="timeline-continuation-link" style={{left:`${left}%`}}>↳</div>;
       })}
      </div>
     </div>;
    })}
   </div>
  </div>
 </div>;
}
