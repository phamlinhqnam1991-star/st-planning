"use client";

import {useEffect,useRef} from "react";
import {usePathname,useRouter} from "next/navigation";
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
 type StRealtimeDomain,
} from "@/lib/realtime/st-realtime";

const STORAGE_SIGNAL_KEY="st-planning-live-signal-v3";
const STORAGE_LEADER_KEY="st-planning-live-leader-v3";
const STORAGE_CURSOR_KEY="st-planning-live-cursor-v3";
const LEADER_TTL_MS=6500;
const LEADER_HEARTBEAT_MS=2000;
const MAX_SEEN=500;
const MAX_PERSIST_RETRIES=2;
const MAX_POLL_BACKOFF_MS=15000;
const MISSING_MIGRATION_BACKOFF_MS=30000;
const VISIBLE_REFRESH_DEBOUNCE_MS=500;
const VISIBLE_REFRESH_COOLDOWN_MS=4000;

type LeaderLease={tabId:string;expiresAt:number};

function parseLeaderLease(raw:string|null):LeaderLease|null{
 if(!raw)return null;
 try{
  const x=JSON.parse(raw) as Partial<LeaderLease>;
  if(typeof x.tabId!=="string"||typeof x.expiresAt!=="number")return null;
  return {tabId:x.tabId,expiresAt:x.expiresAt};
 }catch{return null;}
}

function pageDomains(pathname:string):StRealtimeDomain[]{
 if(pathname.startsWith("/schedule"))return ["SCHEDULE","PRODUCTION","PLANNING"];
 if(pathname.startsWith("/production-execution")||pathname.startsWith("/daily-production-adjustment")||pathname.startsWith("/production-change-alerts"))
  return ["PRODUCTION","SCHEDULE","PLANNING"];
 if(pathname.startsWith("/planning")||pathname.startsWith("/masking-unmasking-planning"))
  return ["PLANNING","SCHEDULE","PRODUCTION"];
 if(pathname.startsWith("/dashboard"))return ["DASHBOARD","PLANNING","SCHEDULE","PRODUCTION"];
 if(pathname.startsWith("/all-open-jobs")||pathname.startsWith("/job-tracker")||pathname.startsWith("/part-tracker"))
  return ["AUDIT","PLANNING","IMPORT","MASTER","CONFIG"];
 if(pathname.startsWith("/internal-chat"))return ["CHAT"];
 if(pathname.startsWith("/users-permissions"))return ["ADMIN"];
 if(pathname.startsWith("/masking-time-estimate-config"))return ["MASTER","CONFIG","PLANNING","SCHEDULE","PRODUCTION","AUDIT"];
 if(
  pathname.startsWith("/master")||pathname.startsWith("/area")||pathname.startsWith("/settings")||
  pathname.startsWith("/st-")||pathname.startsWith("/recipe-")||pathname.startsWith("/process-")||
  pathname.startsWith("/planner-work-assignment")||pathname.startsWith("/operation-code-order")||
  pathname.startsWith("/batch-key-recipe-rules")||pathname.startsWith("/auto-planning-rules")||
  pathname.startsWith("/open-job-column-values")||pathname.startsWith("/main-support-operations")
 )return ["MASTER","CONFIG","PLANNING","SCHEDULE","PRODUCTION","AUDIT"];
 // V517: unknown/static routes do not opt into automatic RSC reconciliation.
 // They can still receive the window realtime event if a client island needs it.
 return [];
}

function changeAffectsPage(change:StRealtimeChange,pathname:string){
 // V510: Internal Chat reconciles its own client data. Do not RSC-refresh the whole Chat page for CHAT events.
 if(pathname.startsWith("/internal-chat"))return false;
 // V514: Masking Estimate Config is a client data island. It listens to the
 // realtime window event and reloads only /api/config/masking-time-estimate.
 // Never RSC-refresh this page for config mutations.
 if(pathname.startsWith("/masking-time-estimate-config"))return false;
 const wanted=pageDomains(pathname);
 if(wanted.length===0)return false;
 if(change.domains.includes("ALL"))return true;
 return change.domains.some(domain=>wanted.includes(domain));
}

