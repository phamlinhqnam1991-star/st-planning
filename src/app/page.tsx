import { redirect } from "next/navigation"; import Link from "next/link"; import { createClient } from "@/lib/supabase/server"; import { LogoutButton } from "@/components/logout-button"; import { MasterImporter } from "@/components/master-importer"; import { getStats } from "@/lib/stats";
export const dynamic="force-dynamic";
export default async function Page(){
 const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect("/login");
 let data:null|Awaited<ReturnType<typeof getStats>>=null; let setupError=""; try{data=await getStats()}catch(e){setupError=e instanceof Error?e.message:String(e)}
 const c=data?.counts||{};
 return <main className="shell"><div className="top"><div className="brand"><h1>ST Planning · Master Data</h1><p>{user.email}</p></div><LogoutButton/></div>
 {setupError&&<div className="notice">Database chưa sẵn sàng hoặc thiếu biến môi trường: {setupError}. Hãy chạy SQL trong thư mục <b>supabase/migrations</b> và cấu hình Vercel.</div>}
 <div className="grid section"><Stat n={c.md_part} t="Part" href="/master/part"/><Stat n={c.md_part_revision} t="Part Revision" href="/master/revision"/><Stat n={c.md_operation} t="Operation" href="/master/operation"/><Stat n={c.md_routing_detailed} t="Routing Detail" href="/master/routing"/><Stat n={c.md_material_finish} t="Material Finish" href="/master/finish"/><Stat n={c.md_process_requirement} t="Process Requirement" href="/master/requirement"/><Stat n={c.md_st_routing_summary} t="ST Routing Master" href="/master/strouting"/><Stat n={c.md_part_routing} t="Part → Routing" href="/master/partrouting"/></div>
 <div className="section"><MasterImporter/></div>
 <div className="card section"><h2 style={{marginTop:0}}>Import History</h2><table><thead><tr><th>Thời gian</th><th>File</th><th>Status</th><th>Source rows</th><th>Routing rows</th></tr></thead><tbody>{data?.imports.map((x:any)=><tr key={x.id}><td>{new Date(x.created_at).toLocaleString("vi-VN")}</td><td>{x.file_name}</td><td><span className="badge">{x.status}</span></td><td>{x.source_rows?.toLocaleString?.()||0}</td><td>{x.routing_rows?.toLocaleString?.()||0}</td></tr>)}{!data?.imports.length&&<tr><td colSpan={5} className="muted">Chưa có lần import nào.</td></tr>}</tbody></table></div>
 </main>}
function Stat({n=0,t,href}:{n?:number,t:string,href:string}){return <Link href={href} className="card stat"><b>{n.toLocaleString()}</b><span>{t} · Xem dữ liệu →</span></Link>}
