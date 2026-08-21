import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {MasterImporter} from "@/components/master-importer";
import {getStats} from "@/lib/stats";
import {LogoutButton} from "@/components/logout-button";
import {AppTabs} from "@/components/app-tabs";
export const dynamic="force-dynamic";
export default async function Page(){
 const s=await createClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/login");
 const data=await getStats();
 return <main className="shell"><div className="top"><div className="brand"><h1>ST Planning</h1><p>Import Master · {user.email}</p></div><LogoutButton/></div>
 <AppTabs active="import"/>
 <div className="section"><MasterImporter/></div>
 <div className="card section"><h2 style={{marginTop:0}}>Import History</h2><div className="table-wrap"><table><thead><tr><th>Thời gian</th><th>File</th><th>Status</th><th>Source rows</th><th>New</th><th>Changed</th><th>Unchanged</th><th>Routing rows</th></tr></thead><tbody>{data.imports.map((x:any)=><tr key={x.id}><td>{new Date(x.created_at).toLocaleString("vi-VN")}</td><td>{x.file_name}</td><td><span className="badge">{x.status}</span></td><td>{x.source_rows?.toLocaleString?.()||0}</td><td>{x.new_rows?.toLocaleString?.()||0}</td><td>{x.changed_rows?.toLocaleString?.()||0}</td><td>{x.unchanged_rows?.toLocaleString?.()||0}</td><td>{x.routing_rows?.toLocaleString?.()||0}</td></tr>)}{!data.imports.length&&<tr><td colSpan={8} className="muted">Chưa có lần import nào.</td></tr>}</tbody></table></div></div>
 </main>
}