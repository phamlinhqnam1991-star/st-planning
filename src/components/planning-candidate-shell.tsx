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
 presentation?:"legacy"|"erp";
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

export function PlanningCandidateShell({presentation="legacy",areas,operations,availableBatches,mainOperations,stOperations,nextOperations,sourceColumns,operationMappings,initial}:Props){
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
 const [loadingMore,setLoadingMore]=useState(false);
 const [routeLoading,setRouteLoading]=useState(false);
 const [error,setError]=useState("");
 const [sourceDataError,setSourceDataError]=useState("");
 const [routeError,setRouteError]=useState("");
 const [boardKey,setBoardKey]=useState(`${initial.areaId}|${initial.op}|${initial.recipeKey}`);
 // v331: availableBatches/nextOperations chuyển sang state để refresh tại chỗ
 // sau khi tạo/thêm Batch (trước đây phải location.reload() mới thấy Batch mới
 // trong Target Batch dropdown).
 const [availableBatchesState,setAvailableBatchesState]=useState(availableBatches);
 const [nextOperationsState,setNextOperationsState]=useState(nextOperations);
 const refreshDeferredData=useCallback(async()=>{
  try{
   const r=await fetch("/api/planning/deferred-data",{cache:"no-store"});
   const d=await r.json().catch(()=>({}));
   if(Array.isArray(d.availableBatches))setAvailableBatchesState(d.availableBatches);
   if(Array.isArray(d.nextOperations))setNextOperationsState(d.nextOperations);
  }catch{/* graceful — board vẫn hoạt động với dữ liệu cũ */}
 },[]);
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
   const fetchedMap=new Map<number,any[]>();
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
     if(!r.ok)throw new Error(d.error||(presentation==="erp"?"Không tải được trạng thái ma trận.":"Không tải được Route Matrix."));
     if(seq!==loadSeq.current)return;

     const routeMap=new Map<number,any[]>((d.rows||[]).map((x:any)=>[Number(x.candidate_id),Array.isArray(x.route_status)?x.route_status:[]]));
     for(const id of chunk){
      const status=routeMap.get(id)||[];
      routeStatusCache.current.set(id,status);
      fetchedMap.set(id,status);
     }
    }
   };
   await Promise.all(Array.from({length:Math.min(ROUTE_MAX_PARALLEL,chunks.length)},()=>worker()));
   if(seq===loadSeq.current&&fetchedMap.size){
    // v331: ONE batched state update for every Route Matrix chunk instead of
    // one update per chunk — the Candidate table re-renders once, not N times.
    setCandidates(prev=>prev.map(row=>{
     const status=fetchedMap.get(Number(row.id));
     return status!==undefined?{...row,route_status:status,route_status_loaded:true}:row;
    }));
   }
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

 // v390: every Planning Board mutation (Batch, Hold/Unhold, etc.) refreshes
 // ONLY the affected Jobs. The optional operationState is patched immediately
 // so the visible cell changes as soon as the save succeeds; the canonical
 // delta query then reconciles the row in the background. No page reload, no
 // board remount, and no scroll/filter/zoom reset.
 const refreshAffectedCandidates=useCallback(async(event:{
  affectedJobNums:string[];
  batchTarget?:any|null;
  operationState?:any|null;
 })=>{
  const batchTarget=event?.batchTarget;
  if(batchTarget&&Number.isFinite(Number(batchTarget.id))){
   setAvailableBatchesState(prev=>[
    batchTarget,
    ...prev.filter((x:any)=>Number(x.id)!==Number(batchTarget.id))
   ].slice(0,100));
  }

  const jobNums=[...new Set((event?.affectedJobNums||[])
   .map(x=>String(x||"").trim()).filter(Boolean))];
  if(!jobNums.length)return;
  const affectedSet=new Set(jobNums);

  // Immediate visible patch for Job/Main Hold / Release Hold. PostgreSQL has
  // already committed before this callback runs, so this is not a speculative
  // write: it simply avoids waiting for the follow-up delta round-trip.
  const operationState=event?.operationState;
  const operationId=Number(operationState?.id);
  const hasOperationPatch=Boolean(operationState&&Number.isFinite(operationId));
  const isHold=hasOperationPatch?Boolean(operationState.is_hold):false;
  const rawPlanningStatus=hasOperationPatch?String(operationState.status||"").toUpperCase():"";
  const candidatePlanningStatus=isHold
   ?"HOLD"
   :(rawPlanningStatus==="ELIGIBLE"?"ELIGIBLE":rawPlanningStatus==="PLANNED"?"PLANNED":"LOCKED");
  const routeStatus=isHold
   ?"HOLD"
   :(rawPlanningStatus==="ELIGIBLE"?"READY":rawPlanningStatus==="PLANNED"?"PLANNED-UNSCHEDULED":"WAITING");
  const patchRoute=(items:any[])=>hasOperationPatch&&Array.isArray(items)?items.map((item:any)=>
   Number(item?.planning_job_operation_id)===operationId
    ?{
      ...item,
      planning_job_status:rawPlanningStatus||item.planning_job_status,
      route_status:routeStatus,
      is_hold:isHold,
      hold_reason:operationState.hold_reason??null,
      hold_note:operationState.hold_note??null,
      held_at:operationState.held_at??null,
      held_by:operationState.held_by??null
     }
    :item
  ):items;

  if(hasOperationPatch){
   setCandidates(prev=>prev.map((row:any)=>{
    if(!affectedSet.has(String(row.job_num)))return row;
    const patchedRoute=patchRoute(row.route_status||[]);
    const isDirect=Number(row.id)===operationId;
    return {
     ...row,
     ...(isDirect?{
      planning_status:candidatePlanningStatus,
      is_hold:isHold,
      hold_reason:operationState.hold_reason??null,
      hold_note:operationState.hold_note??null,
      held_at:operationState.held_at??null,
      held_by:operationState.held_by??null
     }:{}),
     route_status:patchedRoute
    };
   }));

  }

  // Capture current source_data before replacing the rows. Batch creation does
  // not modify All Open Job source columns, so keeping this avoids another
  // source_data request.
  const sourceByJob=new Map<string,unknown>();
  const routeByJob=new Map<string,any[]>();
  const oldIds:number[]=[];
  for(const row of candidates){
   if(!affectedSet.has(String(row.job_num)))continue;
   if(row.source_data!=null)sourceByJob.set(String(row.job_num),row.source_data);
   if(hasOperationPatch&&Array.isArray(row.route_status)){
    routeByJob.set(String(row.job_num),patchRoute(row.route_status));
   }
   const id=Number(row.id);
   if(Number.isFinite(id))oldIds.push(id);
  }
  for(const id of oldIds){
   routeStatusCache.current.delete(id);
   routeRequestedIds.current.delete(id);
  }

  const r=await fetch("/api/planning/candidates/delta",{
   method:"POST",
   headers:{"content-type":"application/json"},
   cache:"no-store",
   body:JSON.stringify({
    areaId:loadedAreaId,
    op:loadedOp,
    recipeKey:loadedRecipeKey,
    previousBatchNo:loadedPreviousBatchNo,
    jobNums
   })
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d?.error||(presentation==="erp"?"Không đồng bộ được Job vừa thay đổi.":"Không đồng bộ được Candidate vừa thay đổi."));

  const deltaRows=(Array.isArray(d.candidates)?d.candidates:[]).map((row:any)=>{
   const preservedRoute=hasOperationPatch?routeByJob.get(String(row.job_num)):undefined;
   return {
    ...row,
    source_data:row.source_data??sourceByJob.get(String(row.job_num))??null,
    route_status:Array.isArray(preservedRoute)?preservedRoute:[],
    route_status_loaded:Array.isArray(preservedRoute)
   };
  });
  const newIds=deltaRows.map((x:any)=>Number(x.id)).filter(Number.isFinite);
  for(const id of newIds){
   routeStatusCache.current.delete(id);
   routeRequestedIds.current.delete(id);
  }

  // Preserve the physical row position when the Job still belongs to the
  // loaded scope. If it no longer belongs, remove it; if a newly matching row
  // appears, append it. Client sort/filter rules remain untouched.
  const deltaByJob=new Map(deltaRows.map((row:any)=>[String(row.job_num),row]));
  setCandidates(prev=>{
   const pending=new Map(deltaByJob);
   const merged:any[]=[];
   for(const row of prev){
    const jobNum=String(row.job_num);
    if(!affectedSet.has(jobNum)){merged.push(row);continue;}
    const replacement=pending.get(jobNum);
    if(replacement){merged.push(replacement);pending.delete(jobNum);}
   }
   for(const row of pending.values())merged.push(row);
   return merged;
  });
  setPagination((p:any)=>{
   // In normal mutation flow the affected Job remains in the same scope, so
   // total is stable. Reconcile only when the delta truly adds/removes rows.
   const existingAffected=candidates.filter(row=>affectedSet.has(String(row.job_num))).length;
   const total=Math.max(0,Number(p?.totalCandidates||0)-existingAffected+deltaRows.length);
   const pageSize=Math.max(1,Number(p?.pageSize||200));
   return {...p,totalCandidates:total,totalPages:Math.max(1,Math.ceil(total/pageSize))};
  });

  // Only these rows need fresh READY/PLANNED/SCHEDULED state.
  if(newIds.length)await ensureRouteStatuses(newIds);
 },[candidates,loadedAreaId,loadedOp,loadedRecipeKey,loadedPreviousBatchNo,ensureRouteStatuses]);

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
    setSourceDataError(presentation==="erp"?"Không tải được các trường Open Job mở rộng — ma trận vẫn hoạt động bình thường.":"Không tải được cột All Open Source (mạng chậm) — board vẫn hoạt động bình thường.");
   }
  }finally{clearTimeout(timer);}
 }

 async function load(next:{useLoadedScope?:boolean}={}){
  const seq=++loadSeq.current;
  routeRequestedIds.current=new Set();
  // v390: a full Candidate load must never reuse pre-mutation Route Matrix
  // entries. Stale cache was the reason HOLD sometimes appeared only after
  // several manual refreshes.
  routeStatusCache.current.clear();
  routeActiveRequests.current=0;
  setLoading(true);setLoadingMore(false);setRouteLoading(false);setError("");setSourceDataError("");setRouteError("");
  // v323: hard client timeout — never let the board spin on a wedged request.
  let timedOut=false;
  const controller=new AbortController();
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},60_000);
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
   // v324: main load runs light (no source_data — ~2.8MB payload). All Open
   // Source columns are fetched lazily in the background afterwards.
   qs.set("light","1");
   // v328: progressive chunked load — same API, same SQL/pagination mode as the
   // legacy paged path (business logic untouched). Small pages finish within
   // the timeout even on high-latency links; rows render as pages arrive.
   // v331: measured faster than the v330 all-in-one load on production data,
   // so this remains the default.
   const CHUNK_PAGE=200;
   const mapRows=(arr:any[])=>arr.map((x:any)=>{
    const id=Number(x.id);
    const cached=Number.isFinite(id)?routeStatusCache.current.get(id):undefined;
    return {
     ...x,
     route_status:cached??(Array.isArray(x.route_status)?x.route_status:[]),
     route_status_loaded:cached!==undefined
    };
   });
   const fetchPage=async(page:number,knownTotal:number|null)=>{
    const u=new URLSearchParams(qs);
    u.set("pageSize",String(CHUNK_PAGE));
    u.set("page",String(page));
    if(knownTotal!=null)u.set("knownTotal",String(knownTotal));
    const url=`/api/planning/candidates?${u.toString()}`;
    const r=await fetch(url,{cache:"no-store",signal:controller.signal});
    const raw=await r.text();
    let d:any={};
    try{d=raw?JSON.parse(raw):{};}catch{}
    if(!r.ok){
     const detail=String(d?.error||"").trim();
     console.error(`[planning] candidates FAILED ${r.status} ${r.statusText}`,detail||raw.slice(0,1200));
     throw new Error(detail||(presentation==="erp"?"Không tải được dữ liệu Planning Board.":"Không tải được Candidate Jobs."));
    }
    return d;
   };

   // Page 1 — renders immediately so the board is usable while more arrive.
   const first=await fetchPage(1,null);
   if(seq!==loadSeq.current)return;
   const firstRows=mapRows(first.candidates||[]);
   setCandidates(firstRows);
   setRecipeOptions(first.recipeOptions||[]);
   setTimeRules(first.timeRules||[]);
   setPagination(first.pagination);
   setInitialView(first.initialView||null);
   setServerViews((first.serverViews&&typeof first.serverViews==="object")?first.serverViews:{});
   setLoadedAreaId(requestAreaId);
   setLoadedOp(requestOp);
   setLoadedRecipeKey(requestRecipeKey);
   setLoadedPreviousBatchNo(requestPreviousBatchNo);
   setBoardKey(`${requestAreaId}|${requestOp}|${requestRecipeKey}`);

   const total=Number(first.pagination?.totalCandidates)||0;
   const totalPages=Math.max(1,Math.ceil(total/CHUNK_PAGE));
   let rows=firstRows;
   if(totalPages>1){
    setLoadingMore(true);
    try{
     for(let page=2;page<=totalPages;page++){
      const d=await fetchPage(page,total);
      if(seq!==loadSeq.current)return;
      const pageRows=mapRows(d.candidates||[]);
      rows=rows.concat(pageRows);
      setCandidates(rows);
      if(pageRows.length<CHUNK_PAGE)break;
     }
    }finally{
     if(seq===loadSeq.current)setLoadingMore(false);
    }
   }
   if(seq!==loadSeq.current)return;
   void loadSourceData(rows,seq);

   const historyQs=new URLSearchParams(qs);
   historyQs.delete("pageSize");
   window.history.replaceState(null,"",`${window.location.pathname}?${historyQs.toString()}`);

  }catch(e){
   if(seq===loadSeq.current){
    if(timedOut){
     console.error(`[planning] candidates TIMEOUT after 60s`);
     setError("Mất quá 60s khi tải Candidate — kiểm tra kết nối và bấm Thử lại.");
    }else{
     // Page 1 failed = real error; later pages failed = keep rows, softer notice.
     const msg=e instanceof Error?e.message:String(e);
     setError(candidates.length?`Tải tiếp Candidate bị lỗi: ${msg} — đã hiển thị ${candidates.length} dòng, bấm Thử lại.`:`Lỗi: ${msg}`);
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

 const erpMode=presentation==="erp";
 const fieldClass=erpMode?"erpkit-select":"input";
 const actionClass=erpMode?"erpkit-btn erpkit-btn-primary":"btn primary";
 const noticeClass=(tone:"info"|"warning"|"danger"="info")=>erpMode?`erpkit-planning-notice is-${tone}`:"notice section";

 return <div className={erpMode?"erpkit-live-planning":""}>
  <form className={erpMode?"erpkit-live-planning-filter":"erp-form-panel planning-filter"} onSubmit={submit}>
   <label><span>{erpMode?"Khu vực":"Area"}</span><select className={fieldClass} value={areaId} onChange={e=>changeArea(e.target.value)}><option value="">{erpMode?"Tất cả khu vực":"Tất cả Area"}</option>{areas.map(a=><option key={a.id} value={a.id}>{a.area_name}</option>)}</select></label>
   <label><span>{erpMode?"Main Operation":"Standard Operation"}</span><select className={fieldClass} value={op} onChange={e=>{setOp(e.target.value);setRecipeKey("");}}><option value="">{erpMode?"Tất cả công đoạn":"Chọn công đoạn..."}</option>{filteredOperations.map(x=><option key={`${x.area_id||"none"}-${x.standard_operation}`} value={x.standard_operation}>{x.standard_operation}{x.area_name?` · ${x.area_name}`:""}</option>)}</select>{areaId&&<small className="planning-sub">{filteredOperations.length} công đoạn</small>}</label>
   <label><span>Recipe</span><select className={fieldClass} value={recipeKey} onChange={e=>setRecipeKey(e.target.value)}><option value="">{erpMode?"Tất cả Recipe":"Tất cả / Không yêu cầu"}</option>{recipeOptions.map(r=><option key={r.recipe_key} value={r.recipe_key}>{r.recipe_no||"—"} · {r.recipe_name||"CHƯA KHAI BÁO"}</option>)}</select></label>
   <label><span>{erpMode?"Batch trước":"Previous Batch No"}</span><input className={erpMode?"erpkit-input":"input"} value={previousBatchNo} onChange={e=>setPreviousBatchNo(e.target.value)} placeholder={erpMode?"Nhập Batch No.":"PB-000120"}/></label>
   <button className={actionClass} disabled={loading}>{loading?"Đang tải…":erpMode?"Áp dụng":"Tải Candidate"}</button>
  </form>
  {error&&<div className={noticeClass("danger")}>{error}
   <div className="row" style={{marginTop:8}}><button className={actionClass} onClick={()=>void load()}>Thử lại</button></div>
  </div>}
  {routeError&&<div className={noticeClass("warning")}>{erpMode?"Dữ liệu Job đã tải, nhưng trạng thái công đoạn gặp lỗi: ":"Dữ liệu Job đã tải, nhưng trạng thái Route Matrix gặp lỗi: "}{routeError}</div>}
  {sourceDataError&&<div className={noticeClass("warning")}>{sourceDataError}</div>}
  {loading&&<div className={noticeClass("info")}><span className="erpkit-planning-spinner"/>Đang tải dữ liệu kế hoạch {loadElapsed>0&&<span className="muted">· {loadElapsed}s</span>}</div>}
  {!loading&&loadingMore&&<div className={noticeClass("info")}><span className="erpkit-planning-spinner"/>Đang tải thêm Job · đã hiển thị {candidates.length.toLocaleString("vi-VN")} dòng</div>}
  {!loading&&routeLoading&&<div className={noticeClass("info")}><span className="erpkit-planning-spinner"/>{erpMode?"Đang đồng bộ trạng thái công đoạn…":"Đang đồng bộ trạng thái Route Matrix…"}</div>}
  {!op&&!areaId&&<div className={noticeClass("info")}>Chọn khu vực hoặc Main Operation để thu hẹp phạm vi kế hoạch.</div>}
  <div className={erpMode?"erpkit-live-planning-content":"section"}>
   <PlanningBoardClient
    key={boardKey}
    candidates={candidates} availableBatches={availableBatchesState} standardOperation={loadedOp}
    areaMode={Boolean(loadedAreaId&&!loadedOp)} selectedAreaId={loadedAreaId} mainOperations={mainOperations}
    stOperations={stOperations} nextOperations={nextOperationsState} sourceColumnNames={sourceColumns} operationMappings={operationMappings} recipeKey={loadedRecipeKey}
    timeRules={timeRules} today={initial.today} initialView={initialView} initialServerViews={serverViews} pagination={pagination}
    onVisibleCandidateIds={ensureRouteStatuses}
    onReloadCandidates={()=>void load({useLoadedScope:true})}
    onCandidateMutation={refreshAffectedCandidates}
    onAfterMutation={()=>{void load({useLoadedScope:true});void refreshDeferredData();}}
    presentation={presentation}
   />
  </div>
 </div>;
}
