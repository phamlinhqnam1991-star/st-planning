import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {ChemicalHandlingTimeManager} from "@/components/chemical-handling-time-manager";
import {getPool} from "@/lib/db";
export const dynamic="force-dynamic";

export default async function Page(){
 const c=await getPool().connect();
 try{
  const handlingRulesQ=await c.query(`select id,phase,priority,qty_min,qty_max,surface_min_dm2,surface_max_dm2,duration_minutes,note
            from md_chemical_handling_time_rule where is_active=true order by phase,priority,id`);
  return <main className="erp-shell">
   <header className="erp-header"><div><h1>ST Planning</h1></div><div className="erp-env">CONFIGURATION</div></header>
   <AppTabs active="config"/>
   <div className="erp-workspace">
    <ConfigSidebar active="recipetimeloading"/>
    <section className="erp-content">
     <ConfigPageHeader
      title="Thời gian Loading / Unloading"
      subtitle="Chemical Line: thời gian nạp (Loading) và dỡ (Unloading) lô theo Số lượng + Diện tích."
      purpose="Định nghĩa thời gian Loading/Unloading cho 1 lô Chemical: hệ thống chọn rule theo Priority, Qty và Surface dm² của lô (Min/Max để trống = không giới hạn)."
      impact="Thời gian này là đầu và cuối chuỗi thời gian mỗi lô trên Board Điều Độ. Sai rule → lô bị tính sai giờ, trạm Loading bị chồng chéo hoặc bỏ trống."
      prev={{label:"Công thức & Rule",href:"/recipe-operation-map"}}
      next={{label:"Thời gian xử lý (Process)",href:"/recipe-time-process"}}
     />
     <ChemicalHandlingTimeManager rules={handlingRulesQ.rows as any}/>
    </section>
   </div>
  </main>
 }finally{c.release()}
}
