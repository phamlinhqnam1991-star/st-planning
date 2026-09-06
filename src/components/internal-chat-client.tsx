"use client";

import {FormEvent,useCallback,useEffect,useMemo,useRef,useState} from "react";
import {ST_REALTIME_WINDOW_EVENT,isStRealtimeChange} from "@/lib/realtime/st-realtime";

type ChatMessage={
 id:number;
 message_type:"USER"|"SYSTEM";
 sender_user_id:string|null;
 sender_display_name:string|null;
 recipient_user_id:string|null;
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
type ChatUser={userId:string;displayName:string;email:string;roles:string[];unread:number};

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

export function InternalChatClient(){
 const [messages,setMessages]=useState<ChatMessage[]>([]);
 const [users,setUsers]=useState<ChatUser[]>([]);
 const [me,setMe]=useState<CurrentUser|null>(null);
 const [peerUserId,setPeerUserId]=useState<string|null>(null);
 const [userSearch,setUserSearch]=useState("");
 const [groupUnread,setGroupUnread]=useState(0);
 const [canSend,setCanSend]=useState(false);
 const [text,setText]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const listRef=useRef<HTMLDivElement|null>(null);
 const lastId=useMemo(()=>messages.length?Number(messages[messages.length-1].id):0,[messages]);
 const lastIdRef=useRef(0);
 useEffect(()=>{lastIdRef.current=lastId;},[lastId]);

 const selectedPeer=useMemo(()=>users.find(x=>x.userId===peerUserId)||null,[users,peerUserId]);
 const filteredUsers=useMemo(()=>{
  const q=userSearch.trim().toLowerCase();
  if(!q)return users;
  return users.filter(u=>`${u.displayName} ${u.email} ${u.roles.join(" ")}`.toLowerCase().includes(q));
 },[users,userSearch]);

 const markRead=useCallback(async(id:number,peer:string|null)=>{
  if(!id)return;
  try{
   const r=await fetch("/api/internal-chat",{
    method:"PATCH",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({lastMessageId:id,peerUserId:peer})
   });
   if(r.ok)window.dispatchEvent(new Event("internal-chat-unread-changed"));
  }catch{/* best effort */}
 },[]);

 const loadUsers=useCallback(async()=>{
  try{
   const r=await fetch("/api/internal-chat?mode=users",{cache:"no-store"});
   const j=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(j.error||"Unable to load chat users.");
   setUsers(Array.isArray(j.users)?j.users:[]);
   setGroupUnread(Math.max(0,Number(j.groupUnread)||0));
   if(j.currentUser)setMe(j.currentUser);
   if(typeof j.canSend==="boolean")setCanSend(j.canSend);
  }catch(e){setError(e instanceof Error?e.message:String(e));}
 },[]);

 const load=useCallback(async(initial=false,peerOverride?:string|null)=>{
  const peer=peerOverride===undefined?peerUserId:peerOverride;
  try{
   const after=initial?0:lastIdRef.current;
   const qs=new URLSearchParams();
   if(after)qs.set("after_id",String(after));
   if(peer)qs.set("peer_user_id",peer); else qs.set("scope","group");
   const r=await fetch(`/api/internal-chat?${qs.toString()}`,{cache:"no-store"});
   const j=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(j.error||"Unable to load Internal Chat.");
   if(j.currentUser)setMe(j.currentUser);
   if(typeof j.canSend==="boolean")setCanSend(j.canSend);
   const incoming=Array.isArray(j.messages)?j.messages:[];
   if(incoming.length){
    setMessages(prev=>mergeMessages(initial?[]:prev,incoming));
    const newest=Number(incoming[incoming.length-1]?.id||0);
    if(newest&&document.visibilityState==="visible"){
     void markRead(newest,peer).then(()=>loadUsers());
    }
   }else if(initial){
    setMessages([]);
   }
   setError("");
  }catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{if(initial)setLoading(false);}
 },[loadUsers,markRead,peerUserId]);

 useEffect(()=>{
  setMessages([]);lastIdRef.current=0;setLoading(true);setError("");
  void Promise.all([load(true,peerUserId),loadUsers()]);
 },[peerUserId]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(()=>{
  const onRealtime=(event:Event)=>{
   const detail=(event as CustomEvent<unknown>).detail;
   if(!isStRealtimeChange(detail))return;
   if(!detail.domains.includes("CHAT")&&!detail.domains.includes("ALL"))return;
   // Read receipts only affect unread counters; do not reload messages and mark them read again.
   if(detail.path==="/api/internal-chat"&&detail.method==="PATCH"){void loadUsers();return;}
   void load(false);
   void loadUsers();
  };
  const onVisible=()=>{
   if(document.visibilityState!=="visible")return;
   void load(false);
   void loadUsers();
  };
  window.addEventListener(ST_REALTIME_WINDOW_EVENT,onRealtime as EventListener);
  document.addEventListener("visibilitychange",onVisible);
  const fallback=window.setInterval(()=>{
   if(document.visibilityState==="visible"){
    void load(false);
    void loadUsers();
   }
  },15000);
  return()=>{
   window.removeEventListener(ST_REALTIME_WINDOW_EVENT,onRealtime as EventListener);
   document.removeEventListener("visibilitychange",onVisible);
   window.clearInterval(fallback);
  };
 },[load,loadUsers]);

 useEffect(()=>{
  const el=listRef.current;if(!el)return;
  el.scrollTop=el.scrollHeight;
 },[messages.length,peerUserId]);

 async function submit(e?:FormEvent){
  e?.preventDefault();
  const message=text.trim();
  if(!message||busy||!canSend)return;
  setBusy(true);setError("");
  try{
   const r=await fetch("/api/internal-chat",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({message,recipientUserId:peerUserId})
   });
   const j=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(j.error||"Unable to send message.");
   if(j.message)setMessages(prev=>mergeMessages(prev,[j.message]));
   setText("");
   void loadUsers();
  }catch(e2){setError(e2 instanceof Error?e2.message:String(e2));}
  finally{setBusy(false);}
 }

 return <div className="internal-chat-shell">
  <aside className="internal-chat-people" aria-label="Chat recipients">
   <div className="internal-chat-people-head"><b>Chats</b><span>Group + direct users</span></div>
   <button type="button" className={`internal-chat-person ${peerUserId===null?"active":""}`} onClick={()=>setPeerUserId(null)}>
    <span className="internal-chat-avatar">ST</span><span className="internal-chat-person-text"><b>ST Planning Group</b><small>System changes + team chat</small></span>{groupUnread>0?<em>{groupUnread>99?"99+":groupUnread}</em>:null}
   </button>
   <input className="input internal-chat-user-search" value={userSearch} onChange={e=>setUserSearch(e.target.value)} placeholder="Search user…"/>
   <div className="internal-chat-user-list">
    {filteredUsers.length===0?<div className="internal-chat-users-empty">No active users.</div>:filteredUsers.map(u=><button type="button" key={u.userId} className={`internal-chat-person ${peerUserId===u.userId?"active":""}`} onClick={()=>setPeerUserId(u.userId)}>
     <span className="internal-chat-avatar">{(u.displayName||u.email||"U").slice(0,2).toUpperCase()}</span>
     <span className="internal-chat-person-text"><b>{u.displayName||u.email}</b><small>{u.email}{u.roles.length?` · ${u.roles.join(" / ")}`:""}</small></span>
     {u.unread>0?<em>{u.unread>99?"99+":u.unread}</em>:null}
    </button>)}
   </div>
  </aside>
  <div className="internal-chat-layout">
   <div className="internal-chat-toolbar">
    <div><b>{selectedPeer?selectedPeer.displayName||selectedPeer.email:"ST Planning Group"}</b><span>{selectedPeer?`Direct chat · ${selectedPeer.email}`:"Manual messages + automatic Planning / Scheduling / Production change notifications."}</span></div>
    <div className="internal-chat-presence"><span className="internal-chat-live-dot"/>LIVE · Global Realtime</div>
   </div>
   {error?<div className="notice error internal-chat-error">{error}</div>:null}
   <div className="internal-chat-list" ref={listRef} aria-live="polite" aria-busy={loading}>
    {loading?<div className="internal-chat-empty">Loading Internal Chat…</div>:messages.length===0?<div className="internal-chat-empty">{selectedPeer?`No direct messages with ${selectedPeer.displayName||selectedPeer.email} yet.`:"No group messages yet. Planning / Scheduling changes and team messages will appear here automatically."}</div>:messages.map(m=>{
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
    <textarea className="input" value={text} onChange={e=>setText(e.target.value)} maxLength={2000} rows={3} disabled={!canSend||busy} placeholder={canSend?(selectedPeer?`Message ${selectedPeer.displayName||selectedPeer.email}…`:"Write a message to the ST Planning group…"):"You have read-only access to Internal Chat."} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void submit();}}}/>
    <div className="internal-chat-compose-actions"><span>{text.length}/2000 · Enter to send · Shift+Enter for new line</span><button type="submit" className="btn primary" disabled={!canSend||busy||!text.trim()}>{busy?"Sending…":"Send"}</button></div>
   </form>
  </div>
 </div>;
}
