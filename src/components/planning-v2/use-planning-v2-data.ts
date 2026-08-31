"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import type {BatchOption,Candidate,PlanningScope,RecipeOption,SnapshotMeta,TimeRule} from "./types";

const CHUNK=60;
const PARALLEL=3;
// v328: progressive load — each request fetches this many rows via the legacy
// paged mode of the candidates API (same SQL, same business logic). Small
// pages finish within the timeout even on high-latency links and rows render
// as they arrive.
const CHUNK_PAGE=200;

const mapRows=(arr:any[],routeCache:Map<number,any[]>)=>arr.map((x:any)=>({
 ...x,
 route_status:routeCache.get(Number(x.id))||[],
 route_status_loaded:routeCache.has(Number(x.id))
}));

// v325: quick server+DB health probe used right after a Candidate timeout —
// distinguishes "Candidate load itself is slow" from "connection is dead".
async function probeServer():Promise<string>{
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),8000);
 try{
  const started=Date.now();
  const r=await fetch("/api/config/health?fresh=1",{cache:"no-store",signal:controller.signal});
  const d=await r.json().catch(()=>({}));
  const ms=Date.now()-started;
  return `Server+DB OK trong ${ms}ms (db=${(d as any).db?.label||"?"}, _timingMs=${(d as any)._timingMs??"?"})`;
 }catch{
  return "Server+DB check FAILED trong 8s — server/Next không phản hồi, không phải lỗi payload";
 }finally{clearTimeout(timer);}
}

