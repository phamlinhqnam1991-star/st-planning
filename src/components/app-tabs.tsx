import Link from "next/link";
import {
 ST_ERP_MODULE_GROUPS,
 getStErpModuleItems,
 getStErpModuleKey,
 type StErpLeafKey,
} from "@/lib/erp/st-navigation";

export type AppTab=StErpLeafKey;

/**
 * Canonical ERP two-level navigation:
 * Level 1: business module/work center.
 * Level 2: functions that belong to the selected module.
 */
export function AppTabs({active}:{active:AppTab}){
 const activeModule=getStErpModuleKey(active);
 const functions=getStErpModuleItems(activeModule);
 const moduleLabel=ST_ERP_MODULE_GROUPS.find(x=>x.key===activeModule)?.label||"Workspace";
 return <aside className="erp-navigation-stack erp-navigation-vertical" aria-label="Điều hướng ERP">
  <div className="erp-navigation-caption">WORK CENTERS</div>
  <nav className="erp-modules erp-modules-primary" aria-label="ST Planning modules">
   {ST_ERP_MODULE_GROUPS.map(module=><Link
    key={module.key}
    href={module.href}
    className={`erp-module ${activeModule===module.key?"active":""}`}
    aria-current={activeModule===module.key?"page":undefined}
   >
    <span className="erp-module-short">{module.shortLabel}</span>
    <span className="erp-module-label">{module.label}</span>
   </Link>)}
  </nav>
  <nav className="erp-module-context" aria-label={`${ST_ERP_MODULE_GROUPS.find(x=>x.key===activeModule)?.label||"Module"} functions`}>
   <span className="erp-module-context-title">{moduleLabel.toUpperCase()}</span>
   <div className="erp-module-context-items">
    {functions.map(item=><Link
     key={item.key}
     href={item.href}
     className={`erp-module-context-item ${active===item.key?"active":""}`}
     aria-current={active===item.key?"page":undefined}
    >{item.label}</Link>)}
   </div>
  </nav>
 </aside>;
}

export function SubTabs({items,active}:{items:{label:string;href:string;key:string;group?:string}[];active?:string}){
 const hasGroups=items.some(item=>item.group);
 if(!hasGroups){
  return <nav className="erp-subnav" aria-label="Section navigation">
   {items.map(x=><Link key={x.key} href={x.href} className={`erp-subnav-item ${active===x.key?"active":""}`} aria-current={active===x.key?"page":undefined}>{x.label}</Link>)}
  </nav>;
 }
 const groups:Array<{name:string;items:typeof items}>=[];
 for(const item of items){
  const name=item.group||"Khác";
  let group=groups.find(x=>x.name===name);
  if(!group){group={name,items:[]};groups.push(group);}
  group.items.push(item);
 }
 return <nav className="erp-subnav erp-subnav-grouped" aria-label="Section navigation">
  {groups.map(group=><section key={group.name} className="erp-subnav-group">
   <div className="erp-subnav-group-title">{group.name}</div>
   {group.items.map(x=><Link key={x.key} href={x.href} className={`erp-subnav-item ${active===x.key?"active":""}`} aria-current={active===x.key?"page":undefined}>{x.label}</Link>)}
  </section>)}
 </nav>;
}
