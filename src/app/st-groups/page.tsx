import {createAdminClient} from "@/lib/supabase/admin";import {StGroupManager} from "@/components/st-group-manager";import {AppTabs,SubTabs} from "@/components/app-tabs";
export const dynamic="force-dynamic";
const tabs=[{key:"operation",label:"Operation Master",href:"/master/operation"},{key:"operationmapping",label:"ST Operation Mapping",href:"/master/operationmapping"},{key:"stgroup",label:"ST Group Master",href:"/st-groups"},{key:"area",label:"Area Master",href:"/area"},
 {key:"processrecipe",label:"Process Recipe",href:"/process-recipes"},{key:"autoplanning",label:"Auto Planning Rules",href:"/auto-planning-rules"}];
export default async function Page(){
 const admin=createAdminClient();const {data,error}=await admin.from("md_st_group").select("*").eq("is_active",true).order("sort_order");if(error)throw error;
 return <main className="erp-shell">
  <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">CONFIGURATION</div></header>
  <AppTabs active="config"/>
  <div className="erp-workspace">
   <aside className="erp-sidebar"><div className="erp-sidebar-title">CẤU HÌNH</div><SubTabs items={tabs} active="stgroup"/></aside>
   <section className="erp-content"><div className="erp-page-head"><div><h2>ST Group Master</h2><p>{data?.length||0} active groups · Add / Edit / Deactivate</p></div></div><StGroupManager rows={(data||[]) as any}/></section>
  </div>
 </main>
}