"use client";

import {useEffect,useRef} from "react";
import {useRouter} from "next/navigation";
import {
 ST_REALTIME_API_PATH,
 ST_REALTIME_BROWSER_CHANNEL,
 ST_REALTIME_POLL_MS,
 ST_REALTIME_WINDOW_EVENT,
 isStRealtimeChange,
 isStRealtimeFeedResponse,
 makeRealtimeChange,
 realtimeMutationRequest,
 type StRealtimeChange,
} from "@/lib/realtime/st-realtime";

const STORAGE_SIGNAL_KEY="st-planning-live-signal-v2";
const MAX_SEEN=500;
const MAX_PERSIST_RETRIES=3;

/**
 * V508 Global Realtime No-Supabase.
 *
 * Canonical business data and the cross-device invalidation feed both live in
 * the same PostgreSQL database. No Supabase Realtime key/channel is required.
 *
 * Transport order:
 *  1) BroadcastChannel/localStorage = instant synchronization between tabs on
 *     the same PC/browser profile.
 *  2) PostgreSQL change-event feed = cross-device synchronization. Browsers
 *     poll only the tiny event feed (~1.2s default), then re-read canonical
 *     data through the existing application routes.
 *
 * `router.refresh()` is an automatic Next.js RSC soft reconcile, not F5 or a
 * browser-document reload. Existing client state remains mounted while server
 * data is merged, and schedule/timeline views also keep their fine-grained
 * `st-schedule-changed` reload path.
 */
