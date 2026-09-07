import Link from "next/link";
import {
 getAuthorizedModuleGroups,
 getStErpModuleKey,
 type StErpLeafKey,
} from "@/lib/erp/st-navigation";
import {getAccessContext} from "@/lib/security/access";
import {PAGE_PERMISSION} from "@/lib/security/permissions";
import {redirect} from "next/navigation";
import {ChatUnreadBadge} from "@/components/chat-unread-badge";

export type AppTab=StErpLeafKey;

/**
 * Canonical ERP two-level navigation:
 * Level 1: business module/work center.
 * Level 2: functions that belong to the selected module.
 */
export async function AppTabs({active}:{active:AppTab}){
 const access=await getAccessContext();
 if(!access)redirect("/login");
 if(!access.active)redirect("/access-denied?reason=inactive");
 const required=PAGE_PERMISSION[active];
 if(required&&!access.permissions.has(required))redirect("/access-denied");
 const groups=getAuthorizedModuleGroups(access);
 const activeModule=getStErpModuleKey(active);
 return <aside className="erp-navigation-stack erp-navigation-vertical" aria-label="Điều hướng ERP">
  <div className="erp-navigation-caption">WORK CENTERS</div>
  <nav className="erp-modules erp-modules-primary erp-modules-all" aria-label="ST Planning modules">
   {groups.map(module=><section key={module.key} className="erp-navigation-module-group">
    <Link
     href={module.href}
     className={`erp-module ${activeModule===module.key?"active":""}`}
     aria-current={activeModule===module.key?"page":undefined}
    >
     <span className="erp-module-short">{module.shortLabel}</span>
     <span className="erp-module-label">{module.label}</span>
    </Link>
    {module.items.length>0?<div className="erp-module-context-items erp-module-context-items-always">
     {module.items.map(item=><Link
      key={item.key}
      href={item.href}
      className={`erp-module-context-item ${active===item.key?"active":""}`}
      aria-current={active===item.key?"page":undefined}
     ><span>{item.label}</span>{item.key==="chat"?<ChatUnreadBadge/>:null}</Link>)}
    </div>:null}
   </section>)}
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
