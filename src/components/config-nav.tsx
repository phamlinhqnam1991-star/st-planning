import Link from "next/link";
import {ConfigSidebar} from "@/components/config-sidebar-client";

export {ConfigSidebar};
export {CONFIG_FLOW,healthStatus} from "@/lib/config/config-flow";
export type {ConfigFlowItem,ConfigHealth} from "@/lib/config/config-flow";

export function ConfigPageHeader({
 title,subtitle,purpose,impact,prev,next,
}: {
 title:string;subtitle?:string;purpose:string;impact:string;
 prev?:{label:string;href:string};next?:{label:string;href:string};
}){
 return <section className="erp-config-object-header" aria-label={`Cấu hình ${title}`}>
  <div className="erp-config-object-topline">
   <div className="erp-config-breadcrumb"><Link href="/settings">Configuration</Link><span>/</span><b>{title}</b></div>
   <span className="erp-config-object-state">CURRENT CONFIGURATION</span>
  </div>
  <div className="erp-page-head erp-config-page-head">
   <div>
    <div className="erp-object-eyebrow">Configuration Workspace</div>
    <h2>{title}</h2>
    {subtitle?<p>{subtitle}</p>:null}
   </div>
   {(prev||next)&&<div className="config-flow-nav erp-command-actions">
    {prev&&<Link className="btn small" href={prev.href}><span aria-hidden="true">←</span> {prev.label}</Link>}
    {next&&<Link className="btn small primary" href={next.href}>{next.label} <span aria-hidden="true">→</span></Link>}
   </div>}
  </div>
  <div className="erp-config-context-grid">
   <div className="erp-context-card"><span className="erp-context-label">MỤC ĐÍCH</span><strong>{purpose}</strong></div>
   <div className="erp-context-card"><span className="erp-context-label">ẢNH HƯỞNG PHÍA SAU</span><strong>{impact}</strong></div>
  </div>
 </section>;
}
