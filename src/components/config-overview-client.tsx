"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {CONFIG_FLOW,healthStatus,type ConfigHealth} from "@/lib/config/config-flow";
import {CONFIG_HEALTH_INVALIDATED_EVENT,loadConfigHealth} from "@/lib/config/config-client";

const n=(x:unknown)=>Number(x||0);

export function ConfigOverviewClient(){
 const [health,setHealth]=useState<Partial<ConfigHealth>|null>(null);
 useEffect(()=>{
  let cancelled=false;
  const load=async(fresh=false)=>{
   try{const data=await loadConfigHealth(fresh);if(!cancelled)setHealth(data);}catch{if(!cancelled)setHealth({});}
  };
  void load(false);
  const onInvalidated=()=>{void load(false)};
  window.addEventListener(CONFIG_HEALTH_INVALIDATED_EVENT,onInvalidated);
  return ()=>{cancelled=true;window.removeEventListener(CONFIG_HEALTH_INVALIDATED_EVENT,onInvalidated)};
 },[]);

 const derived=useMemo(()=>{
  if(!health)return null;
  const s=health;
  const architecture=[
   {label:"ST Scope",ok:n(s.scope_total)>0,value:n(s.scope_total),href:"/operation-code-order"},
   {label:"Source → Main",ok:n(s.mapping_total)>0&&n(s.mapping_missing)===0,value:n(s.mapping_total),href:"/master/operationmapping"},
   {label:"Main Operation",ok:n(s.master_total)>0,value:n(s.master_total),href:"/master/operation"},
   {label:"ST Group",ok:n(s.group_total)>0,value:n(s.group_total),href:"/st-groups"},
   {label:"Physical Area",ok:n(s.area_total)>0&&n(s.area_group_total)>0,value:n(s.area_total),href:"/area"},
   {label:"Schedule Area",ok:n(s.schedule_total)>0&&n(s.schedule_op_total)>0,value:n(s.schedule_total),href:"/schedule-areas"},
   {label:"Planner",ok:n(s.planner_assigned)>0,value:n(s.planner_assigned),href:"/planner-work-assignment"},
  ];
  const ruleChecks=[
   {label:"Recipe Mapping",ok:n(s.recipe_total)>0&&n(s.recipe_op_total)>0,value:n(s.recipe_op_total),href:"/recipe-operation-map"},
   {label:"Loading / Unloading",ok:n(s.handling_total)>0,value:n(s.handling_total),href:"/recipe-time-loading"},
   {label:"Process Time",ok:n(s.time_total)>0,value:n(s.time_total),href:"/recipe-time-process"},
  ];
  const tracked=[...architecture,...ruleChecks];
  const okCount=tracked.filter(x=>x.ok).length;
  const readiness=tracked.length?Math.round(okCount/tracked.length*100):0;
  const issues:{severity:"critical"|"warning";title:string;detail:string;href:string}[]=[];
  if(n(s.missing_jobs)>0)issues.push({severity:"critical",title:`${n(s.missing_jobs)} Job chưa đủ cấu hình ST`,detail:"Các Job này chưa thể đi vào Planning Board đúng flow.",href:"/st-operation-flow"});
  if(n(s.mapping_missing)>0)issues.push({severity:"critical",title:`${n(s.mapping_missing)} Operation chưa có Main Mapping`,detail:"Source Operation chưa map đầy đủ vào Main Operation.",href:"/master/operationmapping"});
  if(n(s.schedule_total)>0&&n(s.planner_assigned)===0)issues.push({severity:"warning",title:"Schedule Area chưa có Planner",detail:"Scheduling Board chưa xác định ownership theo khu vực.",href:"/planner-work-assignment"});
  if(n(s.recipe_total)===0||n(s.recipe_op_total)===0)issues.push({severity:"critical",title:"Recipe / Batch Rule chưa hoàn chỉnh",detail:"Job có thể không đề xuất được Recipe hoặc không tạo Batch đúng rule.",href:"/recipe-operation-map"});
  if(n(s.handling_total)===0)issues.push({severity:"warning",title:"Thiếu Loading / Unloading Time",detail:"Chemical Line có thể thiếu thời gian handling chuẩn.",href:"/recipe-time-loading"});
  if(n(s.time_total)===0)issues.push({severity:"warning",title:"Thiếu Process Time Rule",detail:"Batch chưa có nguồn thời gian xử lý chuẩn.",href:"/recipe-time-process"});
  return {s,architecture,ruleChecks,readiness,issues,okCount,total:tracked.length};
 },[health]);

 if(!derived){
  return <div className="erp-config-dashboard-loading" aria-busy="true">
   <div className="erp-config-kpi-grid">{Array.from({length:4},(_,i)=><div className="erp-config-kpi skeleton" key={i}/>)}</div>
   <div className="erp-config-dashboard-grid"><div className="erp-panel skeleton tall"/><div className="erp-panel skeleton tall"/></div>
  </div>;
 }

 const {s,architecture,ruleChecks,readiness,issues,okCount,total}=derived;
 const chainPlanning=n(s.chain_planning_total);
 const chainOk=n(s.chain_ok);
 const chainPct=chainPlanning?Math.round(chainOk/chainPlanning*100):0;

 return <div className="erp-config-dashboard">
  <section className="erp-config-dashboard-hero">
   <div>
    <span className="erp-object-eyebrow">Configuration Health</span>
    <h2>System Configuration Readiness</h2>
    <p>Kiểm tra dependency từ Operation Architecture đến Recipe, thời gian và Automation trước khi dữ liệu đi vào Planning.</p>
   </div>
   <div className={`erp-config-readiness ${readiness>=90?"ok":readiness>=70?"warn":"critical"}`}>
    <strong>{readiness}%</strong><span>READY</span><small>{okCount}/{total} control points</small>
   </div>
  </section>

  <div className="erp-config-kpi-grid">
   <div className="erp-config-kpi"><span>Planning Chain</span><b>{chainPct}%</b><small>{chainOk}/{chainPlanning||0} Job đủ chuỗi</small></div>
   <div className="erp-config-kpi"><span>Main Mapping</span><b>{n(s.mapping_total)}</b><small>{n(s.mapping_missing)} thiếu mapping</small></div>
   <div className="erp-config-kpi"><span>Recipe Rules</span><b>{n(s.recipe_op_total)}</b><small>{n(s.recipe_total)} Recipe đang dùng</small></div>
   <div className="erp-config-kpi"><span>Open Job Issues</span><b>{n(s.missing_jobs)}</b><small>Job cần bổ sung cấu hình</small></div>
  </div>

  <section className="erp-panel erp-config-health-panel">
   <div className="erp-panel-head"><div><b>Dependency Architecture</b><small>Luồng chuẩn mà Planning dùng để hiểu một Operation.</small></div><Link href="/st-operation-flow" className="btn small primary">Mở ST Operation Flow</Link></div>
   <div className="erp-config-architecture-chain">
    {architecture.map((item,index)=><div className="erp-config-architecture-node-wrap" key={item.label}>
     <Link href={item.href} className={`erp-config-architecture-node ${item.ok?"ok":"warn"}`}>
      <span>{String(index+1).padStart(2,"0")}</span><b>{item.label}</b><small>{item.value} records</small>
     </Link>
     {index<architecture.length-1&&<i className="erp-config-architecture-arrow" aria-hidden="true">→</i>}
    </div>)}
   </div>
  </section>

  <div className="erp-config-dashboard-grid">
   <section className="erp-panel erp-config-issues-panel">
    <div className="erp-panel-head"><div><b>Issues cần xử lý</b><small>Ưu tiên các dependency ảnh hưởng trực tiếp Planning/Batch.</small></div><span className={`erp-status-pill ${issues.length?"warn":"ok"}`}>{issues.length?`${issues.length} issues`:"Healthy"}</span></div>
    {issues.length?<div className="erp-config-issue-table">
     {issues.map((issue,index)=><Link href={issue.href} key={`${issue.title}-${index}`} className={`erp-config-issue-row ${issue.severity}`}>
      <span className="erp-config-issue-severity">{issue.severity==="critical"?"!":"△"}</span>
      <span><b>{issue.title}</b><small>{issue.detail}</small></span>
      <em>Open</em>
     </Link>)}
    </div>:<div className="erp-config-empty-ok"><b>Không có issue cấu hình chính.</b><span>Architecture, Recipe và Time Rule đều có dữ liệu cơ bản.</span></div>}
   </section>

   <section className="erp-panel erp-config-rule-panel">
    <div className="erp-panel-head"><div><b>Batch & Time Controls</b><small>Các rule quyết định Recipe và thời gian khi tạo Batch.</small></div></div>
    <div className="erp-config-control-list">
     {ruleChecks.map((item,index)=><Link href={item.href} key={item.label} className="erp-config-control-row">
      <span className={`erp-config-control-state ${item.ok?"ok":"warn"}`}/><span><b>{item.label}</b><small>{item.value} records</small></span><em>{item.ok?"Ready":"Check"}</em>
     </Link>)}
     <Link href="/auto-planning-rules" className="erp-config-control-row"><span className="erp-config-control-state idle"/><span><b>Auto Planning Rules</b><small>Automation workspace</small></span><em>Optional</em></Link>
    </div>
   </section>
  </div>

  <section className="erp-panel erp-config-domain-overview">
   <div className="erp-panel-head"><div><b>Configuration Workspaces</b><small>Đi theo domain nghiệp vụ; không cần mở từng trang theo thứ tự nếu chỉ chỉnh một rule độc lập.</small></div></div>
   <div className="erp-config-domain-card-grid">
    {CONFIG_FLOW.map((group,index)=>{
     const tracked=group.items.filter(x=>x.statusKey);
     const ready=tracked.filter(x=>healthStatus(s,x.statusKey)==="ok").length;
     return <article className="erp-config-domain-card" key={group.tier}>
      <div className="erp-config-domain-card-head"><span>{String(index+1).padStart(2,"0")}</span><div><b>{group.tier.replace(/^\d+\s*·\s*/,"")}</b><small>{group.hint}</small></div></div>
      <div className="erp-config-domain-card-health"><span>{tracked.length?`${ready}/${tracked.length} ready`:"Optional workspace"}</span><i><u style={{width:`${tracked.length?Math.round(ready/tracked.length*100):100}%`}}/></i></div>
      <div className="erp-config-domain-card-links">{group.items.map(item=><Link key={item.key} href={item.href}>{item.label}<span>→</span></Link>)}</div>
     </article>;
    })}
   </div>
  </section>
 </div>;
}
