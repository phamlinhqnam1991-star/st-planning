import Link from "next/link";
import {ST_ERP_MODULES} from "@/lib/erp/st-navigation";

export type AppTab="master"|"config"|"tracker"|"jobtracker"|"jobs"|"planning"|"masking"|"schedule"|"import"|"guide";

export function AppTabs({active}:{active:AppTab}){
 const tabs=ST_ERP_MODULES.map(item=>({
  key:item.key as AppTab,
  label:item.label,
  short:item.shortLabel??item.label.slice(0,2).toUpperCase(),
  href:item.href
 }));
 return <nav className="erp-modules" aria-label="ST Planning modules">
  {tabs.map(t=><Link key={t.key} href={t.href} className={`erp-module ${active===t.key?"active":""}`} aria-current={active===t.key?"page":undefined}><span className="erp-module-short">{t.short}</span><span className="erp-module-label">{t.label}</span></Link>)}
 </nav>
}

export function SubTabs({items,active}:{items:{label:string;href:string;key:string}[];active?:string}){
 return <nav className="erp-subnav" aria-label="Section navigation">
  {items.map(x=><Link key={x.key} href={x.href} className={`erp-subnav-item ${active===x.key?"active":""}`} aria-current={active===x.key?"page":undefined}>{x.label}</Link>)}
 </nav>
}
