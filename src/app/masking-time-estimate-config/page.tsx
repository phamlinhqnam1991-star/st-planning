import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {MaskingTimeEstimateConfigManager} from "@/components/masking-time-estimate-config-manager";
import {getPool} from "@/lib/db";

export const dynamic="force-dynamic";

export default async function Page(){
 const c=await getPool().connect();
 try{
  const ready=await c.query(`select to_regclass('public.md_main_masking_time_column') is not null as ready`);
  const migrationReady=Boolean(ready.rows[0]?.ready);
  let totalPeople=0,areas:any[]=[],mains:any[]=[],columns:any[]=[],allocations:any[]=[],mappings:any[]=[];
  if(migrationReady){
   const [totalQ,areasQ,mainsQ,columnsQ,allocQ,mapQ]=await Promise.all([
    c.query(`select total_people from public.md_masking_team_setting where setting_key='DEFAULT' limit 1`),
    c.query(`select area_code,area_name,sort_order from public.md_area where is_active=true order by sort_order,area_name`),
    c.query(`select standard_operation,planning_sort_order from public.md_operation_master where is_active=true order by planning_sort_order nulls last,standard_operation`),
    c.query(`select distinct source_column from public.md_open_job_column_value where is_active=true order by case when upper(source_column) like '%MASK%' then 0 else 1 end,source_column`),
    c.query(`select p.area_code,a.area_name,p.allocated_people from public.md_masking_area_manpower p join public.md_area a on a.area_code=p.area_code where p.is_active=true order by a.sort_order,a.area_name`),
    c.query(`select m.id,m.standard_operation,m.source_column,m.area_code,a.area_name,m.time_basis,m.value_unit,m.sort_order from public.md_main_masking_time_column m join public.md_area a on a.area_code=m.area_code where m.is_active=true order by coalesce((select planning_sort_order from md_operation_master om where upper(trim(om.standard_operation))=upper(trim(m.standard_operation)) and om.is_active=true limit 1),9999),m.sort_order,m.id`)
   ]);
   totalPeople=Number(totalQ.rows[0]?.total_people||0);areas=areasQ.rows;mains=mainsQ.rows;columns=columnsQ.rows;allocations=allocQ.rows;mappings=mapQ.rows;
  }else{
   const [areasQ,mainsQ,columnsQ]=await Promise.all([
    c.query(`select area_code,area_name,sort_order from public.md_area where is_active=true order by sort_order,area_name`),
    c.query(`select standard_operation,planning_sort_order from public.md_operation_master where is_active=true order by planning_sort_order nulls last,standard_operation`),
    c.query(`select distinct source_column from public.md_open_job_column_value where is_active=true order by case when upper(source_column) like '%MASK%' then 0 else 1 end,source_column`)
   ]);areas=areasQ.rows;mains=mainsQ.rows;columns=columnsQ.rows;
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
    <MaskingTimeEstimateConfigManager migrationReady={migrationReady} totalPeople={totalPeople} areas={areas as any} mains={mains as any} columns={columns as any} allocations={allocations as any} mappings={mappings as any}/>
   </section></div>
  </main>;
 }finally{c.release();}
}
