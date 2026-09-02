import {ErpAppShell,ErpPageHeader} from "@/components/erp";
import {ST_ERP_MODULES} from "@/lib/erp/st-navigation";

export default function Loading(){
 return <ErpAppShell moduleItems={ST_ERP_MODULES} activeModule="planning" environment="ST PLANNING">
  <div className="planning-erp-version">
   <ErpPageHeader
    eyebrow="PLANNING BOARD"
    title="Planning Board"
    description="Đang mở ERP Planning Board…"
    status={<span className="erpkit-status erpkit-status-info"><span className="erpkit-status-dot"/>ĐANG TẢI</span>}
   />
   <div className="erpkit-section">
    <div className="erpkit-section-body">
     <div className="planning-load-skeleton">Đang tải bộ lọc và ma trận kế hoạch…</div>
    </div>
   </div>
  </div>
 </ErpAppShell>;
}
