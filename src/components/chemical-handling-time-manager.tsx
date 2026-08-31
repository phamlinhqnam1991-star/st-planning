"use client";
import {safeJson} from "@/lib/fetch-json";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {refreshConfigPage} from "@/lib/config/config-client";

type Rule={id:number;phase:"LOADING"|"UNLOADING";priority:number;qty_min:number|null;qty_max:number|null;surface_min_dm2:number|null;surface_max_dm2:number|null;duration_minutes:number;note:string|null};
const hhmm=(n:number)=>`${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;

export function ChemicalHandlingTimeManager({rules}:{rules:Rule[]}){
 const router=useRouter();
 const [form,setForm]=useState({phase:"LOADING",priority:"100",qty_min:"",qty_max:"",surface_min_dm2:"",surface_max_dm2:"",duration:"00:30",note:""});
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
 const patch=(x:Partial<typeof form>)=>setForm(v=>({...v,...x}));
 async function save(){
  const m=/^(\d{1,3}):(\d{2})$/.exec(form.duration);const duration=m?Number(m[1])*60+Number(m[2]):0;
  if(!duration){setMessage("Duration phải theo HH:MM và lớn hơn 00:00.");return}
  setBusy(true);setMessage("");
  const res=await fetch("/api/process-recipe/chemical-handling-time",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...form,duration_minutes:duration})});
  const data=await safeJson(res);setBusy(false);
  if(!res.ok){setMessage(data.error||"Không lưu được rule.");return} refreshConfigPage(router);
 }
 async function remove(id:number){
  if(!confirm("Ngưng sử dụng rule này?"))return;
  await fetch("/api/process-recipe/chemical-handling-time",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id})});refreshConfigPage(router);
 }
 return <section className="erp-table-panel section">
  <div className="erp-panel-head"><div><b>Chemical Line · Loading / Unloading Time</b><small className="planning-sub">Chọn Duration theo Priority, Qty và tổng Surface dm². Min/Max để trống nghĩa là không giới hạn.</small></div><span>{rules.length} rules</span></div>
  <div className="chemical-handling-form">
   <select className="input" value={form.phase} onChange={e=>patch({phase:e.target.value})}><option>LOADING</option><option>UNLOADING</option></select>
   <input className="input" type="number" min="1" placeholder="Priority" value={form.priority} onChange={e=>patch({priority:e.target.value})}/>
   <input className="input" type="number" min="0" placeholder="SL min" value={form.qty_min} onChange={e=>patch({qty_min:e.target.value})}/>
   <input className="input" type="number" min="0" placeholder="SL max" value={form.qty_max} onChange={e=>patch({qty_max:e.target.value})}/>
   <input className="input" type="number" min="0" placeholder="dm² min" value={form.surface_min_dm2} onChange={e=>patch({surface_min_dm2:e.target.value})}/>
   <input className="input" type="number" min="0" placeholder="dm² max" value={form.surface_max_dm2} onChange={e=>patch({surface_max_dm2:e.target.value})}/>
   <input className="input mono" placeholder="HH:MM" value={form.duration} onChange={e=>patch({duration:e.target.value})}/>
   <input className="input" placeholder="Ghi chú" value={form.note} onChange={e=>patch({note:e.target.value})}/>
   <button className="btn primary" disabled={busy} onClick={save}>{busy?"Đang lưu...":"Thêm rule"}</button>
  </div>
  {message&&<div className="notice">{message}</div>}
  <div className="table-wrap"><table className="erp-table"><thead><tr><th>Giai đoạn</th><th>Ưu tiên</th><th>SL min</th><th>SL max</th><th>dm² min</th><th>dm² max</th><th>Thời gian</th><th>Ghi chú</th><th></th></tr></thead><tbody>
   {rules.map(r=><tr key={r.id}><td><b>{r.phase}</b></td><td>{r.priority}</td><td>{r.qty_min??"—"}</td><td>{r.qty_max??"—"}</td><td>{r.surface_min_dm2??"—"}</td><td>{r.surface_max_dm2??"—"}</td><td className="mono"><b>{hhmm(r.duration_minutes)}</b></td><td>{r.note||"—"}</td><td><button className="btn small danger-btn" onClick={()=>remove(r.id)}>Ngưng</button></td></tr>)}
  </tbody></table></div>
 </section>
}
