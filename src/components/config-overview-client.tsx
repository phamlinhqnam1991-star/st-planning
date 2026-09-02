"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {healthStatus,type ConfigHealth} from "@/lib/config/config-flow";
import {CONFIG_HEALTH_INVALIDATED_EVENT,loadConfigHealth} from "@/lib/config/config-client";

type Step={no:number;title:string;desc:string;status:"ok"|"warn"|"idle";badge:string;note:string;href:string};

export function ConfigOverviewClient(){
 const [health,setHealth]=useState<Partial<ConfigHealth>|null>(null);

 useEffect(()=>{
  let cancelled=false;
  const load=async(fresh=false)=>{
   try{
    const data=await loadConfigHealth(fresh);
    if(!cancelled)setHealth(data);
   }catch{
    if(!cancelled)setHealth({});
   }
  };
  void load(false);
  const onInvalidated=()=>{void load(false)};
  window.addEventListener(CONFIG_HEALTH_INVALIDATED_EVENT,onInvalidated);
  return ()=>{
   cancelled=true;
   window.removeEventListener(CONFIG_HEALTH_INVALIDATED_EVENT,onInvalidated);
  };
 },[]);

 if(health===null){
  return <>
   <div className="config-overview-intro"><b>Đang tải trạng thái cấu hình…</b> Bạn vẫn có thể mở ngay các bước ở thanh bên trái.</div>
   <div className="config-progress" aria-busy="true">
    <b>Đang kiểm tra cấu hình…</b>
    <div className="bar"><div style={{width:"12%"}}/></div>
   </div>
   <div className="card" style={{minHeight:180}}>
    {Array.from({length:5},(_,i)=><div key={i} style={{height:34,borderRadius:5,background:"rgba(148,163,184,.12)",marginBottom:9}}/>)}
   </div>
  </>;
 }

 const s=health;
 const n=(x:unknown)=>Number(x||0);
 const scopeTotal=n(s.scope_total);
 const chainOk=n(s.chain_ok);
 const chainPlanning=n(s.chain_planning_total);
 const mappingMissing=n(s.mapping_missing);

 const t1Total=7;
 const t1Done=[n(s.scope_total)>0,n(s.mapping_total)>0&&n(s.mapping_missing)===0,n(s.master_total)>0,n(s.group_total)>0,n(s.area_total)>0&&n(s.area_group_total)>0,n(s.schedule_total)>0&&n(s.schedule_op_total)>0,n(s.schedule_total)>0&&n(s.planner_assigned)>0].filter(Boolean).length;
 // v266: tiến độ Tầng 2 chỉ tính 3 mục BẮT BUỘC; Open Job Column Values là tùy chọn.
 const t2Items=[(n(s.recipe_total)>0&&n(s.recipe_op_total)>0),n(s.handling_total)>0,n(s.time_total)>0];
 const t2Total=t2Items.length;
 const t2Done=t2Items.filter(Boolean).length;
 const overall=Math.round(((t1Done+t2Done)/(t1Total+t2Total))*100);

 const issues:{text:string;href:string}[]=[];
 if(n(s.missing_jobs)>0)issues.push({text:`${n(s.missing_jobs)} Job đang mở chưa có cấu hình ST đầy đủ nên chưa vào Planning Board.`,href:"/st-operation-flow"});
 if(scopeTotal===0)issues.push({text:"Chưa khai báo Operation nào thuộc ST — bắt đầu từ Trợ lý Operation.",href:"/st-operation-flow"});
 if(mappingMissing>0)issues.push({text:`Còn ${mappingMissing} Operation chưa gán công đoạn chính.`,href:"/master/operationmapping"});
 if(n(s.master_total)===0)issues.push({text:"Chưa có công đoạn chính nào trong Main Operation Master.",href:"/master/operation"});
 if(n(s.group_total)===0)issues.push({text:"Chưa có ST Group (nhóm công đoạn).",href:"/st-groups"});
 if(n(s.area_total)===0||n(s.area_group_total)===0)issues.push({text:"Chưa gán ST Group vào khu vực vật lý.",href:"/area"});
 if(n(s.schedule_total)===0||n(s.schedule_op_total)===0)issues.push({text:"Chưa tạo/gán công đoạn vào Khu vực điều độ (lane).",href:"/schedule-areas"});
 if(n(s.schedule_total)>0&&n(s.planner_assigned)===0)issues.push({text:"Có khu vực điều độ nhưng chưa phân Planner.",href:"/planner-work-assignment"});
 if(n(s.recipe_total)===0||n(s.recipe_op_total)===0)issues.push({text:"Chưa khai báo Recipe hoặc chưa gán Công đoạn → Recipe — Job sẽ không tạo lô được.",href:"/recipe-operation-map"});
 if(n(s.handling_total)===0)issues.push({text:"Chưa có rule thời gian Loading/Unloading — lô Chemical thiếu giờ.",href:"/recipe-time-loading"});
 if(n(s.time_total)===0)issues.push({text:"Chưa có rule thời gian xử lý (Process).",href:"/recipe-time-process"});

 const steps:Step[]=[
  {no:1,title:"Trợ lý Operation (ST Operation Flow)",desc:"Khai báo 1 Operation Code hoàn chỉnh: loại, công đoạn chính, nhóm, khu vực, lane, Planner — làm trong 3 bước có hướng dẫn.",status:scopeTotal>0?"ok":"warn",badge:`${scopeTotal} code`,note:scopeTotal>0?`${chainOk}/${chainPlanning} đủ chuỗi`:"Chưa khai báo",href:"/st-operation-flow"},
  {no:2,title:"ST Scope & Operation Code Order",desc:"Xác định code thuộc ST; Operation Code Order chỉ tie-break trong cùng Main.",status:healthStatus(s,"scope_total"),badge:`${scopeTotal} code`,note:scopeTotal>0?"Đã khai báo":"Chưa có",href:"/operation-code-order"},
  {no:3,title:"Source → Main Mapping",desc:"Gán mỗi code nguồn vào công đoạn chính + quy tắc.",status:healthStatus(s,"mapping_missing"),badge:`${n(s.mapping_total)} mapping`,note:mappingMissing>0?`Thiếu ${mappingMissing}`:"Đủ",href:"/master/operationmapping"},
  {no:4,title:"Công đoạn chính (Main Operation)",desc:"Tên, thứ tự, tiền tố số lô.",status:healthStatus(s,"master_total"),badge:`${n(s.master_total)} công đoạn`,note:n(s.master_total)>0?"Đã có":"Chưa có",href:"/master/operation"},
  {no:5,title:"ST Group (nhóm công đoạn)",desc:"Gom công đoạn tương tự thành nhóm.",status:healthStatus(s,"group_total"),badge:`${n(s.group_total)} nhóm`,note:n(s.group_total)>0?"Đã có":"Chưa có",href:"/st-groups"},
  {no:6,title:"Khu vực vật lý",desc:"Khu nào chứa nhóm nào.",status:healthStatus(s,"area_total"),badge:`${n(s.area_total)} khu`,note:`${n(s.area_group_total)} nhóm đã gán`,href:"/area"},
  {no:7,title:"Khu vực điều độ (lane) + Planner",desc:"Lane trên Board Điều Độ + ai phụ trách.",status:healthStatus(s,"schedule_total"),badge:`${n(s.schedule_total)} lane`,note:`${n(s.planner_assigned)} đã gán Planner`,href:"/schedule-areas"},
  {no:8,title:"Kết quả: Planning Chain",desc:"Job sẵn sàng lập kế hoạch: PLANNED / ELIGIBLE / LOCKED.",status:healthStatus(s,"chain_ok"),badge:`${chainOk}/${chainPlanning} đủ chuỗi`,note:chainOk>0?"Đã sẵn sàng":"Chưa đủ chuỗi",href:"/st-operation-flow"},
 ];

 const statusBadge=(st:Step["status"])=>st==="ok"?<span className="badge b-ready">Đã đủ</span>:st==="warn"?<span className="badge b-lock">Cần bổ sung</span>:<span className="badge b-wait">Tùy chọn</span>;
 const extra=[
  {group:"Tầng 2 · Công thức & Rule",tag:"bắt buộc · điều khiển tạo lô",items:[
   ["Công thức & Rule",`${n(s.recipe_total)} recipe · ${n(s.recipe_op_total)} mapping`,"/recipe-operation-map"],
   ["Thời gian Loading/Unloading",`${n(s.handling_total)} rule`,"/recipe-time-loading"],
   ["Thời gian xử lý (Process)",`${n(s.time_total)} rule`,"/recipe-time-process"],
  ]},
  {group:"Tầng 2 · Tùy chọn",tag:"từ điển cột Job",items:[
   ["Cột All Open Job (từ điển)",`${n(s.colval_total)} giá trị`,"/open-job-column-values"],
  ]},
 ];

 return <>
  <div className="config-overview-intro erp-guidance-banner"><div><span className="erp-guidance-kicker">Configuration readiness</span><b>Làm theo thứ tự phụ thuộc để tránh cấu hình thiếu.</b><small>Đã đủ = sẵn sàng · Cần bổ sung = còn dependency chưa hoàn chỉnh. Thêm Operation mới bắt đầu từ Trợ lý Operation.</small></div></div>
  <div className="config-progress">
   <b>Tiến độ cấu hình: {overall}%</b>
   <div className="bar"><div style={{width:`${overall}%`}}/></div>
   <div className="meta"><span>Tầng 1 (định nghĩa công đoạn): {t1Done}/{t1Total} bước</span><span>Tầng 2 (công thức & rule): {t2Done}/{t2Total} mục</span></div>
  </div>
  {issues.length>0&&<div className="config-issues">{issues.slice(0,4).map((x,i)=><div className="config-issue" key={i}><span className="erp-issue-marker">!</span><span>{x.text}</span><Link className="erp-link" href={x.href}>Mở cấu hình</Link></div>)}</div>}
  <div className="config-flow">
   {steps.map((st,i)=><div className="config-step" key={st.no}>
    <div className="config-step-rail"><div className={`config-step-dot ${st.status}`}>{st.no}</div>{i<steps.length-1&&<div className="config-step-line"/>}</div>
    <Link href={st.href} className={`config-step-card ${st.status}`} style={{textDecoration:"none"}}>
     <div className="config-step-body"><h3>{st.title}</h3><p>{st.desc}</p></div>
     <div className="config-step-status">{statusBadge(st.status)}<small>{st.badge} · {st.note}</small></div>
     <div className="config-step-go"><span className="btn small">Mở</span></div>
    </Link>
   </div>)}
  </div>
  {extra.map(g=><div key={g.group}>
   <div className="config-ov-group-title">{g.group}<span className="tag">{g.tag}</span></div>
   <div className="config-meta-grid">
    {g.items.map(([label,val,href])=><Link key={href} href={href} className="config-meta-chip" style={{textDecoration:"none"}}><b>{val}</b><span>{label}</span></Link>)}
   </div>
  </div>)}
 </>;
}
