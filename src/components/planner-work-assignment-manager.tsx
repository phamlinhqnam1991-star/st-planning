"use client";
import {useEffect,useState} from "react";
type Area={schedule_area_code:string;schedule_area_name:string;display_order:number;planner_owner:string;note:string|null;updated_by:string|null;updated_at:string|null};

export function PlannerWorkAssignmentManager(){
 const [areas,setAreas]=useState<Area[]>([]);const [status,setStatus]=useState("");
 async function load(){const r=await fetch("/api/config/planner-work-assignment",{cache:"no-store"});const d=await r.json();if(!r.ok){setStatus(d.error);return}setAreas(d.areas||[])}
 useEffect(()=>{load()},[]);
 async function assign(a:Area,owner:string){
  setStatus("");
  const r=await fetch("/api/config/planner-work-assignment",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({
   schedule_area_code:a.schedule_area_code,planner_owner:owner,updated_by:"Configuration"
  })});
  const d=await r.json();if(!r.ok)setStatus(d.error);else{setStatus(`Đã chuyển ${a.schedule_area_name} → ${owner==="UNASSIGNED"?"Chưa phân công":"Planner "+owner}.`);await load()}
 }
 const p1=areas.filter(x=>x.planner_owner==="1"),p2=areas.filter(x=>x.planner_owner==="2"),un=areas.filter(x=>!["1","2"].includes(x.planner_owner));
 const col=(title:string,rows:Area[],owner:string)=><div className="planner-assignment-column">
  <div className="planner-assignment-head"><b>{title}</b><span>{rows.length} khu vực</span></div>
  <div className="planner-assignment-list">{rows.map(a=><div className="planner-assignment-card" key={a.schedule_area_code}>
   <div><b>{a.schedule_area_name}</b><small>{a.schedule_area_code}</small></div>
   <div className="row">
    {owner!=="1"&&<button className="btn small" onClick={()=>assign(a,"1")}>→ Planner 1</button>}
    {owner!=="2"&&<button className="btn small" onClick={()=>assign(a,"2")}>→ Planner 2</button>}
    {owner!=="UNASSIGNED"&&<button className="btn small" onClick={()=>assign(a,"UNASSIGNED")}>Bỏ phân công</button>}
   </div>
  </div>)}</div>
 </div>;
 return <>
  <div className="notice"><b>Phân chia công việc điều độ</b><br/>Chuyển khu vực giữa Planner 1 / Planner 2 tại đây. Việc chuyển chỉ đổi người phụ trách điều độ, không đổi Standard Operation, Routing, Batch hoặc logic công đoạn.</div>
  {status&&<div className="notice">{status}</div>}
  <div className="planner-assignment-board">
   {col("Planner 1",p1,"1")}
   {col("Planner 2",p2,"2")}
   {col("Chưa phân công",un,"UNASSIGNED")}
  </div>
 </>;
}
