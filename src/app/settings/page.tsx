import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {getStats} from "@/lib/stats";
import {LogoutButton} from "@/components/logout-button";
import {AppTabs,SubTabs} from "@/components/app-tabs";
export const dynamic="force-dynamic";
const sub=[
 {key:"operation",label:"Operation Master",href:"/master/operation"},
 {key:"operationmapping",label:"ST Operation Mapping",href:"/master/operationmapping"},
 {key:"stgroup",label:"ST Group Master",href:"/st-groups"},
 {key:"area",label:"Area Master",href:"/area"},
];
export default async function Page(){
 const s=await createClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/login");
 const data=await getStats(),c=data.counts;
 const stats=[
  ["Operation Master",c.md_operation_master,"/master/operation"],
  ["ST Operation Mapping",c.md_st_operation_mapping,"/master/operationmapping"],
  ["ST Group Master",c.md_st_group,"/st-groups"],
  ["Area Master",c.md_area,"/area"],
 ];
 return <main className="shell"><div className="top"><div className="brand"><h1>ST Planning</h1><p>Cấu hình Planning · {user.email}</p></div><LogoutButton/></div>
 <AppTabs active="config"/><SubTabs items={sub}/>
 {data.issues.length>0&&<div className="notice section"><b>Database cần kiểm tra:</b><ul className="issue-list">{data.issues.map((x:string)=><li key={x}>{x}</li>)}</ul></div>}
 <div className="grid section">{stats.map(([t,n,h])=><Link key={String(t)} href={String(h)} className="card stat"><b>{Number(n||0).toLocaleString()}</b><span>{String(t)}</span></Link>)}</div>
 <div className="card section"><h2 style={{marginTop:0}}>Cấu hình</h2><p className="muted">Quản lý Standard Operation, mapping Operation Code → ST Group, danh mục ST Group và Area. Các bảng nguồn không bị thay đổi tại đây.</p></div>
 </main>
}