"use client";

import {useEffect,useState} from "react";

export function ChatUnreadBadge(){
 const [count,setCount]=useState(0);
 useEffect(()=>{
  let live=true;
  const load=async()=>{
   try{
    const r=await fetch("/api/internal-chat?mode=unread",{cache:"no-store"});
    if(!r.ok)return;
    const j=await r.json();
    if(live)setCount(Math.max(0,Number(j.unread)||0));
   }catch{/* badge is best effort */}
  };
  void load();
  const id=window.setInterval(load,10000);
  const onVisible=()=>{if(document.visibilityState==="visible")void load();};
  document.addEventListener("visibilitychange",onVisible);
  return()=>{live=false;window.clearInterval(id);document.removeEventListener("visibilitychange",onVisible);};
 },[]);
 if(!count)return null;
 return <span className="internal-chat-unread-badge" aria-label={`${count} unread chat messages`}>{count>99?"99+":count}</span>;
}
