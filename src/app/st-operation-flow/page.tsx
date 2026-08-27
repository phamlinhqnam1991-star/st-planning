import {AppTabs,SubTabs} from "@/components/app-tabs";
import {StOperationFlowManager} from "@/components/st-operation-flow-manager";
import {getPool} from "@/lib/db";

export const dynamic="force-dynamic";
const tabs=[
 {key:"flow",label:"ST Operation Flow",href:"/st-operation-flow"},
 {key:"operation",label:"Main Operation Master",href:"/master/operation"},
 {key:"operationcodeorder",label:"ST Scope & Operation Order",href:"/operation-code-order"},
 {key:"operationmapping",label:"Source → Main Mapping",href:"/master/operationmapping"},
 {key:"stgroup",label:"ST Group Master",href:"/st-groups"},
 {key:"area",label:"Physical Area Master",href:"/area"},
 {key:"schedulearea",label:"Schedule Area Mapping",href:"/schedule-areas"},
 {key:"plannerassignment",label:"Phân chia Planner",href:"/planner-work-assignment"},
 {key:"processrecipe",label:"Process Recipe",href:"/process-recipes"},
 {key:"autoplanning",label:"Auto Planning Rules",href:"/auto-planning-rules"}
];

export default async function Page(){
 const c=await getPool().connect();
 try{
  // Legacy consistency backfill: active mappings missing a scope row are added once.
  // Explicitly disabled scope rows are never reactivated.
  await c.query(`
   insert into md_st_operation_scope(operation_code,operation_type,is_active)
   select distinct upper(trim(m.source_operation_code)),'PLANNING_OPERATION',true
   from md_st_operation_mapping m
   left join md_st_operation_scope s on upper(trim(s.operation_code))=upper(trim(m.source_operation_code))
   where m.is_active=true and s.operation_code is null
   on conflict(operation_code) do nothing
  `);
  const [flowQ,rawQ,mainQ,groupQ,areaQ,scheduleQ]=await Promise.all([
   c.query(`
    with active_scope as (
     select
      upper(trim(operation_code)) operation_code,
      case when bool_or(operation_type='ST_SCOPE_ONLY')
       then 'ST_SCOPE_ONLY' else 'PLANNING_OPERATION' end operation_type
     from md_st_operation_scope
     where is_active=true
     group by upper(trim(operation_code))
    )
    select scope.operation_code,coalesce(o.operation_name,scope.operation_code) operation_name,o.planning_sort_order,scope.operation_type,map.id mapping_id,map.mapping_rule,
      map.standard_operation_rule standard_operation,coalesce(map.st_group,om.st_group) st_group,
      a.id area_id,a.area_name,sa.schedule_area_code,sa.schedule_area_name,sa.planner_owner,
      coalesce(j.open_jobs,0)::int open_jobs,
      case when scope.operation_type='ST_SCOPE_ONLY' then 'ST_SCOPE_ONLY'
       when map.id is null then 'MISSING_MAIN_MAPPING'
       when om.standard_operation is null then 'MISSING_MAIN_MASTER'
       when sg.st_group is null then 'MISSING_ST_GROUP'
       when a.id is null then 'MISSING_AREA'
       when sa.schedule_area_code is null then 'MISSING_SCHEDULE_AREA'
       when coalesce(sa.planner_owner,'UNASSIGNED')='UNASSIGNED' then 'MISSING_PLANNER_OWNER' else 'OK' end config_status
    from active_scope scope
    left join lateral (
     select x.operation_name,x.planning_sort_order
     from md_operation x
     where upper(trim(x.operation_code))=scope.operation_code and x.is_active=true
     order by
      case when trim(x.operation_code)=scope.operation_code then 0 else 1 end,
      x.updated_at desc nulls last,x.operation_code
     limit 1
    ) o on true
    left join lateral (select m.* from md_st_operation_mapping m where upper(trim(m.source_operation_code))=upper(trim(scope.operation_code)) and m.is_active=true order by m.updated_at desc,m.id desc limit 1) map on true
    left join md_operation_master om on om.standard_operation=map.standard_operation_rule and om.is_active=true
    left join md_st_group sg on sg.st_group=coalesce(map.st_group,om.st_group) and sg.is_active=true
    left join md_area_operation_group ag on ag.st_group=coalesce(map.st_group,om.st_group) and ag.is_active=true
    left join md_area a on a.id=ag.area_id and a.is_active=true
    left join lateral (select s.schedule_area_code,s.schedule_area_name,coalesce(w.planner_owner,'UNASSIGNED') planner_owner from md_schedule_area_operation m join md_schedule_area s on s.schedule_area_code=m.schedule_area_code and s.is_active=true left join md_planner_work_assignment w on w.schedule_area_code=s.schedule_area_code and w.is_active=true where m.standard_operation=map.standard_operation_rule and m.is_active=true order by s.display_order limit 1) sa on true
    left join lateral (select count(*)::int open_jobs from open_job_current j where j.is_open=true and upper(trim(j.next_operation))=upper(trim(scope.operation_code))) j on true
    order by o.planning_sort_order nulls last,scope.operation_code
   `),
   c.query(`
    with catalog as (
     select upper(trim(operation_code)) operation_code from md_operation where is_active=true
     union
     select upper(trim(next_operation)) operation_code from open_job_current where is_open=true and nullif(trim(coalesce(next_operation,'')),'') is not null
    )
    select c.operation_code,coalesce(o.operation_name,c.operation_code) operation_name,
           coalesce(j.open_jobs,0)::int open_jobs,
           exists(
            select 1 from md_st_operation_scope s
            where s.is_active=true and upper(trim(s.operation_code))=c.operation_code
           ) in_st_scope
    from catalog c
    left join lateral (
     select x.operation_name
     from md_operation x
     where x.is_active=true and upper(trim(x.operation_code))=c.operation_code
     order by case when trim(x.operation_code)=c.operation_code then 0 else 1 end,x.updated_at desc nulls last,x.operation_code
     limit 1
    ) o on true
    left join lateral (
     select count(*)::int open_jobs from open_job_current j
     where j.is_open=true and upper(trim(j.next_operation))=c.operation_code
    ) j on true
    order by case when coalesce(j.open_jobs,0)>0 then 0 else 1 end,c.operation_code
   `),
   c.query(`select standard_operation,st_group,planning_sort_order,batch_prefix from md_operation_master where is_active=true order by planning_sort_order nulls last,standard_operation`),
   c.query(`select st_group,group_name,sort_order from md_st_group where is_active=true order by sort_order,st_group`),
   c.query(`select id,area_code,area_name,sort_order from md_area where is_active=true order by sort_order,area_name`),
   c.query(`select a.schedule_area_code,a.schedule_area_name,a.display_order,coalesce(w.planner_owner,'UNASSIGNED') planner_owner from md_schedule_area a left join md_planner_work_assignment w on w.schedule_area_code=a.schedule_area_code and w.is_active=true where a.is_active=true order by a.display_order,a.schedule_area_code`)
  ]);
  return <main className="erp-shell"><header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">CONFIGURATION FLOW</div></header><AppTabs active="config"/><div className="erp-workspace"><aside className="erp-sidebar"><div className="erp-sidebar-title">CẤU HÌNH</div><SubTabs items={tabs} active="flow"/></aside><section className="erp-content"><div className="erp-page-head"><div><h2>ST Operation Flow</h2><p>Single source of truth · Configure one Operation from ST Scope through Planning & Scheduling.</p></div></div><StOperationFlowManager rows={flowQ.rows as any} rawOperations={rawQ.rows as any} mainOperations={mainQ.rows as any} groups={groupQ.rows as any} areas={areaQ.rows as any} scheduleAreas={scheduleQ.rows as any}/></section></div></main>;
 }finally{c.release()}
}
