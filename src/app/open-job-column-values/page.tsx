import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {OpenJobColumnValueManager} from "@/components/open-job-column-value-manager";
export const dynamic="force-dynamic";
export default async function Page(){
 return <main className="erp-shell erpkit-migrated-page">
  <ErpAppHeader module="CONFIGURATION"/>
  <AppTabs active="config"/>
  <div className="erp-workspace">
   <ConfigSidebar active="openjobcolumnvalues"/>
   <section className="erp-content">
    <ConfigPageHeader
     title="Open Job Column Values"
     subtitle="Tổng hợp mọi giá trị unique theo từng cột trong All Open Job — nguồn dữ liệu để cấu hình Batch Key / Recipe Rules."
     purpose="Là 'từ điển' giá trị của các cột Job (vd cột PRIMER1 có các giá trị nào) — giúp tạo điều kiện rule chính xác, đặt tên hiển thị dễ đọc và lọc nhanh trên Planning Board."
     impact="Dữ liệu này không tự đổi: bấm Scan / Rebuild để quét lại sau mỗi lần Import Master mới. Giá trị bị ngưng dùng (Inactive) sẽ không xuất hiện khi chọn điều kiện rule."
     prev={{label:"Recipe & Batch Rules",href:"/recipe-operation-map"}}
     next={{label:"Loading / Unloading Time",href:"/recipe-time-loading"}}
    />
    <OpenJobColumnValueManager/>
   </section>
  </div>
 </main>
}
