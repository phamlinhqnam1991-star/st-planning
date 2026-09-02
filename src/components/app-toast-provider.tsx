"use client";

import {useEffect,useRef,useState} from "react";

export type ToastKind="success"|"warning"|"error"|"info";
type Toast={id:number;message:string;kind:ToastKind};

function inferKind(message:string):ToastKind{
 const text=message.trim();
 if(/^(lỗi|error)|failed|không .*được|không thể|nxdomain/i.test(text))return "error";
 if(/chọn |phải |thiếu |bắt buộc|không hợp lệ|chưa được map|xác nhận/i.test(text))return "warning";
 if(/^(đã |hoàn tất|thành công|reset hoàn tất)|success/i.test(text))return "success";
 return "info";
}

export function pushAppToast(message:string,kind?:ToastKind){
 if(typeof window==="undefined"||!String(message||"").trim())return;
 window.dispatchEvent(new CustomEvent("st-planning-toast",{
  detail:{message:String(message),kind:kind||inferKind(String(message))}
 }));
}

export function AppToastProvider(){
 const [items,setItems]=useState<Toast[]>([]);
 const nextId=useRef(1);

 useEffect(()=>{
  const onToast=(event:Event)=>{
   const detail=(event as CustomEvent).detail||{};
   const message=String(detail.message||"").trim();
   if(!message)return;
   const kind=(detail.kind||inferKind(message)) as ToastKind;
   const id=nextId.current++;
   setItems(prev=>[...prev.slice(-4),{id,message,kind}]);
   window.setTimeout(()=>setItems(prev=>prev.filter(x=>x.id!==id)),kind==="error"?6500:4200);
  };

  window.addEventListener("st-planning-toast",onToast);

  return ()=>{
   window.removeEventListener("st-planning-toast",onToast);
  };
 },[]);

 return <div className="app-toast-stack" aria-live="polite" aria-atomic="false">
  {items.map(item=><div key={item.id} className={`app-toast app-toast-${item.kind}`} role={item.kind==="error"||item.kind==="warning"?"alert":"status"}>
   <div className="app-toast-icon" aria-hidden="true">{item.kind==="success"?"✓":item.kind==="error"?"!":item.kind==="warning"?"!":"i"}</div>
   <div className="app-toast-content">
    <b>{item.kind==="success"?"Thành công":item.kind==="error"?"Lỗi":item.kind==="warning"?"Cảnh báo":"Thông báo"}</b>
    <span>{item.message}</span>
   </div>
   <button type="button" className="app-toast-close" aria-label="Đóng thông báo" onClick={()=>setItems(prev=>prev.filter(x=>x.id!==item.id))}>×</button>
  </div>)}
 </div>;
}
