"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {safeJson} from "@/lib/fetch-json";
import {ST_REALTIME_WINDOW_EVENT,isStRealtimeChange,type StRealtimeChange} from "@/lib/realtime/st-realtime";
import {usePopupMessage} from "@/hooks/use-popup-message";

type Area={area_code:string;area_name:string;sort_order:number};
type Main={standard_operation:string;planning_sort_order:number|null};
type Column={source_column:string};
type Allocation={area_code:string;area_name:string;allocated_people:number|string};
type Mapping={id:number;standard_operation:string;source_column:string;area_code:string;area_name:string;time_basis:"JOB_TOTAL"|"PER_PIECE";value_unit:"HOURS"|"MINUTES";sort_order:number};
type MappingDraft={id:number;standard_operation:string;source_column:string;area_code:string;time_basis:"JOB_TOTAL"|"PER_PIECE";value_unit:"HOURS"|"MINUTES";sort_order:number};

type ConfigPayload={
 ok?:boolean;
 migrationReady?:boolean;
 warnings?:string[];
 totalPeople?:number;
 areas?:Area[];
 mains?:Main[];
 columns?:Column[];
 allocations?:Allocation[];
 mappings?:Mapping[];
 error?:string;
};

const blankMapping=():MappingDraft=>({id:0,standard_operation:"",source_column:"",area_code:"",time_basis:"JOB_TOTAL",value_unit:"HOURS",sort_order:100});
const displayMain=(v:string)=>v.toUpperCase()==="PRIMER"?"PRIMER1":v;
const n=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)?x:0;};

/**
 * V514: Masking config is a client data island.
 * Saving/realtime reloads only this dataset; it never router.refresh()'es the
 * whole Server Component tree.  A DB/API failure becomes an in-panel warning.
 */
