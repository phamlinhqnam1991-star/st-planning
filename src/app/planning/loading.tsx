import {ErpAppShell,ErpPageHeader} from "@/components/erp";
import {ST_ERP_MODULES} from "@/lib/erp/st-navigation";

export default function Loading(){
 return <ErpAppShell moduleItems={ST_ERP_MODULES} activeModule="planning" environment="ERP PLANNING">
  <div className="planning-erp-version">
   <ErpPageHeader
    eyebrow="PLANNING / BATCH"
    title="Planning Board"
    description="Đang mở ERP Planning Board…"
    status={<span className="erpkit-status erpkit-status-info">LOADING</span>}
   />
   <div className="erpkit-section">
    <div className="erpkit-section-body">
     <div className="planning-load-skeleton">Đang tải bộ lọc Planning và Candidate Matrix…</div>
    </div>
   </div>
  </div>
 </ErpAppShell>;
}
