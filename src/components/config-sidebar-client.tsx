"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {CONFIG_FLOW,healthStatus,type ConfigHealth} from "@/lib/config/config-flow";
import {CONFIG_HEALTH_INVALIDATED_EVENT,loadConfigHealth,primeConfigHealth} from "@/lib/config/config-client";

type Props={active:string;initialHealth?:Partial<ConfigHealth>};

export function ConfigSidebar({active,initialHealth}:Props){
 const [health,setHealth]=useState<Partial<ConfigHealth>>(initialHealth||{});
 const [query,setQuery]=useState("");
 useEffect(()=>{
  let cancelled=false;
  const load=async(fresh=false)=>{
   try{const data=await loadConfigHealth(fresh);if(!cancelled)setHealth(data);}catch{}
  };
  if(initialHealth&&Object.keys(initialHealth).length){primeConfigHealth(initialHealth);setHealth(initialHealth);}else void load(false);
  const onInvalidated=()=>{void load(false)};
  window.addEventListener(CONFIG_HEALTH_INVALIDATED_EVENT,onInvalidated);
  return ()=>{cancelled=true;window.removeEventListener(CONFIG_HEALTH_INVALIDATED_EVENT,onInvalidated)};
 },[initialHealth]);

 const metrics=useMemo(()=>{
  const items=CONFIG_FLOW.flatMap(g=>g.items).filter(x=>x.statusKey);
  const ok=items.filter(x=>healthStatus(health,x.statusKey)==="ok").length;
  const warn=items.filter(x=>healthStatus(health,x.statusKey)==="warn").length;
  const pct=items.length?Math.round(ok/items.length*100):0;
  return {ok,warn,total:items.length,pct};
 },[health]);

 return <aside className="erp-sidebar erp-config-sidebar erp-config-workcenter-nav">
  <div className="erp-config-rail-head">
   <div>
    <span className="erp-sidebar-title">CONFIGURATION</span>
    <small>Work Center</small>
   </div>
   <div className="erp-config-health-ring" aria-label={`Configuration readiness ${metrics.pct}%`}>
    <b>{metrics.pct}%</b><span>ready</span>
   </div>
  </div>

  <Link href="/settings" className={`erp-config-home ${active==="overview"?"active":""}`}>
   <span className="erp-config-home-mark">H</span>
   <span><b>Health Dashboard</b><small>{metrics.warn?`${metrics.warn} mục cần kiểm tra`:`${metrics.ok}/${metrics.total} mục sẵn sàng`}</small></span>
  </Link>

  <div className="erp-config-nav-search">
   <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm cấu hình..." aria-label="Tìm cấu hình"/>
   {query&&<button type="button" onClick={()=>setQuery("")} aria-label="Xóa tìm kiếm">×</button>}
  </div>

  <nav className="erp-config-domain-nav" aria-label="Configuration workspaces">
   {CONFIG_FLOW.map((group,index)=>{
    const q=query.trim().toLowerCase();
    const visibleItems=q?group.items.filter(x=>(`${group.tier} ${group.tag} ${group.hint||""} ${x.label}`).toLowerCase().includes(q)):group.items;
    if(!visibleItems.length)return null;
    const tracked=group.items.filter(x=>x.statusKey);
    const ok=tracked.filter(x=>healthStatus(health,x.statusKey)==="ok").length;
    const activeGroup=group.items.some(x=>x.key===active);
    return <section key={group.tier} className={`erp-config-domain ${activeGroup?"active":""}`}>
     <header className="erp-config-domain-head">
      <span className="erp-config-domain-no">{String(index+1).padStart(2,"0")}</span>
      <span className="erp-config-domain-title"><b>{group.tier.replace(/^\d+\s*·\s*/,"")}</b><small>{group.tag}</small></span>
      {tracked.length>0&&<span className={`erp-config-domain-health ${ok===tracked.length?"ok":"warn"}`}>{ok}/{tracked.length}</span>}
     </header>
     {group.hint&&<p className="erp-config-domain-hint">{group.hint}</p>}
     <div className="erp-config-domain-items">
      {visibleItems.map(item=>{
       const st=healthStatus(health,item.statusKey);
       return <Link key={item.key} href={item.href} className={`erp-config-domain-item ${active===item.key?"active":""}`} aria-current={active===item.key?"page":undefined}>
        <span className="erp-config-item-order">{item.no??"—"}</span>
        <span className="erp-config-item-label">{item.label}</span>
        <span className={`erp-config-item-state ${st}`} title={st==="ok"?"Sẵn sàng":st==="warn"?"Cần bổ sung":"Không yêu cầu health check"}/>
       </Link>;
      })}
     </div>
    </section>;
   })}
  </nav>
 </aside>;
}
