import Link from "next/link";
import {AppTabs} from "@/components/app-tabs";
import {PlanningBoardClient} from "@/components/planning-board-client";
import {PlanningAreaOperationFilter} from "@/components/planning-area-operation-filter";
import {BatchRowActions} from "@/components/batch-row-actions";
import {ResetAllBatchesButton} from "@/components/reset-all-batches-button";
import {getPool} from "@/lib/db";

export const dynamic="force-dynamic";

const formatNumber=(value:unknown, maxDecimals=2)=>{
 const n=Number(value??0);
 if(!Number.isFinite(n))return "0";
 const fixed=n.toFixed(maxDecimals);
 let [whole,decimal]=fixed.split(".");
 whole=whole.replace(/\B(?=(\d{3})+(?!\d))/g,".");
 decimal=(decimal||"").replace(/0+$/,"");
 return decimal?`${whole},${decimal}`:whole;
};

const hhmm=(minutes:number|null)=>{
 if(minutes==null)return "—";
 const h=Math.floor(minutes/60);
 const m=minutes%60;
 return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
};

export default async function Page({
 searchParams
}:{
 searchParams:Promise<{area?:string;op?:string;recipe?:string;prevBatch?:string}>
}){
 const sp=await searchParams;
 const areaId=(sp.area||"").trim();
 const op=(sp.op||"").trim();
 const recipeKey=(sp.recipe||"").trim();
 const previousBatchNo=(sp.prevBatch||"").trim();

 const c=await getPool().connect();
 try{
   const [areasQ,opsQ,batchesQ,matrixOpsQ]=await Promise.all([
     c.query(`
       select id,area_name
       from md_area
       where is_active=true
       order by sort_order,area_name
     `),
     c.query(`
       select s.standard_operation,s.sort_order,
              om.st_group,
              a.id area_id,a.area_name
       from md_planning_operation_scope s
       left join md_operation_master om
         on om.standard_operation=s.standard_operation
        and om.is_active=true
       left join md_area_operation_group ag
         on ag.st_group=om.st_group
        and ag.is_active=true
       left join md_area a
         on a.id=ag.area_id
        and a.is_active=true
       where s.is_active=true
       order by s.sort_order
     `),
     c.query(`
       select
        b.id,b.batch_no,b.planning_date,b.standard_operation,b.recipe_key,
        b.total_jobs,b.total_qty,b.total_surface_dm2,b.process_minutes,
        b.planned_start,b.planned_end,b.status,b.priority,
        a.area_name,
        r.recipe_no,r.recipe_name
       from planning_batch b
       left join md_area a on a.id=b.area_id
       left join md_process_recipe r on r.recipe_key=b.recipe_key
       where b.status<>'CANCELLED'
       order by b.created_at desc
       limit 50
     `),
     c.query(`
       select
         s.standard_operation,
         s.sort_order operation_sort,
         om.st_group,
         a.id area_id,
         a.area_name,
         coalesce(a.sort_order,999999) area_sort,
         coalesce(sg.sort_order,999999) st_group_sort
       from md_planning_operation_scope s
       left join md_operation_master om
         on om.standard_operation=s.standard_operation
        and om.is_active=true
       left join md_st_group sg
         on sg.st_group=om.st_group
        and sg.is_active=true
       left join md_area_operation_group ag
         on ag.st_group=om.st_group
        and ag.is_active=true
       left join md_area a
         on a.id=ag.area_id
        and a.is_active=true
       where s.is_active=true
       order by
         coalesce(a.sort_order,999999),
         coalesce(sg.sort_order,999999),
         s.sort_order,
         s.standard_operation
     `)
   ]);

   const params:any[]=[];
   const conditions=[
     "p.is_active=true",
     "p.status in ('ELIGIBLE','PLANNED')",
     "j.is_open=true"
   ];

   if(op){
     params.push(op);
     conditions.push(`p.standard_operation=$${params.length}`);
   }

   if(areaId){
     params.push(Number(areaId));
     conditions.push(`a.id=$${params.length}`);
   }

   if(recipeKey){
     params.push(recipeKey);
     const n=params.length;
     conditions.push(`(
       p.recipe_key=$${n}
       or (
         p.recipe_key is null
         and exists(
           select 1
           from md_operation_code_recipe ocr
           where ocr.operation_code=p.source_operation_code
             and ocr.recipe_key=$${n}
             and ocr.is_active=true
         )
       )
     )`);
   }

   if(previousBatchNo){
     params.push(previousBatchNo);
     conditions.push(`prevhist.previous_batch_no=$${params.length}`);
   }

   const candidatesQ=await c.query(`
     select
       p.id,p.job_num,p.source_operation_code,p.standard_operation,p.st_group,p.recipe_key,
       p.status planning_status,
       pb.batch_no,
       pb.id batch_id,
       pb.status batch_status,
       case
         when prevhist.previous_batch_no is not null then coalesce(prevhist.previous_batch_status,'PLANNED')
         when prevp.standard_operation is not null then coalesce(prevp.status,'—')
         when p.previous_standard_operation_snapshot is not null then 'NO BATCH'
         else null
       end previous_planning_status,
       coalesce(
         prevp.standard_operation,
         prevhist.previous_batch_operation,
         p.previous_standard_operation_snapshot
       ) previous_planning_operation,
       prevhist.previous_batch_no,
       prevhist.previous_batch_id,
       prevhist.previous_batch_status,
       prevhist.previous_batch_operation,
       prevhist.previous_batch_source_operation,
       prevhist.previous_batch_source_seq,
       j.part_num,j.revision_num,j.program,j.priority_type,
       mf.primer1 part_master_primer1,
       mf.primer2 part_master_primer2,
       mf.primer3 part_master_primer3,
       mf.topcoat1 part_master_topcoat1,
       mf.topcoat2 part_master_topcoat2,
       mf.antiabration part_master_antiabration,
       mf.varinish_name part_master_varnish,
       j.source_data,
       j.part_cluster,j.part_description,
       j.prod_qty,j.current_good_wip_qty,j.last_labor_qty,
       j.last_operation,j.next_operation,j.all_operation,
       j.total_surface,j.surface_per_part_dm2,
       j.open_dmr,j.st,j.st_wip_area,j.wip_sequence,
       j.cat35_transit,j.impact_sale_value,
       j.last_import_status,j.first_seen_at,j.last_seen_at,j.last_changed_at,
       coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0) plan_qty,
       coalesce(
         j.total_surface,
         coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)
           * coalesce(j.surface_per_part_dm2,0),
         0
       ) plan_surface,
       a.area_name,
       coalesce(r.recipe_no,selected_r.recipe_no) recipe_no,
       coalesce(r.recipe_name,selected_r.recipe_name) recipe_name,
       coalesce(routeinfo.route_status,'[]'::jsonb) route_status,
       (
         p.recipe_key is not null
         or exists(
           select 1
           from md_operation_code_recipe ocr0
           where ocr0.operation_code=p.source_operation_code
             and ocr0.is_active=true
         )
         or exists(
           select 1
           from md_operation_recipe_mapping orm0
           where orm0.standard_operation=p.standard_operation
             and orm0.is_active=true
         )
       ) recipe_required,
       (
         select p2.standard_operation
         from planning_job_operation p2
         where p2.job_num=p.job_num
           and p2.is_active=true
           and p2.planning_seq>p.planning_seq
         order by p2.planning_seq
         limit 1
       ) next_standard_operation,
       coalesce(
         prevp.standard_operation,
         p.previous_standard_operation_snapshot
       ) previous_standard_operation
     from planning_job_operation p
     join open_job_current j
       on j.job_num=p.job_num

     left join md_material_finish mf
       on mf.part_num=j.part_num
      and mf.revision_num=j.revision_num
      and mf.is_active=true

     -- Current Batch of this exact planning operation.
     -- Keep this separate from route-history lookup below.
     left join planning_batch_job pbj
       on pbj.planning_job_operation_id=p.id
     left join planning_batch pb
       on pb.id=pbj.batch_id
      and pb.status<>'CANCELLED'

     -- Previous planning operation for Candidate display/filter.
     left join lateral (
       select p2.standard_operation,p2.status
       from planning_job_operation p2
       where p2.job_num=p.job_num
         and p2.is_active=true
         and p2.standard_operation<>'PIONBL'
         and p2.planning_seq<p.planning_seq
       order by p2.planning_seq desc
       limit 1
     ) prevp on true

     -- Most recent previous Main Operation batch for this Job.
     left join lateral (
       select
         hb.id previous_batch_id,
         hb.batch_no previous_batch_no,
         hb.status previous_batch_status,
         hp.standard_operation previous_batch_operation,
         hbj.source_operation_code previous_batch_source_operation,
         coalesce(hbj.source_seq_snapshot,hp.source_seq) previous_batch_source_seq
       from planning_batch_job hbj
       join planning_batch hb
         on hb.id=hbj.batch_id
        and hb.status<>'CANCELLED'
       left join planning_job_operation hp
         on hp.id=hbj.planning_job_operation_id
       where hbj.job_num=p.job_num
         and hbj.standard_operation<>'PIONBL'
         and coalesce(hbj.source_seq_snapshot,hp.source_seq)<p.source_seq
       order by
         coalesce(hbj.source_seq_snapshot,hp.source_seq) desc,
         hb.created_at desc,
         hbj.id desc
       limit 1
     ) prevhist on true

     left join lateral (
       select jsonb_agg(
         jsonb_build_object(
           'route_key',r.route_key,
           'source_operation',r.source_operation,
           'source_seq',r.source_seq,
           'occurrence',r.occurrence,
           'standard_operation',r.standard_operation,
           'route_status',r.route_status,
           'batch_id',r.batch_id,
           'batch_no',r.batch_no,
           'batch_status',r.batch_status,
           'schedule_id',r.schedule_id,
           'schedule_status',r.schedule_status,
           'resource_code',r.resource_code,
           'planned_start',r.planned_start,
           'planned_end',r.planned_end,
           'recipe_no',r.recipe_no,
           'recipe_name',r.recipe_name
         )
         order by r.source_seq
       ) route_status
       from (
         with raw_route as (
           select
             trim(both '[] ' from token) source_operation,
             ordinality::int source_seq,
             row_number() over(
               partition by upper(trim(both '[] ' from token))
               order by ordinality
             ) occurrence
           from regexp_split_to_table(
             regexp_replace(coalesce(j.all_operation,''),'^\s*\[|\]\s*$','','g'),
             '\s*\|\s*'
           ) with ordinality as parts(token,ordinality)
           where trim(both '[] ' from token)<>''
         ),

         mapped_route as (
           select
             rr.*,

             -- Prefer the exact Planning Chain operation at this source sequence.
             -- This preserves occurrence rules such as PRIMER2/PRIMER3/TOPCOAT2.
             coalesce(
               exact_po.standard_operation,

               -- For source codes already completed and no longer active in
               -- planning_job_operation, reuse historical Batch snapshot.
               hist_op.standard_operation,

               -- Fallback to DIRECT mapping.
               direct_map.standard_operation_rule,

               case when upper(rr.source_operation)='PIONBL' then 'PIONBL' end
             ) standard_operation

           from raw_route rr

           left join lateral (
             select po.standard_operation
             from planning_job_operation po
             where po.job_num=p.job_num
               and po.source_seq=rr.source_seq
             order by
               po.is_active desc,
               po.updated_at desc,
               po.id desc
             limit 1
           ) exact_po on true

           left join lateral (
             select hbj.standard_operation
             from planning_batch_job hbj
             where hbj.job_num=p.job_num
               and hbj.source_seq_snapshot=rr.source_seq
             order by hbj.id desc
             limit 1
           ) hist_op on true

           left join lateral (
             select m.standard_operation_rule
             from md_st_operation_mapping m
             where m.is_active=true
               and upper(trim(m.source_operation_code))=upper(rr.source_operation)
               and m.mapping_rule='DIRECT'
             order by m.sort_order,m.id
             limit 1
           ) direct_map on true
         ),

         enriched as (
           select
             mr.*,

             hist_batch.batch_id,
             hist_batch.batch_no,
             hist_batch.batch_status,
             hist_batch.recipe_no,
             hist_batch.recipe_name,

             hist_schedule.schedule_id,
             hist_schedule.schedule_status,
             hist_schedule.resource_code,
             hist_schedule.planned_start,
             hist_schedule.planned_end

           from mapped_route mr

           left join lateral (
             select
               hb.id batch_id,
               hb.batch_no,
               hb.status batch_status,
               pr.recipe_no,
               pr.recipe_name
             from planning_batch_job hbj
             join planning_batch hb
               on hb.id=hbj.batch_id
              and hb.status<>'CANCELLED'
             left join md_process_recipe pr
               on pr.recipe_key=hb.recipe_key
              and pr.is_active=true
             where hbj.job_num=p.job_num
               and (
                 hbj.source_seq_snapshot=mr.source_seq
                 or (
                   hbj.standard_operation=mr.standard_operation
                   and hbj.source_seq_snapshot is null
                 )
               )
             order by hb.created_at desc,hbj.id desc
             limit 1
           ) hist_batch on true

           left join lateral (
             select
               ps.id schedule_id,
               ps.status schedule_status,
               ps.resource_code,
               ps.planned_start,
               ps.planned_end
             from planning_schedule ps
             where ps.batch_id=hist_batch.batch_id
               and ps.status<>'CANCELLED'
             order by ps.planned_start desc,ps.id desc
             limit 1
           ) hist_schedule on true
         )

         select
           concat(
             coalesce(standard_operation,source_operation),
             '#',
             occurrence
           ) route_key,
           source_operation,
           source_seq,
           occurrence,
           standard_operation,

           case
             -- Any operation physically before current AllOperation source position
             -- is completed, even when no historical Batch record exists.
             when source_seq < p.source_seq
               then 'DONE'

             -- Existing Batch/Schedule always overrides generic READY/WAITING.
             when batch_id is not null
              and schedule_id is not null
               then case
                 when upper(coalesce(schedule_status,'')) in ('COMPLETED','DONE')
                   then 'COMPLETED'
                 when upper(coalesce(schedule_status,''))='RUNNING'
                   then 'RUNNING'
                 when upper(coalesce(schedule_status,''))='HOLD'
                   then 'HOLD'
                 else 'SCHEDULED'
               end

             when batch_id is not null
               then 'PLANNED-UNSCHEDULED'

             -- Current planning position
             when source_seq = p.source_seq
              and p.status='PLANNED'
               then 'PLANNED-UNSCHEDULED'

             when source_seq = p.source_seq
               then 'READY'

             -- Every mapped operation after current position remains visible
             -- as WAITING until it gets its own Batch/Schedule.
             when source_seq > p.source_seq
               then 'WAITING'

             else 'DONE'
           end route_status,

           batch_id,
           batch_no,
           batch_status,
           schedule_id,
           schedule_status,
           resource_code,
           planned_start,
           planned_end,
           recipe_no,
           recipe_name

         from enriched
         where standard_operation is not null
            or upper(source_operation)='PIONBL'
       ) r
     ) routeinfo on true

     left join md_area_operation_group ag
       on ag.st_group=p.st_group and ag.is_active=true
     left join md_area a
       on a.id=ag.area_id and a.is_active=true
     left join md_process_recipe r
       on r.recipe_key=p.recipe_key and r.is_active=true
     left join md_process_recipe selected_r
       on selected_r.recipe_key=${recipeKey?`$${params.findIndex(x=>x===recipeKey)+1}`:"null"}
      and selected_r.is_active=true
     where ${conditions.join(" and ")}
     order by
       -- 1) Unplanned / ELIGIBLE first, PLANNED last.
       case when p.status='PLANNED' then 1 else 0 end,

       -- 2) For PLANNED rows, keep every Batch together.
       --    PB-000008 rows stay together, then PB-000009, ...
       case when p.status='PLANNED' then pb.batch_no end nulls first,

       -- 3) Inside ELIGIBLE rows keep current business priority.
       case
         when p.status<>'PLANNED'
          and (
           upper(coalesce(j.priority_type,'')) like '%HIGH%'
           or upper(coalesce(j.priority_type,'')) like '%URGENT%'
          )
         then 0
         when p.status<>'PLANNED' then 1
         else 0
       end,

       -- 4) Stable order inside each Batch / priority group.
       p.job_num
     limit 500
   `,params);

   let recipeOptions:any[]=[];
   let timeRules:any[]=[];

   if(op){
     const recipeQ=await c.query(`
       select distinct r.recipe_key,r.recipe_no,r.recipe_name,r.process_family,r.recipe_group
       from md_process_recipe r
       where r.is_active=true
         and (
           exists(
             select 1
             from md_operation_recipe_mapping orm
             where orm.standard_operation=$1
               and orm.recipe_key=r.recipe_key
               and orm.is_active=true
           )
           or exists(
             select 1
             from planning_job_operation p
             join md_operation_code_recipe ocr
               on ocr.operation_code=p.source_operation_code
              and ocr.recipe_key=r.recipe_key
              and ocr.is_active=true
             where p.standard_operation=$1
               and p.status='ELIGIBLE'
               and p.is_active=true
           )
         )
       order by r.process_family,r.recipe_group,r.recipe_no
     `,[op]);
     recipeOptions=recipeQ.rows;
   }

   if(recipeKey){
     const rulesQ=await c.query(`
       select calc_type,priority,qty_min,qty_max,
              surface_min_dm2,surface_max_dm2,
              fixed_hours,standard_hours
       from md_recipe_time_rule
       where recipe_key=$1 and is_active=true
       order by priority,id
     `,[recipeKey]);
     timeRules=rulesQ.rows;
   }

   const today=new Date().toISOString().slice(0,10);

   return <main className="erp-shell">
    <header className="erp-header">
     <div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div>
     <div className="erp-env">PLANNING BOARD</div>
    </header>

    <AppTabs active="planning"/>

    <section className="erp-content erp-content-full planning-page">
     <div className="erp-page-head">
      <div>
       <h2>Planning Board</h2>
       <p>AllOperation sequence → Eligible Jobs → Candidate selection → Production Batch</p>
      </div>
     </div>

     <form className="erp-form-panel planning-filter" method="get">
      <PlanningAreaOperationFilter
       areas={areasQ.rows as any}
       operations={opsQ.rows as any}
       initialAreaId={areaId}
       initialOperation={op}
      />

      <label>
       Recipe
       <select className="input" name="recipe" defaultValue={recipeKey}>
        <option value="">All / Not Required</option>
        {recipeOptions.map((r:any)=>
         <option key={r.recipe_key} value={r.recipe_key}>
          {r.recipe_no||"—"} · {r.recipe_name||"CHƯA KHAI BÁO"}
         </option>
        )}
       </select>
      </label>

      <label>
       Previous Batch No
       <input
        className="input"
        name="prevBatch"
        defaultValue={previousBatchNo}
        placeholder="PB-000120"
       />
      </label>

      <button className="btn primary">Load Candidates</button>
     </form>

     {!op&&!areaId&&
      <div className="notice section">
       Chọn Area để xem toàn bộ Candidate thuộc Area, hoặc chọn thêm Standard Operation để lọc chi tiết.
      </div>}

     <div className="section">
      <PlanningBoardClient
       candidates={candidatesQ.rows as any}
       standardOperation={op}
       areaMode={Boolean(areaId&&!op)}
       selectedAreaId={areaId}
       mainOperations={matrixOpsQ.rows as any}
       recipeKey={recipeKey}
       timeRules={timeRules as any}
       today={today}
      />
     </div>

     <div className="erp-table-panel section">
      <div className="erp-panel-head">
       <b>Recent Planning Batches</b>
       <div className="batch-panel-tools">
        <span>{batchesQ.rows.length} latest batches</span>
        <ResetAllBatchesButton/>
       </div>
      </div>
      <div className="table-wrap">
       <table className="erp-table planning-batch-table">
        <thead>
         <tr>
          <th>Batch</th><th>Date</th><th>Area</th><th>Operation</th>
          <th>Recipe</th><th className="num">Jobs</th><th className="num">Qty</th>
          <th className="num">Surface</th><th>Process</th>
          <th>Start</th><th>End</th><th>Status</th><th></th>
         </tr>
        </thead>
        <tbody>
         {batchesQ.rows.map((b:any)=>
          <tr key={b.id}>
           <td><b>{b.batch_no||"—"}</b></td>
           <td>{String(b.planning_date).slice(0,10)}</td>
           <td>{b.area_name||"—"}</td>
           <td>{b.standard_operation}</td>
           <td>{b.recipe_no?<><b>{b.recipe_no}</b><small className="planning-sub">{b.recipe_name||"—"}</small></>:"—"}</td>
           <td className="num">{b.total_jobs}</td>
           <td className="num">{formatNumber(b.total_qty)}</td>
           <td className="num">{formatNumber(b.total_surface_dm2)}</td>
           <td className="mono">{hhmm(b.process_minutes)}</td>
           <td>{b.planned_start?new Date(b.planned_start).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"}):"—"}</td>
           <td>{b.planned_end?new Date(b.planned_end).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"}):"—"}</td>
           <td><span className="job-state state-new">{b.status}</span></td>
           <td>
            <div className="batch-list-actions">
             <Link className="erp-link" href={`/planning/batches/${b.id}`}>View →</Link>
             <BatchRowActions
              batchId={Number(b.id)}
              batchNo={b.batch_no||"—"}
              currentRecipeKey={b.recipe_key||null}
             />
            </div>
           </td>
          </tr>
         )}
         {!batchesQ.rows.length&&
          <tr><td colSpan={13} className="muted">Chưa có Planning Batch.</td></tr>}
        </tbody>
       </table>
      </div>
     </div>
    </section>
   </main>
 }finally{
   c.release();
 }
}
