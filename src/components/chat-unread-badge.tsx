"use client";

import {useEffect,useState} from "react";
import {ST_REALTIME_WINDOW_EVENT,isStRealtimeChange} from "@/lib/realtime/st-realtime";

export function ChatUnreadBadge(){
 const [count,setCount]=useState(0);
 useEffect(()=>{
  let live=true;
  const load=async()=>{
   try{
    const r=await fetch("/api/internal-chat?mode=unread",{cache:"no-store"});
    if(!r.ok)return;
    const j=await r.json().catch(()=>({}));
    if(live)setCount(Math.max(0,Number(j.unread)||0));
   }catch{/* badge is best effort */}
  };
  const onRealtime=(event:Event)=>{
   const detail=(event as CustomEvent<unknown>).detail;
   if(!isStRealtimeChange(detail))return;
   if(detail.domains.includes("CHAT")||detail.domains.includes("ALL"))void load();
  };
  const onVisible=()=>{if(document.visibilityState==="visible")void load();};
  const onReadChanged=()=>void load();
  void load();
  const id=window.setInterval(()=>{if(document.visibilityState==="visible")void load();},15000);
  window.addEventListener(ST_REALTIME_WINDOW_EVENT,onRealtime as EventListener);
  window.addEventListener("internal-chat-unread-changed",onReadChanged);
  document.addEventListener("visibilitychange",onVisible);
  return()=>{
   live=false;window.clearInterval(id);
   window.removeEventListener(ST_REALTIME_WINDOW_EVENT,onRealtime as EventListener);
   window.removeEventListener("internal-chat-unread-changed",onReadChanged);
   document.removeEventListener("visibilitychange",onVisible);
  };
 },[]);
 if(!count)return null;
 return <span className="internal-chat-unread-badge" aria-label={`${count} unread chat messages`}>{count>99?"99+":count}</span>;
}
