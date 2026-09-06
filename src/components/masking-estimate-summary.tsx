import type {BatchMaskingEstimate} from "@/lib/masking-time-estimate";

function hhmm(minutes:number|null){
 if(minutes==null)return "—";
 const n=Math.max(0,Math.round(minutes));
 return `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
}
function time(v:string|null){
 if(!v)return "—";
 const d=new Date(v);if(Number.isNaN(d.getTime()))return "—";
 return d.toLocaleTimeString("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"});
}
function fmt(v:number,max=2){return new Intl.NumberFormat("vi-VN",{maximumFractionDigits:max}).format(Number(v||0));}

export function MaskingEstimateSummary({estimate,plannedStart,compact=false}:{estimate?:BatchMaskingEstimate|null;plannedStart?:string|null;compact?:boolean}){
 if(!estimate?.configured)return null;
 const readyMs=estimate.estimatedReady?new Date(estimate.estimatedReady).getTime():Number.NaN;
 const startMs=plannedStart?new Date(plannedStart).getTime():Number.NaN;
 const notReady=Number.isFinite(readyMs)&&Number.isFinite(startMs)&&startMs<readyMs;
 const manpower=estimate.breakdown
  .filter(x=>x.allocatedPeople>0)
  .map(x=>`${x.areaName}: ${fmt(x.allocatedPeople,1)}`)
  .filter((x,i,a)=>a.indexOf(x)===i)
  .join(" · ");
 const title=[
  ...estimate.breakdown.map(x=>`${x.sourceColumn}: ${fmt(x.workloadHours)} PH / ${fmt(x.allocatedPeople,1)} people = ${hhmm(x.estimatedMinutes)}`),
  ...estimate.warnings
 ].join("\n");
 return <div className={`masking-estimate-summary ${compact?"compact":""} ${notReady?"is-not-ready":""}`} title={title}>
  <div className="masking-estimate-summary-head"><b>MASKING EST.</b>{notReady?<em>NOT READY</em>:null}</div>
  <div className="masking-estimate-summary-metric"><strong>{hhmm(estimate.estimatedMinutes)}</strong><span>{fmt(estimate.workloadHours)} PH{manpower?` · ${manpower}`:""}</span></div>
  {estimate.estimatedReady?<small>Ready: <b>{time(estimate.estimatedReady)}</b>{notReady&&plannedStart?` · Schedule ${time(plannedStart)}`:""}</small>:<small>{estimate.estimatedMinutes==null?"Chưa đủ manpower để tính duration":"Cần Previous Main End để tính Ready"}</small>}
  {(estimate.missingJobs>0||estimate.invalidJobs>0)&&<small className="masking-estimate-warning">Data: {estimate.missingJobs>0?`${estimate.missingJobs} trống`:""}{estimate.missingJobs>0&&estimate.invalidJobs>0?" · ":""}{estimate.invalidJobs>0?`${estimate.invalidJobs} lỗi`:""}</small>}
 </div>;
}
