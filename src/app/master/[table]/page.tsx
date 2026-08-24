import Link from "next/link";
import {notFound} from "next/navigation";
import {createAdminClient} from "@/lib/supabase/admin";
import {getPool} from "@/lib/db";
import {AppTabs,SubTabs} from "@/components/app-tabs";
import {OperationMasterManager} from "@/components/operation-master-manager";
const config:Record<string,{table:string,title:string,search:string[],section:"master"|"config",exactField?:string,uppercaseExact?:boolean}>={
 part:{table:"md_part",title:"Part Master",search:["part_num","part_description","program"],section:"master"},
 revision:{table:"md_part_revision",title:"Part Revision",search:["part_num","revision_num"],section:"master",exactField:"part_num",uppercaseExact:true},
 operation:{table:"md_operation_master",title:"Operation Master · Planning",search:["standard_operation","st_group","time_calc_type"],section:"config"},
 sourceoperation:{table:"md_operation",title:"Source Operation",search:["operation_code","operation_name"],section:"master"},
 routing:{table:"md_routing_detailed",title:"Routing Detail",search:["part_num","revision_num","operation_code","operation_detail_code"],section:"master",exactField:"part_num",uppercaseExact:true},
 finish:{table:"md_material_finish",title:"Material Finish",search:["part_num","revision_num","primer1","topcoat1"],section:"master",exactField:"part_num",uppercaseExact:true},
 requirement:{table:"md_process_requirement",title:"Process Requirement",search:["part_num","revision_num","requirement_code","requirement_value"],section:"master",exactField:"part_num",uppercaseExact:true},
 strouting:{table:"md_st_routing_summary",title:"ST Routing Master",search:["routing_code","routing_signature"],section:"master"},
 stroutingchain:{table:"md_st_routing",title:"ST Routing Chain · Standardized",search:["routing_code","operation_code","operation_detail_code","standard_operation","planning_group"],section:"master"},
 partrouting:{table:"md_part_routing",title:"Part → ST Routing",search:["part_num","revision_num","routing_code"],section:"master",exactField:"part_num",uppercaseExact:true}
};
const masterTabs=[
 {key:"part",label:"Part",href:"/master/part"},{key:"revision",label:"Part Revision",href:"/master/revision"},
 {key:"sourceoperation",label:"Source Operation",href:"/master/sourceoperation"},{key:"routing",label:"Routing Detail",href:"/master/routing"},
 {key:"finish",label:"Material Finish",href:"/master/finish"},{key:"requirement",label:"Process Requirement",href:"/master/requirement"},
 {key:"strouting",label:"ST Routing Master",href:"/master/strouting"},{key:"stroutingchain",label:"ST Routing Chain",href:"/master/stroutingchain"},
 {key:"partrouting",label:"Part → Routing",href:"/master/partrouting"}
];
const configTabs=[
 {key:"operation",label:"Operation Master",href:"/master/operation"},{key:"operationmapping",label:"ST Operation Mapping",href:"/master/operationmapping"},
 {key:"stgroup",label:"ST Group Master",href:"/st-groups"},{key:"area",label:"Area Master",href:"/area"},
 {key:"processrecipe",label:"Process Recipe",href:"/process-recipes"},{key:"autoplanning",label:"Auto Planning Rules",href:"/auto-planning-rules"}
];
export const dynamic="force-dynamic";
export default async function Page({params,searchParams}:{params:Promise<{table:string}>,searchParams:Promise<{q?:string;p?:string}>}){
 const {table:key}=await params;const c=config[key];if(!c)notFound();const sp=await searchParams,q=(sp.q||"").trim(),page=Math.max(1,Number(sp.p)||1),size=50,from=(page-1)*size;
 let data:any[]|null=null;
 let error:any=null;
 let count:number|null=0;

 // Operation Master is configuration data used heavily by Planning/Scheduling.
 // Read it directly from PostgreSQL so this page does not depend on Supabase REST API keys.
 if(key==="operation"){
  let db:any=null;

  try{
   db=await getPool().connect();

   const values:any[]=[];
   let where=`where is_active=true`;

   if(q){
    values.push(`%${q}%`);
    const p=`$${values.length}`;
    where+=` and (${c.search.map(x=>`cast(${x} as text) ilike ${p}`).join(" or ")})`;
   }

   const countQ=await db.query(
    `select count(*)::int count from ${c.table} ${where}`,
    values
   );

   values.push(size);
   const limitParam=`$${values.length}`;
   values.push(from);
   const offsetParam=`$${values.length}`;

   const dataQ=await db.query(
    `select *
     from ${c.table}
     ${where}
     order by standard_operation
     limit ${limitParam}
     offset ${offsetParam}`,
    values
   );

   data=dataQ.rows;
   count=Number(countQ.rows[0]?.count||0);
  }catch(e){
   error={
    message:e instanceof Error?e.message:String(e)
   };
  }finally{
   if(db)db.release();
  }
 }else{
  const admin=createAdminClient();
  let query=admin.from(c.table).select("*",{count:"exact"}).eq("is_active",true).range(from,from+size-1);

  // Large Part-related tables use indexed exact PartNum lookup.
  // This avoids ILIKE '%...%' scans across 600k–2M+ rows.
  if(q){
    if(c.exactField){
      const exactValue=c.uppercaseExact?q.toUpperCase():q;
      query=query.eq(c.exactField,exactValue);
    }else{
      const safeQ=q.replaceAll(",","");
      query=query.or(c.search.map(x=>`${x}.ilike.%${safeQ}%`).join(","));
    }
  }

  const result=await query;
  data=result.data;
  error=result.error;
  count=result.count;
 }
 if(error){
   return <main className="erp-shell">
    <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">{c.section==="master"?"MASTER DATA":"CONFIGURATION"}</div></header>
    <AppTabs active={c.section==="master"?"master":"config"}/>
    <div className="erp-workspace">
     <aside className="erp-sidebar"><div className="erp-sidebar-title">{c.section==="master"?"MASTER DATA":"CẤU HÌNH"}</div><SubTabs items={c.section==="master"?masterTabs:configTabs} active={key}/></aside>
     <section className="erp-content">
      <div className="erp-page-head"><div><h2>{c.title}</h2><p>Không thể tải dữ liệu</p></div></div>
      <div className="notice"><b>Database query error:</b> {error.message||JSON.stringify(error)}</div>
     </section>
    </div>
   </main>
 }
 const rows=(data||[]) as Record<string,unknown>[];const cols=rows.length?Object.keys(rows[0]).filter(x=>!["created_at","updated_at","last_import_batch_id"].includes(x)):[];const pages=Math.max(1,Math.ceil((count||0)/size));
 const tabs=c.section==="master"?masterTabs:configTabs;

 if(key==="operation"){
  return <main className="erp-shell">
   <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">CONFIGURATION</div></header>
   <AppTabs active="config"/>
   <div className="erp-workspace">
    <aside className="erp-sidebar"><div className="erp-sidebar-title">CẤU HÌNH</div><SubTabs items={configTabs} active="operation"/></aside>
    <section className="erp-content">
     <div className="erp-page-head"><div><h2>{c.title}</h2><p>{(count||0).toLocaleString()} active records · Có thể sửa tên Standard Operation</p></div></div>
     <form className="row erp-form-panel"><input className="input" name="q" defaultValue={q} placeholder="Tìm kiếm..."/><button className="btn primary">Tìm</button></form>
     <OperationMasterManager rows={rows as any}/>
     <div className="row pager"><Link className="btn" href={`?q=${encodeURIComponent(q)}&p=${Math.max(1,page-1)}`}>← Trước</Link><span className="muted">Trang {page} / {pages}</span><Link className="btn" href={`?q=${encodeURIComponent(q)}&p=${Math.min(pages,page+1)}`}>Sau →</Link></div>
    </section>
   </div>
  </main>
 }
 return <main className="erp-shell">
  <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">{c.section==="master"?"MASTER DATA":"CONFIGURATION"}</div></header>
  <AppTabs active={c.section==="master"?"master":"config"}/>
  <div className="erp-workspace">
   <aside className="erp-sidebar"><div className="erp-sidebar-title">{c.section==="master"?"MASTER DATA":"CẤU HÌNH"}</div><SubTabs items={tabs} active={key}/></aside>
   <section className="erp-content">
    <div className="erp-page-head"><div><h2>{c.title}</h2><p>{(count||0).toLocaleString()} active records</p></div></div>
    <form className="row erp-form-panel"><input className="input" name="q" defaultValue={q} placeholder={c.exactField==="part_num"?"Nhập chính xác Part Number...":"Tìm kiếm..."}/><button className="btn primary">Tìm</button></form>
    <div className="erp-table-panel section table-wrap"><table className="erp-table"><thead><tr>{cols.map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{cols.map(x=><td key={x}>{String(r[x]??"")}</td>)}</tr>)}{!rows.length&&<tr><td className="muted">Không có dữ liệu.</td></tr>}</tbody></table></div>
    <div className="row pager"><Link className="btn" href={`?q=${encodeURIComponent(q)}&p=${Math.max(1,page-1)}`}>← Trước</Link><span className="muted">Trang {page} / {pages}</span><Link className="btn" href={`?q=${encodeURIComponent(q)}&p=${Math.min(pages,page+1)}`}>Sau →</Link></div>
   </section>
  </div>
 </main>
}
