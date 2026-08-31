"use client";
import {useMemo,useState} from "react";
import type {BatchOption,Candidate,SelectedTarget,TimeRule} from "./types";
import {estimateMinutes,formatNumber,minutesToHHMM,normalized,targetRecipeKey} from "./domain";

export function PlanningV2BatchPanel({selected,candidateById,batches,timeRules,loadedOperation,loadedRecipeKey,busy,message,onCreate,onRebuild,onClearSelection}:{
 selected:Map<number,SelectedTarget>;candidateById:Map<number,Candidate>;batches:BatchOption[];timeRules:TimeRule[];loadedOperation:string;loadedRecipeKey:string;busy:boolean;message:string;
 onCreate:(targetBatchId:number|null,recipeKey:string|null)=>Promise<void>;onRebuild:()=>Promise<void>;onClearSelection:()=>void;
}){
 const [targetBatchId,setTargetBatchId]=useState("");
 const targets=[...selected.values()];
 const rows=targets.map(t=>candidateById.get(t.candidateId)).filter(Boolean) as Candidate[];
 const operation=targets[0]?.standardOperation||loadedOperation||"";
 const totalQty=rows.reduce((a,x)=>a+Number(x.plan_qty||0),0);
 const totalSurface=rows.reduce((a,x)=>a+Number(x.plan_surface||0),0);
 const processMinutes=normalized(operation)===normalized(loadedOperation)?estimateMinutes(timeRules,totalQty,totalSurface):null;
 const recipes=useMemo(()=>[...new Set(targets.map(t=>{const row=candidateById.get(t.candidateId);return row?targetRecipeKey(row,t):null;}).filter(Boolean))] as string[],[selected,candidateById]);
 const recipeKey=(normalized(operation)===normalized(loadedOperation)&&loadedRecipeKey)|| (recipes.length===1?recipes[0]:null);
 const compatible=batches.filter(b=>normalized(b.standard_operation)===normalized(operation)&&!["CANCELLED","COMPLETED"].includes(normalized(b.status)));
 return <aside className="planning-v2-batch-panel">
  <div className="erp-panel-head"><div><b>Batch Builder V2</b><small>{operation||"Chưa chọn Main Operation"}</small></div><button className="btn" disabled={busy} onClick={onRebuild}>Rebuild Chain</button></div>
  <div className="planning-v2-batch-summary"><div><span>Selected</span><b>{targets.length}</b></div><div><span>Qty</span><b>{formatNumber(totalQty)}</b></div><div><span>Surface</span><b>{formatNumber(totalSurface)} dm²</b></div><div><span>Process</span><b>{minutesToHHMM(processMinutes)}</b></div></div>
  <div className="planning-v2-batch-info"><span>Recipe</span><b>{recipeKey||"Auto / Not required"}</b>{recipes.length>1&&<small className="warn">Selected targets có nhiều Recipe; server sẽ kiểm tra theo logic chuẩn.</small>}</div>
  <label>Add to existing Batch<select className="input" value={targetBatchId} onChange={e=>setTargetBatchId(e.target.value)}><option value="">Create new Batch</option>{compatible.map(b=><option key={b.id} value={b.id}>{b.batch_no} · {b.schedule_id?"SCHEDULED":"UNSCHEDULED"}</option>)}</select></label>
  <div className="row"><button className="btn primary" disabled={busy||!targets.length} onClick={()=>onCreate(targetBatchId?Number(targetBatchId):null,recipeKey)}>{busy?"Processing...":targetBatchId?"Add to Batch":"Create Batch"}</button><button className="btn" disabled={!targets.length||busy} onClick={onClearSelection}>Clear selection</button></div>
  {message&&<div className="notice">{message}</div>}
  <div className="planning-v2-selected-list">{targets.slice(0,20).map(t=><div key={t.id}><b>{candidateById.get(t.candidateId)?.job_num||t.candidateId}</b><span>{t.standardOperation}</span><small>{t.sourceOperation}</small></div>)}{targets.length>20&&<small>+ {targets.length-20} targets</small>}</div>
 </aside>;
}
