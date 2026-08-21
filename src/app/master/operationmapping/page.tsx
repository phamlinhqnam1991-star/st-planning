import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {OperationMappingManager} from "@/components/operation-mapping-manager";
import {AppTabs,SubTabs} from "@/components/app-tabs";
export const dynamic="force-dynamic";
const tabs=[{key:"operation",label:"Operation Master",href:"/master/operation"},{key:"operationmapping",label:"ST Operation Mapping",href:"/master/operationmapping"},{key:"stgroup",label:"ST Group Master",href:"/st-groups"},{key:"area",label:"Area Master",href:"/area"}];
export default async function Page(){
 const auth=await createClient();const {data:{user}}=await auth.auth.getUser();if(!user)redirect("/login");const admin=createAdminClient();
 const [{data:rows,error},{data:masters},{data:ops}]=await Promise.all([
  admin.from("md_st_operation_mapping").select("*").eq("is_active",true).order("sort_order"),
  admin.from("md_st_group").select("st_group").eq("is_active",true).order("sort_order"),
  admin.from("md_operation").select("operation_code").eq("is_active",true).order("operation_code")
 ]);if(error)throw error;
 const groups=[...new Set((masters||[]).map((x:any)=>String(x.st_group)).filter(Boolean))];
 const sourceOperations=[...new Set((ops||[]).map((x:any)=>String(x.operation_code)).filter(Boolean))];
 return <main className="shell"><div className="top"><div className="brand"><h1>ST Operation Mapping</h1><p>{rows?.length||0} active records · Add / Remove / Move Operation Code · {user.email}</p></div></div><AppTabs active="config"/><SubTabs items={tabs} active="operationmapping"/><div className="section"><OperationMappingManager rows={(rows||[]) as any} groups={groups} sourceOperations={sourceOperations}/></div></main>
}