import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {StOperationFlowManager} from "@/components/st-operation-flow-manager";
import {getPool} from "@/lib/db";
import type {PoolClient} from "pg";

export const dynamic="force-dynamic";

type LoadResult={rows:any[];warning?:string};

async function safeRows(c:PoolClient,sql:string,fallbackSql?:string):Promise<LoadResult>{
 try{return {rows:(await c.query(sql)).rows}}
 catch(e){
  const first=e instanceof Error?e.message:String(e);
  if(fallbackSql){
   try{return {rows:(await c.query(fallbackSql)).rows,warning:first}}
   catch(e2){return {rows:[],warning:`${first} | fallback: ${e2 instanceof Error?e2.message:String(e2)}`}}
  }
  return {rows:[],warning:first};
 }
}

function SchemaNotice({warnings}:{warnings:string[]}){
 if(!warnings.length)return null;
 return <div className="erp-panel" style={{marginBottom:12}}>
  <div className="erp-panel-head"><div><b>Schema compatibility mode</b><small>Một số nguồn Config dùng schema cũ hoặc chưa đủ migration. Trang vẫn được tải bằng fallback an toàn.</small></div><span className="erp-status-pill warn">{warnings.length} WARNING</span></div>
  <details style={{padding:"10px 14px"}}><summary style={{cursor:"pointer",fontWeight:600}}>Xem chi tiết kỹ thuật</summary><div style={{marginTop:8}}>{warnings.map((x,i)=><pre key={i} style={{whiteSpace:"pre-wrap",wordBreak:"break-word",fontSize:11,margin:"6px 0"}}>{x}</pre>)}</div></details>
 </div>;
}

function ErrorPanel({message}:{message:string}){
 return <div className="erp-panel" style={{marginTop:16}}>
  <div className="erp-panel-head"><div><b>ST Operation Flow chưa tải được</b><small>Trang Configuration vẫn hoạt động; lỗi được cô lập tại dữ liệu ST Operation Flow.</small></div><span className="erp-status-pill warn">SERVER DATA</span></div>
  <div style={{padding:16}}><p style={{marginTop:0}}>Kiểm tra DB migration/schema rồi Reload. Chi tiết:</p><pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",fontSize:12}}>{message}</pre></div>
 </div>;
}

