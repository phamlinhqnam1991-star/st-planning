import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {InternalChatClient} from "@/components/internal-chat-client";

export const dynamic="force-dynamic";

export default function Page(){
 return <main className="erp-shell erpkit-migrated-page">
  <ErpAppHeader module="INTERNAL CHAT"/>
  <AppTabs active="chat"/>
  <section className="erp-content erp-content-full internal-chat-page">
   <div className="erp-page-head"><div><div className="erp-object-eyebrow">OPERATIONS · TEAM COMMUNICATION</div><h2>Internal Chat</h2><p>One ST Planning group for team conversation, direct user-to-user chat, and automatic Planning / Scheduling / Production change notifications.</p></div></div>
   <div className="production-source-note"><b>Chat supplements existing alerts</b><span>Production Change Alerts, handover attention, Daily Production Adjustment and audit history remain the source workflows. Chat adds immediate communication and notification only; it does not approve or change Planning/Schedule data by itself.</span></div>
   <InternalChatClient/>
  </section>
 </main>;
}
