import Link from "next/link";
import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {ProductionExecutionClient} from "@/components/production-execution-client";
import {getPool} from "@/lib/db";
import {loadProductionExecution} from "@/lib/production-execution";
import {getProductionDateString} from "@/lib/schedule-time";

export const dynamic="force-dynamic";

function safeDate(v:unknown,fallback:string){const x=String(v??"").trim();return /^\d{4}-\d{2}-\d{2}$/.test(x)?x:fallback;}
function shiftDate(value:string,days:number){const d=new Date(`${value}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function displayDate(value:string){const d=new Date(`${value}T00:00:00Z`);return new Intl.DateTimeFormat("en-GB",{timeZone:"UTC",day:"2-digit",month:"2-digit",year:"numeric"}).format(d);}

export default async function Page({searchParams}:{searchParams:Promise<{date?:string}>}){
 const sp=await searchParams;
 const current=getProductionDateString(new Date());
 const date=safeDate(sp.date,current);
 const prev=shiftDate(date,-1),next=shiftDate(date,1);
 const c=await getPool().connect();
 let items=[] as Awaited<ReturnType<typeof loadProductionExecution>>;let error="";
 try{items=await loadProductionExecution(c,{scheduleDate:date});}catch(e){error=e instanceof Error?e.message:String(e);}finally{c.release();}
 return <main className="erp-shell erpkit-migrated-page">
  <ErpAppHeader module="PRODUCTION EXECUTION"/>
  <AppTabs active="production"/>
  <section className="erp-content erp-content-full production-execution-page">
   <div className="erp-page-head production-page-head"><div><div className="erp-object-eyebrow">OPERATIONS · EXECUTION</div><h2>Production Execution</h2><p>Production day 06:00 → 06:00 next day · Scheduled production + Masking / Unmasking worklist · report WAITING → ON-GOING → DONE without changing Planning or Schedule status.</p></div><div className="production-date-nav"><Link className="btn" href={`/production-execution?date=${prev}`}>‹ Previous</Link><span>{displayDate(date)}</span><Link className="btn" href={`/production-execution?date=${next}`}>Next ›</Link>{date!==current?<Link className="btn primary" href={`/production-execution?date=${current}`}>Today</Link>:null}</div></div>
   <div className="production-source-note"><b>Source of truth</b><span>Scheduling Board provides Batch / Resource / Planned Time. Masking / Unmasking provides support work. This page stores only execution status and Actual Start/End.</span></div>
   {error?<div className="notice error"><b>Unable to load Production Execution:</b> {error}</div>:<ProductionExecutionClient initialItems={items}/>}
  </section>
 </main>;
}