export default async function Page(){
 let c:PoolClient|null=null;
 let fatalError="";
 try{
  c=await getPool().connect();
  const warnings:string[]=[];

  // Read-only page load. Do not mutate/backfill configuration while rendering.
  // Each source is isolated so one optional/legacy schema mismatch cannot crash the whole page.
  const flow=await safeRows(c,`
    with bridge_ops as (
     select
      upper(trim(bo.operation_code)) operation_code,
      count(distinct s.id)::int bridge_count,
      string_agg(distinct s.previous_main_operation||' → '||s.next_main_operation,', ' order by s.previous_main_operation||' → '||s.next_main_operation) bridge_summary
     from md_intermediate_bridge_operation bo
     join md_intermediate_bridge_segment s on s.id=bo.segment_id and s.is_active=true
     group by upper(trim(bo.operation_code))
    ), scope_rows as (
     select
      upper(trim(operation_code)) operation_code,
      case
       when bool_or(operation_type='ST_SCOPE_ONLY') then 'ST_SCOPE_ONLY'
       when bool_or(operation_type='INTERMEDIATE') then 'INTERMEDIATE'
       when bool_or(operation_type='PLANNING_OPERATION') then 'PLANNING_OPERATION'
       else null
      end st_scope_type
     from md_st_operation_scope
     where is_active=true
       and operation_type in ('PLANNING_OPERATION','INTERMEDIATE','ST_SCOPE_ONLY')
     group by upper(trim(operation_code))
    ), catalog as (
     select
      s.operation_code,
      case when s.st_scope_type='INTERMEDIATE' then 'BRIDGE_INTERMEDIATE' else s.st_scope_type end operation_type,
      s.st_scope_type
     from scope_rows s
     where s.st_scope_type is not null
     union all
     select b.operation_code,'BRIDGE_INTERMEDIATE'::text operation_type,null::text st_scope_type
     from bridge_ops b
     where not exists(select 1 from scope_rows s where s.operation_code=b.operation_code)
    )
    select cat.operation_code,coalesce(o.operation_name,cat.operation_code) operation_name,o.planning_sort_order,cat.operation_type,cat.st_scope_type,map.id mapping_id,map.mapping_rule,
      map.standard_operation_rule standard_operation,coalesce(map.st_group,om.st_group) st_group,
      a.id area_id,a.area_name,sa.schedule_area_code,sa.schedule_area_name,sa.planner_owner,
      coalesce(j.open_jobs,0)::int open_jobs,
      coalesce(bridge.bridge_count,0)::int bridge_count,bridge.bridge_summary,
      case when cat.operation_type='ST_SCOPE_ONLY' then 'ST_SCOPE_ONLY'
       when cat.operation_type='BRIDGE_INTERMEDIATE' and cat.st_scope_type='INTERMEDIATE' and coalesce(bridge.bridge_count,0)>0 then 'INTERMEDIATE_ST_SCOPE'
       when cat.operation_type='BRIDGE_INTERMEDIATE' and cat.st_scope_type='INTERMEDIATE' then 'INTERMEDIATE_ST_SCOPE_NO_BRIDGE'
       when cat.operation_type='BRIDGE_INTERMEDIATE' then 'INTERMEDIATE_BRIDGE'
       when map.id is null then 'MISSING_MAIN_MAPPING'
       when om.standard_operation is null then 'MISSING_MAIN_MASTER'
       when sg.st_group is null then 'MISSING_ST_GROUP'
       when a.id is null then 'MISSING_AREA'
       when sa.schedule_area_code is null then 'MISSING_SCHEDULE_AREA'
       when coalesce(sa.planner_owner,'UNASSIGNED')='UNASSIGNED' then 'MISSING_PLANNER_OWNER' else 'OK' end config_status
    from catalog cat
    left join bridge_ops bridge on bridge.operation_code=cat.operation_code
    left join lateral (
     select x.operation_name,x.planning_sort_order
     from md_operation x
     where upper(trim(x.operation_code))=cat.operation_code and x.is_active=true
     order by case when trim(x.operation_code)=cat.operation_code then 0 else 1 end,x.updated_at desc nulls last,x.operation_code
     limit 1
    ) o on true
    left join lateral (select m.* from md_st_operation_mapping m where upper(trim(m.source_operation_code))=cat.operation_code and m.is_active=true order by m.updated_at desc,m.id desc limit 1) map on true
    left join md_operation_master om on om.standard_operation=map.standard_operation_rule and om.is_active=true
    left join md_st_group sg on sg.st_group=coalesce(map.st_group,om.st_group) and sg.is_active=true
    left join md_area_operation_group ag on ag.st_group=coalesce(map.st_group,om.st_group) and ag.is_active=true
    left join md_area a on a.id=ag.area_id and a.is_active=true
    left join lateral (select s.schedule_area_code,s.schedule_area_name,coalesce(w.planner_owner,'UNASSIGNED') planner_owner from md_schedule_area_operation m join md_schedule_area s on s.schedule_area_code=m.schedule_area_code and s.is_active=true left join md_planner_work_assignment w on w.schedule_area_code=s.schedule_area_code and w.is_active=true where m.standard_operation=map.standard_operation_rule and m.is_active=true order by s.display_order limit 1) sa on true
    left join lateral (select count(*)::int open_jobs from open_job_current j where j.is_open=true and upper(trim(j.next_operation))=cat.operation_code) j on true
    order by o.planning_sort_order nulls last,cat.operation_code
   `,`
    select upper(trim(s.operation_code)) operation_code,
      coalesce(o.operation_name,upper(trim(s.operation_code))) operation_name,
      o.planning_sort_order,
      case when upper(trim(coalesce(s.operation_type,'')))='INTERMEDIATE' then 'BRIDGE_INTERMEDIATE'
           when upper(trim(coalesce(s.operation_type,'')))='ST_SCOPE_ONLY' then 'ST_SCOPE_ONLY'
           else 'PLANNING_OPERATION' end operation_type,
      case when upper(trim(coalesce(s.operation_type,''))) in ('PLANNING_OPERATION','INTERMEDIATE','ST_SCOPE_ONLY') then upper(trim(s.operation_type)) else 'PLANNING_OPERATION' end st_scope_type,
      null::bigint mapping_id,null::text mapping_rule,null::text standard_operation,null::text st_group,
      null::bigint area_id,null::text area_name,null::text schedule_area_code,null::text schedule_area_name,null::text planner_owner,
      coalesce(j.open_jobs,0)::int open_jobs,0::int bridge_count,null::text bridge_summary,
      case when upper(trim(coalesce(s.operation_type,'')))='ST_SCOPE_ONLY' then 'ST_SCOPE_ONLY'
           when upper(trim(coalesce(s.operation_type,'')))='INTERMEDIATE' then 'INTERMEDIATE_ST_SCOPE_NO_BRIDGE'
           else 'MISSING_MAIN_MAPPING' end config_status
    from md_st_operation_scope s
    left join lateral (select x.operation_name,x.planning_sort_order from md_operation x where x.is_active=true and upper(trim(x.operation_code))=upper(trim(s.operation_code)) order by x.updated_at desc nulls last limit 1) o on true
    left join lateral (select count(*)::int open_jobs from open_job_current j where j.is_open=true and upper(trim(j.next_operation))=upper(trim(s.operation_code))) j on true
    where s.is_active=true
    order by o.planning_sort_order nulls last,upper(trim(s.operation_code))
   `);
  if(flow.warning)warnings.push(`Flow catalog: ${flow.warning}`);

  const raw=await safeRows(c,`
    with catalog as (
     select upper(trim(operation_code)) operation_code from md_operation where is_active=true
     union
     select upper(trim(next_operation)) operation_code from open_job_current where is_open=true and nullif(trim(coalesce(next_operation,'')),'') is not null
    )
    select c.operation_code,coalesce(o.operation_name,c.operation_code) operation_name,
           coalesce(j.open_jobs,0)::int open_jobs,
           exists(select 1 from md_st_operation_scope s where s.is_active=true and upper(trim(s.operation_code))=c.operation_code) in_st_scope
    from catalog c
    left join lateral (select x.operation_name from md_operation x where x.is_active=true and upper(trim(x.operation_code))=c.operation_code order by x.updated_at desc nulls last limit 1) o on true
    left join lateral (select count(*)::int open_jobs from open_job_current j where j.is_open=true and upper(trim(j.next_operation))=c.operation_code) j on true
    order by case when coalesce(j.open_jobs,0)>0 then 0 else 1 end,c.operation_code
   `,`
    select upper(trim(next_operation)) operation_code,upper(trim(next_operation)) operation_name,count(*)::int open_jobs,false in_st_scope
    from open_job_current where is_open=true and nullif(trim(coalesce(next_operation,'')),'') is not null
    group by upper(trim(next_operation)) order by count(*) desc,upper(trim(next_operation))
   `);
  if(raw.warning)warnings.push(`Raw operation catalog: ${raw.warning}`);

  const [main,group,area,schedule,bridge]=await Promise.all([
   safeRows(c,
    `select standard_operation,st_group,planning_sort_order,batch_prefix from md_operation_master where is_active=true order by planning_sort_order nulls last,standard_operation`,
    `select standard_operation,st_group,planning_sort_order,null::text batch_prefix from md_operation_master where is_active=true order by planning_sort_order nulls last,standard_operation`
   ),
   safeRows(c,`select st_group,group_name,sort_order from md_st_group where is_active=true order by sort_order,st_group`,
              `select st_group,st_group group_name,null::int sort_order from md_st_group where is_active=true order by st_group`),
   safeRows(c,`select id,area_code,area_name,sort_order from md_area where is_active=true order by sort_order,area_name`,
              `select id,area_code,area_name,null::int sort_order from md_area where is_active=true order by area_name`),
   safeRows(c,
    `select a.schedule_area_code,a.schedule_area_name,a.display_order,coalesce(w.planner_owner,'UNASSIGNED') planner_owner from md_schedule_area a left join md_planner_work_assignment w on w.schedule_area_code=a.schedule_area_code and w.is_active=true where a.is_active=true order by a.display_order,a.schedule_area_code`,
    `select schedule_area_code,schedule_area_name,display_order,case when planner_owner in ('1','2') then planner_owner else 'UNASSIGNED' end planner_owner from md_schedule_area where is_active=true order by display_order,schedule_area_code`
   ),
   safeRows(c,`
    select s.id,s.previous_main_operation,s.next_main_operation,s.intermediate_signature,s.route_count,s.source,
           coalesce(s.priority,100)::int priority,s.note,
           coalesce(ops.intermediate_operations,'[]'::jsonb) intermediate_operations,
           routes.routing_codes
    from md_intermediate_bridge_segment s
    left join lateral (select jsonb_agg(o.operation_code order by o.sequence_no) intermediate_operations from md_intermediate_bridge_operation o where o.segment_id=s.id) ops on true
    left join lateral (select string_agg(distinct r.routing_code,', ' order by r.routing_code) routing_codes from md_intermediate_bridge_route r where r.segment_id=s.id) routes on true
    where s.is_active=true
    order by case when s.source='MANUAL' then 0 else 1 end,coalesce(s.priority,100) desc,s.previous_main_operation,s.next_main_operation,s.intermediate_signature
   `,`
    select s.id,s.previous_main_operation,s.next_main_operation,s.intermediate_signature,s.route_count,s.source,
           100::int priority,null::text note,
           coalesce(ops.intermediate_operations,'[]'::jsonb) intermediate_operations,
           null::text routing_codes
    from md_intermediate_bridge_segment s
    left join lateral (select jsonb_agg(o.operation_code order by o.sequence_no) intermediate_operations from md_intermediate_bridge_operation o where o.segment_id=s.id) ops on true
    where s.is_active=true
    order by case when s.source='MANUAL' then 0 else 1 end,s.previous_main_operation,s.next_main_operation,s.intermediate_signature
   `)
  ]);
  if(main.warning)warnings.push(`Main Operation: ${main.warning}`);
  if(group.warning)warnings.push(`ST Group: ${group.warning}`);
  if(area.warning)warnings.push(`Physical Area: ${area.warning}`);
  if(schedule.warning)warnings.push(`Schedule Area / Planner: ${schedule.warning}`);
  if(bridge.warning)warnings.push(`Intermediate Bridge: ${bridge.warning}`);

  return <main className="erp-shell erpkit-migrated-page"><ErpAppHeader module="CONFIGURATION FLOW"/><AppTabs active="config"/><div className="erp-workspace"><ConfigSidebar active="flow"/><section className="erp-content"><ConfigPageHeader
   title="ST Operation Flow"
   subtitle="Cấu hình Main Planning / Intermediate Dashboard ST / ST Scope Only; Bridge Intermediate vẫn được suy ra độc lập từ Routing."
   purpose="Bridge xác định vai trò Intermediate theo routing; Dashboard ST membership chỉ xác định Intermediate nào được tính trên Dashboard. Hai lớp độc lập, không dùng nhãn Dashboard ST để suy ra Previous/Next Main."
   impact="Planning Operation vẫn sync Planning Chain theo logic hiện hành. INTERMEDIATE Dashboard ST chỉ cập nhật nhãn Dashboard và tuyệt đối không sửa Mapping, All Open Jobs, Planning Chain, Candidate, Batch hay Schedule. API sẽ chặn nếu Operation đang là Planning source."
   prev={{label:"Health Dashboard",href:"/settings"}}
   next={{label:"ST Scope & Operation Code",href:"/operation-code-order"}}
  /><SchemaNotice warnings={warnings}/><StOperationFlowManager rows={flow.rows as any} rawOperations={raw.rows as any} mainOperations={main.rows as any} groups={group.rows as any} areas={area.rows as any} scheduleAreas={schedule.rows as any} bridgeSegments={bridge.rows as any}/></section></div></main>;
 }catch(e){
  fatalError=e instanceof Error?e.message:String(e);
 }finally{c?.release()}

 return <main className="erp-shell erpkit-migrated-page"><ErpAppHeader module="CONFIGURATION FLOW"/><AppTabs active="config"/><div className="erp-workspace"><ConfigSidebar active="flow"/><section className="erp-content"><ConfigPageHeader
  title="ST Operation Flow"
  subtitle="Cấu hình Main Planning / Intermediate Dashboard ST / ST Scope Only."
  purpose="Cấu hình vai trò Operation trong ST và mối quan hệ Planning/Bridge."
  impact="Không thay đổi All Open Job khi chỉ mở trang."
  prev={{label:"Health Dashboard",href:"/settings"}}
  next={{label:"ST Scope & Operation Code",href:"/operation-code-order"}}
 /><ErrorPanel message={fatalError||"Unknown server data error"}/></section></div></main>;
}
