
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const config:Record<string,{table:string,title:string,search:string[]}>= {
  part:{table:"md_part",title:"Part Master",search:["part_num","part_description","program"]},
  revision:{table:"md_part_revision",title:"Part Revision",search:["part_num","revision_num"]},
  operation:{table:"md_operation",title:"Operation Master",search:["operation_code","operation_name"]},
  routing:{table:"md_routing_detailed",title:"Routing Detail",search:["part_num","revision_num","operation_code","operation_detail_code"]},
  finish:{table:"md_material_finish",title:"Material Finish",search:["part_num","revision_num","primer1","topcoat1"]},
  requirement:{table:"md_process_requirement",title:"Process Requirement",search:["part_num","revision_num","requirement_code","requirement_value"]},
  strouting:{table:"md_st_routing_summary",title:"ST Routing Master",search:["routing_code","routing_signature"]},
  partrouting:{table:"md_part_routing",title:"Part → ST Routing",search:["part_num","revision_num","routing_code"]}
};
export const dynamic="force-dynamic";
export default async function Page({params,searchParams}:{params:Promise<{table:string}>,searchParams:Promise<{q?:string;p?:string}>}){
 const auth=await createClient(); const {data:{user}}=await auth.auth.getUser(); if(!user)redirect("/login");
 const {table:key}=await params; const c=config[key]; if(!c)notFound(); const sp=await searchParams; const q=(sp.q||"").trim(); const page=Math.max(1,Number(sp.p)||1); const size=50; const from=(page-1)*size;
 const admin=createAdminClient(); let query=admin.from(c.table).select("*",{count:"exact"}).eq("is_active",true).range(from,from+size-1);
 if(q)query=query.or(c.search.map(x=>`${x}.ilike.%${q.replaceAll(",","")}%`).join(","));
 const {data,error,count}=await query; if(error)throw error; const rows=(data||[]) as Record<string,unknown>[]; const cols=rows.length?Object.keys(rows[0]).filter(x=>!["created_at","updated_at","last_import_batch_id"].includes(x)):[]; const pages=Math.max(1,Math.ceil((count||0)/size));
 return <main className="shell"><div className="top"><div className="brand"><h1>{c.title}</h1><p>{(count||0).toLocaleString()} active records</p></div><Link className="btn" href="/">← Dashboard</Link></div>
 <form className="row card" style={{marginBottom:18}}><input className="input" name="q" defaultValue={q} placeholder="Tìm kiếm..."/><button className="btn primary">Tìm</button></form>
 <div className="card" style={{overflowX:"auto"}}><table><thead><tr>{cols.map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{cols.map(x=><td key={x}>{String(r[x]??"")}</td>)}</tr>)}{!rows.length&&<tr><td className="muted">Không có dữ liệu.</td></tr>}</tbody></table></div>
 <div className="row" style={{justifyContent:"space-between",marginTop:14}}><Link className={`btn ${page<=1?"disabled":""}`} href={`?q=${encodeURIComponent(q)}&p=${Math.max(1,page-1)}`}>← Trước</Link><span className="muted">Trang {page} / {pages}</span><Link className="btn" href={`?q=${encodeURIComponent(q)}&p=${Math.min(pages,page+1)}`}>Sau →</Link></div></main>
}
