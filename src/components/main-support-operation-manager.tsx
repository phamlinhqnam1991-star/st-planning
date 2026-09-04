"use client";

import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {safeJson} from "@/lib/fetch-json";
import {refreshConfigPage} from "@/lib/config/config-client";
import {usePopupMessage} from "@/hooks/use-popup-message";

type MainRow={standard_operation:string;planning_sort_order:number|null};
type ConfigRow={standard_operation:string;support_type:"MASKING"|"UNMASKING";support_operation_code:string};
type Option={operation_code:string;support_type:"MASKING"|"UNMASKING"};

const displayMain=(op:string)=>op.toUpperCase()==="PRIMER"?"PRIMER1":op;

export function MainSupportOperationManager({mains,configs,options}:{mains:MainRow[];configs:ConfigRow[];options:Option[]}){
 const router=useRouter();
 const [busy,setBusy]=useState("");
 const [message,setMessage]=useState("");
 const [search,setSearch]=useState("");
 usePopupMessage(message);
 const initial=useMemo(()=>{
  const m=new Map<string,string[]>();
  for(const r of configs){const code=r.support_operation_code.toUpperCase();if(code==="__NONE__")continue;const k=`${r.standard_operation.toUpperCase()}|${r.support_type}`;m.set(k,[...(m.get(k)||[]),code]);}
  return m;
 },[configs]);
 const [selected,setSelected]=useState<Map<string,string[]>>(()=>new Map(initial));
 const maskOptions=options.filter(x=>x.support_type==="MASKING").map(x=>x.operation_code);
 const unmaskOptions=options.filter(x=>x.support_type==="UNMASKING").map(x=>x.operation_code);
 const filtered=mains.filter(x=>!search.trim()||displayMain(x.standard_operation).toUpperCase().includes(search.trim().toUpperCase()));
 function key(op:string,type:string){return `${op.toUpperCase()}|${type}`;}
 function toggle(op:string,type:"MASKING"|"UNMASKING",code:string){
  const k=key(op,type);setSelected(prev=>{const n=new Map(prev),cur=n.get(k)||[];n.set(k,cur.includes(code)?cur.filter(x=>x!==code):[...cur,code]);return n;});
 }
 async function save(op:string,type:"MASKING"|"UNMASKING"){
  const k=key(op,type);setBusy(k);setMessage("");
  try{
   const r=await fetch("/api/config/main-support-operations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({standard_operation:op,support_type:type,support_operation_codes:selected.get(k)||[]})});
   const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Không lưu được cấu hình.");
   setMessage(`Đã lưu ${displayMain(op)} · ${type}.`);refreshConfigPage(router);
  }catch(e){setMessage(e instanceof Error?e.message:"Không lưu được cấu hình.");}finally{setBusy("");}
 }
 function Picker({op,type}:{op:string;type:"MASKING"|"UNMASKING"}){
  const k=key(op,type),values=selected.get(k)||[],opts=type==="MASKING"?maskOptions:unmaskOptions;
  return <div style={{minWidth:290}}>
   <div className="row" style={{gap:5,flexWrap:"wrap",marginBottom:6}}>{values.length?values.map(code=><button key={code} className="btn small mono" type="button" onClick={()=>toggle(op,type,code)} disabled={!!busy}>{code} ×</button>):<span className="muted">Không cấu hình</span>}</div>
   <select className="input" value="" onChange={e=>{if(e.target.value)toggle(op,type,e.target.value)}} disabled={!!busy}>
    <option value="">+ Chọn {type==="MASKING"?"Masking":"Unmasking"} trước Main...</option>
    {opts.filter(x=>!values.includes(x)).map(x=><option key={x} value={x}>{x}</option>)}
   </select>
   <button className="btn primary small" style={{marginTop:6}} type="button" onClick={()=>save(op,type)} disabled={!!busy}>{busy===k?"Đang lưu...":"Lưu"}</button>
  </div>;
 }
 return <div className="erp-table-panel section">
  <div className="erp-panel-head"><div><b>Main Operation → Masking / Unmasking trước công đoạn</b><div className="muted">PRIMER1/2/3 và TOPCOAT1/2 được tách theo occurrence của Planning Chain.</div></div><input className="input" style={{maxWidth:260}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm Main Operation..."/></div>
  <div className="notice" style={{margin:10}}><b>Quan hệ:</b> Support nằm giữa Main trước và Main hiện tại được coi là <b>BEFORE MAIN</b>. Khi Main có cấu hình, resolver chỉ nhận các Operation Code đã chọn; Main chưa cấu hình vẫn dùng logic routing hiện tại để không phá dữ liệu cũ.</div>
  <div className="table-wrap"><table className="erp-table"><thead><tr><th>Planning Order</th><th>Main Operation</th><th>Masking trước Main</th><th>Unmasking trước Main</th></tr></thead><tbody>
   {filtered.map(r=><tr key={r.standard_operation}><td className="mono">{r.planning_sort_order??""}</td><td><b>{displayMain(r.standard_operation)}</b>{r.standard_operation.toUpperCase()==="PRIMER"&&<div className="muted mono">DB: PRIMER</div>}</td><td><Picker op={r.standard_operation} type="MASKING"/></td><td><Picker op={r.standard_operation} type="UNMASKING"/></td></tr>)}
  </tbody></table></div>
 </div>;
}
