"use client";
import {useEffect,useMemo,useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";
import {PlanningV2Filters} from "./planning-v2-filters";
import {PlanningV2Grid} from "./planning-v2-grid";
import {PlanningV2BatchPanel} from "./planning-v2-batch-panel";
import {usePlanningV2Data} from "./use-planning-v2-data";
import type {Area,Candidate,MainOperation,Operation,PlanningScope,SelectedTarget} from "./types";
import {formatNumber,minutesToHHMM,normalized,paintSelectionField,paintSelectionKey} from "./domain";

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

export function PlanningV2Client({areas,operations,mainOperations,today,initialScope}:{areas:Area[];operations:Operation[];mainOperations:MainOperation[];today:string;initialScope:PlanningScope}){
 const data=usePlanningV2Data(initialScope);
 const loadElapsed=useLoadElapsed(data.loading);
 const [selected,setSelected]=useState<Map<number,SelectedTarget>>(new Map());
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 usePopupMessage(message);

 const selectedTargets=[...selected.values()];

 function toggleTarget(row:Candidate,target:SelectedTarget){
  setMessage("");
  setSelected(prev=>{
   const next=new Map(prev);
   if(next.has(target.id)){next.delete(target.id);return next;}
   const existing=[...next.values()];
   if(existing.length&&normalized(existing[0].standardOperation)!==normalized(target.standardOperation)){
    setMessage(`Chỉ chọn cùng một Main Operation trong một Batch. Đang chọn ${existing[0].standardOperation}.`);return prev;
   }
   if(paintSelectionField(target.standardOperation)){
    const key=paintSelectionKey(row,target.standardOperation);
    if(!key){setMessage(`Job ${row.job_num} chưa có ${paintSelectionField(target.standardOperation)}.`);return prev;}
    if(existing.length){
     const firstRow=data.candidateById.get(existing[0].candidateId);
     const firstKey=firstRow?paintSelectionKey(firstRow,target.standardOperation):"";
     if(firstKey&&firstKey!==key){setMessage(`Batch sơn chỉ được chứa cùng ${paintSelectionField(target.standardOperation)}.`);return prev;}
    }
   }
   next.set(target.id,target);return next;
  });
 }

 async function createBatch(targetBatchId:number|null,recipeKey:string|null){
  const targets=[...selected.values()];
  if(!targets.length)return;
  const op=targets[0].standardOperation;
  if(targets.some(x=>normalized(x.standardOperation)!==normalized(op))){setMessage("Lỗi: một Batch chỉ được chứa cùng Standard Operation.");return;}
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/planning/batch",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({planning_job_operation_ids:targets.map(x=>x.id),standard_operation:op,recipe_key:recipeKey,target_batch_id:targetBatchId})});
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(d.error||"Không tạo được Batch.");
   setMessage(`${d.batchNo} ${d.addedToExisting?"updated":"created"} · ${d.totalJobs} Jobs · Qty ${formatNumber(d.totalQty)} · Surface ${formatNumber(d.totalSurface)} dm² · Process ${minutesToHHMM(d.processMinutes)}${d.batchKey?` · Batch Key ${d.batchKey}`:""}`);
   setSelected(new Map());
   await data.load({force:true,keepLoadedScope:true});
  }catch(e){setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`);}finally{setBusy(false);}
 }

 async function rebuild(){
  setBusy(true);setMessage("Đang rebuild Planning Chain...");
  try{
   const r=await fetch("/api/planning/rebuild",{method:"POST"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Rebuild thất bại.");
   setMessage(`Rebuild xong: ${d.jobs||0} Jobs · ${d.operations||0} operations · ${d.eligible||0} eligible · NO CHAIN ${d.noChain??d.sequenceCheck??0}${d.noChainAllMain?` (${d.noChainAllMain} All Main READY)`:""}`);
   setSelected(new Map());await data.load({force:true,keepLoadedScope:true});
  }catch(e){setMessage(`Lỗi: ${e instanceof Error?e.message:String(e)}`);}finally{setBusy(false);}
 }

 const stats=useMemo(()=>({
  total:data.candidates.length,
  ready:data.candidates.filter(x=>x.planning_status==="ELIGIBLE"||(x.route_status||[]).some(r=>normalized(r.route_status)==="READY")).length,
  planned:data.candidates.filter(x=>Boolean(x.batch_no)).length,
  noChainAllMain:data.candidates.filter(x=>normalized(x.route_resolution_mode)==="NO_CHAIN_ALL_MAIN").length
 }),[data.candidates]);

 return <div className="planning-v2-root">
  <div className="planning-v2-banner"><div><b>Planning Board V2 · TEST</b><span>UI/architecture viết lại từ đầu · Business logic dùng chung API chuẩn hiện tại</span></div><div className="planning-v2-statline"><span>{stats.total.toLocaleString("vi-VN")} Jobs</span><span>{stats.ready.toLocaleString("vi-VN")} READY</span><span>{stats.planned.toLocaleString("vi-VN")} có Batch</span><span>{stats.noChainAllMain.toLocaleString("vi-VN")} NO_CHAIN_ALL_MAIN</span></div></div>
  <PlanningV2Filters areas={areas} operations={operations} scope={data.scope} setScope={data.setScope} recipeOptions={data.recipeOptions} snapshot={data.snapshot} loading={data.loading} onLoad={()=>{setSelected(new Map());void data.load();}} onForce={()=>{setSelected(new Map());void data.load({force:true});}}/>
  {data.error&&<div className="notice section">Lỗi Candidate: {data.error}
   {data.errorDetail&&<details className="planning-v2-debug"><summary>Chi tiết kỹ thuật (copy gửi cho dev)</summary><pre>{data.errorDetail}</pre></details>}
   <div className="row" style={{marginTop:8}}><button className="btn primary" onClick={()=>void data.load()}>Thử lại</button></div>
  </div>}
  {!data.error&&data.debugInfo&&<div className="planning-v2-debugline">Load {Number((data.debugInfo as any).totalMs)||0} ms · {Number((data.debugInfo as any).rows)||0} Jobs · stView {(data.debugInfo as any).stViewCount??"—"}</div>}
  {data.routeError&&<div className="notice section">Candidate đã tải; Route Matrix lỗi: {data.routeError}</div>}
  {data.loading&&<div className="notice section">Đang tải Candidate metadata… {loadElapsed>0&&<span className="muted">({loadElapsed}s)</span>}</div>}
  {!data.loading&&data.loadingMore&&<div className="notice section">Đang tải tiếp Jobs… đã hiển thị {data.candidates.length.toLocaleString("vi-VN")} dòng</div>}
  {!data.loading&&data.routeLoading&&<div className="notice section">Candidate đã hiển thị; Route Matrix đang tải dần cho các rows đang xem…</div>}
  <div className="planning-v2-layout">
   <section className="planning-v2-main"><PlanningV2Grid candidates={data.candidates} mainOperations={mainOperations} today={today} selected={selected} onToggleTarget={toggleTarget} onVisibleIds={ids=>void data.ensureRouteStatuses(ids)}/></section>
   <PlanningV2BatchPanel selected={selected} candidateById={data.candidateById} batches={data.availableBatches} timeRules={data.timeRules} loadedOperation={data.loadedScope.op} loadedRecipeKey={data.loadedScope.recipeKey} busy={busy} message={message} onCreate={createBatch} onRebuild={rebuild} onClearSelection={()=>setSelected(new Map())}/>
  </div>
 </div>;
}
