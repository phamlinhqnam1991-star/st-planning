import {substituteTemplate} from "@/lib/batch-key-recipe";
import {bestRecipeMatch,mergeJobData} from "@/lib/planning/live-recipe";
import {getCachedLiveRecipeContext,getCachedRecipeMeta} from "@/lib/planning/planning-static-cache";

/**
 * Lazy Route Matrix loader for Planning Board.
 *
 * IMPORTANT: the route_status SQL below is copied from the Candidate query
 * without changing its business rules. v283 only moves that expensive LATERAL
 * out of the Candidate metadata request so the table can paint first.
 */
export async function loadPlanningRouteStatus(c:any,candidateIds:number[]){
 const ids=[...new Set(candidateIds.map(Number).filter(Number.isFinite).map(Math.trunc))];
 if(!ids.length)return [];

 const q=await c.query(`
   select
     p.id candidate_id,
     j.part_num,
     j.revision_num,
     j.source_data,
     coalesce(routeinfo.route_status,'[]'::jsonb) route_status
   from planning_job_operation p
   join open_job_current j
     on j.job_num=p.job_num
    and j.is_open=true
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
           -- v288: Route Matrix uses the SAME source occurrence identity as
           -- Planning Chain: this Job's own AllOperation. source_seq is the
           -- original ordinal before mapping/scope filtering.
           select
             trim(both '[] ' from token) source_operation,
             ordinality::int source_seq,
             row_number() over(
               partition by upper(trim(both '[] ' from token))
               order by ordinality
             ) source_occurrence,
             count(*) over(
               partition by upper(trim(both '[] ' from token))
             ) source_code_count
           from regexp_split_to_table(
             regexp_replace(coalesce(j.all_operation,''),'^\\s*\\[|\\]\\s*$','','g'),
             '\\s*\\|\\s*'
           ) with ordinality as parts(token,ordinality)
           where trim(both '[] ' from token)<>''
         ),

         master_route as (
           select
             mb.source_operation,
             mb.source_seq,
             mb.source_occurrence occurrence,
             mb.source_code_count,
             null::text master_standard_operation,
             null::text master_st_group,
             false from_master
           from master_route_base mb
         ),

         raw_route as (
           select * from master_route
         ),

         mapped_route as (
           select
             rr.*,

             coalesce(
               rr.master_standard_operation,

               -- Exact current/future Planning Chain status. v288 uses the same
               -- AllOperation source_seq + source Operation occurrence as the
               -- live chain, so repeated Operation Codes cannot drift.
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
               and po.source_seq=rr.source_seq
               and upper(trim(po.source_operation_code))=upper(trim(rr.source_operation))
             order by
               case when po.id=p.id then 0 else 1 end,
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
                 hbj.source_seq_snapshot=rr.source_seq
                 or rr.source_code_count=1
               )
             order by
               case when hbj.source_seq_snapshot=rr.source_seq then 0 else 1 end,
               hbj.id desc
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
             order by
               case
                 when m.mapping_rule='DIRECT' then 0
                 when m.mapping_rule='SEQUENCE/FALLBACK' then 1
                 else 2
               end,
               coalesce(m.sort_order,2147483647),
               m.updated_at desc nulls last,
               m.created_at desc nulls last,
               m.id desc
             limit 1
           ) direct_map on true
         ),

         next_op_position as (
           -- v288: vị trí NextOperation trong Job AllOperation — chọn ĐÚNG
           -- occurrence khi công đoạn bị TRÙNG (vd CMSA xuất hiện 2 lần).
           -- Lấy occurrence ĐẦU TIÊN của NextOperation nằm SAU mốc CAO NHẤT của:
           --   Mốc 1 (v250): occurrence CUỐI của LastOperation trong routing detail
           --   Mốc 2 (v251): vị trí routing CAO NHẤT đã có Batch (không hủy) của job
           --                 ở chính NextOperation này — occurrence đã làm qua.
           -- Lấy mốc cao hơn → không bao giờ tụt lùi; batch chỉ là phao cứu sinh
           -- khi LastOperation thiếu; job hoàn thành không batch vẫn đúng nhờ Mốc 1.
           select min(mb.source_seq) pos
           from master_route_base mb
           where upper(trim(mb.source_operation))=upper(trim(j.next_operation))
             and mb.source_seq > greatest(
               coalesce(
                 (
                   select max(mb2.source_seq)
                   from master_route_base mb2
                   where upper(trim(mb2.source_operation))=upper(trim(j.last_operation))
                 ),
                 0
               ),
               coalesce(
                 (
                   select max(mr3.source_seq)
                   from planning_batch_job hbj
                   join planning_batch hb
                     on hb.id=hbj.batch_id
                    and hb.status<>'CANCELLED'
                   join mapped_route mr3
                     on upper(trim(mr3.source_operation))=upper(trim(hbj.source_operation_code))
                    and mr3.standard_operation=hbj.standard_operation
                    and (
                      hbj.source_seq_snapshot=mr3.source_seq
                      or (mr3.source_code_count=1 and hbj.source_seq_snapshot is null)
                    )
                   where hbj.job_num=j.job_num
                     and upper(trim(hbj.source_operation_code))=upper(trim(j.next_operation))
                 ),
                 0
               )
             )
         ),

         ready_position as (
           select coalesce(
             -- v250: ưu tiên vị trí của Main đang ELIGIBLE (p), chọn occurrence
             -- TẠI/SAU vị trí NextOperation — thay vì min() chọn occurrence đầu tiên
             -- (sai khi công đoạn trùng). Xử lý cả plan-ahead (main sau đã mở khóa).
             (
               select mr.source_seq
               from mapped_route mr
               where mr.source_seq=p.source_seq
                 and upper(trim(mr.source_operation))=upper(trim(p.source_operation_code))
                 and mr.standard_operation=p.standard_operation
               limit 1
             ),

             -- NextOperation trung gian / không phải main: main đầu tiên tại/sau vị trí đó.
             (
               select min(mr.source_seq)
               from mapped_route mr
               where mr.standard_operation is not null
                 and mr.source_seq>=coalesce((select pos from next_op_position),1)
             ),

             -- Final fallback: canonical source_seq already stored on live chain.
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
               and upper(trim(hbj.source_operation_code))=upper(trim(mr.source_operation))
               and hbj.standard_operation=mr.standard_operation
               and (
                 hbj.source_seq_snapshot=mr.source_seq
                 or mr.source_code_count=1
               )
             order by
               case when hbj.source_seq_snapshot=mr.source_seq then 0 else 1 end,
               hb.created_at desc,hbj.id desc
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
             -- v312: operations before Current Main are already passed by
             -- physical progress, but preserve their stronger actual history.
             -- If no Batch/Schedule history exists, show DONE_BY_PROGRESS as DONE.
             when ready_source_seq is not null
              and source_seq < ready_source_seq
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
                 else 'DONE'
               end

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
                 when upper(coalesce(planning_job_status,''))='ELIGIBLE'
                   then 'READY'
                 else 'WAITING'
               end

             -- v342 sequential gating: future Main(s) are WAITING unless the
             -- exact planning row has been unlocked to ELIGIBLE. Existing
             -- Batch/Schedule history still has higher display priority.
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
                 when upper(coalesce(planning_job_status,''))='PLANNED'
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
   where p.id=any($1::bigint[])
     and p.is_active=true
   order by array_position($1::bigint[],p.id)
 `,[ids]);

 // v290: Recipe suggestion must follow the EXACT Planning Operation target
 // selected from the Route Matrix. A Candidate row can still represent an
 // earlier Main (for example CPBILP) while the immediate READY target is
 // TSAUNSLD. Enrich every route occurrence with its own live Recipe match so
 // Batch Builder never reuses the representative Candidate's Recipe.
 const [ctx,recipeMetaRows]=await Promise.all([
   getCachedLiveRecipeContext(c),
   getCachedRecipeMeta(c)
 ]);
 const recipeMeta=new Map<string,{recipe_no:string|null;recipe_name:string|null}>();
 for(const r of recipeMetaRows){
   recipeMeta.set(String(r.recipe_key),{recipe_no:r.recipe_no??null,recipe_name:r.recipe_name??null});
 }

 return q.rows.map((row:any)=>{
   const jobData=mergeJobData(ctx,{
     partNum:row.part_num,
     revisionNum:row.revision_num,
     sourceData:row.source_data||null
   });
   const routeStatus=(Array.isArray(row.route_status)?row.route_status:[]).map((item:any)=>{
     if(!item?.standard_operation || String(item.standard_operation).trim().toUpperCase()==="PIONBL")return item;

     const match=bestRecipeMatch(ctx,{
       standardOperation:item.standard_operation,
       sourceOperationCode:item.source_operation,
       partNum:row.part_num,
       revisionNum:row.revision_num,
       sourceData:row.source_data||null,
       ruleSuggestion:null
     });
     const meta=match.recipeKey?recipeMeta.get(match.recipeKey):null;
     return {
       ...item,
       effective_recipe_key:match.recipeKey,
       effective_recipe_no:meta?.recipe_no||null,
       effective_recipe_name:meta?.recipe_name||null,
       batch_key_suggest:substituteTemplate(match.batchKeyTemplate,jobData),
       batch_prefix_suggest:match.batchNoPrefix||null
     };
   });

   return {candidate_id:row.candidate_id,route_status:routeStatus};
 });
}
