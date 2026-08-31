"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {
  CONFIG_FLOW,
  healthStatus,
  type ConfigHealth,
} from "@/lib/config/config-flow";
import {
  CONFIG_HEALTH_INVALIDATED_EVENT,
  loadConfigHealth,
  primeConfigHealth,
} from "@/lib/config/config-client";

type Props={
  active:string;
  initialHealth?:Partial<ConfigHealth>;
};

export function ConfigSidebar({active,initialHealth}:Props){
  const [health,setHealth]=useState<Partial<ConfigHealth>>(initialHealth||{});

  useEffect(()=>{
    let cancelled=false;

    const load=async(fresh=false)=>{
      try{
        const data=await loadConfigHealth(fresh);
        if(!cancelled)setHealth(data);
      }catch{
        // Health is a secondary status indicator; never block config navigation.
      }
    };

    // Optional server-provided health can prime the shared client cache.
    if(initialHealth&&Object.keys(initialHealth).length>0){
      primeConfigHealth(initialHealth);
      setHealth(initialHealth);
    }else{
      void load(false);
    }

    const onInvalidated=()=>{void load(false)};
    window.addEventListener(CONFIG_HEALTH_INVALIDATED_EVENT,onInvalidated);
    return ()=>{
      cancelled=true;
      window.removeEventListener(CONFIG_HEALTH_INVALIDATED_EVENT,onInvalidated);
    };
  },[initialHealth]);

  return <aside className="erp-sidebar">
    <div className="erp-sidebar-title">CẤU HÌNH · THEO LUỒNG</div>
    <nav className="erp-subnav" aria-label="Cấu hình navigation">
      {CONFIG_FLOW.map(g=><div key={g.tier} className="config-nav-group">
        <div className="config-nav-group-title">{g.tier} <em>{g.tag}</em></div>
        {g.hint&&<div className="config-nav-hint">{g.hint}</div>}
        {g.items.map(x=>{
          const st=healthStatus(health,x.statusKey);
          return <Link key={x.key} href={x.href} className={`erp-subnav-item flow-item ${active===x.key?"active":""}`}>
            <span className={`flow-no ${st}`}>{x.no??(x.key==="chain"?"✓":"◎")}</span>
            <span className="flow-label">{x.label}</span>
            <span className={`flow-dot ${st}`} title={st==="ok"?"Đã đủ":st==="warn"?"Cần bổ sung":"Đang tải trạng thái"}/>
          </Link>;
        })}
      </div>)}
    </nav>
  </aside>;
}
