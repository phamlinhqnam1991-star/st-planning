import {AppTabs} from "@/components/app-tabs";
import {ErpAppHeader} from "@/components/erp/erp-app-header";

export function ConfigRouteLoading(){
 return <main className="erp-shell erpkit-migrated-page" aria-busy="true">
  <ErpAppHeader module="CONFIGURATION"/>
  <AppTabs active="config"/>
  <div className="erp-workspace">
   <aside className="erp-sidebar">
    <div className="erp-sidebar-title">CẤU HÌNH · THEO LUỒNG</div>
    <div style={{padding:"8px 10px",display:"grid",gap:8}}>
     {Array.from({length:10},(_,i)=><div key={i} style={{height:30,borderRadius:6,background:"rgba(148,163,184,.14)"}}/>)}
    </div>
   </aside>
   <section className="erp-content">
    <div className="erp-page-head"><div><h2>Đang tải cấu hình…</h2></div></div>
    <div className="card" style={{minHeight:180}}>
     <div style={{height:18,width:"35%",borderRadius:6,background:"rgba(148,163,184,.18)",marginBottom:14}}/>
     {Array.from({length:5},(_,i)=><div key={i} style={{height:28,borderRadius:5,background:"rgba(148,163,184,.12)",marginBottom:8}}/>)}
    </div>
   </section>
  </div>
 </main>;
}
