"use client";
import type {Area,Operation,PlanningScope,RecipeOption,SnapshotMeta} from "./types";

function fmtMs(v:number|null|undefined){const n=Number(v);if(!Number.isFinite(n))return "—";return n<1000?`${Math.round(n)} ms`:`${(n/1000).toFixed(n<10000?2:1)} s`;}

export function PlanningV2Filters({areas,operations,scope,setScope,recipeOptions,snapshot,loading,onLoad,onForce}:{
 areas:Area[];operations:Operation[];scope:PlanningScope;setScope:(s:PlanningScope)=>void;recipeOptions:RecipeOption[];snapshot:SnapshotMeta|null;loading:boolean;onLoad:()=>void;onForce:()=>void;
}){
 const filtered=scope.areaId?operations.filter(x=>String(x.area_id||"")===scope.areaId):operations;
 const patch=(p:Partial<PlanningScope>)=>setScope({...scope,...p});
 return <>
  <form className="erp-form-panel planning-filter" onSubmit={e=>{e.preventDefault();onLoad();}}>
   <label>Area<select className="input" value={scope.areaId} onChange={e=>{const areaId=e.target.value;const op=areaId&&scope.op&&!operations.some(x=>String(x.area_id||"")===areaId&&x.standard_operation===scope.op)?"":scope.op;setScope({...scope,areaId,op,recipeKey:op?scope.recipeKey:""});}}><option value="">All Areas</option>{areas.map(a=><option key={a.id} value={a.id}>{a.area_name}</option>)}</select></label>
   <label>Standard Operation<select className="input" value={scope.op} onChange={e=>patch({op:e.target.value,recipeKey:""})}><option value="">Select Operation...</option>{filtered.map(x=><option key={`${x.area_id||"none"}-${x.standard_operation}`} value={x.standard_operation}>{x.standard_operation}{x.area_name?` · ${x.area_name}`:""}</option>)}</select></label>
   <label>Recipe<select className="input" value={scope.recipeKey} onChange={e=>patch({recipeKey:e.target.value})}><option value="">All / Not Required</option>{recipeOptions.map(r=><option key={r.recipe_key} value={r.recipe_key}>{r.recipe_no||"—"} · {r.recipe_name||"CHƯA KHAI BÁO"}</option>)}</select></label>
   <label>Previous Batch No<input className="input" value={scope.previousBatchNo} onChange={e=>patch({previousBatchNo:e.target.value})} placeholder="PB-000120"/></label>
   <button className="btn primary" disabled={loading}>{loading?"Loading...":"Load Candidates"}</button>
   <button type="button" className="btn" disabled={loading} onClick={onForce}>Force Refresh</button>
  </form>
  {snapshot&&<div className={`planning-snapshot-status ${snapshot.fallback?"is-fallback":snapshot.hit?"is-hit":"is-miss"}`}>
   <b>{snapshot.fallback?"FALLBACK · CANONICAL":snapshot.hit?"SNAPSHOT HIT":"SNAPSHOT MISS"}</b><span>Load {fmtMs(snapshot.serveMs)}</span>{!snapshot.hit&&!snapshot.fallback&&snapshot.buildMs!=null&&<span>Build {fmtMs(snapshot.buildMs)}</span>}<span>{Number(snapshot.candidateCount||0).toLocaleString("vi-VN")} Jobs</span>
  </div>}
 </>;
}
