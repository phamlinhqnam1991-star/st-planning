"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import type {BatchOption,Candidate,PlanningScope,RecipeOption,SnapshotMeta,TimeRule} from "./types";

const CHUNK=60;
const PARALLEL=3;

export function usePlanningV2Data(initialScope:PlanningScope){
 const [scope,setScope]=useState(initialScope);
 const [loadedScope,setLoadedScope]=useState(initialScope);
 const [candidates,setCandidates]=useState<Candidate[]>([]);
 const [recipeOptions,setRecipeOptions]=useState<RecipeOption[]>([]);
 const [timeRules,setTimeRules]=useState<TimeRule[]>([]);
 const [availableBatches,setAvailableBatches]=useState<BatchOption[]>([]);
 const [snapshot,setSnapshot]=useState<SnapshotMeta|null>(null);
 const [loading,setLoading]=useState(false);
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
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},25_000);
  setLoading(true);setError("");setErrorDetail("");setRouteError("");
  if(next?.force){routeCache.current.clear();routeRequested.current.clear();}
  const requestScope=next?.keepLoadedScope?loadedScope:scope;
  try{
   const qs=new URLSearchParams();
   if(requestScope.areaId)qs.set("area",requestScope.areaId);
   if(requestScope.op)qs.set("op",requestScope.op);
   if(requestScope.recipeKey)qs.set("recipe",requestScope.recipeKey);
   if(requestScope.previousBatchNo)qs.set("prevBatch",requestScope.previousBatchNo);
   qs.set("pageSize","all");
   // v323: V2 does not render All Open Source columns — skip source_data
   // (~2.8MB of the payload).
   qs.set("light","1");
   if(next?.force)qs.set("forceSnapshot","1");
   const url=`/api/planning/candidates?${qs.toString()}`;
   console.info(`[planning-v2] load candidates ${url}`);
   const r=await fetch(url,{cache:"no-store",credentials:"same-origin",signal:controller.signal});
   const raw=await r.text();
   let d:any={};
   try{d=raw?JSON.parse(raw):{};}catch{}
   if(current!==seq.current||controller.signal.aborted)return;
   if(!r.ok){
    // v321: keep the FULL technical detail so the failure can be diagnosed
    // from the screen / browser console without extra tooling.
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
   if(typeof d?._debug==="object"&&d._debug&&current===seq.current)setDebugInfo(d._debug);
   const rows:Candidate[]=(Array.isArray(d.candidates)?d.candidates:[]).map((x:any)=>({
    ...x,route_status:routeCache.current.get(Number(x.id))||[],route_status_loaded:routeCache.current.has(Number(x.id))
   }));
   setCandidates(rows);setRecipeOptions(d.recipeOptions||[]);setTimeRules(d.timeRules||[]);
   setSnapshot(d._snapshot&&typeof d._snapshot==="object"?d._snapshot:null);
   setLoadedScope(requestScope);
   if(current===seq.current)console.info(`[planning-v2] loaded ${rows.length} candidates ${d._debug?`(load ${d._debug.totalMs}ms, stView ${d._debug.stViewCount})`:""}`);
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
     console.error(`[planning-v2] candidates TIMEOUT after 25s`);
     setErrorDetail("Client timeout: request bị hủy sau 25s. Kiểm tra kết nối mạng/DB, xem log server ([candidates] ...).");
     setError("Mất quá 25s khi tải Candidate (timeout) — kiểm tra kết nối DB/mạng, bấm Thử lại.");
    }else if((e as Error)?.name!=="AbortError"){
     setError(e instanceof Error?e.message:String(e));
    }
   }
  }finally{clearTimeout(timer);if(current===seq.current)setLoading(false);}
 },[scope,loadedScope,loadDeferred]);

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
 return {scope,setScope,loadedScope,candidates,setCandidates,candidateById,recipeOptions,timeRules,availableBatches,snapshot,loading,routeLoading,error,errorDetail,debugInfo,routeError,load,ensureRouteStatuses};
}
