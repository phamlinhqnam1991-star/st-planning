import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {getStats} from "@/lib/stats";
import {LogoutButton} from "@/components/logout-button";
import {AppTabs,SubTabs} from "@/components/app-tabs";
export const dynamic="force-dynamic";
const sub=[
 {key:"part",label:"Part",href:"/master/part"},
 {key:"revision",label:"Part Revision",href:"/master/revision"},
 {key:"sourceoperation",label:"Source Operation",href:"/master/sourceoperation"},
 {key:"routing",label:"Routing Detail",href:"/master/routing"},
 {key:"finish",label:"Material Finish",href:"/master/finish"},
 {key:"requirement",label:"Process Requirement",href:"/master/requirement"},
 {key:"strouting",label:"ST Routing Master",href:"/master/strouting"},
 {key:"stroutingchain",label:"ST Routing Chain",href:"/master/stroutingchain"},
 {key:"partrouting",label:"Part → Routing",href:"/master/partrouting"},
];
export default async function Page(){
 const s=await createClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/login");
 let data:any=null,err="";try{data=await getStats()}catch(e){err=e instanceof Error?e.message:String(e)}
 const c=data?.counts||{};
 const stats=[
  ["Part",c.md_part,"/master/part"],["Part Revision",c.md_part_revision,"/master/revision"],
  ["Source Operation",c.md_operation,"/master/sourceoperation"],["Routing Detail",c.md_routing_detailed,"/master/routing"],
  ["Material Finish",c.md_material_finish,"/master/finish"],["Process Requirement",c.md_process_requirement,"/master/requirement"],
  ["ST Routing Master",c.md_st_routing_summary,"/master/strouting"],["ST Routing Chain",c.md_st_routing,"/master/stroutingchain"],
  ["Part → Routing",c.md_part_routing,"/master/partrouting"]
 ];
 return <main className="shell"><div className="top"><div className="brand"><h1>ST Planning</h1><p>Master Data · {user.email}</p></div><LogoutButton/></div>
 <AppTabs active="master"/><SubTabs items={sub}/>
 {err&&<div className="notice section">{err}</div>}
 <div className="grid section">{stats.map(([t,n,h])=><Link key={String(t)} href={String(h)} className="card stat"><b>{Number(n||0).toLocaleString()}</b><span>{String(t)}</span></Link>)}</div>
 <div className="card section"><h2 style={{marginTop:0}}>Master Data</h2><p className="muted">Dữ liệu nguồn và routing dùng cho ST Planning. Chọn tab phía trên hoặc một ô thống kê để xem chi tiết.</p></div>
 </main>
}