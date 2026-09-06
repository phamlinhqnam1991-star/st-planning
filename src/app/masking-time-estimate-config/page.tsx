import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {MaskingTimeEstimateConfigManager} from "@/components/masking-time-estimate-config-manager";
import {getPool} from "@/lib/db";

export const dynamic="force-dynamic";

type QueryResult<T=Record<string,unknown>>={rows:T[];error:string};
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e??"Unknown database error");

async function safeRows<T=Record<string,unknown>>(c:{query:(sql:string,params?:unknown[])=>Promise<{rows:T[]}>},sql:string,params?:unknown[]):Promise<QueryResult<T>>{
 try{
  const q=await c.query(sql,params);
  return {rows:q.rows,error:""};
 }catch(e){
  return {rows:[],error:errorText(e)};
 }
}

export default async function Page(){
 let c:any=null;
 const warnings:string[]=[];
 let migrationReady=false;
 let totalPeople=0;
 let areas:any[]=[];
 let mains:any[]=[];
 let columns:any[]=[];
 let allocations:any[]=[];
 let mappings:any[]=[];

 try{
  c=await getPool().connect();

  // V513: check all V512 tables. A partially-applied 4-query migration must not make the page crash.
  const schema=await safeRows<any>(c,`select
    to_regclass('public.md_masking_team_setting') is not null as team_ready,
    to_regclass('public.md_masking_area_manpower') is not null as area_ready,
    to_regclass('public.md_main_masking_time_column') is not null as mapping_ready`);
  if(schema.error){
   warnings.push(`Không kiểm tra được schema Masking Estimate: ${schema.error}`);
  }else{
   const s=schema.rows[0]||{};
   migrationReady=Boolean(s.team_ready&&s.area_ready&&s.mapping_ready);
   if(!migrationReady)warnings.push("Schema V512 chưa đầy đủ. Hãy chạy đủ 4 query Masking Estimate trên Aiven.");
  }

  // Base masters are independent. One bad/missing source must not take down the whole config page.
  const areaQ=await safeRows<any>(c,`select area_code,area_name,coalesce(sort_order,0) sort_order from public.md_area where coalesce(is_active,true)=true order by coalesce(sort_order,0),area_name`);
  if(areaQ.error)warnings.push(`Không đọc được Physical Area: ${areaQ.error}`); else areas=areaQ.rows;

  let mainQ=await safeRows<any>(c,`select standard_operation,planning_sort_order from public.md_operation_master where coalesce(is_active,true)=true order by planning_sort_order nulls last,standard_operation`);
  // Some older databases may not yet have planning_sort_order. Fall back to alphabetical Main list.
  if(mainQ.error){
   const fallback=await safeRows<any>(c,`select standard_operation,null::integer planning_sort_order from public.md_operation_master where coalesce(is_active,true)=true order by standard_operation`);
   if(fallback.error)warnings.push(`Không đọc được Main Operation: ${fallback.error}`); else {mains=fallback.rows;warnings.push("Main Operation đang dùng thứ tự alphabet vì DB chưa có planning_sort_order.");}
  }else mains=mainQ.rows;

  const columnQ=await safeRows<any>(c,`select distinct source_column from public.md_open_job_column_value where coalesce(is_active,true)=true and nullif(trim(source_column),'') is not null order by case when upper(source_column) like '%MASK%' then 0 else 1 end,source_column`);
  if(columnQ.error)warnings.push(`Không đọc được Open Job Column Values: ${columnQ.error}`); else columns=columnQ.rows;

  if(migrationReady){
   const totalQ=await safeRows<any>(c,`select total_people from public.md_masking_team_setting where setting_key='DEFAULT' limit 1`);
   if(totalQ.error)warnings.push(`Không đọc được Total Masking People: ${totalQ.error}`); else totalPeople=Number(totalQ.rows[0]?.total_people||0);

   const allocQ=await safeRows<any>(c,`select p.area_code,coalesce(a.area_name,p.area_code) area_name,p.allocated_people
      from public.md_masking_area_manpower p
      left join public.md_area a on a.area_code=p.area_code
      where coalesce(p.is_active,true)=true
      order by coalesce(a.sort_order,999999),coalesce(a.area_name,p.area_code)`);
   if(allocQ.error)warnings.push(`Không đọc được Masking manpower theo Area: ${allocQ.error}`); else allocations=allocQ.rows;

   const mapQ=await safeRows<any>(c,`select m.id,m.standard_operation,m.source_column,m.area_code,coalesce(a.area_name,m.area_code) area_name,m.time_basis,m.value_unit,m.sort_order
      from public.md_main_masking_time_column m
      left join public.md_area a on a.area_code=m.area_code
      where coalesce(m.is_active,true)=true
      order by upper(trim(m.standard_operation)),m.sort_order,m.id`);
   if(mapQ.error)warnings.push(`Không đọc được Main → Masking Time Column mapping: ${mapQ.error}`); else mappings=mapQ.rows;
  }
 }catch(e){
  // V513 fail-safe: even a connection/session failure renders the page shell with a diagnostic.
  warnings.push(`Không kết nối/đọc được cấu hình Masking Estimate: ${errorText(e)}`);
 }finally{
  c?.release();
 }

 return <main className="erp-shell erpkit-migrated-page">
  <ErpAppHeader module="CONFIGURATION"/><AppTabs active="config"/>
  <div className="erp-workspace"><ConfigSidebar active="maskingtime"/><section className="erp-content erp-content-full">
   <ConfigPageHeader
    title="Masking Time Estimate"
    subtitle="Gán Main Operation với cột thời gian Masking trong All Open Job và số người theo Physical Area."
    purpose="Ước tính Masking workload / duration / ready time để Planner điều độ chính xác hơn."
    impact="Chỉ là Planning Advisory trên Scheduling Board. Không tạo Masking resource, không đổi READY/WAIT, Batch, Recipe hay khóa Start."
    prev={{label:"Process Time",href:"/recipe-time-process"}}
    next={{label:"Auto Planning Rules",href:"/auto-planning-rules"}}
   />
   <MaskingTimeEstimateConfigManager migrationReady={migrationReady} loadWarnings={warnings} totalPeople={totalPeople} areas={areas as any} mains={mains as any} columns={columns as any} allocations={allocations as any} mappings={mappings as any}/>
  </section></div>
 </main>;
}
