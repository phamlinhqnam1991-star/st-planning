import Link from "next/link";
import {BatchRowActions} from "@/components/batch-row-actions";
import {ResetAllBatchesButton} from "@/components/reset-all-batches-button";
import {LogoutButton} from "@/components/logout-button";
import {ErpAppShell,ErpPageHeader,ErpTabs} from "@/components/erp";
import {getPool} from "@/lib/db";
import {getRecentPlanningBatches} from "@/lib/planning/recent-batches";
import {ST_ERP_MODULE_GROUPS} from "@/lib/erp/st-navigation";

export const dynamic="force-dynamic";


const formatNumber=(value:unknown,maxDecimals=2)=>{
 const n=Number(value??0);
 if(!Number.isFinite(n))return "0";
 const fixed=n.toFixed(maxDecimals);
 let [whole,decimal]=fixed.split(".");
 whole=whole.replace(/\B(?=(\d{3})+(?!\d))/g,".");
 decimal=(decimal||"").replace(/0+$/g,"");
 return decimal?`${whole},${decimal}`:whole;
};

const hhmm=(minutes:number|null)=>{
 if(minutes==null)return "—";
 const h=Math.floor(minutes/60);
 const m=minutes%60;
 return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
};

const batchStatusTone=(value:unknown)=>{
 const status=String(value||"").trim().toUpperCase();
 if(["COMPLETED","DONE"].includes(status))return "erpkit-status-success";
 if(["RUNNING","SCHEDULED"].includes(status))return "erpkit-status-info";
 if(["HOLD","WAITING"].includes(status))return "erpkit-status-warning";
 if(["CANCELLED","ERROR"].includes(status))return "erpkit-status-danger";
 return "erpkit-status-neutral";
};

const batchStatusLabel=(value:unknown)=>{
 const status=String(value||"").trim().toUpperCase();
 if(status==="UNSCHEDULED")return "CHƯA ĐIỀU ĐỘ";
 if(status==="SCHEDULED")return "ĐÃ ĐIỀU ĐỘ";
 if(status==="RUNNING")return "ĐANG CHẠY";
 if(["COMPLETED","DONE"].includes(status))return "HOÀN TẤT";
 if(["HOLD","WAITING"].includes(status))return "ĐANG CHỜ";
 if(status==="CANCELLED")return "ĐÃ HỦY";
 if(status==="ERROR")return "LỖI";
 return status||"—";
};

export default async function Page({searchParams}:{searchParams:Promise<{area?:string;op?:string;recipe?:string;prevBatch?:string}>}){
 const sp=await searchParams;
 const scopeParams=new URLSearchParams();
 for(const [key,value] of Object.entries(sp)){if(value)scopeParams.set(key,String(value));}
 const scopeQuery=scopeParams.toString();
 const scoped=(base:string)=>scopeQuery?`${base}?${scopeQuery}`:base;
 const c=await getPool().connect();
 try{
  const batchesQ=await getRecentPlanningBatches(c,100);
  return <ErpAppShell
   moduleGroups={ST_ERP_MODULE_GROUPS}
   activeModule="operations"
   activeSecondary="planning"
   environment="ST PLANNING"
   userArea={<LogoutButton presentation="erp"/>}
   breadcrumb={<><Link href="/planning">Planning Board</Link><span>/</span><b>Batch gần đây</b></>}
  >
   <div className="planning-erp-version">
    <ErpPageHeader
     eyebrow="PLANNING BOARD"
     title="Batch gần đây"
     description="Theo dõi các Batch đã tạo từ Planning Board và mở nhanh chi tiết khi cần."
     status={<span className="erpkit-status erpkit-status-success"><span className="erpkit-status-dot"/>LIVE</span>}
    />
    <ErpTabs active="batches" items={[
     {key:"matrix",label:"Ma trận kế hoạch",href:scoped("/planning")},
     {key:"batches",label:"Batch gần đây",href:scoped("/planning/batches"),count:batchesQ.rows.length},
    ]}/>

    <div className="erpkit-section erpkit-live-batches">
     <div className="erpkit-section-head">
      <div><b>Danh sách Batch</b><small>{batchesQ.rows.length} Batch gần nhất</small></div>
      <ResetAllBatchesButton presentation="erp"/>
     </div>
     <div className="table-wrap">
      <table className="erp-table planning-batch-table">
       <thead><tr>
        <th>Batch</th><th>Ngày</th><th>Khu vực</th><th>Main Operation</th><th>Recipe</th>
        <th className="num">Job</th><th className="num">Qty</th><th className="num">Diện tích</th>
        <th>Thời gian</th><th>Bắt đầu</th><th>Kết thúc</th><th>Trạng thái</th><th className="action"></th>
       </tr></thead>
       <tbody>
        {batchesQ.rows.map((b:any)=><tr key={b.id}>
         <td><b>{b.batch_no||"—"}</b></td>
         <td>{String(b.planning_date).slice(0,10)}</td>
         <td>{b.area_name||"—"}</td>
         <td>{b.standard_operation}</td>
         <td>{b.recipe_no?<><b>{b.recipe_no}</b><small className="planning-sub">{b.recipe_name||"—"}</small></>:"—"}</td>
         <td className="num">{b.total_jobs}</td>
         <td className="num">{formatNumber(b.total_qty)}</td>
         <td className="num">{formatNumber(b.total_surface_dm2)}</td>
         <td className="mono">{hhmm(b.process_minutes)}</td>
         <td>{b.planned_start?new Date(b.planned_start).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"}):"—"}</td>
         <td>{b.planned_end?new Date(b.planned_end).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"}):"—"}</td>
         <td><span className={`erpkit-status ${batchStatusTone(b.status)}`}><span className="erpkit-status-dot"/>{batchStatusLabel(b.status)}</span></td>
         <td className="action"><div className="batch-list-actions">
          <Link className="erp-link" href={`/planning/batches/${b.id}`}>Chi tiết →</Link>
          <BatchRowActions batchId={Number(b.id)} batchNo={b.batch_no||"—"} currentRecipeKey={b.recipe_key||null} presentation="erp"/>
         </div></td>
        </tr>)}
        {!batchesQ.rows.length&&<tr><td colSpan={13} className="muted">Chưa có Batch nào.</td></tr>}
       </tbody>
      </table>
     </div>
    </div>
   </div>
  </ErpAppShell>;
 }finally{c.release();}
}
