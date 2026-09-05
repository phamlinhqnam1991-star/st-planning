"use client";

import {FormEvent,useCallback,useEffect,useMemo,useRef,useState} from "react";

type ChatMessage={
 id:number;
 message_type:"USER"|"SYSTEM";
 sender_user_id:string|null;
 sender_display_name:string|null;
 body:string;
 event_key:string|null;
 is_cross_planner:boolean;
 source_main:string|null;
 affected_main:string|null;
 source_planner:string|null;
 affected_planner:string|null;
 entity_type:string|null;
 entity_id:string|null;
 metadata_json:Record<string,unknown>|null;
 created_at:string;
};
type CurrentUser={userId:string;displayName:string;email:string;roles:string[]};

function timeLabel(value:string){
 const d=new Date(value);
 if(Number.isNaN(d.getTime()))return "";
 return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(d);
}
function mergeMessages(current:ChatMessage[],incoming:ChatMessage[]){
 const map=new Map<number,ChatMessage>(current.map(x=>[Number(x.id),x]));
 for(const row of incoming)map.set(Number(row.id),row);
 return [...map.values()].sort((a,b)=>Number(a.id)-Number(b.id)).slice(-500);
}

export function InternalChatClient({canSend}:{canSend:boolean}){
 const [messages,setMessages]=useState<ChatMessage[]>([]);
 const [me,setMe]=useState<CurrentUser|null>(null);
 const [text,setText]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const listRef=useRef<HTMLDivElement|null>(null);
 const lastId=useMemo(()=>messages.length?Number(messages[messages.length-1].id):0,[messages]);
 const lastIdRef=useRef(0);
 useEffect(()=>{lastIdRef.current=lastId;},[lastId]);

 const markRead=useCallback(async(id:number)=>{
  if(!id)return;
  try{await fetch("/api/internal-chat",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({lastMessageId:id})});}catch{/* best effort */}
 },[]);

 const load=useCallback(async(initial=false)=>{
  try{
   const after=initial?0:lastIdRef.current;
   const r=await fetch(`/api/internal-chat${after?`?after_id=${after}`:""}`,{cache:"no-store"});
   const j=await r.json();
   if(!r.ok)throw new Error(j.error||"Unable to load Internal Chat.");
   if(j.currentUser)setMe(j.currentUser);
   const incoming=Array.isArray(j.messages)?j.messages:[];
   if(incoming.length){
    setMessages(prev=>mergeMessages(initial?[]:prev,incoming));
    const newest=Number(incoming[incoming.length-1]?.id||0);
    if(newest)void markRead(newest);
   }else if(initial){
    setMessages([]);
    void markRead(0);
   }
   setError("");
  }catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{if(initial)setLoading(false);}
 },[markRead]);

 useEffect(()=>{
  void load(true);
  const id=window.setInterval(()=>void load(false),5000);
  const onVisible=()=>{if(document.visibilityState==="visible")void load(false);};
  document.addEventListener("visibilitychange",onVisible);
  return()=>{window.clearInterval(id);document.removeEventListener("visibilitychange",onVisible);};
 },[load]);

 useEffect(()=>{
  const el=listRef.current;if(!el)return;
  el.scrollTop=el.scrollHeight;
 },[messages.length]);

 async function submit(e?:FormEvent){
  e?.preventDefault();
  const message=text.trim();
  if(!message||busy||!canSend)return;
  setBusy(true);setError("");
  try{
   const r=await fetch("/api/internal-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message})});
   const j=await r.json();
   if(!r.ok)throw new Error(j.error||"Unable to send message.");
   if(j.message)setMessages(prev=>mergeMessages(prev,[j.message]));
   setText("");
   if(j.message?.id)void markRead(Number(j.message.id));
  }catch(e2){setError(e2 instanceof Error?e2.message:String(e2));}
  finally{setBusy(false);}
 }

 return <div className="internal-chat-layout">
  <div className="internal-chat-toolbar">
   <div><b>ST Planning Group</b><span>Manual messages + automatic Planning / Scheduling / Production change notifications.</span></div>
   <div className="internal-chat-presence"><span className="internal-chat-live-dot"/>LIVE · refresh 5s</div>
  </div>
  {error?<div className="notice error internal-chat-error">{error}</div>:null}
  <div className="internal-chat-list" ref={listRef} aria-live="polite" aria-busy={loading}>
   {loading?<div className="internal-chat-empty">Loading Internal Chat…</div>:messages.length===0?<div className="internal-chat-empty">No messages yet. Start the ST Planning group conversation here.</div>:messages.map(m=>{
    const mine=Boolean(me&&m.sender_user_id===me.userId);
    if(m.message_type==="SYSTEM")return <article key={m.id} className={`internal-chat-system ${m.is_cross_planner?"is-cross-planner":""}`}>
     <div className="internal-chat-system-head"><span>{m.is_cross_planner?"CROSS-PLANNER":"SYSTEM"}</span>{m.event_key?<b>{m.event_key.replaceAll("_"," ")}</b>:null}<time>{timeLabel(m.created_at)}</time></div>
     <p>{m.body}</p>
     <small>{m.sender_display_name?`Changed by ${m.sender_display_name}`:"Automatic system notification"}{m.source_main?` · ${m.source_main}`:""}{m.affected_main?` → ${m.affected_main}`:""}</small>
    </article>;
    return <article key={m.id} className={`internal-chat-message ${mine?"is-mine":""}`}>
     <div className="internal-chat-message-meta"><b>{mine?"You":m.sender_display_name||"ST user"}</b><time>{timeLabel(m.created_at)}</time></div>
     <p>{m.body}</p>
    </article>;
   })}
  </div>
  <form className="internal-chat-compose" onSubmit={submit}>
   <textarea className="input" value={text} onChange={e=>setText(e.target.value)} maxLength={2000} rows={3} disabled={!canSend||busy} placeholder={canSend?"Write a message to the ST Planning group…":"You have read-only access to Internal Chat."} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void submit();}}}/>
   <div className="internal-chat-compose-actions"><span>{text.length}/2000 · Enter to send · Shift+Enter for new line</span><button type="submit" className="btn primary" disabled={!canSend||busy||!text.trim()}>{busy?"Sending…":"Send"}</button></div>
  </form>
 </div>;
}