export function MaskingTimeEstimateConfigManager(){
 const [message,setMessage]=useState("");usePopupMessage(message);
 const [busy,setBusy]=useState("");
 const [loading,setLoading]=useState(true);
 const [migrationReady,setMigrationReady]=useState(false);
 const [loadWarnings,setLoadWarnings]=useState<string[]>([]);
 const [totalPeople,setTotalPeople]=useState(0);
 const [areas,setAreas]=useState<Area[]>([]);
 const [mains,setMains]=useState<Main[]>([]);
 const [columns,setColumns]=useState<Column[]>([]);
 const [allocations,setAllocations]=useState<Allocation[]>([]);
 const [mappings,setMappings]=useState<Mapping[]>([]);
 const [total,setTotal]=useState("0");
 const [alloc,setAlloc]=useState<Record<string,string>>({});
 const [areaPick,setAreaPick]=useState("");
 const [mappingDraft,setMappingDraft]=useState<MappingDraft>(blankMapping());
 const [columnSearch,setColumnSearch]=useState("mask");
 const [mainSearch,setMainSearch]=useState("");
 const loadInFlightRef=useRef(false);
 const loadAgainRef=useRef(false);
 const realtimeTimerRef=useRef<number|null>(null);

 const applyPayload=useCallback((d:ConfigPayload)=>{
  const nextAreas=Array.isArray(d.areas)?d.areas:[];
  const nextAllocations=Array.isArray(d.allocations)?d.allocations:[];
  const nextTotal=n(d.totalPeople);
  const nextAlloc=Object.fromEntries(nextAllocations.map(x=>[String(x.area_code),String(x.allocated_people??0)]));
  setMigrationReady(Boolean(d.migrationReady));
  setLoadWarnings(Array.isArray(d.warnings)?d.warnings.map(String):[]);
  setTotalPeople(nextTotal);
  setAreas(nextAreas);
  setMains(Array.isArray(d.mains)?d.mains:[]);
  setColumns(Array.isArray(d.columns)?d.columns:[]);
  setAllocations(nextAllocations);
  setMappings(Array.isArray(d.mappings)?d.mappings:[]);
  setTotal(String(nextTotal));
  setAlloc(nextAlloc);
  setAreaPick(prev=>{
   if(prev&&nextAreas.some(a=>a.area_code===prev)&&!Object.prototype.hasOwnProperty.call(nextAlloc,prev))return prev;
   return nextAreas.find(a=>!Object.prototype.hasOwnProperty.call(nextAlloc,a.area_code))?.area_code||"";
  });
 },[]);

 const loadData=useCallback(async()=>{
  if(loadInFlightRef.current){loadAgainRef.current=true;return;}
  loadInFlightRef.current=true;
  setLoading(true);
  try{
   const r=await fetch("/api/config/masking-time-estimate",{method:"GET",cache:"no-store",headers:{"cache-control":"no-cache"}});
   const d=await safeJson(r) as ConfigPayload;
   if(!r.ok){
    setLoadWarnings([d.error||`Masking Config API HTTP ${r.status}`]);
    return;
   }
   applyPayload(d);
  }catch(e){
   setLoadWarnings([e instanceof Error?e.message:"Không tải được Masking Time Estimate Config."]);
  }finally{
   setLoading(false);
   loadInFlightRef.current=false;
   if(loadAgainRef.current){
    loadAgainRef.current=false;
    window.setTimeout(()=>{void loadData();},120);
   }
  }
 },[applyPayload]);

 useEffect(()=>{void loadData();},[loadData]);

 // Remote/local Global Realtime events update only this config dataset.
 useEffect(()=>{
  const onRealtime=(ev:Event)=>{
   const change=(ev as CustomEvent<StRealtimeChange>).detail;
   if(!isStRealtimeChange(change))return;
   if(!change.domains.some(x=>x==="ALL"||x==="CONFIG"||x==="MASTER"||x==="IMPORT"))return;
   if(realtimeTimerRef.current!=null)window.clearTimeout(realtimeTimerRef.current);
   realtimeTimerRef.current=window.setTimeout(()=>{realtimeTimerRef.current=null;void loadData();},300);
  };
  window.addEventListener(ST_REALTIME_WINDOW_EVENT,onRealtime);
  return()=>{
   window.removeEventListener(ST_REALTIME_WINDOW_EVENT,onRealtime);
   if(realtimeTimerRef.current!=null)window.clearTimeout(realtimeTimerRef.current);
  };
 },[loadData]);

 const allocationRows=useMemo(()=>areas.filter(a=>Object.prototype.hasOwnProperty.call(alloc,a.area_code)),[areas,alloc]);
 const allocatedTotal=useMemo(()=>allocationRows.reduce((sum,a)=>sum+n(alloc[a.area_code]),0),[allocationRows,alloc]);
 const remaining=n(total)-allocatedTotal;
 const visibleMappings=useMemo(()=>{
  const q=mainSearch.trim().toUpperCase();
  return mappings.filter(x=>!q||`${x.standard_operation} ${x.source_column} ${x.area_name}`.toUpperCase().includes(q));
 },[mappings,mainSearch]);
 const filteredColumns=useMemo(()=>{
  const q=columnSearch.trim().toUpperCase();
  const list=columns.map(x=>x.source_column).filter(Boolean);
  if(!q)return list;
  return list.filter(x=>x.toUpperCase().includes(q));
 },[columns,columnSearch]);

 async function post(body:Record<string,unknown>,key:string,ok:string):Promise<boolean>{
  if(!migrationReady){setMessage("Chưa chạy đủ 4 query Masking Estimate V512 trên Aiven.");return false;}
  setBusy(key);setMessage("");
  try{
   const r=await fetch("/api/config/masking-time-estimate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
   const d=await safeJson(r);if(!r.ok)throw new Error(d.error||"Không lưu được cấu hình.");
   setMessage(ok);
   await loadData();
   return true;
  }catch(e){
   setMessage(e instanceof Error?e.message:"Không lưu được cấu hình.");
   return false;
  }finally{setBusy("");}
 }

 async function saveMapping(){
  if(!mappingDraft.standard_operation||!mappingDraft.source_column||!mappingDraft.area_code){setMessage("Chọn Main Operation, Masking Time Column và Physical Area.");return;}
  const ok=await post({action:"SAVE_MAPPING",...mappingDraft},`map-${mappingDraft.id||"new"}`,"Đã lưu Main Operation → Masking Time Column.");
  if(ok)setMappingDraft(blankMapping());
 }

 return <div className="masking-estimate-config-stack">
  {loading&&<div className="notice"><b>Đang tải Masking Time Estimate Config...</b> Trang vẫn giữ nguyên, không refresh toàn bộ.</div>}
  {!migrationReady&&!loading&&<div className="notice error"><b>Schema Masking Estimate chưa đầy đủ.</b> Hãy chạy đủ <b>4 query V512</b> trên Aiven. Scheduling Board vẫn hoạt động bình thường; chỉ phần Masking Estimate tạm chưa dùng được.</div>}
  {!!loadWarnings.length&&<div className="notice warning"><b>V514 · Config load diagnostics</b><ul style={{margin:"6px 0 0 18px"}}>{loadWarnings.map((x,i)=><li key={`${i}-${x}`}>{x}</li>)}</ul><div style={{marginTop:8}}><button className="btn small" type="button" disabled={loading} onClick={()=>void loadData()}>Tải lại riêng Masking Config</button></div></div>}

  <section className="erp-table-panel section">
   <div className="erp-panel-head"><div><b>Masking Manpower · Physical Area</b><div className="muted">Chỉ dùng để chia person-hours thành thời lượng ước tính. Không phải finite-capacity scheduling.</div></div></div>
   <div className="masking-manpower-summary">
    <label>Tổng người bộ phận Masking
     <div className="row"><input className="input mono" type="number" min="0" step="1" value={total} onChange={e=>setTotal(e.target.value)}/><button className="btn primary" type="button" disabled={!!busy||loading} onClick={()=>void post({action:"SAVE_TOTAL",total_people:n(total)},"total","Đã lưu tổng số người Masking.")}>Lưu tổng</button></div>
    </label>
    <div className={`masking-capacity-kpi ${remaining<0?"is-over":""}`}><span>Đã phân bổ</span><b>{allocatedTotal}</b><small>Tổng: {n(total)} · Còn lại: {remaining}</small></div>
   </div>
   {remaining<0&&<div className="notice warning" style={{margin:"0 12px 12px"}}><b>Phân bổ vượt tổng người:</b> {Math.abs(remaining)} người. Đây là cảnh báo cấu hình; estimate từng Area vẫn dùng số người đã phân bổ.</div>}
   <div className="masking-area-add row">
    <select className="input" value={areaPick} onChange={e=>setAreaPick(e.target.value)}><option value="">Chọn Physical Area...</option>{areas.filter(a=>!Object.prototype.hasOwnProperty.call(alloc,a.area_code)).map(a=><option key={a.area_code} value={a.area_code}>{a.area_name}</option>)}</select>
    <button className="btn" type="button" disabled={!areaPick||!!busy||loading} onClick={()=>{
     const picked=areaPick;
     const nextAlloc={...alloc,[picked]:"0"};
     setAlloc(nextAlloc);
     setAreaPick(areas.find(a=>!Object.prototype.hasOwnProperty.call(nextAlloc,a.area_code))?.area_code||"");
    }}>+ Thêm Area</button>
   </div>
   <div className="table-wrap"><table className="erp-table"><thead><tr><th>Physical Area</th><th>Allocated People</th><th>Ý nghĩa</th><th>Tác vụ</th></tr></thead><tbody>
    {allocationRows.map(a=><tr key={a.area_code}><td><b>{a.area_name}</b><div className="muted mono">{a.area_code}</div></td><td style={{maxWidth:180}}><input className="input mono" type="number" min="0" step="1" value={alloc[a.area_code]??"0"} onChange={e=>setAlloc(v=>({...v,[a.area_code]:e.target.value}))}/></td><td className="muted">Workload của Main gán vào Area này sẽ chia cho số người này.</td><td><div className="row"><button className="btn primary small" type="button" disabled={!!busy||loading} onClick={()=>void post({action:"SAVE_AREA",area_code:a.area_code,allocated_people:n(alloc[a.area_code])},`area-${a.area_code}`,`Đã lưu manpower ${a.area_name}.`)}>Lưu</button><button className="btn small danger-btn" type="button" disabled={!!busy||loading} onClick={()=>void post({action:"DELETE_AREA",area_code:a.area_code},`area-del-${a.area_code}`,`Đã bỏ manpower ${a.area_name}.`)}>Bỏ</button></div></td></tr>)}
    {!allocationRows.length&&<tr><td colSpan={4} className="muted">Chưa phân bổ người cho Physical Area.</td></tr>}
   </tbody></table></div>
  </section>

  <section className="erp-table-panel section">
   <div className="erp-panel-head"><div><b>Main Operation → All Open Job Masking Time Column</b><div className="muted">Có thể gán nhiều cột cho một Main; workload các cột được cộng để ước tính.</div></div><input className="input" style={{maxWidth:300}} value={mainSearch} onChange={e=>setMainSearch(e.target.value)} placeholder="Tìm Main / cột / Area..."/></div>
   <div className="masking-time-map-form">
    <label>Main Operation<select className="input" value={mappingDraft.standard_operation} onChange={e=>setMappingDraft(v=>({...v,standard_operation:e.target.value}))}><option value="">Chọn Main...</option>{mains.map(x=><option key={x.standard_operation} value={x.standard_operation}>{x.planning_sort_order??"—"} · {displayMain(x.standard_operation)}</option>)}</select></label>
    <label>Physical Area<select className="input" value={mappingDraft.area_code} onChange={e=>setMappingDraft(v=>({...v,area_code:e.target.value}))}><option value="">Chọn Area...</option>{areas.map(x=><option key={x.area_code} value={x.area_code}>{x.area_name}</option>)}</select></label>
    <label>Time Basis<select className="input" value={mappingDraft.time_basis} onChange={e=>setMappingDraft(v=>({...v,time_basis:e.target.value==="PER_PIECE"?"PER_PIECE":"JOB_TOTAL"}))}><option value="JOB_TOTAL">JOB TOTAL · giá trị đã là tổng của Job</option><option value="PER_PIECE">PER PIECE · nhân Qty của Job</option></select></label>
    <label>Đơn vị cột<select className="input" value={mappingDraft.value_unit} onChange={e=>setMappingDraft(v=>({...v,value_unit:e.target.value==="MINUTES"?"MINUTES":"HOURS"}))}><option value="HOURS">Hours</option><option value="MINUTES">Minutes</option></select></label>
    <label className="masking-column-search">Tìm cột thời gian<input className="input" value={columnSearch} onChange={e=>setColumnSearch(e.target.value)} placeholder="mask / MSKG-AND / primer..."/></label>
    <label className="masking-column-select">Masking Time Column<select className="input" value={mappingDraft.source_column} onChange={e=>setMappingDraft(v=>({...v,source_column:e.target.value}))}><option value="">Chọn cột All Open Job...</option>{filteredColumns.map(x=><option key={x} value={x}>{x}</option>)}</select><small className="muted">Danh sách lấy từ Open Job Column Values, không hard-code tên cột.</small></label>
    <label>Sort<input className="input mono" type="number" value={mappingDraft.sort_order} onChange={e=>setMappingDraft(v=>({...v,sort_order:Number(e.target.value)||100}))}/></label>
    <div className="masking-map-actions"><button className="btn primary" type="button" disabled={!!busy||loading} onClick={()=>void saveMapping()}>{busy.startsWith("map-")?"Đang lưu...":mappingDraft.id?"Cập nhật Mapping":"+ Thêm Mapping"}</button>{mappingDraft.id>0&&<button className="btn" type="button" onClick={()=>setMappingDraft(blankMapping())}>Hủy sửa</button>}</div>
   </div>
   <div className="notice" style={{margin:"0 12px 12px"}}><b>Ví dụ:</b> BSAUNSLD → <code>...MSKG-AND</code> → Chemical Line. Nếu Batch có 35 person-hours và Area có 10 người thì Estimated Masking Duration = 03:30.</div>
   <div className="table-wrap"><table className="erp-table"><thead><tr><th>#</th><th>Main Operation</th><th>Masking Time Column</th><th>Physical Area</th><th>Basis / Unit</th><th>Tác vụ</th></tr></thead><tbody>
    {visibleMappings.map((x,i)=><tr key={x.id}><td>{i+1}</td><td><b>{displayMain(x.standard_operation)}</b></td><td className="mono"><b>{x.source_column}</b></td><td>{x.area_name}<div className="muted mono">{x.area_code}</div></td><td><span className="badge">{x.time_basis}</span> <span className="badge">{x.value_unit}</span></td><td><div className="row"><button className="btn small" type="button" onClick={()=>setMappingDraft({id:x.id,standard_operation:x.standard_operation,source_column:x.source_column,area_code:x.area_code,time_basis:x.time_basis,value_unit:x.value_unit,sort_order:x.sort_order})}>Sửa</button><button className="btn small danger-btn" type="button" disabled={!!busy||loading} onClick={()=>void post({action:"DELETE_MAPPING",id:x.id},`map-del-${x.id}`,"Đã bỏ Mapping Masking Time.")}>Xóa</button></div></td></tr>)}
    {!visibleMappings.length&&<tr><td colSpan={6} className="muted">Chưa có Main Operation → Masking Time Column mapping.</td></tr>}
   </tbody></table></div>
  </section>
 </div>;
}
