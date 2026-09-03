import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {getPool} from "@/lib/db";
import {AppTabs} from "@/components/app-tabs";
import ScheduleBoardClient from "@/components/schedule-board-client";
import {ManualScheduleGrid} from "@/components/manual-schedule-grid";
import ProductionTimelineClient from "@/components/production-timeline-client";
import {ScheduleDayShiftControl} from "@/components/schedule-day-shift-control";
import {calculateScheduleEnd,getProductionDay} from "@/lib/schedule-time";

export const dynamic="force-dynamic";

function fmt(v:any){
 const n=Number(v||0);return new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(n)
}
function hhmm(v:any){
 const n=Number(v||0);if(!n)return "—";
 return `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`
}
function time(v:any){
 if(!v)return "—";
 return new Date(v).toLocaleTimeString("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"})
}

export default async function Page({
 searchParams
}:{searchParams:Promise<{date?:string;planner?:string}>}){
 const sp=await searchParams;
 // v187: Production day starts at 06:00
 const now=new Date();
 const productionDay=getProductionDay(now);
 const today=productionDay.toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"});
 const date=sp.date||today;
 const planner=sp.planner==="2"?"2":"1";
 const c=await getPool().connect();
 try{
  // Planner ownership is fully dynamic: Schedule Area -> Planner Assignment -> Main Operation.
  const plannerScopeQ=await c.query(`
   select
    coalesce(w.planner_owner,'UNASSIGNED') planner_owner,
    m.standard_operation,
    a.display_order
   from md_schedule_area a
   join md_schedule_area_operation m
     on m.schedule_area_code=a.schedule_area_code and m.is_active=true
   left join md_planner_work_assignment w
     on w.schedule_area_code=a.schedule_area_code and w.is_active=true
   where a.is_active=true
   order by a.display_order,m.standard_operation
  `);
  const planner1Operations:string[]=[...new Set<string>(plannerScopeQ.rows.filter((x:any)=>x.planner_owner==='1').map((x:any)=>String(x.standard_operation)))];
  const planner2Operations:string[]=[...new Set<string>(plannerScopeQ.rows.filter((x:any)=>x.planner_owner==='2').map((x:any)=>String(x.standard_operation)))];
  const plannerOperations=planner==='2'?planner2Operations:planner1Operations;
  const plannerOperationSet=new Set(plannerOperations.map(x=>x.toUpperCase()));
  const plannerOwnerByOperation=new Map<string,string>();
  for(const x of plannerScopeQ.rows){
   const op=String(x.standard_operation||'').toUpperCase();
   if(op && ['1','2'].includes(String(x.planner_owner)))plannerOwnerByOperation.set(op,String(x.planner_owner));
  }
  const [
   resourcesQ,batchesQ,scheduleTableQ,timelineQ,operationsQ,recipesQ,handoverAlertsQ,scheduleAreasQ,handlingRulesQ
  ]=await Promise.all([
   c.query(`select * from md_schedule_resource where is_active=true order by sort_order,resource_code`),
   c.query(`
    select
      b.id,b.batch_no,b.standard_operation,b.recipe_key,
      r.recipe_no,r.recipe_name,
      b.total_jobs,b.total_qty,b.total_surface_dm2,b.process_minutes,
      nextbreakdown.next_main_operations,
      nextbreakdown.next_main_breakdown,
      coalesce(previousinfo.previous_main_batches,'[]'::jsonb) previous_main_batches,
      sch.schedule_id,
      sch.schedule_date,
      sch.resource_code scheduled_resource_code,
      sch.planned_start scheduled_planned_start,
      sch.planned_end scheduled_planned_end,
      sch.schedule_status
    from planning_batch b
    left join md_process_recipe r
      on r.recipe_key=b.recipe_key
     and r.is_active=true

    left join lateral (
      select
        string_agg(x.next_op,' / ' order by x.next_op) next_main_operations,
        jsonb_agg(
          jsonb_build_object(
            'operation',x.next_op,
            'qty',x.qty,
            'surface',x.surface,
            'paint',nullif(x.paint_values,'')
          )
          order by x.next_op
        ) next_main_breakdown
      from (
        select
          coalesce(n.standard_operation,'END') next_op,
          coalesce(sum(bj.qty),0) qty,
          coalesce(sum(bj.surface_dm2),0) surface,
          array_to_string(
            array_remove(
              array_agg(
                distinct case n.standard_operation
                  when 'PRIMER' then nullif(trim(coalesce(mf.primer1,'')),'')
                  when 'PRIMER2' then nullif(trim(coalesce(mf.primer2,'')),'')
                  when 'PRIMER3' then nullif(trim(coalesce(mf.primer3,'')),'')
                  when 'TOPCOAT1' then nullif(trim(coalesce(mf.topcoat1,'')),'')
                  when 'TOPCOAT2' then nullif(trim(coalesce(mf.topcoat2,'')),'')
                  when 'ANTI-ABRASION' then nullif(trim(coalesce(mf.antiabration,'')),'')
                  when 'VARNISH' then nullif(trim(coalesce(mf.varinish_name,'')),'')
                  else null
                end
              ),
              null
            ),
            ' / '
          ) paint_values
        from planning_batch_job bj
        join open_job_current j on j.job_num=bj.job_num
        left join md_material_finish mf
          on mf.part_num=j.part_num
         and mf.revision_num=j.revision_num
         and mf.is_active=true
        left join planning_job_operation cur
          on cur.id=bj.planning_job_operation_id
        left join lateral (
          select p2.standard_operation
          from planning_job_operation p2
          where p2.job_num=bj.job_num
            and p2.is_active=true
            and p2.planning_seq>coalesce(cur.planning_seq,0)
          order by p2.planning_seq
          limit 1
        ) n on true
        where bj.batch_id=b.id
        group by coalesce(n.standard_operation,'END')
      ) x
    ) nextbreakdown on true

    left join lateral (
      select jsonb_agg(
       jsonb_build_object(
        'batch_id',pinfo.previous_batch_id,
        'batch_no',pinfo.previous_batch_no,
        'operation',pinfo.previous_operation,
        'schedule_status',pinfo.schedule_status,
        'resource_code',pinfo.resource_code,
        'planned_start',pinfo.planned_start,
        'planned_end',pinfo.planned_end
       )
       order by
        pinfo.previous_operation,
        pinfo.previous_batch_no nulls last,
        pinfo.planned_end nulls last
      ) previous_main_batches
      from (
       select distinct
        prevhist.previous_batch_id,
        prevhist.previous_batch_no,
        coalesce(
         prevhist.previous_batch_operation,
         prevp.standard_operation,
         cur.previous_standard_operation_snapshot
        ) previous_operation,
        case
         when prevhist.previous_batch_id is not null
          and prevsch.id is not null
          then 'SCHEDULED'
         else 'UNSCHEDULED'
        end schedule_status,
        prevsch.resource_code,
        prevsch.planned_start,
        prevsch.planned_end
       from planning_batch_job cbj

       left join planning_job_operation cur
        on cur.id=cbj.planning_job_operation_id

       left join lateral (
        select
         p2.standard_operation,
         p2.source_seq,
         p2.planning_seq
        from planning_job_operation p2
        where p2.job_num=cbj.job_num
          and p2.is_active=true
          and p2.standard_operation<>'PIONBL'
          and (
           (
            cur.planning_seq is not null
            and p2.planning_seq<cur.planning_seq
           )
           or (
            cur.planning_seq is null
            and cbj.planning_seq_snapshot is not null
            and p2.planning_seq<cbj.planning_seq_snapshot
           )
          )
        order by p2.planning_seq desc
        limit 1
       ) prevp on true

       left join lateral (
        select
         hb.id previous_batch_id,
         hb.batch_no previous_batch_no,
         hbj.standard_operation previous_batch_operation,
         coalesce(hbj.source_seq_snapshot,hp.source_seq) previous_batch_source_seq
        from planning_batch_job hbj
        join planning_batch hb
         on hb.id=hbj.batch_id
        and hb.status<>'CANCELLED'
        left join planning_job_operation hp
         on hp.id=hbj.planning_job_operation_id
        where hbj.job_num=cbj.job_num
          and hbj.batch_id<>cbj.batch_id
          and hbj.standard_operation<>'PIONBL'
          and coalesce(hbj.source_seq_snapshot,hp.source_seq,-1)
              <coalesce(cbj.source_seq_snapshot,cur.source_seq,2147483647)
        order by
         coalesce(hbj.source_seq_snapshot,hp.source_seq) desc,
         hb.created_at desc,
         hbj.id desc
        limit 1
       ) prevhist on true

       left join lateral (
        select
         ps.id,
         ps.resource_code,
         ps.planned_start,
         ps.planned_end
        from planning_schedule ps
        where ps.batch_id=prevhist.previous_batch_id
          and ps.status<>'CANCELLED'
        order by ps.planned_start desc,ps.id desc
        limit 1
       ) prevsch on true

       where cbj.batch_id=b.id
         and coalesce(
          prevhist.previous_batch_operation,
          prevp.standard_operation,
          cur.previous_standard_operation_snapshot
         ) is not null
      ) pinfo
    ) previousinfo on true

    left join lateral (
      select
        s.id schedule_id,
        s.schedule_date,
        s.resource_code,
        s.planned_start,
        s.planned_end,
        s.status schedule_status
      from planning_schedule s
      where s.batch_id=b.id
        and s.status<>'CANCELLED'
      order by s.planned_start desc,s.id desc
      limit 1
    ) sch on true

    where b.status<>'CANCELLED'

    order by
      case when sch.schedule_id is null then 0 else 1 end,
      b.created_at,
      b.id
   `),

   // Schedule Table: show EVERY active schedule assigned to the selected calendar date.
   c.query(`
    select
      s.*,
      coalesce(b.batch_no,'LEGACY-'||s.batch_id::text) batch_no,
      b.standard_operation,b.recipe_key,
      coalesce(s.plan_source,b.plan_source,'PLANNING_BOARD') plan_source,
      pr.recipe_no,pr.recipe_name,
      coalesce(b.total_jobs,0) total_jobs,
      coalesce(b.total_qty,0) total_qty,
      coalesce(b.total_surface_dm2,0) total_surface_dm2,
      coalesce(sr.resource_name,s.resource_code) resource_name,
      coalesce(sr.resource_group,'UNMAPPED') resource_group,
      coalesce(sr.sort_order,9999) resource_sort_order
    from planning_schedule s
    left join planning_batch b
      on b.id=s.batch_id
    left join md_process_recipe pr
      on pr.recipe_key=b.recipe_key
     and pr.is_active=true
    left join md_schedule_resource sr
      on sr.resource_code=s.resource_code
    where s.status<>'CANCELLED'
      and (
        s.schedule_date=$1::date
        or (s.planned_start at time zone 'Asia/Ho_Chi_Minh')::date=$1::date
      )
    order by
      case when coalesce(s.sequence_no,0)>0 then 0 else 1 end,
      coalesce(s.sequence_no,0),
      s.planned_start,
      coalesce(sr.sort_order,9999),
      coalesce(b.batch_no,'LEGACY-'||s.batch_id::text)
   `,[date]),

   // Timeline: production day remains 06:00 selected date -> 06:00 next day.
   c.query(`
    select
      s.*,
      coalesce(b.batch_no,'LEGACY-'||s.batch_id::text) batch_no,
      b.standard_operation,b.recipe_key,
      coalesce(s.plan_source,b.plan_source,'PLANNING_BOARD') plan_source,
      pr.recipe_no,pr.recipe_name,
      coalesce(b.total_jobs,0) total_jobs,
      coalesce(b.total_qty,0) total_qty,
      coalesce(b.total_surface_dm2,0) total_surface_dm2,
      coalesce(sr.resource_name,s.resource_code) resource_name,
      coalesce(sr.resource_group,'UNMAPPED') resource_group,
      coalesce(sr.sort_order,9999) resource_sort_order
    from planning_schedule s
    left join planning_batch b
      on b.id=s.batch_id
    left join md_process_recipe pr
      on pr.recipe_key=b.recipe_key
     and pr.is_active=true
    left join md_schedule_resource sr
      on sr.resource_code=s.resource_code
    where s.status<>'CANCELLED'
      and s.planned_start < (($1::date + interval '1 day' + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
      and s.planned_end   > (($1::date + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
    order by
      coalesce(sr.sort_order,9999),
      s.planned_start,
      coalesce(b.batch_no,'LEGACY-'||s.batch_id::text)
   `,[date]),

   c.query(`
    select
      o.standard_operation,
      o.st_group,
      o.batch_prefix,
      coalesce(g.group_name,o.st_group) st_group_name,
      coalesce(g.sort_order,9999) st_group_sort_order
    from md_operation_master o
    left join md_st_group g
      on g.st_group=o.st_group
     and g.is_active=true
    where o.is_active=true
    order by
      coalesce(g.sort_order,9999),
      o.st_group,
      o.standard_operation
   `),

   c.query(`
    select
      r.recipe_key,r.recipe_no,r.recipe_name,r.process_family,
      (
        select coalesce(nullif(m.operation_code,''), m.standard_operation)
        from md_main_operation_recipe m
        where m.recipe_key=r.recipe_key
          and m.is_active=true
        order by (m.is_default=false),m.priority,m.operation_code
        limit 1
      ) default_standard_operation
    from md_process_recipe r
    where r.is_active=true
    order by r.process_family,r.recipe_no,r.recipe_name
   `),

   c.query(`
    select
      e.id,e.source_batch_id,e.source_batch_no,e.source_standard_operation,
      e.source_planner,e.job_num,e.change_type,
      e.next_standard_operation,e.affected_planner,
      e.affected_batch_id,e.affected_batch_no,
      e.affected_schedule_id,e.affected_resource_code,e.affected_planned_start,
      e.source_batch_qty_before,e.source_batch_qty_after,
      e.source_batch_surface_before,e.source_batch_surface_after,
      e.changed_job_qty,e.changed_job_surface,
      e.impact_level,e.status,e.created_at,e.acknowledged_at,e.acknowledged_by,e.note
    from planning_handover_change_event e
    where e.affected_planner=$1
      and e.created_at>=now()-interval '14 days'
    order by
      case e.status when 'NEW' then 0 else 1 end,
      case e.impact_level
       when 'CRITICAL' then 0
       when 'IMPACTED' then 1
       when 'WARNING' then 2
       else 3
      end,
      e.created_at desc
    limit 200
   `,[planner]),

   c.query(`
    select a.*,
      coalesce(jsonb_agg(
       jsonb_build_object('standard_operation',m.standard_operation)
       order by m.standard_operation
      ) filter(where m.id is not null),'[]'::jsonb) operations
    from md_schedule_area a
    left join md_schedule_area_operation m
      on m.schedule_area_code=a.schedule_area_code and m.is_active=true
    left join md_planner_work_assignment w
      on w.schedule_area_code=a.schedule_area_code
     and w.is_active=true
    where a.is_active=true
      and a.allow_manual_plan=true
      and coalesce(
       w.planner_owner,
       case when a.planner_owner in ('1','2') then a.planner_owner else 'UNASSIGNED' end
      )=$1
    group by a.schedule_area_code
    order by a.display_order,a.schedule_area_code
   `,[planner]),

   c.query(`
    select id,phase,priority,qty_min,qty_max,surface_min_dm2,surface_max_dm2,duration_minutes,note
    from md_chemical_handling_time_rule
    where is_active=true
    order by phase,priority,id
   `)
  ]);

  const handoverAlerts=handoverAlertsQ.rows as any[];
  const allRows=scheduleTableQ.rows as any[];
  const plannerScheduleAreas=scheduleAreasQ.rows as any[];

  // Dynamic Planner scope:
  // Planner ownership comes from Schedule Area assignment + its mapped Standard Operations.
  // Fall back to the previous fixed Planner operation list only while no Schedule Area
  // operation mapping has been configured yet.
  const assignedOperations=[
   ...new Set(
    plannerScheduleAreas.flatMap((area:any)=>
     Array.isArray(area.operations)
      ? area.operations
         .map((x:any)=>String(x.standard_operation||"").trim().toUpperCase())
         .filter(Boolean)
      : []
    )
   )
  ];

  const effectivePlannerOperationSet=new Set(assignedOperations.length?assignedOperations:[...plannerOperationSet]);

  const alertCountByBatch=new Map<number,number>();
  for(const alert of handoverAlerts){
   if(alert.status!=="NEW"||!alert.affected_batch_id)continue;
   const id=Number(alert.affected_batch_id);
   alertCountByBatch.set(id,(alertCountByBatch.get(id)||0)+1);
  }

  const plannerBatches=(batchesQ.rows as any[])
   .filter(
    (x:any)=>effectivePlannerOperationSet.has(String(x.standard_operation||"").toUpperCase())
   )
   .map((x:any)=>({
    ...x,
    handover_alert_count:alertCountByBatch.get(Number(x.id))||0
   }));

  const rows=(scheduleTableQ.rows as any[]).filter(
   (x:any)=>effectivePlannerOperationSet.has(String(x.standard_operation||"").toUpperCase())
  );

  const timelineRows=(timelineQ.rows as any[]).filter(
   (x:any)=>effectivePlannerOperationSet.has(String(x.standard_operation||"").toUpperCase())
  );

  const operationOrder=new Map(plannerOperations.map((op,index)=>[op.toUpperCase(),index]));
  const plannerOperationRows=(operationsQ.rows as any[])
   .filter((x:any)=>effectivePlannerOperationSet.has(String(x.standard_operation||"").toUpperCase()))
   .sort((a:any,b:any)=>(operationOrder.get(String(a.standard_operation).toUpperCase())??999)-(operationOrder.get(String(b.standard_operation).toUpperCase())??999));

  // Unified production timeline order.
  // Resource order is for Board visualization only; the exact Standard Operation
  // remains attached to each scheduled Batch, so different Job routings are not altered.

  return <main className="erp-shell erpkit-migrated-page">
   <ErpAppHeader module="SCHEDULING"/>
   <AppTabs active="schedule"/>
   <section className="erp-content erp-content-full">
    <div className="erp-page-head">
     <div><h2>Board Điều Độ</h2><p>Điều độ Batch theo Resource, ngày sản xuất và thời gian xử lý.</p></div>
     <div className="schedule-page-date-actions">
      <form>
       <input type="hidden" name="planner" value={planner}/>
       <input className="input" type="date" name="date" defaultValue={date}/>
       <button className="btn" type="submit">Tải</button>
      </form>
      <ScheduleDayShiftControl date={date} planner={planner} scheduleCount={allRows.length}/>
     </div>
    </div>

    <div className="erp-overview-metrics">
     <div className="erp-overview-metric"><span>Planner</span><b>{planner}</b><small>{plannerOperations.length} Main Operation</small></div>
     <div className="erp-overview-metric"><span>Batch trong phạm vi</span><b>{plannerBatches.length}</b><small>Batch có thể điều độ</small></div>
     <div className="erp-overview-metric success"><span>Đã điều độ</span><b>{rows.length}</b><small>Ngày {date}</small></div>
     <div className={`erp-overview-metric ${handoverAlerts.some((x:any)=>x.status==="NEW")?"warning":""}`}><span>Handover mới</span><b>{handoverAlerts.filter((x:any)=>x.status==="NEW").length}</b><small>Cần planner kiểm tra</small></div>
    </div>

    <div className="schedule-planner-view-tabs">
     <a
      className={`schedule-planner-view-tab ${planner==="1"?"active":""}`}
      href={`/schedule?date=${encodeURIComponent(date)}&planner=1`}
     >
      Planner 1
      <small>{planner1Operations.length} công đoạn</small>
     </a>
     <a
      className={`schedule-planner-view-tab ${planner==="2"?"active":""}`}
      href={`/schedule?date=${encodeURIComponent(date)}&planner=2`}
     >
      Planner 2
      <small>{planner2Operations.length} công đoạn</small>
     </a>
    </div>

    <div className="schedule-planner-view-summary">
     <b>Planner {planner}</b>
     <span>{plannerOperations.join(" · ")}</span>
    </div>


    <ManualScheduleGrid
     scheduleAreas={scheduleAreasQ.rows as any}
     operations={plannerOperationRows as any}
     resources={resourcesQ.rows as any}
     recipes={recipesQ.rows as any}
     scheduledRows={rows as any}
     planningBatches={plannerBatches as any}
     handlingRules={handlingRulesQ.rows as any}
     date={date}
     planner={planner}
    />

    <ScheduleBoardClient
     batches={plannerBatches as any}
     resources={resourcesQ.rows as any}
     operations={plannerOperationRows as any}
     recipes={recipesQ.rows as any}
     scheduleAreas={plannerScheduleAreas as any}
     handoverAlerts={handoverAlerts as any}
     planner={planner}
     date={date}
    />

    <div className="erp-table-panel section schedule-table-all-planners">
     <div className="erp-panel-head">
      <div>
       <b>Bảng điều độ · Tổng hợp Planner 1 + Planner 2</b>
       <small className="planning-sub">Tất cả Batch đã điều độ trong ngày {date}</small>
      </div>
      <span>{allRows.length} lô đã điều độ</span>
     </div>

     <div className="table-wrap">
      <table className="erp-table schedule-table schedule-table-combined schedule-table-single-batch">
       <thead>
        <tr>
         <th>Planner</th>
         <th>Batch#</th>
         
         <th>Resource</th>
         <th>Recipe#</th>
         <th>Recipe description</th>
         <th className="num">Jobs</th>
         <th className="num">pcs</th>
         <th className="num">dm²</th>
         <th>Start Time</th>
         <th>End Time</th>
         <th>Duration</th>
        </tr>
       </thead>

       <tbody>
        {allRows.map((x:any)=>{
         const op=String(x.standard_operation||"").toUpperCase();
         const ownerCode=plannerOwnerByOperation.get(op);
         const owner=ownerCode==="1"?"Planner 1":ownerCode==="2"?"Planner 2":"—";

         return <tr
          key={`all-${x.id}`}
          className={
           owner==="Planner 1"
            ?"schedule-row-planner1"
            :owner==="Planner 2"
             ?"schedule-row-planner2"
             :""
          }
         >
          <td>
           <span className={`schedule-planner-badge ${
            owner==="Planner 1"
             ?"planner1"
             :owner==="Planner 2"
              ?"planner2"
              :""
           }`}>
            {owner}
           </span>
          </td>
          <td><b>{x.batch_no||"—"}</b></td>
          
          <td>
           <b>{x.resource_code||"—"}</b>
           {x.resource_name&&x.resource_name!==x.resource_code&&
            <small className="planning-sub">{x.resource_name}</small>}
          </td>
          <td>{x.recipe_no||"—"}</td>
          <td>{x.recipe_name||"—"}</td>
          <td className="num">{x.total_jobs}</td>
          <td className="num">{fmt(x.total_qty)}</td>
          <td className="num">{fmt(x.total_surface_dm2)}</td>
          <td className="mono">{time(x.planned_start)}</td>
          <td className="mono schedule-calculated-end">{time(calculateScheduleEnd(x.planned_start,x.duration_minutes))}</td>
          <td className="mono">{hhmm(x.duration_minutes)}</td>
         </tr>
        })}

        {!allRows.length&&
         <tr>
          <td colSpan={10} className="muted">
           Chưa có Batch được xếp lịch cho ngày này.
          </td>
         </tr>}
       </tbody>
      </table>
     </div>
    </div>

    <div className="erp-table-panel section">
     <div className="erp-panel-head">
      <b>Bảng điều độ · Planner {planner}</b>
      <span>{rows.length} lô đã điều độ</span>
     </div>

     <div className="table-wrap">
      <table className="erp-table schedule-table schedule-table-single-batch">
       <thead>
        <tr>
         <th>Batch#</th>
         
         <th>Resource</th>
         <th>Recipe#</th>
         <th>Recipe description</th>
         <th className="num">Jobs</th>
         <th className="num">pcs</th>
         <th className="num">dm²</th>
         <th>Start Time</th>
         <th>End Time</th>
         <th>Duration</th>
        </tr>
       </thead>

       <tbody>
        {rows.map((x:any)=>
         <tr key={x.id}>
          <td><b>{x.batch_no||"—"}</b></td>
          
          <td>
           <b>{x.resource_code||"—"}</b>
           {x.resource_name&&x.resource_name!==x.resource_code&&
            <small className="planning-sub">{x.resource_name}</small>}
          </td>
          <td>{x.recipe_no||"—"}</td>
          <td>{x.recipe_name||"—"}</td>
          <td className="num">{x.total_jobs}</td>
          <td className="num">{fmt(x.total_qty)}</td>
          <td className="num">{fmt(x.total_surface_dm2)}</td>
          <td className="mono">{time(x.planned_start)}</td>
          <td className="mono schedule-calculated-end">{time(calculateScheduleEnd(x.planned_start,x.duration_minutes))}</td>
          <td className="mono">{hhmm(x.duration_minutes)}</td>
         </tr>
        )}

        {!rows.length&&
         <tr>
          <td colSpan={10} className="muted">
           Chưa có Batch được xếp lịch cho ngày này.
          </td>
         </tr>}
       </tbody>
      </table>
     </div>
    </div>

    <ProductionTimelineClient
     date={date}
     resources={resourcesQ.rows as any}
     initialRows={timelineRows as any}
     plannerOps={[...effectivePlannerOperationSet] as string[]}
    />

    
   </section>
  </main>
 }finally{c.release()}
}
