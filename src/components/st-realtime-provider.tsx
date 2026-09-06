"use client";

import {useEffect,useRef} from "react";
import {useRouter} from "next/navigation";
import {createClient as createSupabaseClient} from "@/lib/supabase/client";
import {
 ST_REALTIME_BROWSER_CHANNEL,
 ST_REALTIME_SUPABASE_CHANNEL,
 ST_REALTIME_SUPABASE_EVENT,
 ST_REALTIME_WINDOW_EVENT,
 isStRealtimeChange,
 makeRealtimeChange,
 realtimeMutationRequest,
 type StRealtimeChange,
} from "@/lib/realtime/st-realtime";

const STORAGE_SIGNAL_KEY="st-planning-live-signal-v1";
const MAX_SEEN=300;

/**
 * V507 global realtime shell.
 *
 * Canonical business data remains in Aiven PostgreSQL. Realtime only carries a
 * tiny invalidation signal; every receiving browser then re-reads canonical
 * data through the existing Next.js routes/server components.
 *
 * Transport order:
 *  1) Supabase Realtime Broadcast = cross-device/cross-browser push signal.
 *  2) BroadcastChannel/localStorage = same-device tabs fallback.
 *
 * `router.refresh()` here is a Next.js RSC soft refresh, not a browser reload:
 * no document reload/F5, and client state (filters, scroll, open dialogs) is
 * preserved while server data is merged in place.
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
  let realtimeChannel:ReturnType<ReturnType<typeof createSupabaseClient>["channel"]>|null=null;
  let originalFetch:typeof window.fetch|undefined;
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

   // Keep the existing fine-grained schedule/timeline loaders alive. They GET
   // only their own dataset while the RSC soft refresh covers every other view.
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

  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(supabaseUrl&&supabaseKey){
   try{
    const supabase=createSupabaseClient();
    realtimeChannel=supabase
     .channel(ST_REALTIME_SUPABASE_CHANNEL,{config:{broadcast:{self:false}}})
     .on("broadcast",{event:ST_REALTIME_SUPABASE_EVENT},payload=>{
      const candidate=(payload as {payload?:unknown})?.payload;
      if(isStRealtimeChange(candidate))applyChange(candidate);
     })
     .subscribe(status=>{
      // When a suspended/reconnecting tab becomes live again, immediately
      // reconcile canonical data in case one broadcast was missed offline.
      if(status==="SUBSCRIBED")softRefresh();
     });
   }catch{realtimeChannel=null;}
  }

  const broadcast=(change:StRealtimeChange)=>{
   // Apply locally first so the initiating page also self-reconciles.
   applyChange(change);
   try{browserChannel?.postMessage(change);}catch{/* fallback below */}
   try{localStorage.setItem(STORAGE_SIGNAL_KEY,JSON.stringify(change));}catch{/* storage can be blocked */}
   if(realtimeChannel){
    void realtimeChannel.send({type:"broadcast",event:ST_REALTIME_SUPABASE_EVENT,payload:change}).catch(()=>{});
   }
  };

  originalFetch=window.fetch.bind(window);
  const baseFetch=originalFetch;
  window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const mutation=realtimeMutationRequest(input,init);
   const response=await baseFetch(input,init);
   if(mutation&&response.ok){
    broadcast(makeRealtimeChange(tabIdRef.current,mutation));
   }
   return response;
  }) as typeof window.fetch;

  const onVisibility=()=>{
   if(document.visibilityState==="hidden"){
    lastHiddenAtRef.current=Date.now();
    return;
   }
   const hiddenAt=lastHiddenAtRef.current;
   lastHiddenAtRef.current=null;
   if(hiddenAt&&Date.now()-hiddenAt>1500)softRefresh();
  };
  document.addEventListener("visibilitychange",onVisibility);

  return()=>{
   alive=false;
   if(refreshTimerRef.current!=null){window.clearTimeout(refreshTimerRef.current);refreshTimerRef.current=null;}
   if(originalFetch)window.fetch=originalFetch;
   window.removeEventListener("storage",onStorage);
   document.removeEventListener("visibilitychange",onVisibility);
   try{browserChannel?.close();}catch{}
   if(realtimeChannel){try{void realtimeChannel.unsubscribe();}catch{}}
  };
 },[router]);

 return children;
}
