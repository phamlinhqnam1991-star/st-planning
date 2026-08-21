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
 return <main className="erp-shell">
 <header className="erp-header">
  <div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div>
  <div className="erp-env">PART TRACKER</div>
 </header>
 <AppTabs active="tracker"/>

 <section className="erp-content erp-content-full">
  <div className="erp-page-head">
   <div><h2>Part Tracker</h2><p>Tra cứu toàn bộ thông tin liên quan theo Part Number</p></div>
  </div>

  <form className="erp-form-panel tracker-search">
   <div>
    <label htmlFor="partq">Part Number / Description</label>
    <input id="partq" className="input" name="q" defaultValue={q} placeholder="Nhập PartNum, ví dụ PVSHFSA002314"/>
   </div>
   <button className="btn primary">Tìm Part</button>
  </form>

  {!q&&<div className="erp-table-panel section">
   <div className="erp-panel-head"><b>Part Information Search</b><span>Master Data lookup</span></div>
   <div className="erp-empty">
    Nhập Part Number để xem Revision, Material Finish, Process Requirement, Routing Detail, ST Routing, Standard Operation, ST Group, Area và Time Rule.
   </div>
  </div>}

  {q&&!part&&<div className="erp-table-panel section">
   <div className="erp-panel-head"><b>Kết quả tìm kiếm</b><span>{matches.length} matches</span></div>
   {matches.length?
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Part Number</th><th>Description</th><th>Program</th><th>Part Cluster</th><th className="num">Surface dm²</th><th></th></tr></thead>
     <tbody>{matches.map(x=><tr key={x.part_num}>
      <td><b>{x.part_num}</b></td><td>{x.part_description||"—"}</td><td>{x.program||"—"}</td><td>{x.part_cluster||"—"}</td><td className="num">{x.surface_dm2??"—"}</td>
      <td className="action"><Link className="erp-link" href={`/part-tracker?q=${encodeURIComponent(x.part_num)}`}>Open →</Link></td>
     </tr>)}</tbody>
    </table></div>
    :<div className="erp-empty">Không tìm thấy Part phù hợp với “{q}”.</div>}
  </div>}

  {part&&<div className="section">
   <div className="erp-table-panel">
    <div className="erp-panel-head"><b>Part Summary</b><span>{part.part_num}</span></div>
    <div className="part-summary-grid">
     <KV label="Part Number" value={part.part_num}/>
     <KV label="Description" value={part.part_description}/>
     <KV label="Program" value={part.program}/>
     <KV label="Part Cluster" value={part.part_cluster}/>
     <KV label="Surface" value={part.surface_dm2!=null?`${part.surface_dm2} dm²`:"—"}/>
     <KV label="Revision Count" value={revisions.length}/>
     <KV label="ST Routing" value={[...new Set(partRouting.filter(x=>x.is_active).map(x=>x.routing_code))].join(", ")||"—"}/>
     <KV label="Areas" value={[...new Set(stRouting.map(x=>areaByGroup.get(x.planning_group)).filter(Boolean))].join(", ")||"Chưa gán"}/>
    </div>
   </div>

   {revisions.map(rev=>{
    const rv=rev.revision_num;
    const f=finish.find(x=>x.revision_num===rv);
    const req=requirements.filter(x=>x.revision_num===rv&&x.is_active);
    const rd=routing.filter(x=>x.revision_num===rv&&x.is_active);
    const pr=partRouting.find(x=>x.revision_num===rv&&x.is_active);
    const sr=pr?stRouting.filter(x=>x.routing_code===pr.routing_code):[];
    return <section className="erp-table-panel section" key={rv}>
     <div className="erp-panel-head revision-panel-head">
      <div><b>Revision {rv}</b><span>{rev.is_active?"Active":"Inactive"} · ST Routing: {pr?.routing_code||"—"}</span></div>
      <span>{rd.length} routing operations</span>
     </div>

     <details open className="erp-details">
      <summary>Part / Material / Finish</summary>
      <div className="part-summary-grid compact">
       <KV label="Alloy" value={f?.alloy}/><KV label="Temper" value={f?.temper}/><KV label="TSA" value={f?.tsa}/><KV label="Chemical Conv Airbus" value={f?.chemicalconv_airbus}/>
       <KV label="Primer 1" value={f?.primer1}/><KV label="Primer 2" value={f?.primer2}/><KV label="Primer 3" value={f?.primer3}/><KV label="Topcoat 1" value={f?.topcoat1}/>
       <KV label="Topcoat 2" value={f?.topcoat2}/><KV label="Anti Abrasion" value={f?.antiabration}/><KV label="Primer Name" value={f?.primer1_name}/><KV label="Topcoat Name" value={f?.topcoat_name}/>
       <KV label="Antiabrasion Name" value={f?.antiabrasion_name}/><KV label="Varnish Name" value={f?.varinish_name}/>
      </div>
     </details>

     <details className="erp-details">
      <summary>Process Requirements ({req.length})</summary>
      {req.length?<div className="table-wrap"><table className="erp-table">
       <thead><tr><th>Requirement Code</th><th>Requirement Value</th></tr></thead>
       <tbody>{req.map((x:any)=><tr key={`${rv}-${x.requirement_code}`}><td><b>{x.requirement_code}</b></td><td>{x.requirement_value}</td></tr>)}</tbody>
      </table></div>:<div className="erp-empty">Không có Process Requirement.</div>}
     </details>

     <details className="erp-details">
      <summary>Routing Detail ({rd.length})</summary>
      <div className="table-wrap"><table className="erp-table">
       <thead><tr><th>Seq</th><th>Operation</th><th>Detail Code</th><th>Detail Name</th><th>Next Operation</th></tr></thead>
       <tbody>{rd.map((x:any)=><tr key={x.source_seq}><td className="mono">{x.source_seq}</td><td><b>{x.operation_code}</b></td><td>{x.operation_detail_code}</td><td>{x.operation_detail_name}</td><td>{x.next_operation_code||"END"}</td></tr>)}</tbody>
      </table></div>
     </details>

     <details open className="erp-details">
      <summary>ST Routing / Planning Chain ({sr.length})</summary>
      {sr.length?<div className="table-wrap"><table className="erp-table">
       <thead><tr><th>Seq</th><th>Source Operation</th><th>Standard Operation</th><th>ST Group</th><th>Area</th><th>Rule</th><th>Time Calc</th><th className="num">Hours</th></tr></thead>
       <tbody>{sr.map((x:any)=>{const om=opByStd.get(x.standard_operation);return <tr key={`${x.routing_code}-${x.seq}`}>
        <td className="mono">{x.seq}</td><td>{x.operation_code}</td><td><b>{x.standard_operation||"—"}</b></td><td>{x.planning_group||"—"}</td><td>{areaByGroup.get(x.planning_group)||"Chưa gán"}</td><td>{x.mapping_rule||"—"}{x.occurrence_no?` #${x.occurrence_no}`:""}</td><td>{om?.time_calc_type||"—"}</td><td className="num">{om?.standard_hours??om?.fixed_hours??"—"}</td>
       </tr>})}</tbody>
      </table></div>:<div className="erp-empty">Revision này chưa có ST Routing.</div>}
     </details>
    </section>
   })}
  </div>}
 </section>
 </main>
}