export function StRealtimeProvider({children}:{children:React.ReactNode}){
 const router=useRouter();
 const tabIdRef=useRef("");
 const seenRef=useRef(new Set<string>());
 const refreshTimerRef=useRef<number|null>(null);
 const lastHiddenAtRef=useRef<number|null>(null);

 if(!tabIdRef.current){
  tabIdRef.current=typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
 }

 useEffect(()=>{
  let alive=true;
  let browserChannel:BroadcastChannel|null=null;
  let originalFetch:typeof window.fetch|undefined;
  let pollTimer:number|null=null;
  let pollBusy=false;
  let feedReady=false;
  let feedCursor=0;
  let warnedMissingMigration=false;
  const seen=seenRef.current;

  const remember=(id:string)=>{
   seen.add(id);
   if(seen.size>MAX_SEEN){
    const excess=seen.size-MAX_SEEN;
    let n=0;
    for(const key of seen){seen.delete(key);if(++n>=excess)break;}
   }
  };

  const softRefresh=()=>{
   if(refreshTimerRef.current!=null)window.clearTimeout(refreshTimerRef.current);
   refreshTimerRef.current=window.setTimeout(()=>{
    refreshTimerRef.current=null;
    router.refresh();
   },320);
  };

  const applyChange=(change:StRealtimeChange)=>{
   if(!alive||seen.has(change.id))return;
   remember(change.id);
   window.dispatchEvent(new CustomEvent<StRealtimeChange>(ST_REALTIME_WINDOW_EVENT,{detail:change}));

   if(change.domains.some(x=>x==="ALL"||x==="PLANNING"||x==="SCHEDULE"||x==="PRODUCTION"))
    window.dispatchEvent(new Event("st-schedule-changed"));
   if(change.domains.some(x=>x==="ALL"||x==="MASTER"||x==="CONFIG"||x==="IMPORT"))
    window.dispatchEvent(new Event("st-config-health-invalidated"));

   softRefresh();
  };

  try{
   if("BroadcastChannel" in window){
    browserChannel=new BroadcastChannel(ST_REALTIME_BROWSER_CHANNEL);
    browserChannel.onmessage=(ev:MessageEvent<unknown>)=>{if(isStRealtimeChange(ev.data))applyChange(ev.data);};
   }
  }catch{browserChannel=null;}

  const onStorage=(ev:StorageEvent)=>{
   if(ev.key!==STORAGE_SIGNAL_KEY||!ev.newValue)return;
   try{const parsed=JSON.parse(ev.newValue) as unknown;if(isStRealtimeChange(parsed))applyChange(parsed);}catch{/* ignore malformed signal */}
  };
  window.addEventListener("storage",onStorage);

  originalFetch=window.fetch.bind(window);
  const baseFetch=originalFetch;

  const persistChange=async(change:StRealtimeChange)=>{
   for(let attempt=0;attempt<MAX_PERSIST_RETRIES&&alive;attempt++){
    if(attempt>0)await new Promise(resolve=>window.setTimeout(resolve,attempt*450));
    try{
     const response=await baseFetch(ST_REALTIME_API_PATH,{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify(change),
      cache:"no-store",
      credentials:"same-origin",
      keepalive:true,
     });
     if(response.ok)return;
     if(response.status===401||response.status===403)return;
    }catch{/* retry a tiny invalidation event without blocking the business mutation */}
   }
  };

  const broadcast=(change:StRealtimeChange)=>{
   // Same-page and same-PC updates are immediate; PostgreSQL carries the same
   // event to other PCs/browsers without any Supabase dependency.
   applyChange(change);
   try{browserChannel?.postMessage(change);}catch{/* storage fallback below */}
   try{localStorage.setItem(STORAGE_SIGNAL_KEY,JSON.stringify(change));}catch{/* storage can be blocked */}
   void persistChange(change);
  };

  window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const mutation=realtimeMutationRequest(input,init);
   const response=await baseFetch(input,init);
   if(mutation&&response.ok)broadcast(makeRealtimeChange(tabIdRef.current,mutation));
   return response;
  }) as typeof window.fetch;

  const readFeed=async(latestOnly:boolean)=>{
   const suffix=latestOnly?"?latest=1":`?after=${feedCursor}`;
   const response=await baseFetch(`${ST_REALTIME_API_PATH}${suffix}`,{
    method:"GET",
    cache:"no-store",
    credentials:"same-origin",
    headers:{"cache-control":"no-cache"},
   });
   if(!response.ok)return null;
   const raw=await response.json().catch(()=>null) as unknown;
   return isStRealtimeFeedResponse(raw)?raw:null;
  };

  const pollFeed=async()=>{
   if(!alive||pollBusy||document.visibilityState==="hidden")return;
   pollBusy=true;
   try{
    if(!feedReady){
     const initial=await readFeed(true);
     if(!initial)return;
     if(!initial.migrationInstalled){
      if(!warnedMissingMigration){
       warnedMissingMigration=true;
       console.warn("[ST realtime] migration 086_global_realtime_change_event.sql is required for cross-device sync.");
      }
      return;
     }
     feedCursor=Math.max(0,Number(initial.latestId||0));
     feedReady=true;
     // Reconcile once after taking the cursor so a mutation committed between
     // the initial page render and feed subscription cannot be missed.
     softRefresh();
     return;
    }

    // Drain a short burst in at most 3 pages so rapid batch/import mutations
    // converge quickly without creating an unbounded request loop.
    for(let page=0;page<3&&alive;page++){
     const feed=await readFeed(false);
     if(!feed||!feed.migrationInstalled)return;
     const events=feed.events.filter(isStRealtimeChange);
     for(const event of events)applyChange(event);
     feedCursor=Math.max(feedCursor,Number(feed.latestId||0));
     if(events.length<100)break;
    }
   }catch{/* transient network/DB errors are retried on the next poll */}
   finally{pollBusy=false;}
  };

  void pollFeed();
  pollTimer=window.setInterval(()=>{void pollFeed();},ST_REALTIME_POLL_MS);

  const onVisibility=()=>{
   if(document.visibilityState==="hidden"){
    lastHiddenAtRef.current=Date.now();
    return;
   }
   const hiddenAt=lastHiddenAtRef.current;
   lastHiddenAtRef.current=null;
   // Resume from the persisted cursor first; then reconcile canonical RSC data
   // in case the tab slept long enough for browser timers/network to pause.
   void pollFeed();
   if(hiddenAt&&Date.now()-hiddenAt>1500)softRefresh();
  };
  document.addEventListener("visibilitychange",onVisibility);

  const onOnline=()=>{void pollFeed();};
  window.addEventListener("online",onOnline);

  return()=>{
   alive=false;
   if(pollTimer!=null)window.clearInterval(pollTimer);
   if(refreshTimerRef.current!=null){window.clearTimeout(refreshTimerRef.current);refreshTimerRef.current=null;}
   if(originalFetch)window.fetch=originalFetch;
   window.removeEventListener("storage",onStorage);
   window.removeEventListener("online",onOnline);
   document.removeEventListener("visibilitychange",onVisibility);
   try{browserChannel?.close();}catch{}
  };
 },[router]);

 return children;
}
