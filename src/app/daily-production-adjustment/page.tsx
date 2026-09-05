import Link from "next/link";
import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {DailyProductionAdjustmentClient} from "@/components/daily-production-adjustment-client";
import {getPool} from "@/lib/db";
import {getProductionDateString} from "@/lib/schedule-time";
import {loadAdjustmentData} from "@/lib/daily-production-adjustment";

export const dynamic="force-dynamic";
const safeDate=(v:unknown,f:string)=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||""))?String(v):f;
const shift=(d:string,n:number)=>{const x=new Date(`${d}T00:00:00Z`);x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
const display=(d:string)=>new Intl.DateTimeFormat("en-GB",{timeZone:"UTC",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(`${d}T00:00:00Z`));

export default async function Page({searchParams}:{searchParams:Promise<{date?:string}>}){
 const sp=await searchParams;const current=getProductionDateString(new Date());const date=safeDate(sp.date,current);const c=await getPool().connect();let data:any={set:null,items:[]};let error="";
 try{data=await loadAdjustmentData(c,date);}catch(e){error=e instanceof Error?e.message:String(e);}finally{c.release();}
 return <main className="erp-shell erpkit-migrated-page"><ErpAppHeader module="DAILY PRODUCTION ADJUSTMENT"/><AppTabs active="adjustment"/>
  <section className="erp-content erp-content-full"><div className="erp-page-head"><div><div className="erp-object-eyebrow">OPERATIONS · RECONCILIATION</div><h2>Điều chỉnh đầu ngày</h2><p>Đối soát Production Report trước 05:59 → Carry Over, bớt Job chưa làm, thêm Job ngoài lô và cascade lịch qua Main/Planner/Resource.</p></div><div className="production-date-nav"><Link className="btn" href={`/daily-production-adjustment?date=${shift(date,-1)}`}>‹ Previous</Link><span>{display(date)}</span><Link className="btn" href={`/daily-production-adjustment?date=${shift(date,1)}`}>Next ›</Link>{date!==current?<Link className="btn primary" href={`/daily-production-adjustment?date=${current}`}>Today</Link>:null}</div></div>
  {error?<div className="notice error">{error}</div>:<DailyProductionAdjustmentClient key={date} productionDate={date} initialData={data}/>}</section></main>;
}
