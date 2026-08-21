import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {AreaManager} from "@/components/area-manager";
import {AppTabs,SubTabs} from "@/components/app-tabs";
export const dynamic="force-dynamic";
const tabs=[{key:"operation",label:"Operation Master",href:"/master/operation"},{key:"operationmapping",label:"ST Operation Mapping",href:"/master/operationmapping"},{key:"stgroup",label:"ST Group Master",href:"/st-groups"},{key:"area",label:"Area Master",href:"/area"}];
export default async function AreaPage(){const s=await createClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/login");return <main className="shell"><div className="top"><div className="brand"><h1>Area Master</h1><p>Tự thêm/sửa Area và gán ST Group · {user.email}</p></div></div><AppTabs active="config"/><SubTabs items={tabs} active="area"/><div className="section"><AreaManager/></div></main>}
