"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import type {Candidate,MainOperation,RouteStatusItem,SelectedTarget} from "./types";
import {computeSelectableTarget,exactRouteTarget,formatNumber,normalized,routeStatusClass,sortCandidates} from "./domain";

const STEP=100;

function currentMainStatus(row:Candidate){
 if(row.batch_no)return row.batch_status||"PLANNED-UNSCHEDULED";
 return row.planning_status||"";
}
function routeTitle(item:RouteStatusItem){
 return [item.standard_operation,item.source_operation,item.route_status,item.batch_no,item.resource_code,item.planned_start,item.planned_end].filter(Boolean).join(" · ");
}

export function PlanningV2Grid({candidates,mainOperations,today,selected,onToggleTarget,onVisibleIds}:{
 candidates:Candidate[];mainOperations:MainOperation[];today:string;selected:Map<number,SelectedTarget>;onToggleTarget:(row:Candidate,target:SelectedTarget)=>void;onVisibleIds:(ids:number[])=>void;
}){
 const [limit,setLimit]=useState(STEP);
 const [search,setSearch]=useState("");
 const [nextMain,setNextMain]=useState("");
 const [nextOp,setNextOp]=useState("");
 const [showRoute,setShowRoute]=useState(true);
 const sentinel=useRef<HTMLTableRowElement|null>(null);
 const nextMains=useMemo(()=>[...new Set(candidates.map(x=>String(x.next_standard_operation||"").trim()).filter(Boolean))].sort(),[candidates]);
 const nextOps=useMemo(()=>[...new Set(candidates.map(x=>String(x.next_operation||"").trim()).filter(Boolean))].sort(),[candidates]);
 const filtered=useMemo(()=>sortCandidates(candidates.filter(x=>{
  if(nextMain&&normalized(x.next_standard_operation)!==normalized(nextMain))return false;
  if(nextOp&&normalized(x.next_operation)!==normalized(nextOp))return false;
  if(search){const q=normalized(search);if(![x.job_num,x.part_num,x.revision_num,x.program,x.next_operation,x.standard_operation,x.recipe_no,x.recipe_name,x.batch_no].some(v=>normalized(v).includes(q)))return false;}
  return true;
 }),today),[candidates,nextMain,nextOp,search,today]);
 const rows=filtered.slice(0,limit);
 const routeOps=useMemo(()=>[...mainOperations].filter(x=>normalized(x.standard_operation)!=="PIONBL").sort((a,b)=>{
  const ao=Number.isFinite(Number(a.planning_sort_order))?Number(a.planning_sort_order):999999;
  const bo=Number.isFinite(Number(b.planning_sort_order))?Number(b.planning_sort_order):999999;
  return ao-bo||String(a.standard_operation).localeCompare(String(b.standard_operation),undefined,{numeric:true});
 }),[mainOperations]);
 useEffect(()=>{setLimit(STEP);},[search,nextMain,nextOp,candidates.length]);
 useEffect(()=>{onVisibleIds(rows.map(x=>Number(x.id)));},[rows.map(x=>x.id).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{
  const el=sentinel.current;if(!el)return;
  const io=new IntersectionObserver(entries=>{if(entries.some(x=>x.isIntersecting))setLimit(v=>Math.min(filtered.length,v+STEP));},{rootMargin:"500px"});io.observe(el);return()=>io.disconnect();
 },[filtered.length]);

 return <div className="planning-v2-grid-panel">
  <div className="planning-v2-grid-toolbar">
   <input className="input" placeholder="Search Job / Part / Program / Recipe / Batch..." value={search} onChange={e=>setSearch(e.target.value)}/>
   <select className="input" value={nextMain} onChange={e=>setNextMain(e.target.value)}><option value="">All Next Main</option>{nextMains.map(x=><option key={x}>{x}</option>)}</select>
   <select className="input" value={nextOp} onChange={e=>setNextOp(e.target.value)}><option value="">All NextOperation</option>{nextOps.map(x=><option key={x}>{x}</option>)}</select>
   <label className="planning-v2-check"><input type="checkbox" checked={showRoute} onChange={e=>setShowRoute(e.target.checked)}/> Route Matrix</label>
   <span className="planning-sub">Showing {Math.min(limit,filtered.length).toLocaleString("vi-VN")} / {filtered.length.toLocaleString("vi-VN")}</span>
  </div>
  <div className="table-wrap planning-v2-table-wrap"><table className="erp-table planning-v2-table"><thead><tr>
   <th>Select</th><th>Job</th><th>Part / Rev</th><th>Qty</th><th>Surface</th><th>Priority</th><th>NextOperation</th><th>Current Main</th><th>Current Status</th><th>Next Main</th><th>Recipe</th><th>Batch</th>
   {showRoute&&routeOps.map(o=><th key={o.standard_operation} className="planning-v2-route-head">{o.standard_operation}</th>)}
  </tr></thead><tbody>
   {rows.map(row=>{
    const defaultTarget=computeSelectableTarget(row);const defaultSelected=defaultTarget?selected.has(defaultTarget.id):false;
    return <tr key={row.id} className={normalized(row.route_resolution_mode)==="NO_CHAIN_ALL_MAIN"?"planning-v2-no-chain":""}>
     <td>{defaultTarget?<input type="checkbox" checked={defaultSelected} onChange={()=>onToggleTarget(row,defaultTarget)}/>:"—"}</td>
     <td><b>{row.job_num}</b>{row.route_resolution_mode&&<small className="planning-v2-mode">{row.route_resolution_mode}</small>}</td>
     <td>{row.part_num||"—"}<br/><small>{row.revision_num||""}</small></td>
     <td>{formatNumber(row.plan_qty)}</td><td>{formatNumber(row.plan_surface)}</td><td>{row.priority_type||"—"}</td>
     <td>{row.next_operation||"—"}</td><td>{row.standard_operation||"—"}</td><td>{currentMainStatus(row)||"—"}</td><td>{row.next_standard_operation||"END"}</td>
     <td>{row.recipe_no||"—"}<br/><small>{row.recipe_name||""}</small></td><td>{row.batch_no||"—"}</td>
     {showRoute&&routeOps.map(op=>{
      if(!row.route_status_loaded)return <td key={op.standard_operation} className="route-status-cell route-status-loading">…</td>;
      const items=(row.route_status||[]).filter(x=>normalized(x.standard_operation)===normalized(op.standard_operation)).sort((a,b)=>Number(a.source_seq||0)-Number(b.source_seq||0));
      if(!items.length)return <td key={op.standard_operation} className="route-status-cell route-status-na">—</td>;
      const item=items.find(x=>normalized(x.route_status)==="READY")||items.find(x=>["PLANNED-UNSCHEDULED","SCHEDULED","RUNNING","HOLD"].includes(normalized(x.route_status)))||items[items.length-1];
      const target=exactRouteTarget(row,item);const active=target?selected.has(target.id):false;
      return <td key={op.standard_operation} title={routeTitle(item)} className={`route-status-cell ${routeStatusClass(item.route_status)} ${active?"planning-v2-selected-route":""}`} onClick={()=>target&&onToggleTarget(row,target)} style={{cursor:target?"pointer":"default"}}>
       <b>{item.route_status}</b>{item.batch_no&&<small>{item.batch_no}</small>}{item.resource_code&&<small>{item.resource_code}</small>}
      </td>;
     })}
    </tr>;
   })}
   {limit<filtered.length&&<tr ref={sentinel}><td colSpan={12+(showRoute?routeOps.length:0)} className="notice">Đang mở thêm rows…</td></tr>}
  </tbody></table></div>
 </div>;
}
