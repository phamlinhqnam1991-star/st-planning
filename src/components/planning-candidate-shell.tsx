"use client";
import {FormEvent,useCallback,useEffect,useMemo,useRef,useState} from "react";
import {PlanningBoardClient} from "@/components/planning-board-client";

function useLoadElapsed(active:boolean){
 const [seconds,setSeconds]=useState(0);
 useEffect(()=>{
  if(!active){setSeconds(0);return;}
  const startedAt=Date.now();
  const t=setInterval(()=>setSeconds(Math.max(1,Math.round((Date.now()-startedAt)/1000))),500);
  return()=>clearInterval(t);
 },[active]);
 return seconds;
}

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

export function PlanningCandidateShell({areas,operations,availableBatches,mainOperations,stOperations,nextOperations,sourceColumns,operationMappings,initial}:Props){
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
 const [candidates,setCandidates]=useState(initial.candidates);
 const [initialView,setInitialView]=useState(initial.initialView);
 const [serverViews,setServerViews]=useState<Record<string,unknown>>(initial.serverViews||{});
 const [pagination,setPagination]=useState(initial.pagination);
 const [loading,setLoading]=useState(false);
 const loadElapsed=useLoadElapsed(loading);
 const [routeLoading,setRouteLoading]=useState(false);
 const [error,setError]=useState("");
 const [errorDetail,setErrorDetail]=useState("");
 const [sourceDataError,setSourceDataError]=useState("");
 const [routeError,setRouteError]=useState("");
 const [boardKey,setBoardKey]=useState(`${initial.areaId}|${initial.op}|${initial.recipeKey}`);
 const loadSeq=useRef(0);
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

 // v298: no more pagination — every Load fetches ALL Candidates of the scope
 // in one request. The server skips the filtered COUNT query in this mode, so
 // loading everything is faster than the old count+page pair.
 // v324: background fetch of All Open Source columns for the loaded jobs only.
 // The main load is light (source_data dropped); this populates the source
 // columns afterwards without blocking the board. Failure degrades gracefully.
 async function loadSourceData(rows:any[],seq:number){
  const jobNums=[...new Set(rows.map(r=>String(r.job_num||"").trim()).filter(Boolean))];
  if(!jobNums.length||!sourceColumns.length)return;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),45_000);
  try{
   const r=await fetch("/api/planning/candidates/source",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({jobNums}),
    signal:controller.signal
   });
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(d?.error||`HTTP ${r.status}`);
   if(seq!==loadSeq.current)return;
   const map=new Map<string,unknown>((d.rows||[]).map((x:any)=>[String(x.job_num),x.source_data||null]));
   setCandidates(prev=>prev.map(row=>{
    const sd=map.get(String(row.job_num));
    return sd!==undefined?{...row,source_data:sd}:row;
   }));
  }catch(e){
   if(seq===loadSeq.current){
    console.error("[planning] source_data lazy fetch failed",e);
    setSourceDataError("Không tải được cột All Open Source (mạng chậm) — board vẫn hoạt động bình thường.");
   }
  }finally{clearTimeout(timer);}
 }

 async function load(next:{useLoadedScope?:boolean}={}){
  const seq=++loadSeq.current;
  routeRequestedIds.current=new Set();
  routeActiveRequests.current=0;
  setLoading(true);setRouteLoading(false);setError("");setErrorDetail("");setSourceDataError("");setRouteError("");
  // v323: hard client timeout — never let the board spin on a wedged request.
  let timedOut=false;
  const controller=new AbortController();
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},25_000);
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
   // v324: main load runs light (no source_data — ~2.8MB payload). All Open
   // Source columns are fetched lazily in the background afterwards.
   qs.set("light","1");
   const url=`/api/planning/candidates?${qs.toString()}`;

   const r=await fetch(url,{cache:"no-store",signal:controller.signal});
   const raw=await r.text();
   let d:any={};
   try{d=raw?JSON.parse(raw):{};}catch{}
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
    console.error(`[planning] candidates FAILED ${r.status} ${r.statusText}\n${tech}`);
    setErrorDetail(tech);
    throw new Error(detail||"Không tải được Candidate Jobs.");
   }
   if(seq!==loadSeq.current)return;

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
   void loadSourceData(rows,seq);
   setRecipeOptions(d.recipeOptions||[]);
   setTimeRules(d.timeRules||[]);
   setPagination(d.pagination);
   setInitialView(d.initialView||null);
   setServerViews((d.serverViews&&typeof d.serverViews==="object")?d.serverViews:{});
   setLoadedAreaId(requestAreaId);
   setLoadedOp(requestOp);
   setLoadedRecipeKey(requestRecipeKey);
   setLoadedPreviousBatchNo(requestPreviousBatchNo);
   setBoardKey(`${requestAreaId}|${requestOp}|${requestRecipeKey}`);

   const historyQs=new URLSearchParams(qs);
   historyQs.delete("pageSize");
   window.history.replaceState(null,"",`${window.location.pathname}?${historyQs.toString()}`);

  }catch(e){
   if(seq===loadSeq.current){
    if(timedOut){
     console.error(`[planning] candidates TIMEOUT after 25s`);
     setErrorDetail("Client timeout: request bị hủy sau 25s. Kiểm tra kết nối mạng/DB, xem log server ([candidates] ...).");
     setError("Mất quá 25s khi tải Candidate (timeout) — kiểm tra kết nối DB/mạng, bấm Thử lại.");
    }else{
     setError(e instanceof Error?e.message:String(e));
    }
   }
  }finally{
   clearTimeout(timer);
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
  {error&&<div className="notice section">Lỗi: {error}
   {errorDetail&&<details className="planning-v2-debug"><summary>Chi tiết kỹ thuật (copy gửi cho dev)</summary><pre>{errorDetail}</pre></details>}
   <div className="row" style={{marginTop:8}}><button className="btn primary" onClick={()=>void load()}>Thử lại</button></div>
  </div>}
  {routeError&&<div className="notice section">Candidate đã tải; Route Matrix lỗi: {routeError}</div>}
  {sourceDataError&&<div className="notice section">{sourceDataError}</div>}
  {loading&&<div className="notice section">Đang tải Candidate metadata… {loadElapsed>0&&<span className="muted">({loadElapsed}s)</span>}</div>}
  {!loading&&routeLoading&&<div className="notice section">Candidate đã hiển thị. Route Matrix của các dòng đang xem đang tải dần…</div>}
  {!op&&!areaId&&<div className="notice section">Chọn Area để xem toàn bộ Candidate thuộc Area, hoặc chọn thêm Standard Operation để lọc chi tiết.</div>}
  <div className="section">
   <PlanningBoardClient
    key={boardKey}
    candidates={candidates} availableBatches={availableBatches} standardOperation={loadedOp}
    areaMode={Boolean(loadedAreaId&&!loadedOp)} selectedAreaId={loadedAreaId} mainOperations={mainOperations}
    stOperations={stOperations} nextOperations={nextOperations} sourceColumnNames={sourceColumns} operationMappings={operationMappings} recipeKey={loadedRecipeKey}
    timeRules={timeRules} today={initial.today} initialView={initialView} initialServerViews={serverViews} pagination={pagination}
    onVisibleCandidateIds={ensureRouteStatuses}
    onReloadCandidates={()=>void load({useLoadedScope:true})}
   />
  </div>
 </>;
}
