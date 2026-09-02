import {getPool} from "@/lib/db";
import {StGroupManager} from "@/components/st-group-manager";
import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
export const dynamic="force-dynamic";
export default async function Page(){
 const q=await getPool().query(`
  select st_group,group_name,description,sort_order,is_active
  from md_st_group
  where is_active=true
  order by sort_order,st_group
 `);
 const data=q.rows;
 return <main className="erp-shell">
  <header className="erp-header"><div><h1>ST Planning</h1></div><div className="erp-env">CONFIGURATION</div></header>
  <AppTabs active="config"/>
  <div className="erp-workspace">
   <ConfigSidebar active="stgroup"/>
   <section className="erp-content">
    <ConfigPageHeader
     title="ST Group Master"
     subtitle={`${data?.length||0} nhóm đang hoạt động · Thêm / Sửa / Ngưng dùng`}
     purpose="Danh mục nhóm công đoạn ST — gom các Operation tương tự thành 1 nhóm (vd tất cả công đoạn che chắn thuộc nhóm MSKG)."
     impact="Nhóm ST là đầu mối nối từ Source → Main Mapping xuống Khu vực vật lý và Schedule Area. Bỏ nhóm sẽ khiến các Operation thuộc nhóm đó không cấu hình được khu vực."
     prev={{label:"Main Operation Master",href:"/master/operation"}}
     next={{label:"Physical Area Master",href:"/area"}}
    />
    <StGroupManager rows={(data||[]) as any}/>
   </section>
  </div>
 </main>
}
