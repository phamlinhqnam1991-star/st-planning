import Link from "next/link";
import {createAdminClient} from "@/lib/supabase/admin";
import {AppTabs} from "@/components/app-tabs";
export const dynamic="force-dynamic";

const clean=(x:unknown)=>String(x??"");
function KV({label,value}:{label:string,value:unknown}){return <div className="kv"><span>{label}</span><b>{value===null||value===undefined||value===""?"—":String(value)}</b></div>}

export default async function Page({searchParams}:{searchParams:Promise<{q?:string}>}){
 const sp=await searchParams,q=(sp.q||"").trim();const admin=createAdminClient();
 let matches:any[]=[];let part:any=null;let revisions:any[]=[],finish:any[]=[],requirements:any[]=[],routing:any[]=[],partRouting:any[]=[],stRouting:any[]=[],opMaster:any[]=[],areaMaps:any[]=[],areas:any[]=[];
 if(q){
   const exact=await admin.from("md_part").select("*").eq("is_active",true).ilike("part_num",q).maybeSingle();
   part=exact.data;
   if(!part){
     const m=await admin.from("md_part").select("part_num,part_description,program,part_cluster,surface_dm2").eq("is_active",true).or(`part_num.ilike.%${q.replaceAll(",","")}%,part_description.ilike.%${q.replaceAll(",","")}%`).order("part_num").limit(30);
     matches=m.data||[];
   }else{
     const pn=part.part_num;
     const [r1,r2,r3,r4,r5]=await Promise.all([
       admin.from("md_part_revision").select("*").eq("part_num",pn).order("revision_num"),
       admin.from("md_material_finish").select("*").eq("part_num",pn),
       admin.from("md_process_requirement").select("*").eq("part_num",pn).order("revision_num").order("requirement_code"),
       admin.from("md_routing_detailed").select("*").eq("part_num",pn).order("revision_num").order("source_seq"),
       admin.from("md_part_routing").select("*").eq("part_num",pn).order("revision_num")
     ]);
     revisions=r1.data||[];finish=r2.data||[];requirements=r3.data||[];routing=r4.data||[];partRouting=r5.data||[];
     const routingCodes=[...new Set(partRouting.filter(x=>x.is_active).map(x=>x.routing_code))];
     if(routingCodes.length){
       const sr=await admin.from("md_st_routing").select("*").in("routing_code",routingCodes).eq("is_active",true).order("routing_code").order("seq");
       stRouting=sr.data||[];
       const standards=[...new Set(stRouting.map(x=>x.standard_operation).filter(Boolean))];
       const groups=[...new Set(stRouting.map(x=>x.planning_group).filter(Boolean))];
       if(standards.length){const om=await admin.from("md_operation_master").select("*").in("standard_operation",standards);opMaster=om.data||[]}
       if(groups.length){
         const gm=await admin.from("md_area_operation_group").select("*").in("st_group",groups).eq("is_active",true);areaMaps=gm.data||[];
         const ids=[...new Set(areaMaps.map(x=>x.area_id))]; if(ids.length){const ar=await admin.from("md_area").select("*").in("id",ids);areas=ar.data||[]}
       }
     }
   }
 }
 const areaByGroup=new Map(areaMaps.map(m=>[m.st_group,areas.find(a=>a.id===m.area_id)?.area_name||""]));
 const opByStd=new Map(opMaster.map(x=>[x.standard_operation,x]));
 return <main className="shell"><div className="top"><div className="brand"><h1>ST Planning</h1><p>Part Tracker</p></div></div>
 <AppTabs active="tracker"/>
 <form className="tracker-search card section"><div><label htmlFor="partq">Part Number / Description</label><input id="partq" className="input" name="q" defaultValue={q} placeholder="Nhập PartNum, ví dụ PVSHFSA002314"/></div><button className="btn primary">Tìm Part</button></form>

 {!q&&<div className="card section"><h2 style={{marginTop:0}}>Tra cứu Part</h2><p className="muted">Tìm một Part để xem toàn bộ dữ liệu liên quan: Part/Revision, Surface & Finish, Process Requirement, Routing Detail, ST Routing, Standard Operation, ST Group, Area và quy tắc thời gian Planning.</p></div>}

 {q&&!part&&<div className="card section"><h2 style={{marginTop:0}}>Kết quả gần đúng</h2>{matches.length?<div className="search-results">{matches.map(x=><Link className="search-result" key={x.part_num} href={`/part-tracker?q=${encodeURIComponent(x.part_num)}`}><b>{x.part_num}</b><span>{x.part_description||"—"}</span><small>{x.program||"—"} · {x.part_cluster||"—"} · Surface {x.surface_dm2??"—"} dm²</small></Link>)}</div>:<p className="muted">Không tìm thấy Part phù hợp với “{q}”.</p>}</div>}

 {part&&<div className="section">
   <div className="tracker-summary">
    <div className="card"><h2 style={{marginTop:0}}>{part.part_num}</h2><p className="muted">{part.part_description||"Không có mô tả"}</p><div className="kv-grid"><KV label="Program" value={part.program}/><KV label="Part Cluster" value={part.part_cluster}/><KV label="Surface" value={part.surface_dm2!=null?`${part.surface_dm2} dm²`:"—"}/><KV label="Revisions" value={revisions.length}/></div></div>
    <div className="card"><h2 style={{marginTop:0}}>Planning Link</h2><div className="kv-grid"><KV label="ST Routing" value={[...new Set(partRouting.filter(x=>x.is_active).map(x=>x.routing_code))].join(", ")||"—"}/><KV label="ST Groups" value={[...new Set(stRouting.map(x=>x.planning_group).filter(Boolean))].join(", ")||"—"}/><KV label="Areas" value={[...new Set(stRouting.map(x=>areaByGroup.get(x.planning_group)).filter(Boolean))].join(", ")||"Chưa gán"}/><KV label="Routing Detail rows" value={routing.filter(x=>x.is_active).length}/></div></div>
   </div>

   {revisions.map(rev=>{
    const rv=rev.revision_num;
    const f=finish.find(x=>x.revision_num===rv);
    const req=requirements.filter(x=>x.revision_num===rv&&x.is_active);
    const rd=routing.filter(x=>x.revision_num===rv&&x.is_active);
    const pr=partRouting.find(x=>x.revision_num===rv&&x.is_active);
    const sr=pr?stRouting.filter(x=>x.routing_code===pr.routing_code):[];
    return <section className="card section revision-block" key={rv}><div className="revision-head"><div><h2>Revision {rv}</h2><p className="muted">{rev.is_active?"Active":"Inactive"} · ST Routing: <b>{pr?.routing_code||"—"}</b></p></div><span className="badge">{rd.length} routing ops</span></div>

     <details open><summary>Part / Material / Finish</summary><div className="kv-grid details-grid"><KV label="Alloy" value={f?.alloy}/><KV label="Temper" value={f?.temper}/><KV label="TSA" value={f?.tsa}/><KV label="Chemical Conv Airbus" value={f?.chemicalconv_airbus}/><KV label="Primer 1" value={f?.primer1}/><KV label="Primer 2" value={f?.primer2}/><KV label="Primer 3" value={f?.primer3}/><KV label="Topcoat 1" value={f?.topcoat1}/><KV label="Topcoat 2" value={f?.topcoat2}/><KV label="Anti Abrasion" value={f?.antiabration}/><KV label="Primer Name" value={f?.primer1_name}/><KV label="Topcoat Name" value={f?.topcoat_name}/><KV label="Antiabrasion Name" value={f?.antiabrasion_name}/><KV label="Varnish Name" value={f?.varinish_name}/></div></details>

     <details><summary>Process Requirements ({req.length})</summary>{req.length?<div className="chip-list">{req.map((x:any)=><span className="info-chip" key={`${rv}-${x.requirement_code}`}><b>{x.requirement_code}</b>: {x.requirement_value}</span>)}</div>:<p className="muted">Không có requirement.</p>}</details>

     <details><summary>Routing Detail ({rd.length})</summary><div className="table-wrap"><table><thead><tr><th>Seq</th><th>Operation</th><th>Detail Code</th><th>Detail Name</th><th>Next Operation</th></tr></thead><tbody>{rd.map((x:any)=><tr key={x.source_seq}><td>{x.source_seq}</td><td><b>{x.operation_code}</b></td><td>{x.operation_detail_code}</td><td>{x.operation_detail_name}</td><td>{x.next_operation_code||"END"}</td></tr>)}</tbody></table></div></details>

     <details open><summary>ST Routing / Planning Chain ({sr.length})</summary>{sr.length?<div className="table-wrap"><table><thead><tr><th>Seq</th><th>Source Operation</th><th>Standard Operation</th><th>ST Group</th><th>Area</th><th>Rule</th><th>Time Calc</th><th>Std Hours</th></tr></thead><tbody>{sr.map((x:any)=>{const om=opByStd.get(x.standard_operation);return <tr key={`${x.routing_code}-${x.seq}`}><td>{x.seq}</td><td>{x.operation_code}</td><td><b>{x.standard_operation||"—"}</b></td><td>{x.planning_group||"—"}</td><td>{areaByGroup.get(x.planning_group)||"Chưa gán"}</td><td>{x.mapping_rule||"—"}{x.occurrence_no?` #${x.occurrence_no}`:""}</td><td>{om?.time_calc_type||"—"}</td><td>{om?.standard_hours??om?.fixed_hours??"—"}</td></tr>})}</tbody></table></div>:<p className="muted">Revision này chưa có ST Routing.</p>}</details>
    </section>
   })}
 </div>}
 </main>
}