export function usePlanningV2Data(initialScope:PlanningScope){
 const [scope,setScope]=useState(initialScope);
 const [loadedScope,setLoadedScope]=useState(initialScope);
 const [candidates,setCandidates]=useState<Candidate[]>([]);
 const [recipeOptions,setRecipeOptions]=useState<RecipeOption[]>([]);
 const [timeRules,setTimeRules]=useState<TimeRule[]>([]);
 const [availableBatches,setAvailableBatches]=useState<BatchOption[]>([]);
 const [snapshot,setSnapshot]=useState<SnapshotMeta|null>(null);
 const [loading,setLoading]=useState(false);
 const [loadingMore,setLoadingMore]=useState(false);
 const [routeLoading,setRouteLoading]=useState(false);
 const [error,setError]=useState("");
 const [errorDetail,setErrorDetail]=useState("");
 const [debugInfo,setDebugInfo]=useState<Record<string,unknown>|null>(null);
 const [routeError,setRouteError]=useState("");
 const seq=useRef(0);
 const abort=useRef<AbortController|null>(null);
 const routeCache=useRef(new Map<number,any[]>());
 const routeRequested=useRef(new Set<number>());

 const loadDeferred=useCallback(async(currentSeq:number)=>{
  try{
   const r=await fetch("/api/planning/deferred-data",{cache:"no-store"});
   const d=await r.json().catch(()=>({}));
   if(!r.ok||currentSeq!==seq.current)return;
   setAvailableBatches(Array.isArray(d.availableBatches)?d.availableBatches:[]);
  }catch{}
 },[]);

 const load=useCallback(async(next?:{force?:boolean;keepLoadedScope?:boolean})=>{
  const current=++seq.current;
  abort.current?.abort();
  const controller=new AbortController();abort.current=controller;
  let timedOut=false;
  // v323: hard client timeout — a wedged connection must never leave the UI
  // spinning ("Đang tải Candidate metadata… (65s)") forever.
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},60_000);
  setLoading(true);setLoadingMore(false);setError("");setErrorDetail("");setRouteError("");
  if(next?.force){routeCache.current.clear();routeRequested.current.clear();}
  const requestScope=next?.keepLoadedScope?loadedScope:scope;
  let firstPageOk=false;
  try{
   const qs=new URLSearchParams();
   if(requestScope.areaId)qs.set("area",requestScope.areaId);
   if(requestScope.op)qs.set("op",requestScope.op);
   if(requestScope.recipeKey)qs.set("recipe",requestScope.recipeKey);
   if(requestScope.previousBatchNo)qs.set("prevBatch",requestScope.previousBatchNo);
   // v323: V2 does not render All Open Source columns — skip source_data.
   qs.set("light","1");
   if(next?.force)qs.set("forceSnapshot","1");
   const fetchPage=async(page:number,knownTotal:number|null)=>{
    const u=new URLSearchParams(qs);
    u.set("pageSize",String(CHUNK_PAGE));
    u.set("page",String(page));
    if(knownTotal!=null)u.set("knownTotal",String(knownTotal));
    const url=`/api/planning/candidates?${u.toString()}`;
    console.info(`[planning-v2] load candidates page ${page} ${url}`);
    const r=await fetch(url,{cache:"no-store",credentials:"same-origin",signal:controller.signal});
    const raw=await r.text();
    let d:any={};
    try{d=raw?JSON.parse(raw):{};}catch{}
    if(!r.ok){
     const detail=String(d?.error||"").trim();
     const tech=[
      `HTTP ${r.status} ${r.statusText||""}`.trim(),
      `URL: ${url}`,
      detail?`Server: ${detail}`:"",
      `Body: ${raw.slice(0,1200)}`
     ].filter(Boolean).join("\n");
     console.error(`[planning-v2] candidates FAILED ${r.status} ${r.statusText}\n${tech}`);
     setErrorDetail(tech);
     setDebugInfo(typeof d?._debug==="object"?d._debug:null);
     throw new Error(detail||`Không tải được Candidate Jobs (HTTP ${r.status}).`);
    }
    return d;
   };

   // Page 1 — renders immediately so the board is usable while more arrive.
   const first=await fetchPage(1,null);
   if(current!==seq.current||controller.signal.aborted)return;
   firstPageOk=true;
   const firstRows=mapRows(Array.isArray(first.candidates)?first.candidates:[],routeCache.current);
   setCandidates(firstRows);
   setRecipeOptions(first.recipeOptions||[]);setTimeRules(first.timeRules||[]);
   setSnapshot(first._snapshot&&typeof first._snapshot==="object"?first._snapshot:null);
   setDebugInfo(typeof first._debug==="object"?first._debug:null);
   setLoadedScope(requestScope);
   const total=Number(first.pagination?.totalCandidates)||0;
   const totalPages=Math.max(1,Math.ceil(total/CHUNK_PAGE));
   let rows=firstRows;
   if(totalPages>1){
    setLoadingMore(true);
    try{
     for(let page=2;page<=totalPages;page++){
      const d=await fetchPage(page,total);
      if(current!==seq.current||controller.signal.aborted)return;
      const pageRows=mapRows(Array.isArray(d.candidates)?d.candidates:[],routeCache.current);
      rows=rows.concat(pageRows);
      setCandidates(rows);
      if(pageRows.length<CHUNK_PAGE)break;
     }
    }finally{
     if(current===seq.current)setLoadingMore(false);
    }
   }
   if(current!==seq.current||controller.signal.aborted)return;
   console.info(`[planning-v2] loaded ${rows.length} candidates (${totalPages} pages)`);
   const hqs=new URLSearchParams();
   if(requestScope.areaId)hqs.set("area",requestScope.areaId);
   if(requestScope.op)hqs.set("op",requestScope.op);
   if(requestScope.recipeKey)hqs.set("recipe",requestScope.recipeKey);
   if(requestScope.previousBatchNo)hqs.set("prevBatch",requestScope.previousBatchNo);
   window.history.replaceState(null,"",`${window.location.pathname}${hqs.size?`?${hqs}`:""}`);
   void loadDeferred(current);
  }catch(e){
   if(current===seq.current){
    if(timedOut){
     console.error(`[planning-v2] candidates TIMEOUT after 60s`);
     // v325: self-diagnostic — probe the server+DB right after a timeout to
     // tell apart a slow Candidate load from a dead connection.
     const probe=await probeServer();
     setErrorDetail(`Client timeout: request bị hủy sau 60s. ${probe}. Gửi dev dòng log [candidates]/[db] nếu có.`);
     setError("Mất quá 60s khi tải Candidate (timeout) — kiểm tra kết nối DB/mạng, bấm Thử lại.");
    }else if((e as Error)?.name!=="AbortError"){
     // Page 1 failed = real error; later pages failed = keep rows, softer notice.
     const msg=e instanceof Error?e.message:String(e);
     if(firstPageOk){
      setError(`Tải tiếp Candidate bị lỗi: ${msg} — đã hiển thị ${candidates.length} dòng, bấm Thử lại.`);
     }else{
      setError(msg);
     }
    }
   }
  }finally{clearTimeout(timer);if(current===seq.current)setLoading(false);}
 },[scope,loadedScope,loadDeferred,candidates.length]);

 const ensureRouteStatuses=useCallback(async(ids:number[])=>{
  const current=seq.current;
  const unique=[...new Set(ids.map(Number).filter(Number.isFinite).map(Math.trunc))];
  const missing=unique.filter(id=>!routeCache.current.has(id)&&!routeRequested.current.has(id));
  if(!missing.length)return;
  missing.forEach(id=>routeRequested.current.add(id));
  setRouteLoading(true);setRouteError("");
  try{
   const chunks:number[][]=[];for(let i=0;i<missing.length;i+=CHUNK)chunks.push(missing.slice(i,i+CHUNK));
   let cursor=0;
   const worker=async()=>{
    while(cursor<chunks.length){
     const chunk=chunks[cursor++];
     const r=await fetch("/api/planning/route-status",{method:"POST",headers:{"content-type":"application/json"},cache:"no-store",body:JSON.stringify({candidateIds:chunk})});
     const d=await r.json().catch(()=>({}));
     if(!r.ok)throw new Error(d.error||"Không tải được Route Matrix.");
     if(current!==seq.current)return;
     const map=new Map<number,any[]>((d.rows||[]).map((x:any)=>[Number(x.candidate_id),Array.isArray(x.route_status)?x.route_status:[]]));
     for(const id of chunk)routeCache.current.set(id,map.get(id)||[]);
     const set=new Set(chunk);
     setCandidates(prev=>prev.map(row=>set.has(Number(row.id))?{...row,route_status:routeCache.current.get(Number(row.id))||[],route_status_loaded:true}:row));
    }
   };
   await Promise.all(Array.from({length:Math.min(PARALLEL,chunks.length)},()=>worker()));
  }catch(e){if(current===seq.current)setRouteError(e instanceof Error?e.message:String(e));}
  finally{if(current===seq.current)setRouteLoading(false);}
 },[]);

 useEffect(()=>{void load();return()=>abort.current?.abort();},[]); // eslint-disable-line react-hooks/exhaustive-deps

 const candidateById=useMemo(()=>new Map(candidates.map(x=>[Number(x.id),x])),[candidates]);
 return {scope,setScope,loadedScope,candidates,setCandidates,candidateById,recipeOptions,timeRules,availableBatches,snapshot,loading,loadingMore,routeLoading,error,errorDetail,debugInfo,routeError,load,ensureRouteStatuses};
}
