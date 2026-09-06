import type {BatchMaskingEstimate} from "@/lib/masking-time-estimate";

function hhmm(minutes:number|null){
 if(minutes==null)return "—";
 const n=Math.max(0,Math.round(minutes));
 return `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;
}
function fmt(v:number,max=2){return new Intl.NumberFormat("vi-VN",{maximumFractionDigits:max}).format(Number(v||0));}

export function MaskingEstimateSummary({estimate,plannedStart,compact=false}:{estimate?:BatchMaskingEstimate|null;plannedStart?:string|null;compact?:boolean}){
 if(!estimate?.configured)return null;
 const readyMs=estimate.estimatedReady?new Date(estimate.estimatedReady).getTime():Number.NaN;
 const startMs=plannedStart?new Date(plannedStart).getTime():Number.NaN;
 const notReady=Number.isFinite(readyMs)&&Number.isFinite(startMs)&&startMs<readyMs;
 const title=[
  ...estimate.breakdown.map(x=>`${x.sourceColumn}: ${fmt(x.workloadHours)} PH / ${fmt(x.allocatedPeople,1)} people = ${hhmm(x.estimatedMinutes)}`),
  ...estimate.warnings
 ].join("\n");
 return <div className={`masking-estimate-summary ${compact?"compact":""} ${notReady?"is-not-ready":""}`} title={title}>
  <span>Masking time <b>{hhmm(estimate.estimatedMinutes)}</b></span>
 </div>;
}
