import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {InternalChatClient} from "@/components/internal-chat-client";
import {getAccessContext} from "@/lib/security/access";

export const dynamic="force-dynamic";

export default async function Page(){
 const access=await getAccessContext();
 return <main className="erp-shell erpkit-migrated-page">
  <ErpAppHeader module="INTERNAL CHAT"/>
  <AppTabs active="chat"/>
  <section className="erp-content erp-content-full internal-chat-page">
   <div className="erp-page-head"><div><div className="erp-object-eyebrow">OPERATIONS · TEAM COMMUNICATION</div><h2>Internal Chat</h2><p>One ST Planning group for team conversation and automatic change notifications. Cross-planner impacts are highlighted so Planner 1 and Planner 2 can see changes that affect each other.</p></div></div>
   <div className="production-source-note"><b>Chat supplements existing alerts</b><span>Production Change Alerts, handover attention, Daily Production Adjustment and audit history remain the source workflows. Chat adds a shared communication channel; it does not approve or change Planning/Schedule data by itself.</span></div>
   <InternalChatClient canSend={Boolean(access?.permissions.has("chat.send"))}/>
  </section>
 </main>;
}
