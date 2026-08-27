import {AppTabs} from "@/components/app-tabs";
import {PlanningBoardClient} from "@/components/planning-board-client";
import {PlanningAreaOperationFilter} from "@/components/planning-area-operation-filter";
import {PlanningViewTabs} from "@/components/planning-view-tabs";
import {getPool} from "@/lib/db";
import {getRecentPlanningBatches} from "@/lib/planning/recent-batches";
import {healScheduledHandoffs} from "@/lib/planning/unlock-next-after-schedule";

export const dynamic="force-dynamic";

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
   // Self-heal historical/new Schedule handoffs before Candidate query.
   // A scheduled Main unlocks ONLY its immediate next Main.
   await healScheduledHandoffs(c);

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
     getRecentPlanningBatches(c,100),
     c.query(`
       select
         s.standard_operation,
         s.sort_order operation_sort,
         om.planning_sort_order,
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
       p.source_seq,
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
       j.last_operation,

       -- RAW NextOperation shown on Candidate Board.
       -- Source: open_job_current.next_operation <- All Open Job Excel.NextOperation.
       -- This is intentionally independent from ST Operation Mapping.
       j.next_operation,

       j.all_operation,
       nextopmaster.planning_sort_order next_operation_planning_sort_order,
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
     from open_job_current j
     join lateral (
       select p0.*
       from planning_job_operation p0
       where p0.job_num=j.job_num
         and p0.is_active=true
         and p0.status in ('ELIGIBLE','PLANNED')
       order by
         -- v173: the shop-floor NextOperation is the authoritative current position.
         -- If its exact Planning Chain row exists, it MUST represent the Candidate.
         -- This fixes NextOperation=CMSA being visually replaced by a later ELIGIBLE Main.
         case
           when upper(trim(coalesce(p0.source_operation_code,'')))=
                upper(trim(coalesce(j.next_operation,'')))
            and p0.status='ELIGIBLE'
           then 0
           else 1
         end,

         -- Otherwise choose the earliest actionable Main.
         case when p0.status='ELIGIBLE' then 0 else 1 end,
         case when p0.status='ELIGIBLE' then p0.planning_seq end asc nulls last,

         -- If no ELIGIBLE exists, show the latest PLANNED Main as history/current state.
         case when p0.status='PLANNED' then p0.planning_seq end desc nulls last,

         p0.id desc
       limit 1
     ) p on true

     -- v169 invariant: master lookups may enrich a Candidate but must never
     -- multiply it. Select one active material-finish record deterministically.
     left join lateral (
       select m.*
       from md_material_finish m
       where m.part_num=j.part_num
         and m.revision_num=j.revision_num
         and m.is_active=true
       limit 1
     ) mf on true

     -- v168: md_operation can contain more than one active row for the same
     -- Operation Code. Pick exactly one deterministic row so this lookup
     -- cannot multiply Candidate rows. Operation Code Order remains the
     -- sorting source; Main Operation mapping logic is unchanged.
     left join lateral (
       select mo.planning_sort_order
       from public.md_operation mo
       join public.md_st_operation_scope scope
         on upper(trim(scope.operation_code))=upper(trim(mo.operation_code))
        and scope.is_active=true
       where mo.is_active=true
         and upper(trim(mo.operation_code))=upper(trim(j.next_operation))
       order by
         mo.planning_sort_order asc nulls last,
         mo.operation_code asc
       limit 1
     ) nextopmaster on true

     -- Current/latest active Batch of this exact planning operation.
     -- Use LATERAL + LIMIT 1 so one planning operation can never duplicate
     -- the Candidate row even if historical planning_batch_job rows exist.
     left join lateral (
       select
         hb.id,
         hb.batch_no,
         hb.status
       from planning_batch_job pbj
       join planning_batch hb
         on hb.id=pbj.batch_id
        and hb.status<>'CANCELLED'
       where pbj.planning_job_operation_id=p.id
       order by
         case
          when upper(coalesce(hb.status,'')) in ('SCHEDULED','PLANNED','UNSCHEDULED') then 0
          else 1
         end,
         hb.created_at desc,
         pbj.id desc
       limit 1
     ) pb on true

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
           'planning_job_operation_id',r.planning_job_operation_id,
           'planning_job_status',r.planning_job_status,
           'ready_source_seq',r.ready_source_seq,
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
         with master_route_base as (
           -- Full Routing Detail is the authoritative source of source_seq.
           -- Unlike All Open Job.AllOperation, this contains operations before
           -- the current NextOperation as well.
           select
             d.operation_code source_operation,
             d.source_seq::int source_seq,
             row_number() over(
               partition by upper(trim(d.operation_code))
               order by d.source_seq
             ) source_occurrence,
             pr.routing_code
           from md_routing_detailed d
           left join md_part_routing pr
             on pr.part_num=d.part_num
            and pr.revision_num=d.revision_num
            and pr.is_active=true
           where d.part_num=j.part_num
             and d.revision_num=j.revision_num
             and d.is_active=true
         ),

         master_route as (
           select
             mb.source_operation,
             mb.source_seq,
             mb.source_occurrence occurrence,
             sr.standard_operation master_standard_operation,
             sr.planning_group master_st_group,
             true from_master
           from master_route_base mb

           -- Match the standardized ST Routing occurrence to the original
           -- Routing Detail occurrence while preserving original source_seq.
           left join lateral (
             select x.standard_operation,x.planning_group
             from md_st_routing x
             where x.routing_code=mb.routing_code
               and x.is_active=true
               and upper(trim(x.operation_code))=upper(trim(mb.source_operation))
               and exists(
                 select 1
                 from md_st_operation_scope scope
                 where scope.is_active=true
                   and scope.operation_type='PLANNING_OPERATION'
                   and upper(trim(scope.operation_code))=upper(trim(mb.source_operation))
               )
             order by x.seq
             offset greatest(mb.source_occurrence-1,0)
             limit 1
           ) sr on true

           where sr.standard_operation is not null
              or upper(trim(mb.source_operation))='PIONBL'
              or exists(
                select 1 from md_st_operation_scope scope
                where scope.is_active=true
                  and upper(trim(scope.operation_code))=upper(trim(mb.source_operation))
              )
         ),

         fallback_route as (
           -- Legacy fallback only when Part/Revision has no Routing Detail.
           select
             trim(both '[] ' from token) source_operation,
             ordinality::int source_seq,
             row_number() over(
               partition by upper(trim(both '[] ' from token))
               order by ordinality
             ) occurrence,
             null::text master_standard_operation,
             null::text master_st_group,
             false from_master
           from regexp_split_to_table(
             regexp_replace(coalesce(j.all_operation,''),'^\s*\[|\]\s*$','','g'),
             '\s*\|\s*'
           ) with ordinality as parts(token,ordinality)
           where trim(both '[] ' from token)<>''
             and not exists(select 1 from master_route)
         ),

         raw_route as (
           select * from master_route
           union all
           select * from fallback_route
         ),

         mapped_route as (
           select
             rr.*,

             coalesce(
               rr.master_standard_operation,

               -- Exact current/future Planning Chain status. Match by
               -- Operation Code + standardized Main instead of source_seq,
               -- because planning_job_operation source_seq may originate from
               -- the current AllOperation slice while master source_seq comes
               -- from full Routing Detail.
               exact_po.standard_operation,

               hist_op.standard_operation,

               direct_map.standard_operation_rule,

               case when upper(rr.source_operation)='PIONBL' then 'PIONBL' end
             ) standard_operation,

             exact_po.id planning_job_operation_id,
             exact_po.status planning_job_status,
             exact_po.planning_seq

           from raw_route rr

           left join lateral (
             select po.id,po.standard_operation,po.status,po.planning_seq
             from planning_job_operation po
             where po.job_num=p.job_num
               and po.is_active=true
               and upper(trim(po.source_operation_code))=upper(trim(rr.source_operation))
               and (
                 rr.master_standard_operation is null
                 or po.standard_operation=rr.master_standard_operation
               )
             order by
               case
                 when po.id=p.id then 0
                 when po.status='ELIGIBLE' then 1
                 when po.status='PLANNED' then 2
                 else 3
               end,
               po.planning_seq,
               po.id
             limit 1
           ) exact_po on true

           left join lateral (
             select hbj.standard_operation
             from planning_batch_job hbj
             where hbj.job_num=p.job_num
               and upper(trim(hbj.source_operation_code))=upper(trim(rr.source_operation))
               and (
                 rr.master_standard_operation is null
                 or hbj.standard_operation=rr.master_standard_operation
               )
             order by hbj.id desc
             limit 1
           ) hist_op on true

           left join lateral (
             select m.standard_operation_rule
             from md_st_operation_mapping m
             join md_st_operation_scope scope
               on upper(trim(scope.operation_code))=upper(trim(m.source_operation_code))
              and scope.is_active=true
              and scope.operation_type='PLANNING_OPERATION'
             where m.is_active=true
               and upper(trim(m.source_operation_code))=upper(trim(rr.source_operation))
               and m.mapping_rule='DIRECT'
             order by m.sort_order,m.id
             limit 1
           ) direct_map on true
         ),

         ready_position as (
           select coalesce(
             -- Primary: exact current Planning Main in full master routing.
             (
               select min(mr.source_seq)
               from mapped_route mr
               where upper(trim(mr.source_operation))=
                     upper(trim(p.source_operation_code))
                 and mr.standard_operation=p.standard_operation
             ),

             -- If NextOperation is intermediate/non-planning, find the first
             -- mapped Main at/after its true Routing Detail source_seq.
             (
               select min(mr.source_seq)
               from mapped_route mr
               where mr.standard_operation is not null
                 and mr.source_seq>=coalesce(
                   (
                     select min(mb.source_seq)
                     from master_route_base mb
                     where upper(trim(mb.source_operation))=
                           upper(trim(j.next_operation))
                   ),
                   1
                 )
             ),

             -- Legacy fallback when master routing is unavailable.
             p.source_seq
           )::int ready_source_seq
         ),

         enriched as (
           select
             mr.*,
             rp.ready_source_seq,

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
           cross join ready_position rp

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
                 (
                   mr.from_master
                   and upper(trim(hbj.source_operation_code))=
                       upper(trim(mr.source_operation))
                   and hbj.standard_operation=mr.standard_operation
                 )
                 or (
                   not mr.from_master
                   and (
                     hbj.source_seq_snapshot=mr.source_seq
                     or (
                       hbj.standard_operation=mr.standard_operation
                       and hbj.source_seq_snapshot is null
                     )
                   )
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
           planning_job_operation_id,
           planning_job_status,
           ready_source_seq,

           case
             -- Position state is determined ONLY by source_seq vs ready_source_seq.
             -- Historical Batch/Schedule is shown only at/after current position;
             -- everything before current is already passed and therefore DONE.
             when ready_source_seq is not null
              and source_seq < ready_source_seq
               then 'DONE'

             -- Current exact operation.
             when ready_source_seq is not null
              and source_seq = ready_source_seq
               then case
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
                 when upper(coalesce(planning_job_status,''))='PLANNED'
                   then 'PLANNED-UNSCHEDULED'
                 else 'READY'
               end

             -- Future operations: if plan-ahead already exists, preserve it;
             -- otherwise WAITING.
             when ready_source_seq is not null
              and source_seq > ready_source_seq
               then case
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
                 when upper(coalesce(planning_job_status,''))='ELIGIBLE'
                   then 'READY'
                 else 'WAITING'
               end

             -- Legacy fallback only if a ready position cannot be found.
             when upper(coalesce(planning_job_status,''))='ELIGIBLE'
               then 'READY'
             when batch_id is not null and schedule_id is not null
               then 'SCHEDULED'
             when batch_id is not null
               then 'PLANNED-UNSCHEDULED'
             else 'WAITING'
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

     -- v169: one ST Group may have more than one active Area mapping.
     -- Candidate is one row per planning_job_operation, so Area lookup must
     -- never multiply the row. Pick one deterministic active Area only.
     left join lateral (
       select ag.area_id
       from md_area_operation_group ag
       join md_area ax
         on ax.id=ag.area_id
        and ax.is_active=true
       where ag.st_group=p.st_group
         and ag.is_active=true
       order by
         ax.sort_order asc nulls last,
         ax.area_name asc,
         ag.area_id asc
       limit 1
     ) candidate_area on true
     left join md_area a
       on a.id=candidate_area.area_id
      and a.is_active=true
     left join lateral (
       select rr.recipe_no,rr.recipe_name
       from md_process_recipe rr
       where rr.recipe_key=p.recipe_key
         and rr.is_active=true
       limit 1
     ) r on true
     left join lateral (
       select rr.recipe_no,rr.recipe_name
       from md_process_recipe rr
       where rr.recipe_key=${recipeKey?`$${params.findIndex(x=>x===recipeKey)+1}`:"null"}
         and rr.is_active=true
       limit 1
     ) selected_r on true
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

    <section className="erp-content erp-content-full planning-page planning-candidate-page">
     <div className="erp-page-head">
      <div>
       <h2>Planning Board</h2>
       <p>AllOperation sequence → Eligible Jobs → Candidate selection → Production Batch</p>
      </div>
     </div>

     <PlanningViewTabs active="candidates"/>

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
       availableBatches={batchesQ.rows as any}
       standardOperation={op}
       areaMode={Boolean(areaId&&!op)}
       selectedAreaId={areaId}
       mainOperations={matrixOpsQ.rows as any}
       recipeKey={recipeKey}
       timeRules={timeRules as any}
       today={today}
      />
     </div>
    </section>
   </main>
 }finally{
   c.release();
 }
}
