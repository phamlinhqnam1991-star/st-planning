import {createAdminClient} from "@/lib/supabase/admin";
import {OperationMappingManager} from "@/components/operation-mapping-manager";
import {AppTabs,SubTabs} from "@/components/app-tabs";
export const dynamic="force-dynamic";
const tabs=[{key:"operation",label:"Operation Master",href:"/master/operation"},{key:"operationmapping",label:"ST Operation Mapping",href:"/master/operationmapping"},{key:"stgroup",label:"ST Group Master",href:"/st-groups"},{key:"area",label:"Area Master",href:"/area"}];
export default async function Page(){const admin=createAdminClient();
 const [{data:rows,error},{data:masters},{data:ops}]=await Promise.all([
  admin.from("md_st_operation_mapping").select("*").eq("is_active",true).order("sort_order"),
  admin.from("md_st_group").select("st_group").eq("is_active",true).order("sort_order"),
  admin.from("md_operation").select("operation_code").eq("is_active",true).order("operation_code")
 ]);if(error)throw error;
 const groups=[...new Set((masters||[]).map((x:any)=>String(x.st_group)).filter(Boolean))];
 const sourceOperations=[...new Set((ops||[]).map((x:any)=>String(x.operation_code)).filter(Boolean))];
 return <main className="erp-shell">
  <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">CONFIGURATION</div></header>
  <AppTabs active="config"/>
  <div className="erp-workspace">
   <aside className="erp-sidebar"><div className="erp-sidebar-title">CẤU HÌNH</div><SubTabs items={tabs} active="operationmapping"/></aside>
   <section className="erp-content">
    <div className="erp-page-head"><div><h2>ST Operation Mapping</h2><p>{rows?.length||0} active mappings · Add / Remove / Move Operation Code</p></div></div>
    <OperationMappingManager rows={(rows||[]) as any} groups={groups} sourceOperations={sourceOperations}/>
   </section>
  </div>
 </main>
}