"use client";
import {FormEvent,useCallback,useEffect,useMemo,useRef,useState} from "react";
import dynamic from "next/dynamic";

const PlanningBoardClient=dynamic(
 ()=>import("@/components/planning-board-client").then(m=>m.PlanningBoardClient),
 {
  ssr:false,
  loading:()=> <div className="notice section">Đang tải giao diện Planning Board…</div>
 }
);

type Props={
 areas:any[];operations:any[];availableBatches:any[];mainOperations:any[];stOperations:any[];nextOperations:any[];sourceColumns:string[];operationMappings:any[];
 initial:{
  areaId:string;op:string;recipeKey:string;previousBatchNo:string;
  candidates:any[];recipeOptions:any[];timeRules:any[];initialView:any;serverViews:Record<string,unknown>;
  pagination:any;today:string
 };
};

// v298: Route Matrix chunks are fetched in PARALLEL (was sequential). Chunk
// size matches the server cap (60 ids/request).
const ROUTE_CHUNK_SIZE=60;
const ROUTE_MAX_PARALLEL=3;

export function PlanningSnapshotShell({areas,operations,availableBatches,mainOperations,stOperations,nextOperations,sourceColumns,operationMappings,initial}:Props){
 const [areaId,setAreaId]=useState(initial.areaId);
 const [op,setOp]=useState(initial.op);
 const [recipeKey,setRecipeKey]=useState(initial.recipeKey);
 const [previousBatchNo,setPreviousBatchNo]=useState(initial.previousBatchNo);
 const [loadedAreaId,setLoadedAreaId]=useState(initial.areaId);
 const [loadedOp,setLoadedOp]=useState(initial.op);
 const [loadedRecipeKey,setLoadedRecipeKey]=useState(initial.recipeKey);
 const [loadedPreviousBatchNo,setLoadedPreviousBatchNo]=useState(initial.previousBatchNo);
 const [recipeOptions,setRecipeOptions]=useState(initial.recipeOptions);
 const [timeRules,setTimeRules]=useState(initial.timeRules);
 const [availableBatchOptions,setAvailableBatchOptions]=useState(availableBatches);
 const [deferredNextOperations,setDeferredNextOperations]=useState(nextOperations);
 const [candidates,setCandidates]=useState(initial.candidates);
 const [initialView,setInitialView]=useState(initial.initialView);
 const [serverViews,setServerViews]=useState<Record<string,unknown>>(initial.serverViews||{});
 const [pagination,setPagination]=useState(initial.pagination);
 const [loading,setLoading]=useState(false);
 const [routeLoading,setRouteLoading]=useState(false);
 const [error,setError]=useState("");
 const [routeError,setRouteError]=useState("");
 const [snapshotMeta,setSnapshotMeta]=useState<any>(null);
 const [boardKey,setBoardKey]=useState(`${initial.areaId}|${initial.op}|${initial.recipeKey}|boot`);
 const loadSeq=useRef(0);
 const candidateAbort=useRef<AbortController|null>(null);
 const deferredAbort=useRef<AbortController|null>(null);
 const didAutoLoad=useRef(false);
 const routeRequestedIds=useRef<Set<number>>(new Set());
 const routeStatusCache=useRef<Map<number,any[]>>(new Map());
 const routeActiveRequests=useRef(0);

 const filteredOperations=useMemo(()=>{
  if(!areaId)return operations;
  return operations.filter(x=>String(x.area_id||"")===String(areaId));
 },[areaId,operations]);

 const ensureRouteStatuses=useCallback(async(candidateIds:number[])=>{
  const seq=loadSeq.current;
  const unique=[...new Set(candidateIds.map(Number).filter(Number.isFinite).map(Math.trunc))];
  if(!unique.length)return;

  const cachedIds=unique.filter(id=>routeStatusCache.current.has(id));
  if(cachedIds.length){
   const cachedSet=new Set(cachedIds);
   setCandidates(prev=>prev.map(row=>
    cachedSet.has(Number(row.id))
     ?{...row,route_status:routeStatusCache.current.get(Number(row.id))||[],route_status_loaded:true}
     :row
   ));
  }

  const ids=unique.filter(id=>!routeStatusCache.current.has(id)&&!routeRequestedIds.current.has(id));
  if(!ids.length)return;
  ids.forEach(id=>routeRequestedIds.current.add(id));
  routeActiveRequests.current+=1;
  setRouteLoading(true);
  setRouteError("");

  try{
   const chunks:number[][]=[];
   for(let i=0;i<ids.length;i+=ROUTE_CHUNK_SIZE)chunks.push(ids.slice(i,i+ROUTE_CHUNK_SIZE));
   // v298: small worker pool — up to ROUTE_MAX_PARALLEL chunk requests in
   // flight instead of awaiting each chunk one by one.
   let nextChunk=0;
   const worker=async()=>{
    while(nextChunk<chunks.length){
     if(seq!==loadSeq.current)return;
     const chunk=chunks[nextChunk++];
     const r=await fetch("/api/planning/route-status",{
      method:"POST",
      headers:{"content-type":"application/json"},
      cache:"no-store",
      body:JSON.stringify({candidateIds:chunk})
     });
     const d=await r.json().catch(()=>({}));
     if(!r.ok)throw new Error(d.error||"Không tải được Route Matrix.");
     if(seq!==loadSeq.current)return;

     const routeMap=new Map<number,any[]>((d.rows||[]).map((x:any)=>[Number(x.candidate_id),Array.isArray(x.route_status)?x.route_status:[]]));
     for(const id of chunk)routeStatusCache.current.set(id,routeMap.get(id)||[]);
     const chunkSet=new Set(chunk);
     setCandidates(prev=>prev.map(row=>
      chunkSet.has(Number(row.id))
       ?{...row,route_status:routeStatusCache.current.get(Number(row.id))||[],route_status_loaded:true}
       :row
     ));
    }
   };
   await Promise.all(Array.from({length:Math.min(ROUTE_MAX_PARALLEL,chunks.length)},()=>worker()));
  }catch(e){
   if(seq===loadSeq.current){
    setRouteError(e instanceof Error?e.message:String(e));
    const failedSet=new Set(ids);
    setCandidates(prev=>prev.map(row=>
     failedSet.has(Number(row.id))?{...row,route_status_loaded:true}:row
    ));
   }
  }finally{
   routeActiveRequests.current=Math.max(0,routeActiveRequests.current-1);
   if(seq===loadSeq.current)setRouteLoading(routeActiveRequests.current>0);
  }
 },[]);


 async function loadDeferred(seq:number){
  deferredAbort.current?.abort();
  const controller=new AbortController();
  deferredAbort.current=controller;
  try{
   const r=await fetch("/api/planning/deferred-data",{cache:"no-store",signal:controller.signal});
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(d.error||"Không tải được dữ liệu phụ Planning.");
   if(seq!==loadSeq.current||controller.signal.aborted)return;
   setAvailableBatchOptions(Array.isArray(d.availableBatches)?d.availableBatches:[]);
   setDeferredNextOperations(Array.isArray(d.nextOperations)?d.nextOperations:[]);
  }catch(e){
   if((e as Error)?.name==="AbortError")return;
   // Non-critical data must never make Candidate Board fail. Keep the last
   // successful snapshot (or an empty list) and allow the next reload to retry.
  }
 }

 // v298: no more pagination — every Load fetches ALL Candidates of the scope
 // in one request. The server skips the filtered COUNT query in this mode, so
 // loading everything is faster than the old count+page pair.
 async function load(next:{useLoadedScope?:boolean;forceSnapshot?:boolean}={}){
  const seq=++loadSeq.current;
  candidateAbort.current?.abort();
  const controller=new AbortController();
  candidateAbort.current=controller;
  routeRequestedIds.current=new Set();
  routeActiveRequests.current=0;
  setLoading(true);setRouteLoading(false);setError("");setRouteError("");
  try{
   // Reload keeps the scope that produced the currently displayed rows, even
   // if the user has started editing filter controls but has not submitted.
   const keepLoadedScope=Boolean(next.useLoadedScope);
   const requestAreaId=keepLoadedScope?loadedAreaId:areaId;
   const requestOp=keepLoadedScope?loadedOp:op;
   const requestRecipeKey=keepLoadedScope?loadedRecipeKey:recipeKey;
   const requestPreviousBatchNo=keepLoadedScope?loadedPreviousBatchNo:previousBatchNo;
   const qs=new URLSearchParams();
   if(requestAreaId)qs.set("area",requestAreaId);
   if(requestOp)qs.set("op",requestOp);
   if(requestRecipeKey)qs.set("recipe",requestRecipeKey);
   if(requestPreviousBatchNo)qs.set("prevBatch",requestPreviousBatchNo);
   qs.set("pageSize","all");
   if(next.forceSnapshot)qs.set("force","1");

   const r=await fetch(`/api/planning/snapshot/candidates?${qs.toString()}`,{cache:"no-store",signal:controller.signal});
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(d.error||"Không tải được Candidate Jobs.");
   if(seq!==loadSeq.current||controller.signal.aborted)return;
   setSnapshotMeta(d._snapshot||null);

   const rows=(d.candidates||[]).map((x:any)=>{
    const id=Number(x.id);
    const cached=Number.isFinite(id)?routeStatusCache.current.get(id):undefined;
    return {
     ...x,
     route_status:cached??(Array.isArray(x.route_status)?x.route_status:[]),
     route_status_loaded:cached!==undefined
    };
   });
   setCandidates(rows);
   setRecipeOptions(d.recipeOptions||[]);
   setTimeRules(d.timeRules||[]);
   setPagination(d.pagination);
   setInitialView(d.initialView||null);
   setServerViews((d.serverViews&&typeof d.serverViews==="object")?d.serverViews:{});
   setLoadedAreaId(requestAreaId);
   setLoadedOp(requestOp);
   setLoadedRecipeKey(requestRecipeKey);
   setLoadedPreviousBatchNo(requestPreviousBatchNo);
   setBoardKey(`${requestAreaId}|${requestOp}|${requestRecipeKey}|ready`);

   const historyQs=new URLSearchParams(qs);
   historyQs.delete("pageSize");
   historyQs.delete("force");
   window.history.replaceState(null,"",`${window.location.pathname}?${historyQs.toString()}`);

   // v315: Candidate is the critical path. Only after it is usable do we load
   // Recent Batches + NextOperation counts. Do not await this request.
   void loadDeferred(seq);

  }catch(e){
   if((e as Error)?.name==="AbortError")return;
   if(seq===loadSeq.current)setError(e instanceof Error?e.message:String(e));
  }finally{
   if(seq===loadSeq.current)setLoading(false);
  }
 }

 useEffect(()=>{
  if(didAutoLoad.current)return;
  didAutoLoad.current=true;
  void load();
 // Initial fetch must run exactly once for the SSR shell.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);

 useEffect(()=>()=>{
  candidateAbort.current?.abort();
  deferredAbort.current?.abort();
 },[]);

 function submit(e:FormEvent){e.preventDefault();void load();}
 function changeArea(v:string){
  setAreaId(v);
  if(v&&op&&!operations.some(x=>String(x.area_id||"")===v&&x.standard_operation===op)){setOp("");setRecipeKey("");}
 }

 return <>
  <form className="erp-form-panel planning-filter" onSubmit={submit}>
   <label>Area<select className="input" value={areaId} onChange={e=>changeArea(e.target.value)}><option value="">All Areas</option>{areas.map(a=><option key={a.id} value={a.id}>{a.area_name}</option>)}</select></label>
   <label>Standard Operation<select className="input" value={op} onChange={e=>{setOp(e.target.value);setRecipeKey("");}}><option value="">Select Operation...</option>{filteredOperations.map(x=><option key={`${x.area_id||"none"}-${x.standard_operation}`} value={x.standard_operation}>{x.standard_operation}{x.area_name?` · ${x.area_name}`:""}</option>)}</select>{areaId&&<small className="planning-sub">{filteredOperations.length} operations in selected Area</small>}</label>
   <label>Recipe<select className="input" value={recipeKey} onChange={e=>setRecipeKey(e.target.value)}><option value="">All / Not Required</option>{recipeOptions.map(r=><option key={r.recipe_key} value={r.recipe_key}>{r.recipe_no||"—"} · {r.recipe_name||"CHƯA KHAI BÁO"}</option>)}</select></label>
   <label>Previous Batch No<input className="input" value={previousBatchNo} onChange={e=>setPreviousBatchNo(e.target.value)} placeholder="PB-000120"/></label>
   <button className="btn primary" disabled={loading}>{loading?"Loading...":"Load Candidates"}</button>
  </form>
  <div className="notice section" style={{display:"flex",gap:12,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap"}}>
   <div>
    <b>SNAPSHOT TEST</b>{" · "}
    {!snapshotMeta?"đang chờ dữ liệu":snapshotMeta.hit?"CACHE HIT · đọc snapshot":"CACHE MISS · vừa xây snapshot"}
    {snapshotMeta?.candidateCount!=null?` · ${snapshotMeta.candidateCount} Candidates`:""}
    {snapshotMeta?.serveMs!=null?` · API ${snapshotMeta.serveMs} ms`:""}{snapshotMeta?.buildMs!=null?` · Build gốc ${snapshotMeta.buildMs} ms`:""}
    {snapshotMeta?.refreshedAt?` · ${new Date(snapshotMeta.refreshedAt).toLocaleString()}`:""}
   </div>
   <button className="btn small" type="button" disabled={loading} onClick={()=>void load({useLoadedScope:true,forceSnapshot:true})}>Xây lại Snapshot</button>
  </div>
  {error&&<div className="notice section">Lỗi: {error}</div>}
  {routeError&&<div className="notice section">Candidate đã tải; Route Matrix lỗi: {routeError}</div>}
  {loading&&<div className="notice section">Đang tải Candidate từ Snapshot TEST…</div>}
  {!loading&&routeLoading&&<div className="notice section">Candidate đã hiển thị. Route Matrix của các dòng đang xem đang tải dần…</div>}
  {!op&&!areaId&&<div className="notice section">Chọn Area để xem toàn bộ Candidate thuộc Area, hoặc chọn thêm Standard Operation để lọc chi tiết.</div>}
  <div className="section">
   <PlanningBoardClient
    key={boardKey}
    candidates={candidates} availableBatches={availableBatchOptions} standardOperation={loadedOp}
    areaMode={Boolean(loadedAreaId&&!loadedOp)} selectedAreaId={loadedAreaId} mainOperations={mainOperations}
    stOperations={stOperations} nextOperations={deferredNextOperations} sourceColumnNames={sourceColumns} operationMappings={operationMappings} recipeKey={loadedRecipeKey}
    timeRules={timeRules} today={initial.today} initialView={initialView} initialServerViews={serverViews} pagination={pagination}
    onVisibleCandidateIds={ensureRouteStatuses}
    onReloadCandidates={()=>void load({useLoadedScope:true})}
   />
  </div>
 </>;
}
