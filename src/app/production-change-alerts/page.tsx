import Link from "next/link";
import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {ProductionChangeAlertsClient} from "@/components/production-change-alerts-client";
import {getPool} from "@/lib/db";
import {getProductionDateString} from "@/lib/schedule-time";
import {loadProductionChangeAlerts} from "@/lib/production-change-alerts";

export const dynamic="force-dynamic";
const safe=(v:unknown,f:string)=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||""))?String(v):f;
const shift=(d:string,n:number)=>{const x=new Date(`${d}T00:00:00Z`);x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
const display=(d:string)=>new Intl.DateTimeFormat("en-GB",{timeZone:"UTC",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(`${d}T00:00:00Z`));

export default async function Page({searchParams}:{searchParams:Promise<{date?:string}>}){
 const sp=await searchParams;const current=getProductionDateString(new Date());const date=safe(sp.date,current);const c=await getPool().connect();let items:any[]=[];let error="";
 try{items=await loadProductionChangeAlerts(c,date);}catch(e){error=e instanceof Error?e.message:String(e);}finally{c.release();}
 return <main className="erp-shell erpkit-migrated-page"><ErpAppHeader module="PRODUCTION CHANGE ALERTS"/><AppTabs active="productionalerts"/>
  <section className="erp-content erp-content-full"><div className="erp-page-head"><div><div className="erp-object-eyebrow">OPERATIONS · PRODUCTION CHANGE TRACE</div><h2>Cảnh báo thay đổi bởi Sản xuất</h2><p>Tập trung tất cả Job được Production thêm ngoài lô và toàn bộ ảnh hưởng downstream để planner đọc vào hiểu ngay: Job nào thay đổi, lô nào bị thay đổi, Main kế tiếp nào phải nhận, Batch/Resource/Planner nào đang bị ảnh hưởng.</p></div><div className="production-date-nav"><Link className="btn" href={`/production-change-alerts?date=${shift(date,-1)}`}>‹ Previous</Link><span>{display(date)}</span><Link className="btn" href={`/production-change-alerts?date=${shift(date,1)}`}>Next ›</Link>{date!==current?<Link className="btn primary" href={`/production-change-alerts?date=${current}`}>Today</Link>:null}</div></div>
  <div className="production-source-note"><b>Chỉ cảnh báo thay đổi phát sinh từ Production</b><span>Tab này là read-only audit/alert. Không sửa Batch hoặc Schedule tại đây. Các Job thêm trực tiếp và các Job được truyền từ Previous Main đều được theo dõi xuyên chuỗi.</span></div>
  {error?<div className="notice error">{error}</div>:<ProductionChangeAlertsClient items={items}/>}</section></main>;
}
