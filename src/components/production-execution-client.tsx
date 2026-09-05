"use client";

import {useMemo,useState} from "react";
import {useUiLanguage} from "@/components/i18n/ui-language-provider";
import {safeJson} from "@/lib/fetch-json";
import {pushAppToast} from "@/components/app-toast-provider";
import type {ProductionExecutionStatus,ProductionWorkItem,ProductionJobDetail,ProductionReportGroup} from "@/lib/production-execution";

const statusOrder:ProductionExecutionStatus[]=["WAITING","ON-GOING","DONE"];
const statusClass=(status:ProductionExecutionStatus)=>status==="DONE"?"done":status==="ON-GOING"?"ongoing":"waiting";

type GroupFilter="ALL"|ProductionReportGroup;
type DisplayGroup={key:string;title:string;subtitle:string;rows:ProductionWorkItem[];tone:string;order:number};

export function ProductionExecutionClient({initialItems,productionDate}:{initialItems:ProductionWorkItem[];productionDate:string}){
 const {locale,text}=useUiLanguage();
 const [items,setItems]=useState(initialItems);
 const [search,setSearch]=useState("");
 const [status,setStatus]=useState<"ALL"|ProductionExecutionStatus>("ALL");
 const [reportGroup,setReportGroup]=useState<GroupFilter>("ALL");
 const [busy,setBusy]=useState("");
 const [extraJobByBatch,setExtraJobByBatch]=useState<Record<number,string>>({});

 const fmt=(v:number,max=2)=>new Intl.NumberFormat(locale==="vi"?"vi-VN":"en-US",{maximumFractionDigits:max}).format(Number(v||0));
 const dt=(v:string|null)=>{
  if(!v)return "—";
  const d=new Date(v);if(Number.isNaN(d.getTime()))return "—";
  return new Intl.DateTimeFormat(locale==="vi"?"vi-VN":"en-GB",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(d);
 };
 const tm=(v:string|null)=>{
  if(!v)return "—";
  const d=new Date(v);if(Number.isNaN(d.getTime()))return "—";
  return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hour12:false}).format(d);
 };
 const localDate=(v:string|null)=>{
  if(!v)return "";
  const d=new Date(v);if(Number.isNaN(d.getTime()))return "";
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
  const y=parts.find(x=>x.type==="year")?.value||"";
  const m=parts.find(x=>x.type==="month")?.value||"";
  const day=parts.find(x=>x.type==="day")?.value||"";
  return y&&m&&day?`${y}-${m}-${day}`:"";
 };
 const targetDisplay=(v:string|null)=>{
  if(!v)return "—";
  const local=localDate(v);
  const time=tm(v);
  if(!local||local===productionDate)return time;
  const d=local.split("-");
  return d.length===3?`${d[2]}/${d[1]} ${time}`:time;
 };
 const shiftFor=(v:string|null)=>{
  if(!v)return {label:"—",title:""};
  const d=new Date(v);if(Number.isNaN(d.getTime()))return {label:"—",title:""};
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(d);
  const hh=Number(parts.find(x=>x.type==="hour")?.value||0);
  const mm=Number(parts.find(x=>x.type==="minute")?.value||0);
  const minutes=hh*60+mm;
  if(minutes>=360&&minutes<840)return {label:text("Shift 1","Ca 1"),title:"06:00–14:00"};
  if(minutes>=840&&minutes<1320)return {label:text("Shift 2","Ca 2"),title:"14:00–22:00"};
  return {label:text("Shift 3","Ca 3"),title:"22:00–05:59"};
 };
 const statusLabel=(s:ProductionExecutionStatus)=>s==="WAITING"?text("Waiting","Chờ thực hiện"):s==="ON-GOING"?text("On-going","Đang thực hiện"):text("Done","Hoàn thành");
 const sourceLabel=(s:ProductionWorkItem["sourceType"])=>s==="BATCH"?text("Production","Sản xuất"):s==="MASKING"?"Masking":"Unmasking";
 const groupLabel=(g:GroupFilter)=>g==="ALL"?text("All","Tất cả"):g==="CHEMICAL_LINE"?"Chemical Line":g==="SHOT_PEENING"?"Shot Peening":g==="MASK_UNMASK"?"Masking & Unmasking":g==="PAINTING"?"Painting":g==="SIRIUS_CLEANING"?"Sirius Cleaning":g==="BLASTING"?"Blasting":g==="PLATING"?"Plating":g==="PASS_BRTG"?"Passivation / Brightening":text("Other","Khác");
 const groupTone=(g:GroupFilter)=>g.toLowerCase().replaceAll("_","-");
 const areaTone=(name:string)=>{
  const x=name.trim().toUpperCase();
  if(x.includes("CHEMICAL"))return "chemical";
  if(x.includes("AUTOMATIC")&&x.includes("SHOT"))return "auto-sp";
  if(x.includes("MANUAL")&&x.includes("SHOT"))return "manual-sp";
  if(x==="MASKING")return "masking";
  if(x==="UNMASKING")return "unmasking";
  if(x.includes("PAINT")||x.includes("POWDER"))return "painting";
  if(x.includes("SIRIUS")||x.includes("SPX"))return "sirius";
  if(x.includes("MANUAL")&&x.includes("BLAST"))return "manual-blast";
  if(x.includes("AUTO")&&x.includes("BLAST"))return "auto-blast";
  if(x.includes("HE-BAKE")||x.includes("HE BAKE"))return "he-bake";
  if(x.includes("PLATING"))return "plating";
  if(x.includes("PASSIVATION")||x.includes("BRIGHTEN"))return "pass-brtg";
  return "other";
 };
 const paintingBucket=(item:ProductionWorkItem)=>{
  const r=item.resource.trim().toUpperCase();
  if(r==="CAB1")return "CAB1" as const;
  if(r==="CAB2")return "CAB2" as const;
  if(r==="CAB3")return "CAB3" as const;
  return "POWERCOATING" as const;
 };
 const productionGroupOrder:Record<ProductionReportGroup,number>={CHEMICAL_LINE:10,SHOT_PEENING:20,MASK_UNMASK:30,PAINTING:40,SIRIUS_CLEANING:50,BLASTING:60,PLATING:70,PASS_BRTG:80,OTHER:90};

 const tabGroups=useMemo(()=>{
  const base:ProductionReportGroup[]=["CHEMICAL_LINE","SHOT_PEENING","MASK_UNMASK","PAINTING","SIRIUS_CLEANING","BLASTING","PLATING","PASS_BRTG"];
  if(items.some(x=>x.reportGroup==="OTHER"))base.push("OTHER");
  return base;
 },[items]);
 const groupCounts=useMemo(()=>new Map<ProductionReportGroup,number>(tabGroups.map(g=>[g,items.filter(x=>x.reportGroup===g).length])),[items,tabGroups]);
 const scoped=useMemo(()=>reportGroup==="ALL"?items:items.filter(x=>x.reportGroup===reportGroup),[items,reportGroup]);
 const filtered=useMemo(()=>{
  const q=search.trim().toLowerCase();
  return scoped.filter(x=>{
   if(status!=="ALL"){
    if(x.reportMode==="LINE"&&x.status!==status)return false;
    if(x.reportMode==="JOB"&&!x.jobDetails.some(d=>d.status===status))return false;
   }
   if(!q)return true;
   return [
    x.batchNo,x.operation,x.linkedMainOperation,x.resource,x.area,x.recipeNo,x.recipeName,
    ...x.jobNumbers,...x.supportOperations,
    x.remark,...x.jobDetails.flatMap(d=>[d.jobNum,d.partDescription,d.priority,d.remark,statusLabel(d.status)])
   ].join(" ").toLowerCase().includes(q);
  });
 },[scoped,search,status]);

 const counts=useMemo(()=>{
  const units=scoped.flatMap(x=>x.reportMode==="LINE"?[{status:x.status}]:x.jobDetails.map(d=>({status:d.status})));
  return {
   waiting:units.filter(x=>x.status==="WAITING").length,
   ongoing:units.filter(x=>x.status==="ON-GOING").length,
   done:units.filter(x=>x.status==="DONE").length,
   units:units.length,
   qty:scoped.reduce((n,x)=>n+x.qty,0),
   surface:scoped.reduce((n,x)=>n+x.surface,0),
  };
 },[scoped]);

 async function reportExtraJob(item:ProductionWorkItem){
  const job=(extraJobByBatch[item.batchId]||"").trim();
  if(!job)return pushAppToast(text("Enter the extra Job Number.","Nhập Job Number phát sinh ngoài lô."));
  const k=`EXTRA|${item.batchId}`;setBusy(k);
  try{
   const r=await fetch("/api/daily-production-adjustment",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
    action:"REPORT_EXTRA_JOB",production_date:productionDate,batch_id:item.batchId,job_num:job,
    actual_start:item.actualStart,actual_end:item.actualEnd
   })});
   const d=await safeJson(r);if(!r.ok)throw new Error(d?.error||text("Unable to add Job to Batch.","Không thêm được Job vào lô."));
   const added=d?.addedJob as ProductionJobDetail|undefined;
   setItems(prev=>prev.map(x=>x.batchId===item.batchId&&x.sourceType==="BATCH"?{
    ...x,
    jobs:added&&!x.jobNumbers.includes(added.jobNum)?x.jobs+1:x.jobs,
    qty:Number(d?.batchTotals?.qty??x.qty),surface:Number(d?.batchTotals?.surface??x.surface),
    jobNumbers:added&&!x.jobNumbers.includes(added.jobNum)?[...x.jobNumbers,added.jobNum]:x.jobNumbers,
    jobDetails:added&&!x.jobDetails.some(j=>j.planningJobOperationId===added.planningJobOperationId)?[...x.jobDetails,added]:x.jobDetails
   }:x));
   setExtraJobByBatch(prev=>({...prev,[item.batchId]:""}));
   pushAppToast(text(`Added ${job} directly to ${item.batchNo}.`,`Đã thêm trực tiếp ${job} vào ${item.batchNo}.`));
  }catch(e){pushAppToast(e instanceof Error?e.message:String(e));}
  finally{setBusy("");}
 }

 async function setLineExecution(item:ProductionWorkItem,next:ProductionExecutionStatus){
  const k=`LINE|${item.sourceType}|${item.sourceKey}`;setBusy(k);
  try{
   const r=await fetch("/api/production-execution",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({
    reportLevel:"LINE",sourceType:item.sourceType,sourceKey:item.sourceKey,batchId:item.batchId,scheduleId:item.scheduleId,status:next
   })});
   const d=await safeJson(r);if(!r.ok)throw new Error(d?.error||text("Unable to update line production status.","Không cập nhật được trạng thái sản xuất của dòng."));
   const summary=d.execution;
   setItems(prev=>prev.map(x=>x.sourceType===item.sourceType&&x.sourceKey===item.sourceKey?{
    ...x,status:summary.execution_status,actualStart:summary.actual_start||null,actualEnd:summary.actual_end||null,remark:summary.remark||""
   }:x));
  }catch(e){pushAppToast(e instanceof Error?e.message:String(e));}
  finally{setBusy("");}
 }

 async function setJobExecution(item:ProductionWorkItem,detail:ProductionJobDetail,next:ProductionExecutionStatus){
  const k=`JOB|${item.sourceType}|${item.sourceKey}|${detail.planningJobOperationId}`;setBusy(k);
  try{
   const r=await fetch("/api/production-execution",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({
    reportLevel:"JOB",sourceType:item.sourceType,sourceKey:item.sourceKey,batchId:item.batchId,scheduleId:item.scheduleId,
    planningJobOperationId:detail.planningJobOperationId,jobNum:detail.jobNum,status:next,expectedJobs:item.jobDetails.length
   })});
   const d=await safeJson(r);if(!r.ok)throw new Error(d?.error||text("Unable to update Job production status.","Không cập nhật được trạng thái sản xuất của Job."));
   const jobEx=d.jobExecution;const summary=d.execution;
   setItems(prev=>prev.map(x=>x.sourceType===item.sourceType&&x.sourceKey===item.sourceKey?{
    ...x,
    status:summary.execution_status,
    actualStart:summary.actual_start||null,
    actualEnd:summary.actual_end||null,
    remark:summary.remark||"",
    jobDetails:x.jobDetails.map(j=>j.planningJobOperationId===detail.planningJobOperationId?{
     ...j,status:jobEx.execution_status,actualStart:jobEx.actual_start||null,actualEnd:jobEx.actual_end||null,remark:jobEx.remark||""
    }:j)
   }:x));
  }catch(e){pushAppToast(e instanceof Error?e.message:String(e));}
  finally{setBusy("");}
 }

 async function saveLineRemark(item:ProductionWorkItem,remark:string){
  const k=`NOTE|LINE|${item.sourceType}|${item.sourceKey}`;setBusy(k);
  try{
   const r=await fetch("/api/production-execution",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({
    reportLevel:"LINE",sourceType:item.sourceType,sourceKey:item.sourceKey,batchId:item.batchId,scheduleId:item.scheduleId,status:item.status,remark
   })});
   const d=await safeJson(r);if(!r.ok)throw new Error(d?.error||text("Unable to save production note.","Không lưu được ghi chú sản xuất."));
   const ex=d.execution;
   setItems(prev=>prev.map(x=>x.sourceType===item.sourceType&&x.sourceKey===item.sourceKey?{...x,remark:ex?.remark||""}:x));
  }catch(e){pushAppToast(e instanceof Error?e.message:String(e));}
  finally{setBusy("");}
 }

 async function saveJobRemark(item:ProductionWorkItem,detail:ProductionJobDetail,remark:string){
  const k=`NOTE|JOB|${item.sourceType}|${item.sourceKey}|${detail.planningJobOperationId}`;setBusy(k);
  try{
   const r=await fetch("/api/production-execution",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({
    reportLevel:"JOB",sourceType:item.sourceType,sourceKey:item.sourceKey,batchId:item.batchId,scheduleId:item.scheduleId,
    planningJobOperationId:detail.planningJobOperationId,jobNum:detail.jobNum,status:detail.status,expectedJobs:item.jobDetails.length,remark
   })});
   const d=await safeJson(r);if(!r.ok)throw new Error(d?.error||text("Unable to save Job note.","Không lưu được ghi chú Job."));
   const jobEx=d.jobExecution;
   setItems(prev=>prev.map(x=>x.sourceType===item.sourceType&&x.sourceKey===item.sourceKey?{
    ...x,jobDetails:x.jobDetails.map(j=>j.planningJobOperationId===detail.planningJobOperationId?{...j,remark:jobEx?.remark||""}:j)
   }:x));
  }catch(e){pushAppToast(e instanceof Error?e.message:String(e));}
  finally{setBusy("");}
 }

 function DetailTable({item}:{item:ProductionWorkItem}){
  const rows=item.jobDetails;
  if(!rows.length)return null;
  const shift=shiftFor(item.targetTime);
  return <div className="production-job-detail-wrap"><table className="production-job-detail-table">
   <thead><tr>
    <th>{text("Job","Job")}</th>
    <th>{text("Part Description","Mô tả Part")}</th>
    <th>{text("Current Good WIP Qty","SL WIP tốt hiện tại")}</th>
    <th>{text("Total Surface","Tổng diện tích")}</th>
    <th>{text("Priority","Ưu tiên")}</th>
    <th>{text("Shift","Ca")}</th>
    <th>{text("Target","Mốc kế hoạch")}</th>
    <th>{text("Actual Start","Bắt đầu thực tế")}</th>
    <th>{text("Actual End","Kết thúc thực tế")}</th>
    <th>{text("Note","Ghi chú")}</th>
    <th>{text("Report","Báo cáo")}</th>
   </tr></thead>
   <tbody>{rows.map((detail,index)=>{
    const k=`JOB|${item.sourceType}|${item.sourceKey}|${detail.planningJobOperationId}`;const isBusy=busy===k;
    const noteKey=`NOTE|JOB|${item.sourceType}|${item.sourceKey}|${detail.planningJobOperationId}`;const noteBusy=busy===noteKey;
    return <tr key={`${detail.planningJobOperationId}-${detail.jobNum}-${index}`} className={`production-job-row production-job-row-${statusClass(detail.status)}`}>
     <td className="mono"><b>{detail.jobNum||"—"}</b></td>
     <td>{detail.partDescription||"—"}</td>
     <td className="num">{detail.currentGoodWipQty==null?"—":fmt(detail.currentGoodWipQty,0)}</td>
     <td className="num">{detail.totalSurface==null?"—":fmt(detail.totalSurface)}</td>
     <td>{detail.priority||"—"}</td>
     <td><span className="production-shift" title={shift.title}>{shift.label}</span></td>
     <td className="mono"><b>{targetDisplay(item.targetTime)}</b>{item.plannedEnd?<small className="planning-sub">→ {targetDisplay(item.plannedEnd)}</small>:null}</td>
     <td className="mono">{dt(detail.actualStart)}</td>
     <td className="mono">{dt(detail.actualEnd)}</td>
     <td className="production-note-cell"><input className="input production-note-input" maxLength={500} value={detail.remark||""} disabled={noteBusy} placeholder={text("Production note...","Ghi chú sản xuất...")} onChange={e=>{const value=e.target.value;setItems(prev=>prev.map(x=>x.sourceType===item.sourceType&&x.sourceKey===item.sourceKey?{...x,jobDetails:x.jobDetails.map(j=>j.planningJobOperationId===detail.planningJobOperationId?{...j,remark:value}:j)}:x));}} onBlur={e=>saveJobRemark(item,detail,e.currentTarget.value)} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}} aria-label={text(`Note for Job ${detail.jobNum}`,`Ghi chú cho Job ${detail.jobNum}`)}/>{noteBusy?<small>{text("Saving...","Đang lưu...")}</small>:null}</td>
     <td className="production-report-cell"><select className={`input production-status-select ${statusClass(detail.status)}`} disabled={isBusy} value={detail.status} onChange={e=>setJobExecution(item,detail,e.target.value as ProductionExecutionStatus)} aria-label={text(`Production status for Job ${detail.jobNum}`,`Trạng thái sản xuất Job ${detail.jobNum}`)}>
      {statusOrder.map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}
     </select>{isBusy?<small>{text("Saving...","Đang lưu...")}</small>:null}</td>
    </tr>;
   })}</tbody>
  </table></div>;
 }


 type SupportJobStep={item:ProductionWorkItem;detail:ProductionJobDetail};
 type CombinedSupportReportJob={
  key:string;
  baseItem:ProductionWorkItem;
  baseDetail:ProductionJobDetail;
  unmasking:SupportJobStep[];
  masking:SupportJobStep[];
 };

 function combineSupportReportJobs(rows:ProductionWorkItem[]):CombinedSupportReportJob[]{
  const map=new Map<string,CombinedSupportReportJob>();
  for(const item of rows){
   if(item.sourceType!=="MASKING"&&item.sourceType!=="UNMASKING")continue;
   for(const detail of item.jobDetails){
    const key=`${item.batchId}|${item.linkedMainOperation.toUpperCase()}|${detail.planningJobOperationId}|${detail.jobNum}`;
    const entry=map.get(key)||{key,baseItem:item,baseDetail:detail,unmasking:[],masking:[]};
    const step={item,detail};
    if(item.sourceType==="UNMASKING")entry.unmasking.push(step);else entry.masking.push(step);
    // Prefer the earlier Unmasking row as the display anchor when it exists.
    if(item.sourceType==="UNMASKING"){entry.baseItem=item;entry.baseDetail=detail;}
    map.set(key,entry);
   }
  }
  return [...map.values()].sort((a,b)=>{
   const at=a.baseItem.targetTime?new Date(a.baseItem.targetTime).getTime():Number.MAX_SAFE_INTEGER;
   const bt=b.baseItem.targetTime?new Date(b.baseItem.targetTime).getTime():Number.MAX_SAFE_INTEGER;
   return a.baseItem.sequence-b.baseItem.sequence||at-bt||a.baseDetail.jobNum.localeCompare(b.baseDetail.jobNum);
  });
 }

 function SupportStepLabel({step,index}:{step:SupportJobStep;index:number}){
  const label=step.item.sourceType==="UNMASKING"?"Unmasking":"Masking";
  const operations=step.detail.supportOperations.length?step.detail.supportOperations:step.item.supportOperations;
  return <div className={`production-support-step production-support-step-${step.item.sourceType.toLowerCase()}`}>
   <b><span className="support-step-order">{index+1}</span> {label}</b>
   <span className="mono">{operations.join(" / ")||step.item.operation||label}</span>
  </div>;
 }

 function SupportWorkTable({rows}:{rows:ProductionWorkItem[]}){
  const jobs=combineSupportReportJobs(rows);
  if(!jobs.length)return <div className="production-empty"><b>{text("No production work matches the current filter.","Không có công việc sản xuất phù hợp bộ lọc hiện tại.")}</b></div>;
  return <div className="table-wrap production-table-wrap"><table className="erp-table production-table production-support-combined-table">
   <thead><tr>
    <th>Job</th><th>{text("Part Description","Mô tả Part")}</th><th>{text("Current Good WIP Qty","SL WIP tốt hiện tại")}</th><th>{text("Total Surface","Tổng diện tích")}</th><th>{text("Priority","Ưu tiên")}</th><th>Batch No.</th><th>Main</th><th>{text("Preparation Operations","Công đoạn chuẩn bị")}</th><th>{text("Target","Mốc kế hoạch")}</th><th>{text("Actual","Thực tế")}</th><th>{text("Note","Ghi chú")}</th><th>{text("Report","Báo cáo")}</th>
   </tr></thead>
   <tbody>{jobs.map(job=>{
    const steps=[...job.unmasking,...job.masking];
    const base=job.baseItem,detail=job.baseDetail;
    return <tr key={job.key} className="production-job-row production-support-combined-row">
     <td className="mono"><b>{detail.jobNum||"—"}</b></td>
     <td>{detail.partDescription||"—"}</td>
     <td className="num">{detail.currentGoodWipQty==null?"—":fmt(detail.currentGoodWipQty,0)}</td>
     <td className="num">{detail.totalSurface==null?"—":fmt(detail.totalSurface)}</td>
     <td>{detail.priority||"—"}</td>
     <td><b className="mono production-batch-no">{base.batchNo||`#${base.batchId}`}</b></td>
     <td><b>{base.linkedMainOperation||"—"}</b></td>
     <td><div className="production-support-step-stack">{steps.map((step,index)=><SupportStepLabel key={`${step.item.sourceType}-${step.item.sourceKey}-${index}`} step={step} index={index}/>)}</div></td>
     <td className="mono"><b>{targetDisplay(base.plannedStart||base.targetTime)}</b>{base.plannedEnd?<small className="planning-sub">→ {targetDisplay(base.plannedEnd)}</small>:null}</td>
     <td><div className="production-support-step-stack">{steps.map((step,index)=><div key={`${step.item.sourceKey}-actual-${index}`} className="production-support-step-value"><b>{index+1}.</b> {dt(step.detail.actualStart)} → {dt(step.detail.actualEnd)}</div>)}</div></td>
     <td className="production-note-cell"><div className="production-support-step-stack">{steps.map((step,index)=>{const noteKey=`NOTE|JOB|${step.item.sourceType}|${step.item.sourceKey}|${step.detail.planningJobOperationId}`;const noteBusy=busy===noteKey;return <div key={`${step.item.sourceKey}-note-${index}`} className="production-support-control-line"><span>{index+1}.</span><input className="input production-note-input" maxLength={500} value={step.detail.remark||""} disabled={noteBusy} placeholder={text("Production note...","Ghi chú sản xuất...")} onChange={e=>{const value=e.target.value;setItems(prev=>prev.map(x=>x.sourceType===step.item.sourceType&&x.sourceKey===step.item.sourceKey?{...x,jobDetails:x.jobDetails.map(j=>j.planningJobOperationId===step.detail.planningJobOperationId?{...j,remark:value}:j)}:x));}} onBlur={e=>saveJobRemark(step.item,step.detail,e.currentTarget.value)} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}}/>{noteBusy?<small>{text("Saving...","Đang lưu...")}</small>:null}</div>})}</div></td>
     <td className="production-report-cell"><div className="production-support-step-stack">{steps.map((step,index)=>{const k=`JOB|${step.item.sourceType}|${step.item.sourceKey}|${step.detail.planningJobOperationId}`;const isBusy=busy===k;return <div key={`${step.item.sourceKey}-report-${index}`} className="production-support-control-line"><span>{index+1}.</span><select className={`input production-status-select ${statusClass(step.detail.status)}`} disabled={isBusy} value={step.detail.status} onChange={e=>setJobExecution(step.item,step.detail,e.target.value as ProductionExecutionStatus)}><option value="WAITING">{statusLabel("WAITING")}</option><option value="ON-GOING">{statusLabel("ON-GOING")}</option><option value="DONE">{statusLabel("DONE")}</option></select>{isBusy?<small>{text("Saving...","Đang lưu...")}</small>:null}</div>})}</div></td>
    </tr>;
   })}</tbody>
  </table></div>;
 }

 function WorkTable({rows}:{rows:ProductionWorkItem[]}){
  if(!rows.length)return <div className="production-empty"><b>{text("No production work matches the current filter.","Không có công việc sản xuất phù hợp bộ lọc hiện tại.")}</b></div>;
  return <div className="table-wrap production-table-wrap"><table className="erp-table production-table">
   <thead><tr>
    <th>{text("Type","Loại việc")}</th><th>{text("Area","Khu vực")}</th><th>{text("Resource","Resource")}</th><th>Batch No.</th><th>Recipe</th><th>{text("Jobs","Số Job")}</th><th>Qty</th><th>dm²</th><th>{text("Target","Mốc kế hoạch")}</th><th>{text("Actual Start","Bắt đầu thực tế")}</th><th>{text("Actual End","Kết thúc thực tế")}</th><th>{text("Note","Ghi chú")}</th><th>{text("Report","Báo cáo")}</th>
   </tr></thead>
   <tbody>{rows.flatMap((item,rowIndex)=>{
    const k=`${item.sourceType}|${item.sourceKey}`;
    const lineKey=`LINE|${item.sourceType}|${item.sourceKey}`;
    const noteKey=`NOTE|LINE|${item.sourceType}|${item.sourceKey}`;
    const recipe=[item.recipeNo,item.recipeName].filter(Boolean).join(" · ")||item.recipeKey||"—";
    const mainRow=<tr key={k} className={`production-row production-batch-row ${rowIndex>0?"production-batch-start":""} production-batch-${rowIndex%2?"odd":"even"} production-row-${statusClass(item.status)}`}>
     <td><span className={`production-source source-${item.sourceType.toLowerCase()}`}>{sourceLabel(item.sourceType)}</span>{item.sourceType!=="BATCH"?<small className="planning-sub">{item.linkedMainOperation}</small>:null}</td>
     <td>{item.area||"—"}</td><td className="mono">{item.resource||"—"}</td>
     <td><b className="mono production-batch-no">{item.batchNo||`#${item.batchId}`}</b>{item.sourceType==="BATCH"?<div className="production-extra-job" style={{display:"flex",gap:6,marginTop:6,minWidth:230}}><input className="input" style={{minWidth:150}} value={extraJobByBatch[item.batchId]||""} autoComplete="off" onChange={e=>setExtraJobByBatch(v=>({...v,[item.batchId]:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();reportExtraJob(item);}}} placeholder={text("Enter Job No.","Nhập Job No.")}/><button type="button" className="btn small" disabled={busy===`EXTRA|${item.batchId}`} onClick={()=>reportExtraJob(item)}>{busy===`EXTRA|${item.batchId}`?"…":text("Add","Thêm")}</button></div>:null}</td>
     <td><span title={recipe}>{recipe}</span></td>
     <td className="num"><b>{item.jobs}</b></td>
     <td className="num">{fmt(item.qty,0)}</td><td className="num">{fmt(item.surface)}</td>
     <td><b className="mono">{targetDisplay(item.targetTime)}</b>{item.plannedEnd?<small className="planning-sub">→ {targetDisplay(item.plannedEnd)}</small>:null}</td>
     <td className="mono">{dt(item.actualStart)}</td><td className="mono">{dt(item.actualEnd)}</td>
     <td className="production-note-cell">{item.reportMode==="LINE"?<><input className="input production-note-input" maxLength={500} value={item.remark||""} disabled={busy===noteKey} placeholder={text("Production note...","Ghi chú sản xuất...")} onChange={e=>{const value=e.target.value;setItems(prev=>prev.map(x=>x.sourceType===item.sourceType&&x.sourceKey===item.sourceKey?{...x,remark:value}:x));}} onBlur={e=>saveLineRemark(item,e.currentTarget.value)} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}} aria-label={text(`Note for Batch ${item.batchNo}`,`Ghi chú cho Batch ${item.batchNo}`)}/>{busy===noteKey?<small>{text("Saving...","Đang lưu...")}</small>:null}</>:<small className="production-job-level-note">{text("Notes are entered by Job","Ghi chú theo từng Job")}</small>}</td>
     <td className="production-report-cell">{item.reportMode==="LINE"?<><select className={`input production-status-select ${statusClass(item.status)}`} disabled={busy===lineKey} value={item.status} onChange={e=>setLineExecution(item,e.target.value as ProductionExecutionStatus)} aria-label={text(`Production status for Batch ${item.batchNo}`,`Trạng thái sản xuất Batch ${item.batchNo}`)}>{statusOrder.map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}</select>{busy===lineKey?<small>{text("Saving...","Đang lưu...")}</small>:null}</>:<small className="production-job-level-note">{text("Report by Job","Báo cáo theo Job")}</small>}</td>
    </tr>;
    const addedJobs=item.jobDetails.filter(d=>d.isAddedJob);
    const addedRow=addedJobs.length?<tr key={`${k}__added`} className="production-detail-row production-added-job-row"><td colSpan={13}>
     <div className="notice" style={{margin:0}}><b>{text("Jobs added during production","Job thêm mới trong sản xuất")}:</b> {addedJobs.map(d=>`${d.jobNum}${d.partDescription?` · ${d.partDescription}`:""} · Qty ${d.currentGoodWipQty??"—"}`).join("  |  ")}</div>
    </td></tr>:null;
    if(item.reportMode!=="JOB"||!item.jobDetails.length)return addedRow?[mainRow,addedRow]:[mainRow];
    const detailRow=<tr key={`${k}__detail`} className="production-detail-row"><td colSpan={13}>{DetailTable({item})}</td></tr>;
    return addedRow?[mainRow,addedRow,detailRow]:[mainRow,detailRow];
   })}</tbody>
  </table></div>;
 }

 const grouped=useMemo<DisplayGroup[]>(()=>{
  const result:DisplayGroup[]=[];
  const sortRows=(rows:ProductionWorkItem[])=>[...rows].sort((a,b)=>{
   const at=a.targetTime?new Date(a.targetTime).getTime():Number.MAX_SAFE_INTEGER;
   const bt=b.targetTime?new Date(b.targetTime).getTime():Number.MAX_SAFE_INTEGER;
   return a.sequence-b.sequence || at-bt || a.batchNo.localeCompare(b.batchNo);
  });
  const addAreaGroups=(group:ProductionReportGroup)=>{
   const rows=filtered.filter(item=>item.reportGroup===group);
   const names=[...new Set(rows.map(item=>item.area||text("Unmapped area","Chưa map khu vực")))];
   for(const name of names){
    const list=sortRows(rows.filter(item=>(item.area||text("Unmapped area","Chưa map khu vực"))===name));
    if(!list.length)continue;
    result.push({
     key:`${group}|AREA|${name}`,title:name,subtitle:`${list.length} ${text("work items","công việc")}`,rows:list,
     tone:areaTone(name),order:productionGroupOrder[group]*100000+Math.min(...list.map(x=>x.sequence))
    });
   }
  };

  addAreaGroups("CHEMICAL_LINE");
  addAreaGroups("SHOT_PEENING");

  // V455: Masking/Unmasking is grouped by the linked Main's physical area.
  // Individual combined Job rows still retain Main so PRIMER2/TOPCOAT1 etc.
  // remain distinguishable inside one physical-area panel.
  const maskRows=filtered.filter(item=>item.reportGroup==="MASK_UNMASK");
  const areaMap=new Map<string,{label:string;rows:ProductionWorkItem[]}>();
  for(const item of maskRows){
   const label=item.area.trim()||text("Unmapped physical area","Chưa map khu vực vật lý");
   const key=label.toUpperCase();
   const entry=areaMap.get(key)||{label,rows:[]};
   entry.rows.push(item);areaMap.set(key,entry);
  }
  for(const [areaKey,entry] of areaMap){
   const list=sortRows(entry.rows);
   const masking=list.filter(x=>x.sourceType==="MASKING").length;
   const unmasking=list.filter(x=>x.sourceType==="UNMASKING").length;
   const preparationJobs=combineSupportReportJobs(list).length;
   const mains=[...new Set(list.map(x=>x.linkedMainOperation).filter(Boolean))];
   result.push({
    key:`MASK_UNMASK|AREA|${areaKey}`,
    title:`${entry.label} (Preparation)`,
    subtitle:`${preparationJobs} Job · ${unmasking} Unmasking · ${masking} Masking${mains.length?` · ${mains.join(" / ")}`:""}`,
    rows:list,tone:areaTone(entry.label),
    order:productionGroupOrder.MASK_UNMASK*100000+Math.min(...list.map(x=>x.sequence))
   });
  }

  const paintRows=filtered.filter(item=>item.reportGroup==="PAINTING");
  const paintDefs=[
   {key:"CAB1" as const,title:"CAB1",tone:"paint-cab1"},
   {key:"CAB2" as const,title:"CAB2",tone:"paint-cab2"},
   {key:"CAB3" as const,title:"CAB3",tone:"paint-cab3"},
   {key:"POWERCOATING" as const,title:"Powercoating",tone:"paint-power"},
  ];
  paintDefs.forEach((def,index)=>{
   const list=sortRows(paintRows.filter(item=>paintingBucket(item)===def.key));
   const showEmpty=reportGroup==="PAINTING";
   if(!list.length&&!showEmpty)return;
   const resources=[...new Set(list.map(x=>x.resource).filter(Boolean))];
   result.push({
    key:`PAINTING|${def.key}`,title:def.title,
    subtitle:list.length?`${list.length} ${text("work items","công việc")}${resources.length?` · ${resources.join(" / ")}`:""}`:text("No scheduled work","Chưa có kế hoạch"),
    rows:list,tone:def.tone,order:productionGroupOrder.PAINTING*100000+index
   });
  });

  addAreaGroups("SIRIUS_CLEANING");
  addAreaGroups("BLASTING");
  addAreaGroups("PLATING");
  addAreaGroups("PASS_BRTG");
  addAreaGroups("OTHER");

  return result.sort((a,b)=>a.order-b.order||a.title.localeCompare(b.title));
 },[filtered,reportGroup,text]);

 return <div className="production-execution-workspace">
  <div className="production-kpis">
   <button type="button" className={`production-kpi waiting ${status==="WAITING"?"active":""}`} onClick={()=>setStatus(status==="WAITING"?"ALL":"WAITING")}><span>{text("Waiting","Chờ thực hiện")}</span><b>{counts.waiting}</b></button>
   <button type="button" className={`production-kpi ongoing ${status==="ON-GOING"?"active":""}`} onClick={()=>setStatus(status==="ON-GOING"?"ALL":"ON-GOING")}><span>{text("On-going","Đang thực hiện")}</span><b>{counts.ongoing}</b></button>
   <button type="button" className={`production-kpi done ${status==="DONE"?"active":""}`} onClick={()=>setStatus(status==="DONE"?"ALL":"DONE")}><span>{text("Done","Hoàn thành")}</span><b>{counts.done}</b></button>
   <div className="production-kpi neutral"><span>{text("Report Units","Đơn vị báo cáo")}</span><b>{counts.units}</b></div>
   <div className="production-kpi neutral"><span>Qty</span><b>{fmt(counts.qty,0)}</b></div>
   <div className="production-kpi neutral"><span>dm²</span><b>{fmt(counts.surface,0)}</b></div>
  </div>

  <nav className="production-subtabs" aria-label={text("Production report areas","Khu vực báo cáo sản xuất")}>
   <button type="button" className={`production-subtab group-all ${reportGroup==="ALL"?"active":""}`} onClick={()=>setReportGroup("ALL")}><span>{groupLabel("ALL")}</span><b>{items.length}</b></button>
   {tabGroups.map(g=><button type="button" key={g} className={`production-subtab group-${groupTone(g)} ${reportGroup===g?"active":""}`} onClick={()=>setReportGroup(g)}><span>{groupLabel(g)}</span><b>{groupCounts.get(g)||0}</b></button>)}
  </nav>

  <div className="production-command-bar">
   <div className="production-filter-group">
    <input className="input production-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={text("Search Batch / Operation / Recipe / Job...","Tìm Batch / Công đoạn / Recipe / Job...")}/>
    <select className="input" value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="ALL">{text("All Report Statuses","Tất cả trạng thái báo cáo")}</option>{statusOrder.map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}</select>
   </div>
  </div>

  <div className="production-result-meta"><b>{filtered.length}</b> {text("work items","công việc")}<span>·</span><span>{text("Chemical Line and Painting are reported by scheduled row; all other areas are reported by Job.","Chemical Line và Painting báo cáo theo từng dòng kế hoạch; các khu vực còn lại báo cáo theo từng Job.")}</span><span>·</span><span>{text("Production day: 06:00 → 05:59 next day.","Ngày sản xuất: 06:00 → 05:59 ngày hôm sau.")}</span></div>

  <div className="production-area-stack">{grouped.map(group=><section className={`erp-table-panel production-area-panel area-tone-${group.tone}`} key={group.key}>
   <div className="erp-panel-head production-area-head"><div className="production-area-title"><b>{group.title||"—"}</b><small>{group.subtitle}</small></div></div>
   {group.key.startsWith("MASK_UNMASK|")?SupportWorkTable({rows:group.rows}):WorkTable({rows:group.rows})}
  </section>)}</div>
 </div>;
}