/**
 * V517 Global Realtime No-Supabase · visible-tab coalesced reconciliation.
 *
 * - Canonical data + tiny invalidation feed stay in PostgreSQL.
 * - Only ONE visible tab per browser profile polls PostgreSQL. Other tabs get
 *   the same events through BroadcastChannel/localStorage.
 * - Cross-device feed errors NEVER block page rendering and NEVER trigger a
 *   browser reload. The provider backs off and retries silently.
 * - Initial subscription does not call router.refresh(); the initial RSC page
 *   render is already canonical. Only the visible relevant tab may soft-refresh.
 * - Hidden tabs coalesce relevant changes into one dirty flag and reconcile once
 *   when brought back to the foreground; unknown/static routes never auto-refresh.
 */
export function StRealtimeProvider({children}:{children:React.ReactNode}){
 const router=useRouter();
 const pathname=usePathname()||"/";
 const pathnameRef=useRef(pathname);
 const tabIdRef=useRef("");
 const seenRef=useRef(new Set<string>());
 const refreshTimerRef=useRef<number|null>(null);
 const lastRefreshAtRef=useRef(0);
 const dirtyWhileHiddenRef=useRef(false);
 const lastHiddenAtRef=useRef<number|null>(null);
 pathnameRef.current=pathname;

 if(!tabIdRef.current){
  tabIdRef.current=typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
 }

 useEffect(()=>{
  let alive=true;
  let browserChannel:BroadcastChannel|null=null;
  let originalFetch:typeof window.fetch|undefined;
  let leaderHeartbeatTimer:number|null=null;
  let pollTimer:number|null=null;
  let pollBusy=false;
  let isLeader=false;
  let feedReady=false;
  let feedCursor=0;
  let pollFailureCount=0;
  let warnedMissingMigration=false;
  const seen=seenRef.current;
  const tabId=tabIdRef.current;

  try{
   const storedCursor=Number(localStorage.getItem(STORAGE_CURSOR_KEY));
   if(Number.isSafeInteger(storedCursor)&&storedCursor>=0&&localStorage.getItem(STORAGE_CURSOR_KEY)!==null){
    feedCursor=storedCursor;
    feedReady=true;
   }
  }catch{/* private mode / blocked storage */}

  const remember=(id:string)=>{
   seen.add(id);
   if(seen.size>MAX_SEEN){
    const excess=seen.size-MAX_SEEN;
    let n=0;
    for(const key of seen){seen.delete(key);if(++n>=excess)break;}
   }
  };

  const softRefresh=()=>{
   // V517: hidden tabs must never RSC-refresh in the background. With several
   // Planning/Schedule/Production tabs open, refreshing every hidden tab for
   // the same event creates a thundering herd of heavy PostgreSQL reads. Mark
   // it dirty and reconcile once when the user returns to that tab instead.
   if(document.visibilityState==="hidden"){
    dirtyWhileHiddenRef.current=true;
    return;
   }
   if(refreshTimerRef.current!=null)window.clearTimeout(refreshTimerRef.current);
   const sinceLast=Math.max(0,Date.now()-lastRefreshAtRef.current);
   const cooldownLeft=Math.max(0,VISIBLE_REFRESH_COOLDOWN_MS-sinceLast);
   const delay=Math.max(VISIBLE_REFRESH_DEBOUNCE_MS,cooldownLeft);
   refreshTimerRef.current=window.setTimeout(()=>{
    refreshTimerRef.current=null;
    if(document.visibilityState==="hidden"){
     dirtyWhileHiddenRef.current=true;
     return;
    }
    dirtyWhileHiddenRef.current=false;
    lastRefreshAtRef.current=Date.now();
    try{router.refresh();}catch{/* realtime must never crash the page */}
   },delay);
  };

  const applyChange=(change:StRealtimeChange)=>{
   if(!alive||seen.has(change.id))return;
   remember(change.id);
   window.dispatchEvent(new CustomEvent<StRealtimeChange>(ST_REALTIME_WINDOW_EVENT,{detail:change}));

   if(change.domains.some(x=>x==="ALL"||x==="PLANNING"||x==="SCHEDULE"||x==="PRODUCTION"))
    window.dispatchEvent(new Event("st-schedule-changed"));
   // V514: Masking advisory config is not part of the expensive global Config Health query.
   // Its own manager reloads via the realtime event, so do not fan this mutation into
   // /api/config/health and create an unnecessary competing DB request.
   if(!change.path.startsWith("/api/config/masking-time-estimate")&&change.domains.some(x=>x==="ALL"||x==="MASTER"||x==="CONFIG"||x==="IMPORT"))
    window.dispatchEvent(new Event("st-config-health-invalidated"));

   if(changeAffectsPage(change,pathnameRef.current))softRefresh();
  };

  const fanOut=(change:StRealtimeChange)=>{
   applyChange(change);
   try{browserChannel?.postMessage(change);}catch{/* localStorage fallback below */}
   try{localStorage.setItem(STORAGE_SIGNAL_KEY,JSON.stringify(change));}catch{/* storage can be blocked */}
  };

  try{
   if("BroadcastChannel" in window){
    browserChannel=new BroadcastChannel(ST_REALTIME_BROWSER_CHANNEL);
    browserChannel.onmessage=(ev:MessageEvent<unknown>)=>{if(isStRealtimeChange(ev.data))applyChange(ev.data);};
   }
  }catch{browserChannel=null;}

  const onStorage=(ev:StorageEvent)=>{
   if(ev.key===STORAGE_SIGNAL_KEY&&ev.newValue){
    try{const parsed=JSON.parse(ev.newValue) as unknown;if(isStRealtimeChange(parsed))applyChange(parsed);}catch{/* ignore malformed signal */}
   }
   if(ev.key===STORAGE_LEADER_KEY)void updateLeadership();
  };
  window.addEventListener("storage",onStorage);

  originalFetch=window.fetch.bind(window);
  const baseFetch=originalFetch;

  const persistChange=async(change:StRealtimeChange)=>{
   for(let attempt=0;attempt<MAX_PERSIST_RETRIES&&alive;attempt++){
    if(attempt>0)await new Promise(resolve=>window.setTimeout(resolve,500));
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
    }catch{/* change feed is best-effort; business mutation already succeeded */}
   }
  };

  const broadcastMutation=(change:StRealtimeChange)=>{
   fanOut(change);
   void persistChange(change);
  };

  window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const mutation=realtimeMutationRequest(input,init);
   const response=await baseFetch(input,init);
   if(mutation&&response.ok)broadcastMutation(makeRealtimeChange(tabId,mutation));
   return response;
  }) as typeof window.fetch;

  const saveCursor=(cursor:number)=>{
   feedCursor=Math.max(feedCursor,cursor);
   try{localStorage.setItem(STORAGE_CURSOR_KEY,String(feedCursor));}catch{}
  };

  const readFeed=async(latestOnly:boolean)=>{
   const suffix=latestOnly?"?latest=1":`?after=${feedCursor}`;
   const response=await baseFetch(`${ST_REALTIME_API_PATH}${suffix}`,{
    method:"GET",
    cache:"no-store",
    credentials:"same-origin",
    headers:{"cache-control":"no-cache"},
   });
   if(response.status===401||response.status===403)return {kind:"unauthorized" as const};
   if(!response.ok)return {kind:"unavailable" as const};
   const raw=await response.json().catch(()=>null) as unknown;
   if(!isStRealtimeFeedResponse(raw))return {kind:"unavailable" as const};
   return {kind:"ok" as const,feed:raw};
  };

  const nextPollDelay=()=>{
   if(pollFailureCount<=0)return ST_REALTIME_POLL_MS;
   return Math.min(MAX_POLL_BACKOFF_MS,ST_REALTIME_POLL_MS*Math.pow(2,Math.min(4,pollFailureCount)));
  };

  const scheduleNextPoll=(delay=nextPollDelay())=>{
   if(!alive||!isLeader)return;
   if(pollTimer!=null)window.clearTimeout(pollTimer);
   pollTimer=window.setTimeout(()=>{pollTimer=null;void pollFeed();},delay);
  };

  const pollFeed=async()=>{
   if(!alive||!isLeader||pollBusy||document.visibilityState==="hidden")return;
   pollBusy=true;
   try{
    if(!feedReady){
     const initial=await readFeed(true);
     if(initial.kind==="unauthorized"){
      pollFailureCount=0;
      return;
     }
     if(initial.kind!=="ok"){
      pollFailureCount++;
      return;
     }
     if(!initial.feed.migrationInstalled){
      if(!warnedMissingMigration){
       warnedMissingMigration=true;
       console.warn("[ST realtime] migration 086_global_realtime_change_event.sql is missing. App remains usable; cross-device realtime is temporarily disabled.");
      }
      pollFailureCount=0;
      scheduleNextPoll(MISSING_MIGRATION_BACKOFF_MS);
      return;
     }
     saveCursor(Math.max(0,Number(initial.feed.latestId||0)));
     feedReady=true;
     pollFailureCount=0;
     // V509: no router.refresh here. The page that just rendered is already
     // canonical, and a second immediate RSC request only adds DB/server load.
     return;
    }

    for(let page=0;page<3&&alive&&isLeader;page++){
     const result=await readFeed(false);
     if(result.kind==="unauthorized"){
      pollFailureCount=0;
      return;
     }
     if(result.kind!=="ok"){
      pollFailureCount++;
      return;
     }
     if(!result.feed.migrationInstalled){
      feedReady=false;
      pollFailureCount=0;
      scheduleNextPoll(MISSING_MIGRATION_BACKOFF_MS);
      return;
     }
     const events=result.feed.events.filter(isStRealtimeChange);
     for(const event of events)fanOut(event);
     saveCursor(Number(result.feed.latestId||feedCursor));
     pollFailureCount=0;
     if(events.length<100)break;
    }
   }catch{
    pollFailureCount++;
   }finally{
    pollBusy=false;
    if(alive&&isLeader&&pollTimer==null)scheduleNextPoll();
   }
  };

  const acquireLease=()=>{
   if(document.visibilityState==="hidden")return false;
   const now=Date.now();
   try{
    const current=parseLeaderLease(localStorage.getItem(STORAGE_LEADER_KEY));
    if(current&&current.tabId!==tabId&&current.expiresAt>now)return false;
    const mine:LeaderLease={tabId,expiresAt:now+LEADER_TTL_MS};
    localStorage.setItem(STORAGE_LEADER_KEY,JSON.stringify(mine));
    const verify=parseLeaderLease(localStorage.getItem(STORAGE_LEADER_KEY));
    return verify?.tabId===tabId;
   }catch{
    // If storage is unavailable, allow this tab to poll. The rest of the
    // fail-safe/backoff still prevents realtime from breaking the application.
    return true;
   }
  };

  const releaseLease=()=>{
   try{
    const current=parseLeaderLease(localStorage.getItem(STORAGE_LEADER_KEY));
    if(current?.tabId===tabId)localStorage.removeItem(STORAGE_LEADER_KEY);
   }catch{}
  };

  async function updateLeadership(){
   if(!alive)return;
   const nextLeader=acquireLease();
   if(nextLeader===isLeader){
    if(isLeader){
     try{localStorage.setItem(STORAGE_LEADER_KEY,JSON.stringify({tabId,expiresAt:Date.now()+LEADER_TTL_MS} satisfies LeaderLease));}catch{}
    }
    return;
   }
   isLeader=nextLeader;
   if(isLeader){
    pollFailureCount=0;
    if(pollTimer!=null){window.clearTimeout(pollTimer);pollTimer=null;}
    void pollFeed();
   }else if(pollTimer!=null){
    window.clearTimeout(pollTimer);
    pollTimer=null;
   }
  }

  void updateLeadership();
  leaderHeartbeatTimer=window.setInterval(()=>{void updateLeadership();},LEADER_HEARTBEAT_MS);

  const onVisibility=()=>{
   if(document.visibilityState==="hidden"){
    lastHiddenAtRef.current=Date.now();
    if(isLeader){isLeader=false;releaseLease();}
    if(pollTimer!=null){window.clearTimeout(pollTimer);pollTimer=null;}
    return;
   }
   lastHiddenAtRef.current=null;
   void updateLeadership();
   // V517: do not refresh merely because a tab was hidden for N seconds.
   // Reconcile exactly once only when a relevant realtime change arrived while
   // hidden. If cross-device events happened during sleep, the leader feed will
   // read them now and apply the same visible-tab coalescing path.
   if(dirtyWhileHiddenRef.current)softRefresh();
  };
  document.addEventListener("visibilitychange",onVisibility);

  const onOnline=()=>{pollFailureCount=0;void updateLeadership();};
  window.addEventListener("online",onOnline);

  return()=>{
   alive=false;
   if(leaderHeartbeatTimer!=null)window.clearInterval(leaderHeartbeatTimer);
   if(pollTimer!=null)window.clearTimeout(pollTimer);
   if(refreshTimerRef.current!=null){window.clearTimeout(refreshTimerRef.current);refreshTimerRef.current=null;}
   releaseLease();
   if(originalFetch)window.fetch=originalFetch;
   window.removeEventListener("storage",onStorage);
   window.removeEventListener("online",onOnline);
   document.removeEventListener("visibilitychange",onVisibility);
   try{browserChannel?.close();}catch{}
  };
 },[router]);

 return children;
}
