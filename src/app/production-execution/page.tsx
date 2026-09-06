import Link from "next/link";
import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {ProductionExecutionClient} from "@/components/production-execution-client";
import {getPool} from "@/lib/db";
import {loadProductionExecution,loadProductionRemoveImpacts} from "@/lib/production-execution";
import {getProductionDateString} from "@/lib/schedule-time";
import {getAccessContext} from "@/lib/security/access";

export const dynamic="force-dynamic";

function safeDate(v:unknown,fallback:string){const x=String(v??"").trim();return /^\d{4}-\d{2}-\d{2}$/.test(x)?x:fallback;}
function shiftDate(value:string,days:number){const d=new Date(`${value}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function displayDate(value:string){const d=new Date(`${value}T00:00:00Z`);return new Intl.DateTimeFormat("en-GB",{timeZone:"UTC",day:"2-digit",month:"2-digit",year:"numeric"}).format(d);}

export default async function Page({searchParams}:{searchParams:Promise<{date?:string}>}){
 const sp=await searchParams;
 const current=getProductionDateString(new Date());
 const date=safeDate(sp.date,current);
 const prev=shiftDate(date,-1),next=shiftDate(date,1);
 const access=await getAccessContext();
 const c=await getPool().connect();
 let items=[] as Awaited<ReturnType<typeof loadProductionExecution>>;
 let removeImpacts=[] as Awaited<ReturnType<typeof loadProductionRemoveImpacts>>;
 let error="";
 try{
  items=await loadProductionExecution(c,{scheduleDate:date});
  const areaScope=access?.scopes.PRODUCTION_AREA||new Set<string>();
  if(areaScope.size){
   const aq=await c.query(`select area_name from md_area where upper(area_code)=any($1::text[])`,[[...areaScope].map(x=>x.toUpperCase())]);
   const allowed=new Set(aq.rows.map((r:any)=>String(r.area_name||"").trim().toUpperCase()));
   items=items.filter(x=>allowed.has(String(x.area||"").trim().toUpperCase()));
  }
  try{
   removeImpacts=await loadProductionRemoveImpacts(c,items.filter(x=>x.sourceType==="BATCH").map(x=>x.batchId));
  }catch{
   // V511 fail-open: an impact-panel read error must not block the Production Report.
   removeImpacts=[];
  }
 }catch(e){error=e instanceof Error?e.message:String(e);}finally{c.release();}
 return <main className="erp-shell erpkit-migrated-page">
  <ErpAppHeader module="PRODUCTION EXECUTION"/>
  <AppTabs active="production"/>
  <section className="erp-content erp-content-full production-execution-page">
   <div className="erp-page-head production-page-head"><div><div className="erp-object-eyebrow">OPERATIONS · EXECUTION</div><h2>Production Execution</h2><p>Production day 06:00 → 05:59 next day · all work is owned by planned start · Job-level WAITING → ON-GOING → DONE reporting without changing Planning or Schedule status.</p></div><div className="production-date-nav"><Link className="btn" href={`/production-execution?date=${prev}`}>‹ Previous</Link><span>{displayDate(date)}</span><Link className="btn" href={`/production-execution?date=${next}`}>Next ›</Link>{date!==current?<Link className="btn primary" href={`/production-execution?date=${current}`}>Today</Link>:null}</div></div>
   <div className="production-source-note"><b>Source of truth</b><span>Scheduling Board provides Batch / Resource / Planned Time. Masking / Unmasking provides support work. This page stores only execution status and Actual Start/End.</span></div>
   {error?<div className="notice error"><b>Unable to load Production Execution:</b> {error}</div>:<ProductionExecutionClient key={date} productionDate={date} initialItems={items} initialRemoveImpacts={removeImpacts} canReport={Boolean(access?.permissions.has("production.report"))} canAddJob={Boolean(access?.permissions.has("production.add_job"))}/>}
  </section>
 </main>;
}
