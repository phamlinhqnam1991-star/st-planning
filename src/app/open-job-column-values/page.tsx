import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {OpenJobColumnValueManager} from "@/components/open-job-column-value-manager";
export const dynamic="force-dynamic";
export default async function Page(){
 return <main className="erp-shell">
  <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">CONFIGURATION</div></header>
  <AppTabs active="config"/>
  <div className="erp-workspace">
   <ConfigSidebar active="openjobcolumnvalues"/>
   <section className="erp-content">
    <ConfigPageHeader
     title="Open Job Column Values"
     subtitle="Tổng hợp mọi giá trị unique theo từng cột trong All Open Job — nguồn dữ liệu để cấu hình Batch Key / Recipe Rules."
     purpose="Là 'từ điển' giá trị của các cột Job (vd cột PRIMER1 có các giá trị nào) — giúp tạo điều kiện rule chính xác, đặt tên hiển thị dễ đọc và lọc nhanh trên Planning Board."
     impact="Dữ liệu này không tự đổi: bấm Scan / Rebuild để quét lại sau mỗi lần Import Master mới. Giá trị bị ngưng dùng (Inactive) sẽ không xuất hiện khi chọn điều kiện rule."
     prev={{label:"Thời gian xử lý (Process)",href:"/recipe-time-process"}}
     next={undefined}
    />
    <div className="notice recipe-note"><b>Cách dùng:</b> Bấm <b>Scan / Rebuild</b> để quét lại toàn bộ cột từ All Open Job hiện tại. Khi tạo rule, chọn cột là danh sách giá trị hiện ra tự động — không cần gõ tay.</div>
    <OpenJobColumnValueManager/>
   </section>
  </div>
 </main>
}
